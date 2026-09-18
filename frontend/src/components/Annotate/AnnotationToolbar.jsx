import { useState, useEffect } from "react";
import { useDocument } from "../../store/useDocument";

const TOOLS = [
  { id: "select", label: "Select", glyph: "\u2196" },
  { id: "highlight", label: "Highlight", glyph: "\u258D" },
  { id: "strike", label: "Strikethrough", glyph: "S" },
  { id: "pen", label: "Pen", glyph: "\u270E" },
  { id: "eraser", label: "Eraser - Click a mark to remove it", glyph: "\u232B" },
  { id: "text", label: "Text box", glyph: "T" },
  { id: "edit-line", label: "Edit existing text", glyph: "\u270D" },
  { id: "note", label: "Sticky note", glyph: "\u25A4" },
  { id: "stamp", label: "Stamp", glyph: "\u2713" },
];

const SHAPES = [
  { id: "rect", label: "Rectangle", glyph: "\u25AD" },
  { id: "ellipse", label: "Ellipse", glyph: "\u25EF" },
  { id: "line", label: "Line", glyph: "\u2571" },
  { id: "arrow", label: "Arrow", glyph: "\u2192" },
  { id: "triangle", label: "Triangle", glyph: "\u25B3" },
  { id: "diamond", label: "Diamond", glyph: "\u25C7" },
  { id: "star", label: "Star", glyph: "\u2606" },
  { id: "check", label: "Check", glyph: "\u2713" },
  { id: "cross", label: "Cross", glyph: "\u2717" },
];

const COLORS = [
  "#0f6b62", "#127d5f", "#e6c200", "#e08a1e", "#a4443a",
  "#c0392b", "#3a6ea5", "#5b4b8a", "#1a1a1a", "#6b6862",
];

/* Font palette for text boxes — everyday fonts, grouped. Web-safe families
 * so the preview renders them on any machine; on export the backend draws
 * the closest built-in PDF font of the same class (serif -> Times,
 * monospace -> Courier, else Helvetica) in your bold/italic choice. Pick
 * any of these and both the live view and the exported PDF follow. */
const FONTS = [
  {
    group: "Sans-serif",
    list: [
      "Arial", "Arial Black", "Calibri", "Trebuchet MS", "Verdana",
      "Tahoma", "Helvetica", "Lucida Sans", "Franklin Gothic",
      "Century Gothic", "Segoe UI",
    ],
  },
  {
    group: "Serif",
    list: [
      "Times New Roman", "Georgia", "Garamond", "Cambria",
      "Palatino Linotype", "Book Antiqua",
    ],
  },
  {
    group: "Monospace",
    list: ["Courier New", "Consolas", "Lucida Console"],
  },
  {
    group: "Display",
    list: ["Comic Sans MS", "Impact"],
  },
];

const LINE_WIDTHS = [1, 2, 3, 4];
const LINE_WIDTH_LABEL = { 1: "Thin", 2: "Regular", 3: "Thick", 4: "Extra thick" };
const HIGHLIGHT_OPACITIES = [0.15, 0.3, 0.5];
const HIGHLIGHT_OPACITY_LABEL = { 0.15: "Light", 0.3: "Medium", 0.5: "Strong" };
// "\u2714" / "\u2718" = standalone check / cross marks — placed with one
// click (no drag) so you can tick any checkbox in the document. Drawn as
// vectors on export (base PDF fonts have no glyph for them).
const STAMP_LABELS = ["APPROVED", "REJECTED", "CONFIDENTIAL", "DRAFT", "PENDING", "\u2714", "\u2718"];

export default function AnnotationToolbar() {
  const {
    doc, tool, shape, setTool, setShape, color, setColor,
    textStyle, setTextStyle, selectedId, annotations,
    lineWidth, setLineWidth,
    highlightOpacity, setHighlightOpacity,
    stampLabel, setStampLabel,
    shapeFilled, setShapeFilled,
    history, undo, redo,
  } = useDocument();
  const [shapeOpen, setShapeOpen] = useState(false);

  // Keyboard shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y
  // redo. Textareas/inputs keep the browser's own text undo, so we stay
  // out when one is focused.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      const t = e.target;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      e.preventDefault();
      if (k === "y" || e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  if (!doc) return null;

  const selected = annotations.find((a) => a.id === selectedId);
  const activeShape = SHAPES.find((s) => s.id === shape) || SHAPES[0];
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  // When a text box is selected, the text controls show AND act on THAT
  // box's own values (not the global "new box" defaults). Toggling was
  // previously based on the global style, so once the two diverged — e.g.
  // box A made italic, then box B selected — clicking I on B appeared to
  // do nothing (it was actually turning the global flag back off).
  const selIsText = !!selected && selected.type === "text";
  const effBold = selIsText ? !!selected.bold : textStyle.bold;
  const effItalic = selIsText ? !!selected.italic : textStyle.italic;
  const effFont = selIsText ? selected.fontFamily || textStyle.fontFamily : textStyle.fontFamily;
  const effSize = selIsText ? selected.fontSize || textStyle.fontSize : textStyle.fontSize;
  const effAlign = selIsText ? selected.align || textStyle.align : textStyle.align;
  // Same idea for the fill toggle: with a shape selected it reads/writes
  // THAT shape; otherwise it's the default for new shapes.
  const selIsShape = !!selected && selected.type === "shape";
  const effFilled = selIsShape ? !!selected.filled : shapeFilled;
  // Thickness picker: visible for the stroke tools, or when a drawn
  // stroke/shape is selected (so you can re-thicken a mark you drew).
  const showWidth =
    tool === "pen" || tool === "shape" ||
    (selected && ["pen", "line", "arrow", "shape", "rect"].includes(selected.type));
  // Fill picker: visible for the Shapes tool or a selected shape.
  const showFilled = tool === "shape" || (selected && selected.type === "shape");
  // Opacity picker: visible for the Highlight tool or a selected highlight.
  const showOpacity =
    tool === "highlight" || (selected && selected.type === "highlight");

  return (
    <div className="annot-toolbar">
      <div className="annot-tools">
        <button
          className={`annot-tool ${canUndo ? "" : "disabled"}`}
          title="Undo (Ctrl+Z)"
          disabled={!canUndo}
          onClick={undo}
        >
          <span className="glyph">{"\u21B6"}</span>
        </button>
        <button
          className={`annot-tool ${canRedo ? "" : "disabled"}`}
          title="Redo (Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={redo}
        >
          <span className="glyph">{"\u21B7"}</span>
        </button>

        <div className="annot-sep" />

        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`annot-tool ${tool === t.id ? "active" : ""}`}
            title={t.label}
            onClick={() => setTool(t.id)}
          >
            <span className={`glyph glyph-${t.id}`}>{t.glyph}</span>
          </button>
        ))}

        <div className="shape-picker">
          <button
            className={`annot-tool ${tool === "shape" ? "active" : ""}`}
            title="Shapes"
            onClick={() => {
              setShape(activeShape.id);
              setShapeOpen((v) => !v);
            }}
          >
            <span className="glyph">{activeShape.glyph}</span>
            <span className="caret">{"\u25BE"}</span>
          </button>
          {shapeOpen && (
            <div className="shape-menu" onMouseLeave={() => setShapeOpen(false)}>
              {SHAPES.map((s) => (
                <button
                  key={s.id}
                  className={`shape-item ${shape === s.id && tool === "shape" ? "active" : ""}`}
                  title={s.label}
                  onClick={() => {
                    setShape(s.id);
                    setShapeOpen(false);
                  }}
                >
                  <span className="glyph">{s.glyph}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="annot-sep" />

      <div className="annot-colors">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`swatch ${color === c ? "active" : ""}`}
            style={{ background: c }}
            title={c}
            onClick={() => setColor(c)}
          />
        ))}
        <label className="color-picker" title="Custom color">
          <span className="picker-ring" style={{ background: color }} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
      </div>

      {showWidth && (
        <>
          <div className="annot-sep" />
          <div className="width-group" title="Line thickness">
            {LINE_WIDTHS.map((w) => (
              <button
                key={w}
                className={`width-btn ${lineWidth === w ? "active" : ""}`}
                title={LINE_WIDTH_LABEL[w]}
                onClick={() => setLineWidth(w)}
              >
                <span className="width-sample" style={{ height: w }} />
              </button>
            ))}
          </div>
        </>
      )}

      {showFilled && (
        <>
          <div className="annot-sep" />
          <button
            className={`text-btn ${effFilled ? "active" : ""}`}
            title="Fill shape (closed shapes: rectangle, ellipse, triangle, diamond, star)"
            onClick={() => setShapeFilled(!effFilled)}
          >
            {effFilled ? "\u25FC" : "\u25FB"}
          </button>
        </>
      )}

      {showOpacity && (
        <>
          <div className="annot-sep" />
          <div className="opacity-group" title="Highlight opacity">
            {HIGHLIGHT_OPACITIES.map((o) => (
              <button
                key={o}
                className={`opacity-btn ${Math.abs(highlightOpacity - o) < 0.001 ? "active" : ""}`}
                title={HIGHLIGHT_OPACITY_LABEL[o]}
                onClick={() => setHighlightOpacity(o)}
              >
                <span
                  className="opacity-sample"
                  style={{ background: `rgba(230, 194, 0, ${o})` }}
                />
              </button>
            ))}
          </div>
        </>
      )}

      {tool === "stamp" && (
        <>
          <div className="annot-sep" />
          <select
            className="stamp-select"
            value={stampLabel}
            title="Stamp text"
            onChange={(e) => setStampLabel(e.target.value)}
          >
            {STAMP_LABELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </>
      )}

      {/* Text treatments — Bold / Italic / Underline / font / size / align.
          Shown at ALL times so the Underline tool sits next to B and I no
          matter what you're doing; with no text box selected the controls
          set the defaults for new text boxes. */}
      <div className="annot-sep" />
      <div className="text-props">
        <select
          className="font-select"
          value={effFont}
          title="Font"
          onChange={(e) => setTextStyle({ fontFamily: e.target.value })}
        >
          {/* FONTS is a list of GROUPS ({ group, list }) — each group
              becomes an <optgroup> and each font an <option>. Mapping the
              groups directly as <option> children makes React throw
              "Objects are not valid as a React child" and takes down the
              whole app (this is what closed the PDF on Text Box /
              Edit Existing Text clicks). */}
          {FONTS.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.list.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          className={`text-btn ${effBold ? "active" : ""}`}
          title="Bold"
          onClick={() => setTextStyle({ bold: !effBold })}
        >
          <b>B</b>
        </button>
        <button
          className={`text-btn ${effItalic ? "active" : ""}`}
          title="Italic"
          onClick={() => setTextStyle({ italic: !effItalic })}
        >
          <i className="italic-glyph">I</i>
        </button>
        <button
          className={`text-btn ${tool === "underline" ? "active" : ""}`}
          title="Underline (underline a line of the page, or keep it here with B/I)"
          onClick={() => setTool("underline")}
        >
          <span className="glyph-underline">U</span>
        </button>
          <select
            className="size-select"
            value={effSize}
            title="Font size"
            onChange={(e) => setTextStyle({ fontSize: Number(e.target.value) })}
          >
            {[10, 12, 14, 16, 18, 20, 24, 28, 32, 40].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="align-group">
            {[
              { id: "left", glyph: "\u2630" },
              { id: "center", glyph: "\u2632" },
              { id: "right", glyph: "\u2631" },
            ].map((al) => (
              <button
                key={al.id}
                className={`text-btn ${effAlign === al.id ? "active" : ""}`}
                title={`Align ${al.id}`}
                onClick={() => setTextStyle({ align: al.id })}
              >
                {al.glyph}
              </button>
            ))}
          </div>
      </div>
    </div>
  );
}