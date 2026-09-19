import { useRef, useState } from "react";
import { useDocument } from "../../store/useDocument";
import { thumbnailUrl } from "../../api/client";

/* The Pages ribbon tab — the page manager:
 *  - horizontal filmstrip of all pages (one row; scroll for big PDFs)
 *  - CLICK a card to (de)select it (it also becomes the view page)
 *  - DRAG a card to reorder it — pointer-based (press, move, release)
 *    with a live drop-line showing exactly where the page will land.
 *    Works anywhere: before page 1, between any two pages, at the end.
 *  - batch actions on the selection (Rotate/Delete/Extract) or the
 *    document (Insert/Merge/Split); commit staged changes with Save.
 */
export default function PagesRibbon() {
  const {
    doc,
    plan,
    currentPage,
    saving,
    isDirty,
    save,
    resetPlan,
    rotatePage,
    deletePage,
    movePage,
    setPage,
    split,
    merge,
    pageSelection,
    togglePageSelection,
    rotateSelectedPages,
    deleteSelectedPages,
    extractSelectedPages,
    showToast,
  } = useDocument();
  const insertRef = useRef(null);
  const mergeRef = useRef(null);
  const gridRef = useRef(null);
  // Live drag state (mirrored in dragRef so pointer handlers never act on
  // stale React state, and side-effects never run inside set-state
  // updaters): { from, offsetX, offsetY, x, y, moved, width, height,
  //              insert, lineX, lineTop, lineH } | null
  const dragRef = useRef(null);
  const [drag, setDragState] = useState(null);
  const setDrag = (d) => {
    dragRef.current = d;
    setDragState(d);
  };

  if (!doc) return null;

  const n = pageSelection.length;
  const dirty = isDirty();

  // Split point: after the first selected page, or after the current page
  // when nothing is selected (mirrors the old "Split here" button).
  const splitAfter =
    n > 0 ? Math.min(Math.min(...pageSelection) + 1, plan.length - 1) : currentPage + 1;

  /* ---------------- pointer-based reorder ----------------
   * HTML5 drag-and-drop (draggable + onDrop) silently cancels too often
   * (native tooltips, React re-renders mid-drag, dropping on the gap
   * between cards), so reordering is done with raw pointer events:
   *   pointerdown on a card  -> start tracking
   *   pointermove  (window)  -> move the ghost, compute the insertion
   *                             slot from live card positions
   *   pointerup    (window)  -> moved? commit movePage : treat as a
   *                             click (select/deselect + view page)
   */
  function startDrag(e, i) {
    if (e.button !== 0) return;
    if (e.target.closest("button")) return; // per-card rotate/delete stay clickable
    const rect = e.currentTarget.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    e.preventDefault(); // no text selection while dragging
    setDrag({
      from: i,
      offsetX: startX - rect.left,
      offsetY: startY - rect.top,
      x: startX,
      y: startY,
      moved: false,
      width: rect.width,
      height: rect.height,
      insert: null,
      lineX: 0,
      lineTop: 0,
      lineH: 0,
    });

    // Insertion slot for a cursor x: count where x falls among the
    // card boundaries (edges + midpoints of the gaps). The card being
    // dragged stays in place (as a placeholder), so its slot is excluded.
    function computeInsert(x) {
      const els = gridRef.current
        ? [...gridRef.current.querySelectorAll(".pg-card")]
        : [];
      const rects = els
        .map((c, idx) => ({ idx, r: c.getBoundingClientRect() }))
        .filter((o) => o.idx !== i)
        .sort((a, b) => a.r.left - b.r.left);
      if (!rects.length) return null;
      const bounds = [rects[0].r.left - 6];
      for (let j = 1; j < rects.length; j++) {
        bounds.push((rects[j - 1].r.right + rects[j].r.left) / 2);
      }
      bounds.push(rects[rects.length - 1].r.right + 6);
      let insert = bounds.length - 1;
      for (let j = 0; j < bounds.length; j++) {
        if (x < bounds[j]) {
          insert = j;
          break;
        }
      }
      return {
        insert,
        lineX: bounds[insert] - 1.5,
        lineTop: rects[0].r.top - 6,
        lineH: rects[0].r.height + 12,
      };
    }

    function onMove(ev) {
      ev.preventDefault();
      const d = dragRef.current;
      if (!d) return;
      const moved =
        d.moved || Math.hypot(ev.clientX - startX, ev.clientY - startY) > 5;
      if (!moved) {
        setDrag({ ...d, x: ev.clientX, y: ev.clientY });
        return;
      }
      setDrag({ ...d, x: ev.clientX, y: ev.clientY, moved: true, ...computeInsert(ev.clientX) });
    }

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
    }

    function onUp() {
      cleanup();
      const d = dragRef.current;
      if (!d) return;
      setDrag(null);
      if (d.moved && d.insert !== null) {
        // `insert` counts the placeholder card; after it is removed from
        // the plan, slots after it shift one left.
        const to = d.insert > d.from ? d.insert - 1 : d.insert;
        if (to !== d.from) movePage(d.from, to);
      } else if (!d.moved) {
        // No real movement -> it was a click: select/deselect + view.
        togglePageSelection(d.from);
        setPage(d.from);
      }
    }

    function onCancel() {
      // Pointercancel / window blur: abort without moving or selecting.
      cleanup();
      setDrag(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
  }

  return (
    <div className="pages-ribbon">
      <div className="pg-actions">
        <button
          className="tool-btn"
          onClick={() => insertRef.current?.click()}
          disabled={saving}
          title="Insert pages from another PDF (appended at the end)"
        >
          + Insert
        </button>
        <button
          className="tool-btn"
          onClick={extractSelectedPages}
          disabled={saving || n === 0}
          title="Open the selected pages as a new document"
        >
          {"⇩"} Extract
        </button>
        <button
          className="tool-btn"
          onClick={rotateSelectedPages}
          disabled={saving || n === 0}
          title="Rotate selected pages 90° clockwise"
        >
          {"⟳"} Rotate
        </button>
        <button
          className="tool-btn danger"
          onClick={deleteSelectedPages}
          disabled={saving || n === 0}
          title="Delete the selected pages"
        >
          {"✕"} Delete
        </button>
        <button
          className="tool-btn"
          onClick={() => split(splitAfter)}
          disabled={saving || currentPage >= plan.length - 1}
          title={
            n > 0
              ? "Split into two files after the first selected page"
              : "Split into two files after the current page"
          }
        >
          {"✂"} Split
        </button>
        <button
          className="tool-btn"
          onClick={() => mergeRef.current?.click()}
          disabled={saving}
          title="Merge another PDF after the current page"
        >
          {"⇄"} Merge
        </button>
        <button
          className="tool-btn"
          onClick={() => showToast("Press a page card and drag it — the line shows where it lands")}
          title="Reorder by dragging a page card"
        >
          {"↕"} Reorder
        </button>

        <div className="pg-count">
          {n > 0 ? (
            <>
              <b>{n} selected</b>
            </>
          ) : (
            "Drag pages to reorder"
          )}
        </div>

        {dirty && (
          <>
            <button className="tool-btn" onClick={resetPlan} disabled={saving} title="Discard staged page changes">
              Reset
            </button>
            <button className="tool-btn primary" onClick={save} disabled={saving} title="Commit staged page changes">
              {saving ? "Saving..." : "Save changes"}
            </button>
          </>
        )}
      </div>

      <div className="pg-grid" ref={gridRef}>
        {plan.map((p, i) => {
          const selected = pageSelection.includes(i);
          const isDragSrc = !!(drag && drag.moved && drag.from === i);
          return (
            <div
              key={p.key}
              className={
                "pg-card" +
                (selected ? " selected" : "") +
                (i === currentPage ? " current" : "") +
                (isDragSrc ? " dragging-src" : "")
              }
              onPointerDown={(e) => startDrag(e, i)}
              onDragStart={(e) => e.preventDefault()}
              title={selected ? "Click to deselect · drag to reorder" : "Click to select · drag to reorder"}
            >
              <span className={"pg-check" + (selected ? " checked" : "")}>{"✓"}</span>
              <div className="pg-thumb">
                <img
                  src={thumbnailUrl(doc.file_id, p.sourceIndex)}
                  alt={`Page ${i + 1}`}
                  loading="lazy"
                  style={{ transform: `rotate(${p.rotation}deg)` }}
                  draggable={false}
                />
              </div>
              <div className="pg-foot">
                <span className="pg-name">Page {String(i + 1).padStart(2, "0")}</span>
                <span className="pg-mini">
                  <button
                    title="Rotate this page right"
                    onClick={(e) => {
                      e.stopPropagation();
                      rotatePage(i, 1);
                    }}
                  >
                    {"⟳"}
                  </button>
                  <button
                    className="del"
                    title="Delete this page"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePage(i);
                    }}
                  >
                    {"✕"}
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* The ghost that follows the cursor while dragging */}
      {drag && drag.moved && (
        <div
          className="pg-ghost"
          style={{
            left: drag.x - drag.offsetX,
            top: drag.y - drag.offsetY,
            width: drag.width,
            height: drag.height,
          }}
        >
          <div className="pg-thumb" style={{ height: "calc(100% - 26px)" }}>
            <img
              src={thumbnailUrl(doc.file_id, plan[drag.from].sourceIndex)}
              alt=""
              draggable={false}
              style={{ transform: `rotate(${plan[drag.from].rotation}deg)` }}
            />
          </div>
          <span className="pg-name">Page {String(drag.from + 1).padStart(2, "0")}</span>
        </div>
      )}
      {/* The drop-line: exactly where the page will land */}
      {drag && drag.moved && drag.insert !== null && (
        <div
          className="pg-drop-line"
          style={{ left: drag.lineX, top: drag.lineTop, height: drag.lineH }}
        />
      )}

      <input
        ref={insertRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) merge(e.target.files[0], plan.length - 1);
          e.target.value = "";
        }}
      />
      <input
        ref={mergeRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) merge(e.target.files[0], currentPage);
          e.target.value = "";
        }}
      />
    </div>
  );
}