import { useRef, useState, useLayoutEffect, useCallback, Fragment } from "react";
import { useDocument } from "../../store/useDocument";

/*
 * Overlay layer matching the rendered page image. Draws in screen pixels,
 * stores in PDF points (origin top-left, y down), so annotations survive
 * zoom and rotation. Text boxes are draggable HTML; shapes/marks are SVG.
 */

/* Map a PDF font name (of the clicked line) to a CSS font stack so the
 * editable line uses the SAME typeface as the document. Without this, the
 * line was rendered in the app's UI font (Inter) while the document is e.g.
 * Times — which made edited lines look like a foreign box pasted over the
 * text. Returns undefined for unknown fonts so the app default applies. */
function cssFontFor(pdfFont) {
  const f = (pdfFont || "").toLowerCase();
  if (!f) return undefined;
  if (/times|tiro|rome|garamond|book/.test(f)) return '"Times New Roman", Times, serif';
  if (/courier|mono/.test(f)) return '"Courier New", Courier, monospace';
  return '"Helvetica Neue", Helvetica, Arial, sans-serif';
}

export default function AnnotationOverlay({ pageEntry, pdfWidth, pdfHeight }) {
  const {
    tool, shape, color, textStyle, annotations, selectedId, currentPage,
    addAnnotation, updateAnnotation, selectAnnotation, deleteAnnotation,
    getPageLines,  lineWidth, highlightOpacity, stampLabel, 
  } = useDocument();

  const ref = useRef(null);
  const [draft, setDraft] = useState(null);
  const [drag, setDrag] = useState(null); // dragging an existing text box
  const [resize, setResize] = useState(null); // resizing a text box's width

  const toScreen = useCallback((e) => {
    const rect = ref.current.getBoundingClientRect();
    return { x: e.clientX - rect.x, y: e.clientY - rect.y, rect };
  }, []);

  const screenToPdf = useCallback((sx, sy, rect) => {
    const nx = sx / rect.width;
    const ny = sy / rect.height;
    let ux = nx, uy = ny;
    if (pageEntry.rotation === 90) { ux = ny; uy = 1 - nx; }
    else if (pageEntry.rotation === 180) { ux = 1 - nx; uy = 1 - ny; }
    else if (pageEntry.rotation === 270) { ux = 1 - ny; uy = nx; }
    return [ux * pdfWidth, uy * pdfHeight];
  }, [pageEntry.rotation, pdfWidth, pdfHeight]);

  const isTextBand = ["highlight", "underline", "strike"].includes(tool);

  async function onPointerDown(e) {
    if (tool === "select") return;
    if (e.target.closest(".text-box")) return; // let text boxes handle themselves
    e.preventDefault();
    const { x, y, rect } = toScreen(e);

    if (tool === "edit-line") {
      const [px, py] = screenToPdf(x, y, rect);
      const lines = await getPageLines(pageEntry.sourceIndex);
      // hit-test against the click point; smallest matching line wins
      let best = null, bestArea = Infinity;
      for (const ln of lines) {
        const [x0, y0, x1, y1] = ln.bbox;
        const pad = 2;
        if (px >= x0 - pad && px <= x1 + pad && py >= y0 - pad && py <= y1 + pad) {
          const area = (x1 - x0) * (y1 - y0);
          if (area < bestArea) { best = ln; bestArea = area; }
        }
      }
      if (best) {
        const fs = best.font_size || 12;
        addAnnotation({
          type: "text",
          page: currentPage,
          // Match the original line's ink color (colored headings stay
          // colored — it was hardcoded near-black before, which made the
          // "copied" line visibly different from the real one).
          color: best.color || "#1a1a1a",
          x: best.bbox[0],
          y: best.bbox[1],
          w: best.bbox[2] - best.bbox[0],
          h: Math.max(best.bbox[3] - best.bbox[1], fs * 1.8 + 4),
          text: best.text,
          fontSize: Math.round(fs),
          bold: !!best.bold,
          italic: !!best.italic,
          // Original line's PDF font name — the textarea is rendered with a
          // matching CSS font (cssFontFor) and the export draws the
          // replacement with the matching built-in PDF font.
          font: best.font || undefined,
          align: "left",
          cover: true,
          editing: true,
          // The ORIGINAL detected line's bbox, frozen at creation and never
          // touched again (unlike x/y/w/h, which grow as the replacement
          // text is typed). The backend uses this — not the current, maybe
          // taller box — as the safe area to erase, so a longer replacement
          // can only ever overlap the content below it, never delete it.
          rects: [best.bbox],
        });
      }
      return;
    }

    if (tool === "note" || tool === "stamp") {
      const [px, py] = screenToPdf(x, y, rect);
      // Stamp label is picked in the toolbar (APPROVED, REJECTED, ...)
      const label = tool === "stamp" ? stampLabel : "Note";
      addAnnotation({ type: tool, page: currentPage, color, x: px, y: py, text: label });
      return;
    }

    if (tool === "text") {
      const [px, py] = screenToPdf(x, y, rect);
      addAnnotation({
        type: "text", page: currentPage, color,
        x: px, y: py, w: 180, h: 40, text: "",
        fontSize: textStyle.fontSize, bold: textStyle.bold,
        italic: textStyle.italic, align: textStyle.align,
        fontFamily: textStyle.fontFamily,
        editing: true,
      });
      return;
    }

    if (tool === "pen") { setDraft({ kind: "pen", pts: [[x, y]], rect }); return; }
    if (isTextBand) {
      // SNAP to the clicked text line (when the pointer starts on one):
      // the band's vertical extent becomes the line's own bbox. This makes
      // the highlighter behave like a real highlighter — a natural
      // HORIZONTAL swipe across a line highlights that line. (Before, the
      // finish guard required > 3px of movement in BOTH axes, so a normal
      // horizontal swipe — the way everyone highlights — silently produced
      // nothing, and vertical drags made near-invisible slivers.)
      // On empty space lineBox stays null and classic 2D box-drawing applies.
      let lineBox = null;
      const canSnap = pageEntry.rotation === 0 || pageEntry.rotation === 180;
      if (canSnap) {
        const [px, py] = screenToPdf(x, y, rect);
        const lines = await getPageLines(pageEntry.sourceIndex);
        let bestArea = Infinity;
        for (const ln of lines) {
          const [bx0, by0, bx1, by1] = ln.bbox;
          const pad = 2;
          if (px >= bx0 - pad && px <= bx1 + pad && py >= by0 - pad && py <= by1 + pad) {
            const area = (bx1 - bx0) * (by1 - by0);
            if (area < bestArea) { lineBox = ln.bbox; bestArea = area; }
          }
        }
      }
      setDraft({ kind: "band", x0: x, y0: y, x1: x, y1: y, rect, lineBox });
      return;
    }
    if (tool === "shape") { setDraft({ kind: "shape", shape, x0: x, y0: y, x1: x, y1: y, rect }); return; }
  }

  function onPointerMove(e) {
    if (resize) {
      const rect = ref.current.getBoundingClientRect();
      const deltaScreen = e.clientX - resize.startClientX;
      const deltaPdf = deltaScreen * (pdfWidth / rect.width);
      const newW = Math.max(40, resize.startW + deltaPdf);
      updateAnnotation(resize.id, { w: newW });
      return;
    }
    if (drag) {
      const { x, y, rect } = toScreen(e);
      const [px, py] = screenToPdf(x - drag.grabX, y - drag.grabY, rect);
      updateAnnotation(drag.id, { x: px, y: py });
      return;
    }
    if (!draft) return;
    const { x, y } = toScreen(e);
    if (draft.kind === "pen") setDraft({ ...draft, pts: [...draft.pts, [x, y]] });
    else setDraft({ ...draft, x1: x, y1: y });
  }

  function onPointerUp() {
    if (resize) { setResize(null); return; }
    if (drag) { setDrag(null); return; }
    if (!draft) return;
    const rect = draft.rect;

    if (draft.kind === "pen" && draft.pts.length >= 2) {
      const points = draft.pts.map(([sx, sy]) => screenToPdf(sx, sy, rect));
      addAnnotation({ type: "pen", page: currentPage, color, points, width: lineWidth });
    } else if (draft.kind === "band") {
      const x0 = Math.min(draft.x0, draft.x1), y0 = Math.min(draft.y0, draft.y1);
      const x1 = Math.max(draft.x0, draft.x1), y1 = Math.max(draft.y0, draft.y1);
      const dragged = Math.max(x1 - x0, y1 - y0) > 3;
      const extra = tool === "highlight" ? { opacity: highlightOpacity } : {};

      if (draft.lineBox) {
        // Snapped to a text line: the vertical extent is the line's own
        // bbox (always a visible line height), the horizontal extent is
        // your swipe — clamped to the line. A plain click (no real drag)
        // highlights the WHOLE line.
        const [lx0, ly0, lx1, ly1] = draft.lineBox;
        let rx0, rx1;
        if (!dragged) {
          rx0 = lx0; rx1 = lx1;
        } else {
          const [ax, ay] = screenToPdf(x0, y0, rect);
          const [bx, by] = screenToPdf(x1, y1, rect);
          rx0 = Math.max(lx0, Math.min(ax, bx));
          rx1 = Math.min(lx1, Math.max(ax, bx));
          if (rx1 - rx0 < 8) { rx0 = lx0; rx1 = lx1; } // tiny swipe = whole line
        }
        addAnnotation({ type: tool, page: currentPage, color, rects: [[rx0, ly0, rx1, ly1]], width: lineWidth, ...extra });
      } else if (dragged) {
        // No text line under the pointer (empty space): classic 2D box.
        // "dragged" only requires ONE axis to exceed 3px — a vertical box
        // drag on empty space used to be rejected too.
        const [px0, py0] = screenToPdf(x0, y0, rect);
        const [px1, py1] = screenToPdf(x1, y1, rect);
        const r = [Math.min(px0, px1), Math.min(py0, py1), Math.max(px0, px1), Math.max(py0, py1)];
        addAnnotation({ type: tool, page: currentPage, color, rects: [r], width: lineWidth, ...extra });
      }
    } else if (draft.kind === "shape") {
      const [px0, py0] = screenToPdf(draft.x0, draft.y0, rect);
      const [px1, py1] = screenToPdf(draft.x1, draft.y1, rect);
      const dist = Math.hypot(draft.x1 - draft.x0, draft.y1 - draft.y0);
      if (dist > 4) {
        if (draft.shape === "line" || draft.shape === "arrow") {
          addAnnotation({ type: draft.shape, page: currentPage, color, points: [[px0, py0], [px1, py1]], width: lineWidth });
        } else {
          const r = [Math.min(px0, px1), Math.min(py0, py1), Math.max(px0, px1), Math.max(py0, py1)];
          addAnnotation({ type: "shape", shape: draft.shape, page: currentPage, color, rects: [r], width: lineWidth });
        }
      }
    }
    setDraft(null);
  }

  const pageAnns = annotations.filter((a) => a.page === currentPage);

  function pdfToPct(px, py) {
    let nx = px / pdfWidth, ny = py / pdfHeight;
    let dx = nx, dy = ny;
    if (pageEntry.rotation === 90) { dx = 1 - ny; dy = nx; }
    else if (pageEntry.rotation === 180) { dx = 1 - nx; dy = 1 - ny; }
    else if (pageEntry.rotation === 270) { dx = ny; dy = 1 - nx; }
    return [dx * 100, dy * 100];
  }

  function rectToBox(r) {
    const [a, b] = pdfToPct(r[0], r[1]);
    const [c, d] = pdfToPct(r[2], r[3]);
    return { left: Math.min(a, c), top: Math.min(b, d), width: Math.abs(c - a), height: Math.abs(d - b) };
  }

  const cursor = tool === "select" ? "default" : "crosshair";

  return (
    <div
      ref={ref}
      className="annot-overlay"
      style={{ cursor }}
      onMouseDown={onPointerDown}
      onMouseMove={onPointerMove}
      onMouseUp={onPointerUp}
      onMouseLeave={() => { if (draft) onPointerUp(); if (drag) setDrag(null); if (resize) setResize(null); }}
    >
      <svg className="annot-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {pageAnns.map((a) => (
          <AnnotShape
            key={a.id} a={a} selected={a.id === selectedId}
            rectToBox={rectToBox} pdfToPct={pdfToPct}
            onSelect={() => tool === "select" && selectAnnotation(a.id)}
          />
        ))}
       {draft && (
          <DraftShape
            draft={draft} color={color} tool={tool}
            lineWidth={lineWidth} opacity={highlightOpacity}
            lineBoxScreen={draft.lineBox ? rectToBox(draft.lineBox) : null}
          />
        )}
      </svg>

      {/* Text boxes (draggable, editable) */}
      {pageAnns.filter((a) => a.type === "text").map((a) => {
        const [lx, ly] = pdfToPct(a.x, a.y);
        const wPct = ((a.w || 180) / pdfWidth) * 100;
        return (
          <Fragment key={a.id}>
            {/* For edit-line (cover) annotations: a white patch sized to the
                ORIGINAL line's frozen bbox — no bigger, no smaller. It hides
                exactly the line being edited and nothing else. On a white
                page it's invisible, which is what makes the line look like it
                is itself editable in place (no box, no shadow, no border).
                The text box on top is chromeless and may grow downward if
                the replacement wraps to extra lines — same as the export. */}
            {a.cover && a.rects && a.rects[0] && (
              <div
                className="cover-patch"
                style={(() => {
                  const b = rectToBox(a.rects[0]);
                  return {
                    left: `${b.left}%`, top: `${b.top}%`,
                    width: `${b.width}%`, height: `${b.height}%`,
                  };
                })()}
              />
            )}
            <TextBox
              a={a} lx={lx} ly={ly} wPct={wPct}
              pdfWidth={pdfWidth}
              selected={a.id === selectedId}
              selectTool={tool === "select"}
              onSelect={() => selectAnnotation(a.id)}
              onChange={(text) => updateAnnotation(a.id, { text })}
              onEditDone={() => updateAnnotation(a.id, { editing: false })}
              onDelete={() => deleteAnnotation(a.id)}
              startDrag={(e) => {
                if (tool !== "select") return;
                const rect = ref.current.getBoundingClientRect();
                // record where in the box the grab happened, in screen px
                const boxX = (lx / 100) * rect.width;
                const boxY = (ly / 100) * rect.height;
                setDrag({
                  id: a.id,
                  grabX: e.clientX - rect.x - boxX,
                  grabY: e.clientY - rect.y - boxY,
                });
                selectAnnotation(a.id);
              }}
              startResize={(e) => {
                setResize({ id: a.id, startClientX: e.clientX, startW: a.w || 180 });
              }}
              onHeightChange={(h) => updateAnnotation(a.id, { h })}
            />
          </Fragment>
        );
      })}

      {/* Notes & stamps as HTML labels */}
      {pageAnns.filter((a) => a.type === "note" || a.type === "stamp").map((a) => {
        const [lx, ly] = pdfToPct(a.x, a.y);
        return (
          <div
            key={`lbl-${a.id}`}
            className={`annot-label ${a.type} ${a.id === selectedId ? "selected" : ""}`}
            style={{ left: `${lx}%`, top: `${ly}%`, borderColor: a.color, color: a.color }}
            onMouseDown={(e) => { e.stopPropagation(); if (tool === "select") selectAnnotation(a.id); }}
          >
            {a.type === "stamp" ? a.text || "APPROVED" : a.text || "Note"}
            {a.id === selectedId && (
              <button className="mini-del" onMouseDown={(e) => { e.stopPropagation(); deleteAnnotation(a.id); }}>×</button>
            )}
          </div>
        );
      })}

      {/* Delete affordance for a selected svg annotation */}
      {selectedId != null && (() => {
        const a = pageAnns.find((x) => x.id === selectedId);
        if (!a || a.type === "text" || a.type === "note" || a.type === "stamp") return null;
        let anchor;
        if (a.rects) anchor = rectToBox(a.rects[0]);
        else if (a.points) { const [l, t] = pdfToPct(a.points[1][0], a.points[1][1]); anchor = { left: l, top: t, width: 0, height: 0 }; }
        else return null;
        return (
          <button
            className="annot-delete"
            style={{ left: `${anchor.left + anchor.width}%`, top: `${anchor.top}%` }}
            onMouseDown={(e) => { e.stopPropagation(); deleteAnnotation(selectedId); }}
            title="Delete"
          >×</button>
        );
      })()}
    </div>
  );
}

function TextBox({ a, lx, ly, wPct, pdfWidth, selected, selectTool, onSelect, onChange, onEditDone, onDelete, startDrag, startResize, onHeightChange }) {
  const boxRef = useRef(null);
  const taRef = useRef(null);
  const [px, setPx] = useState(a.fontSize || 14);
    // Edit-line boxes: on the very first focus, select the whole line so the
  // first keystroke replaces it — "editing the line as it is", not appending
  // to a visible copy. Later clicks still place the cursor where you click.
  const firstFocus = useRef(true);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const parent = el.offsetParent;
    if (!parent) return;
    const recompute = () => {
      const renderedPageWidth = parent.getBoundingClientRect().width;
      const ratio = renderedPageWidth / pdfWidth;
      setPx((a.fontSize || 14) * ratio);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [a.fontSize, pdfWidth]);

  // Auto-grow the textarea height to fit its content, AND feed that height
  // back into the stored annotation (in PDF points). Without this, typing
  // more text than the originally-detected line's height can hold still
  // *looks* fine on screen (the box visually grows) but the export uses the
  // old, too-short height — PyMuPDF silently drops text that overflows its
  // box, which is why edited lines could vanish after Save/Export.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;

    const parent = boxRef.current?.offsetParent;
    if (parent && onHeightChange) {
      const renderedPageWidth = parent.getBoundingClientRect().width;
      const ratio = pdfWidth / renderedPageWidth; // pdf points per screen px
      const newHPdf = ta.scrollHeight * ratio;
      // small tolerance avoids redundant writes/re-renders on sub-pixel jitter
      if (!a.h || Math.abs(newHPdf - a.h) > 0.5) {
        onHeightChange(newHPdf);
      }
    }
  }, [a.text, px, wPct]);

  const style = {
    left: `${lx}%`,
    top: `${ly}%`,
    width: `${wPct}%`,
    color: a.color,
    fontSize: `${px}px`,
    // Font priority: an explicit font-palette pick (a.fontFamily) wins;
    // otherwise cover edits auto-match the document's own typeface so an
    // edited line looks native; otherwise the app default applies.
    fontFamily: a.fontFamily || cssFontFor(a.font),
    fontWeight: a.bold ? 700 : 400,
    fontStyle: a.italic ? "italic" : "normal",
    textAlign: a.align || "left",
    cursor: selectTool ? "move" : "text",
    // No background on the box itself. For edit-line (cover) annotations a
    // separate .cover-patch div — sized to the original line exactly — hides
    // the old text. That's what makes it look like the line itself is
    // editable in place instead of a white box sitting on top of it.
    background: "transparent",
  };

  return (
    <div
      ref={boxRef}
      className={`text-box ${selected ? "selected" : ""} ${a.cover ? "cover" : ""}`}
      style={style}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (selectTool) startDrag(e);
        else onSelect();
      }}
    >
      <textarea
        ref={taRef}
        value={a.text}
        placeholder="Type here"
        autoFocus={a.editing}
        onFocus={() => {
          onSelect();
          if (a.cover && firstFocus.current) {
            firstFocus.current = false;
            requestAnimationFrame(() => taRef.current?.select());
          }
        }}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onEditDone}
        onMouseDown={(e) => { if (!selectTool) e.stopPropagation(); }}
        rows={1}
        style={{
          fontWeight: "inherit",
          textAlign: "inherit",
          color: "inherit",
          fontSize: "inherit",
          // 1.0 (not 1.2): the box top sits exactly on the original line's
          // ascender top, and line-height 1.2 was centering the glyphs
          // ~0.1em lower than where the original text sat — which is why
          // the replacement looked shifted on top of the old line.
          lineHeight: 1,
        }}
      />
      {selected && (
        <>
          <button className="mini-del" onMouseDown={(e) => { e.stopPropagation(); onDelete(); }}>×</button>
          <div
            className="text-resize-handle"
            title="Drag to resize width"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              startResize(e);
            }}
          />
        </>
      )}
    </div>
  );
}

function AnnotShape({ a, selected, rectToBox, pdfToPct, onSelect }) {
  const stroke = a.color;
  const selStyle = selected ? { filter: "drop-shadow(0 0 1.5px rgba(0,0,0,0.4))" } : {};
  const click = { onMouseDown: onSelect, style: { cursor: "pointer", ...selStyle } };

  if (a.type === "highlight" && a.rects) {
    const b = rectToBox(a.rects[0]);
    return <rect x={b.left} y={b.top} width={b.width} height={b.height} rx="0" fill={stroke} fillOpacity={a.opacity ?? 0.3} {...click} />;
  }
  if ((a.type === "underline" || a.type === "strike") && a.rects) {
    const b = rectToBox(a.rects[0]);
    const y = a.type === "underline" ? b.top + b.height : b.top + b.height / 2;
    return <line x1={b.left} y1={y} x2={b.left + b.width} y2={y} stroke={stroke} strokeWidth={selected ? 1 : 0.6} vectorEffect="non-scaling-stroke" {...click} />;
  }
 // Preview stroke width: the stored value is in PDF points; 0.7 keeps the
  // old 2pt -> 1.4px look as the "regular" default.
  const strokeW = (a.width || 2) * 0.7; 
  if (a.type === "pen" && a.points) {
    const pts = a.points.map((p) => pdfToPct(p[0], p[1]).join(",")).join(" ");
    return <polyline points={pts} fill="none" stroke={stroke} strokeWidth={strokeW} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" {...click} />;
  }
  if ((a.type === "line" || a.type === "arrow") && a.points) {
    const [x1, y1] = pdfToPct(a.points[0][0], a.points[0][1]);
    const [x2, y2] = pdfToPct(a.points[1][0], a.points[1][1]);
    return (
      <g {...click}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />
        {a.type === "arrow" && <Arrowhead x1={x1} y1={y1} x2={x2} y2={y2} color={stroke} />}
      </g>
    );
  }
  if (a.type === "shape" && a.rects) {
    const b = rectToBox(a.rects[0]);
    return <ShapeGlyph shape={a.shape} b={b} stroke={stroke} click={click} strokeWidth={strokeW} />;
  }
  return null;
}

function ShapeGlyph({ shape, b, stroke, click, strokeWidth = 1 }) {
  const common = { fill: "none", stroke, strokeWidth, vectorEffect: "non-scaling-stroke", ...click };
  const { left: x, top: y, width: w, height: h } = b;
  const cx = x + w / 2, cy = y + h / 2;
  if (shape === "rect") return <rect x={x} y={y} width={w} height={h} {...common} />;
  if (shape === "ellipse") return <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} {...common} />;
  if (shape === "triangle") return <polygon points={`${cx},${y} ${x + w},${y + h} ${x},${y + h}`} {...common} />;
  if (shape === "diamond") return <polygon points={`${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`} {...common} />;
  if (shape === "star") return <polygon points={starPoints(cx, cy, w / 2, h / 2)} {...common} />;
  if (shape === "check") return <polyline points={`${x},${cy} ${x + w * 0.4},${y + h} ${x + w},${y}`} {...common} />;
  if (shape === "cross") return <g {...click}><line x1={x} y1={y} x2={x + w} y2={y + h} stroke={stroke} strokeWidth={1} vectorEffect="non-scaling-stroke" /><line x1={x + w} y1={y} x2={x} y2={y + h} stroke={stroke} strokeWidth={1} vectorEffect="non-scaling-stroke" /></g>;
  return <rect x={x} y={y} width={w} height={h} {...common} />;
}

function starPoints(cx, cy, rx, ry) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 === 0 ? 1 : 0.42;
    pts.push(`${cx + Math.cos(ang) * rx * r},${cy + Math.sin(ang) * ry * r}`);
  }
  return pts.join(" ");
}

function Arrowhead({ x1, y1, x2, y2, color }) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = 2.4;
  const a1 = angle + Math.PI - 0.4, a2 = angle + Math.PI + 0.4;
  return <polyline points={`${x2 + len * Math.cos(a1)},${y2 + len * Math.sin(a1)} ${x2},${y2} ${x2 + len * Math.cos(a2)},${y2 + len * Math.sin(a2)}`} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />;
}

function DraftShape({ draft, color, tool, lineWidth = 2, opacity = 0.3, lineBoxScreen = null }) {
  const rect = draft.rect;
  const pct = (sx, sy) => [(sx / rect.width) * 100, (sy / rect.height) * 100];
  const draftW = (lineWidth || 2) * 0.7;
  if (draft.kind === "pen") {
    const pts = draft.pts.map(([x, y]) => pct(x, y).join(",")).join(" ");
    return <polyline points={pts} fill="none" stroke={color} strokeWidth={draftW} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
  }
  const [x0, y0] = pct(draft.x0, draft.y0);
  const [x1, y1] = pct(draft.x1, draft.y1);
  if (draft.kind === "shape") {
    if (draft.shape === "line" || draft.shape === "arrow") {
      return <g><line x1={x0} y1={y0} x2={x1} y2={y1} stroke={color} strokeWidth={draftW} vectorEffect="non-scaling-stroke" />{draft.shape === "arrow" && <Arrowhead x1={x0} y1={y0} x2={x1} y2={y1} color={color} />}</g>;
    }
    const b = { left: Math.min(x0, x1), top: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
    return <ShapeGlyph shape={draft.shape} b={b} stroke={color} click={{}} strokeWidth={draftW} />;
  }
  let left = Math.min(x0, x1), top = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
  if (lineBoxScreen) {
    // Snapped-band preview: the line's vertical extent, the swipe's
    // horizontal extent (clamped to the line) — shows exactly what will
    // be created on release.
    left = Math.max(lineBoxScreen.left, Math.min(x0, x1));
    const right = Math.min(lineBoxScreen.left + lineBoxScreen.width, Math.max(x0, x1));
    w = Math.max(right - left, 0.5);
    top = lineBoxScreen.top;
    h = lineBoxScreen.height;
  }
  const fill = tool === "highlight" ? color : "none";
  // highlight uses the chosen opacity; other bands are fully opaque
  const fillOpacity = tool === "highlight" ? opacity : 1;
  return <rect x={left} y={top} width={w} height={h} fill={fill} fillOpacity={fillOpacity} stroke={color} strokeWidth={tool === "highlight" ? 0 : draftW} strokeDasharray="2,1" vectorEffect="non-scaling-stroke" />;
}