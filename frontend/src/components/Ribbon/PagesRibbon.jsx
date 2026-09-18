import { useRef, useState } from "react";
import { useDocument } from "../../store/useDocument";
import { thumbnailUrl } from "../../api/client";

/* The Pages ribbon tab — a Word/Google-Docs-style page manager:
 * grid of all pages with multi-select, and batch actions.
 *
 * - Click a card to (de)select it; the page also becomes the view page.
 * - Drag a card to reorder (same plan engine as the thumbnail rail).
 * - Actions work on the selection (Rotate/Delete/Extract) or the document
 *   (Insert/Merge/Split). Nothing is committed to the backend until you
 *   press "Save changes" — same stage-then-save model as before. */
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
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  if (!doc) return null;

  const n = pageSelection.length;
  const dirty = isDirty();

  // Split point: after the first selected page, or after the current page
  // when nothing is selected (mirrors the old "Split here" button).
  const splitAfter =
    n > 0 ? Math.min(Math.min(...pageSelection) + 1, plan.length - 1) : currentPage + 1;

  function onDrop(to) {
    if (dragIndex !== null && dragIndex !== to) movePage(dragIndex, to);
    setDragIndex(null);
    setOverIndex(null);
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
          onClick={() => showToast("Drag any page card to reorder it")}
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

      <div className="pg-grid">
        {plan.map((p, i) => {
          const selected = pageSelection.includes(i);
          return (
            <div
              key={p.key}
              className={
                "pg-card" +
                (selected ? " selected" : "") +
                (i === currentPage ? " current" : "") +
                (i === overIndex ? " drop-over" : "")
              }
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIndex(i);
              }}
              onDragLeave={() => setOverIndex(null)}
              onDrop={() => onDrop(i)}
              onClick={() => {
                togglePageSelection(i);
                setPage(i);
              }}
              title={selected ? "Click to deselect" : "Click to select"}
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