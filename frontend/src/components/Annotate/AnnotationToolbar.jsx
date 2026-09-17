import { useState } from "react";
import { useDocument } from "../../store/useDocument";

const TOOLS = [
  { id: "select", label: "Select", glyph: "\u2196" },
  { id: "highlight", label: "Highlight", glyph: "\u258D" },
  { id: "underline", label: "Underline", glyph: "U" },
  { id: "strike", label: "Strikethrough", glyph: "S" },
  { id: "pen", label: "Pen", glyph: "\u270E" },
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

export default function AnnotationToolbar() {
  const {
    doc, tool, shape, setTool, setShape, color, setColor,
    textStyle, setTextStyle, selectedId, annotations,
  } = useDocument();
  const [shapeOpen, setShapeOpen] = useState(false);

  if (!doc) return null;

  const selected = annotations.find((a) => a.id === selectedId);
  const showText = tool === "text" || (selected && selected.type === "text");
  const activeShape = SHAPES.find((s) => s.id === shape) || SHAPES[0];

  return (
    <div className="annot-toolbar">
      <div className="annot-tools">
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

      {showText && (
        <>
          <div className="annot-sep" />
          <div className="text-props">
            <button
              className={`text-btn ${textStyle.bold ? "active" : ""}`}
              title="Bold"
              onClick={() => setTextStyle({ bold: !textStyle.bold })}
            >
              <b>B</b>
            </button>
            <select
              className="size-select"
              value={textStyle.fontSize}
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
                  className={`text-btn ${textStyle.align === al.id ? "active" : ""}`}
                  title={`Align ${al.id}`}
                  onClick={() => setTextStyle({ align: al.id })}
                >
                  {al.glyph}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
