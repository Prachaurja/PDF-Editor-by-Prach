import { useState, useEffect, useRef } from "react";
import { useDocument } from "../../store/useDocument";

/* The classic single-line annotation toolbar (the pre-ribbon look) — now the
 * Home tab. One row: History · Tools · Shapes · Ink · Text styles ·
 * context line controls. All behavior from the previous rounds is
 * unchanged; only the container (the ribbon tabs above it) is new. */

const TOOLS = [
  { id: "select", label: "Select (Esc)", glyph: "\u2196" },
  { id: "highlight", label: "Highlight", glyph: "\u258D" },
  { id: "strike", label: "Strikethrough", glyph: "S" },
  { id: "pen", label: "Pen", glyph: "\u270E" },
  { id: "eraser", label: "Eraser - Click a mark to remove it", glyph: "\u232B" },
];

const MARK_TOOLS = [
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

// INK for the drawing tools (pen, highlight, shapes, lines, notes,
// stamps). Text color is SEPARATE — see TEXT_COLORS / the "A" button.
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

// TEXT color palette — the "A" button in the Text group. Fully separate
// from the drawing-ink row above and from the background palette below, so
// font color and background color are picked independently.
const TEXT_COLORS = [
  "#1a1a1a", "#ffffff", "#0f6b62", "#127d5f", "#e6c200", "#e08a1e",
  "#a4443a", "#c0392b", "#3a6ea5", "#5b4b8a", "#6b6862",
];

// Background palette for Text box / Edit existing text. First entry = no
// background. The light tones blend into non-white page backgrounds
// (beige, gray, colored headers) so an edited line stops looking like a
// white sticker; the drawing-ink palette is included too, so ANY color
// can be used as a background.
const BG_COLORS = [
  { id: "transparent", label: "None (no background)" },
  { id: "#ffffff", label: "White" },
  { id: "#f7f3e9", label: "Cream" },
  { id: "#efe9dc", label: "Beige" },
  { id: "#f0f0f0", label: "Light gray" },
  { id: "#fff9c4", label: "Pale yellow" },
  { id: "#e3f2fd", label: "Pale blue" },
  { id: "#e8f5e9", label: "Pale green" },
  { id: "#fdecea", label: "Pale red" },
  ...COLORS.map((c) => ({ id: c, label: c })),
];

// Bullet marker styles. id = the value stored on the annotation (and
// exported); glyph = what the preview and the style menu show.
const BULLET_STYLES = [
  { id: "round",    label: "Round dot",     glyph: "\u2022" },
  { id: "open",     label: "Open circle",   glyph: "\u25E1" },
  { id: "square",   label: "Square",        glyph: "\u25AA" },
  { id: "dash",     label: "Dash",          glyph: "\u2013" },
  { id: "triangle", label: "Triangle",      glyph: "\u25B8" },
  { id: "star",     label: "Star",          glyph: "\u2605" },
];
const BULLET_GLYPH = Object.fromEntries(BULLET_STYLES.map((b) => [b.id, b.glyph]));
// Older saved annotations sent `bullet: true` — normalize to "round".
const normBullet = (v) => (v === true ? "round" : v || undefined);

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
    textBgColor, setTextBgColor, setTextColor,
    history, undo, redo,
  } = useDocument();
  const [shapeOpen, setShapeOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [bulletOpen, setBulletOpen] = useState(false);

  // Each dropdown lives inside a ref that wraps its BUTTON and its MENU.
  // Menus close on a mousedown OUTSIDE that wrapper (click-away) instead of
  // on mouseleave — mouseleave is what made the color picker "disappear":
  // the moment the pointer moved from the input to the OS color dialog
  // (a separate window), the page fired mouseleave and unmounted the menu.
  const shapeRef = useRef(null);
  const bgRef = useRef(null);
  const textColorRef = useRef(null);
  const bulletRef = useRef(null);
  const anyMenuOpen = shapeOpen || bgOpen || textColorOpen || bulletOpen;

  // Open one menu, closing the others (so two popovers never overlap).
  const openMenu = (which) => {
    setShapeOpen(which === "shape");
    setBgOpen(which === "bg");
    setTextColorOpen(which === "text");
    setBulletOpen(which === "bullet");
  };

  useEffect(() => {
    if (!anyMenuOpen) return;
    const onDown = (e) => {
      const refs = [shapeRef.current, bgRef.current, textColorRef.current, bulletRef.current];
      if (!refs.some((r) => r && r.contains(e.target))) openMenu("none");
    };
    const onKey = (e) => {
      // Esc closes an open menu. (Esc -> Home + Select, and Ctrl/Cmd+Z /
      // Shift+Z / Ctrl+Y, are handled globally by Ribbon.jsx so they work
      // from any tab — not handled here, to avoid double-firing.)
      if (e.key === "Escape") openMenu("none");
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [anyMenuOpen]);

  if (!doc) return null;

  const selected = annotations.find((a) => a.id === selectedId);
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const activeShape = SHAPES.find((s) => s.id === shape) || SHAPES[0];

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
  const effBullet = normBullet(selIsText ? selected.bullet : textStyle.bullet);
  // TEXT color: selected box's own color, else the default ink for new
  // boxes (the global `color`).
  const effTextColor = selIsText ? selected.color : color;
  // Background: with a text box selected it reads THAT box (edited lines
  // store their patch color as coverColor, which is always a real color —
  // a redaction must paint something — so it never reads "transparent").
  const effBg = selIsText
    ? (selected.cover ? selected.coverColor || "#ffffff" : selected.bgColor || "transparent")
    : textBgColor;
  // Thickness picker: visible for the stroke tools, or when a drawn
  // stroke/shape is selected (so you can re-thicken a mark you drew).
  const showWidth =
    tool === "pen" || tool === "shape" ||
    (selected && ["pen", "line", "arrow", "shape", "rect"].includes(selected.type));
  // Opacity picker: visible for the Highlight tool or a selected highlight.
  const showOpacity =
    tool === "highlight" || (selected && selected.type === "highlight");
  // The cross-hatch used for "no color / none" swatches.
  const noneBg = "linear-gradient(135deg, transparent 45%, var(--border) 45%, var(--border) 55%, transparent 55%), linear-gradient(45deg, transparent 45%, var(--border) 45%, var(--border) 55%, transparent 55%), #fff";

  return (
    <div className="annot-toolbar">
      {/* ---------- History ---------- */}
      <div className="annot-tools">
        <button
          className="annot-tool"
          title="Undo (Ctrl+Z)"
          disabled={!canUndo}
          onClick={undo}
        >
          <span className="glyph">{"\u21B6"}</span>
        </button>
        <button
          className="annot-tool"
          title="Redo (Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={redo}
        >
          <span className="glyph">{"\u21B7"}</span>
        </button>
      </div>

      <div className="annot-sep" />

      {/* ---------- Tools + shapes ---------- */}
      <div className="annot-tools">
        {[...TOOLS, ...MARK_TOOLS].map((t) => (
          <button
            key={t.id}
            className={`annot-tool ${tool === t.id ? "active" : ""}`}
            title={t.label}
            onClick={() => setTool(t.id)}
          >
            <span className={`glyph glyph-${t.id}`}>{t.glyph}</span>
          </button>
        ))}

        <div className="shape-picker" ref={shapeRef}>
          <button
            className={`annot-tool ${tool === "shape" ? "active" : ""}`}
            title="Shapes"
            onClick={() => openMenu(shapeOpen ? "none" : "shape")}
          >
            <span className="glyph">{activeShape.glyph}</span>
            <span className="caret">{"\u25BE"}</span>
          </button>
          {shapeOpen && (
            <div className="shape-menu">
              {SHAPES.map((s) => (
                <button
                  key={s.id}
                  className={`shape-item ${shape === s.id && tool === "shape" ? "active" : ""}`}
                  title={s.label}
                  onClick={() => {
                    setShape(s.id);
                    openMenu("none");
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

      {/* ---------- Ink (drawing color) ---------- */}
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

      <div className="annot-sep" />

      {/* ---------- Text styles ---------- */}
      <div className="text-props">
        {/* TEXT color ("A"). Separate picker: recolors the selected
            box, or sets the ink for new boxes. Never touches the
            background. */}
        <div className="prop-picker" ref={textColorRef}>
          <button
            className="text-color-btn"
            title="Text color"
            onClick={() => openMenu(textColorOpen ? "none" : "text")}
          >
            <span className="text-color-a" style={{ color: effTextColor }}>A</span>
          </button>
          {textColorOpen && (
            <div className="prop-menu">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  className={`bg-item ${effTextColor === c ? "active" : ""}`}
                  title={c}
                  style={{ background: c }}
                  onClick={() => setTextColor(c)}
                />
              ))}
              <label className="color-picker" title="Custom text color">
                <span className="picker-ring" style={{ background: effTextColor }} />
                <input
                  type="color"
                  value={effTextColor}
                  onChange={(e) => setTextColor(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>
        {/* BACKGROUND color. Separate picker: tint behind a plain
            text box, or the patch an edited line paints over the old
            text — match it to your page background so the edit
            blends in. */}
        <div className="bg-picker" ref={bgRef}>
          <button
            className="bg-btn"
            title="Text background color"
            onClick={() => openMenu(bgOpen ? "none" : "bg")}
          >
            <span
              className="bg-swatch"
              style={effBg === "transparent" ? { background: noneBg } : { background: effBg }}
            />
          </button>
          {bgOpen && (
            <div className="prop-menu">
              {BG_COLORS.map((c) => (
                <button
                  key={c.id}
                  className={`bg-item ${effBg === c.id ? "active" : ""}`}
                  title={c.label}
                  style={{ background: c.id === "transparent" ? noneBg : c.id }}
                  onClick={() => setTextBgColor(c.id)}
                />
              ))}
              <label className="color-picker" title="Custom background color">
                <span className="picker-ring" style={{ background: effBg === "transparent" ? "transparent" : effBg }} />
                <input
                  type="color"
                  value={effBg === "transparent" ? "#ffffff" : effBg}
                  onChange={(e) => setTextBgColor(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>
        <select
          className="font-select"
          value={effFont}
          title="Font"
          onChange={(e) => setTextStyle({ fontFamily: e.target.value })}
        >
          {/* FONTS is a list of GROUPS ({ group, list }) — each group
              becomes an <optgroup> and each font an <option>. Mapping
              the groups directly as <option> children makes React
              throw "Objects are not valid as a React child" and takes
              down the whole app. */}
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
        {/* Bullet: the button toggles on (round dot) / off; the caret
            picks the marker style. Applies to Text box AND Edit
            existing text — one marker at the start of the text. */}
        <div className="bullet-picker" ref={bulletRef}>
          <button
            className={`text-btn ${effBullet ? "active" : ""}`}
            title={effBullet ? `Bullet: ${effBullet} (click to remove)` : "Bullet point"}
            onClick={() => setTextStyle({ bullet: effBullet ? undefined : "round" })}
          >
            <span className="bullet-glyph">{BULLET_GLYPH[effBullet] || "\u2022"}</span>
          </button>
          <button
            className="caret-btn"
            title="Bullet style"
            onClick={() => openMenu(bulletOpen ? "none" : "bullet")}
          >
            {"\u25BE"}
          </button>
          {bulletOpen && (
            <div className="prop-menu bullet-menu">
              <button
                className={`bullet-item ${effBullet ? "" : "active"}`}
                title="No bullet"
                onClick={() => { setTextStyle({ bullet: undefined }); openMenu("none"); }}
              >
                <span className="none-glyph">{"\u2205"}</span>
              </button>
              {BULLET_STYLES.map((b) => (
                <button
                  key={b.id}
                  className={`bullet-item ${effBullet === b.id ? "active" : ""}`}
                  title={`${b.label} bullet`}
                  onClick={() => { setTextStyle({ bullet: b.id }); openMenu("none"); }}
                >
                  {b.glyph}
                </button>
              ))}
            </div>
          )}
        </div>
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

      {/* ---------- Line (context-aware: thickness / opacity / stamp) ---------- */}
      {(showWidth || showOpacity || tool === "stamp") && (
        <>
          <div className="annot-sep" />
          <div className="annot-tools">
            {showWidth && (
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
            )}
            {showOpacity && (
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
            )}
            {tool === "stamp" && (
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
            )}
          </div>
        </>
      )}
    </div>
  );
}