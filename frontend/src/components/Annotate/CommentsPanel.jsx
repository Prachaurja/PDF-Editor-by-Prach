import { useDocument } from "../../store/useDocument";

function timeLabel(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

const TYPE_LABEL = {
  highlight: "Highlight",
  underline: "Underline",
  strike: "Strikethrough",
  pen: "Drawing",
  rect: "Box",
  arrow: "Arrow",
  line: "Line",
  note: "Note",
  stamp: "Stamp",
  text: "Text box",
};

const SHAPE_LABEL = {
  rect: "Rectangle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  diamond: "Diamond",
  star: "Star",
  check: "Checkmark",
  cross: "Cross",
};

function labelFor(a) {
  if (a.type === "shape") return SHAPE_LABEL[a.shape] || "Shape";
  if (a.type === "text" && a.cover) return a.text ? "Edited line" : "Redacted line";
  return TYPE_LABEL[a.type] || a.type;
}

export default function CommentsPanel() {
  const {
    doc,
    annotations,
    selectedId,
    selectAnnotation,
    deleteAnnotation,
    setPage,
  } = useDocument();

  if (!doc) return null;

  return (
    <aside className="comments">
      <div className="comments-head">
        <span>Annotations</span>
        <span className="count">{annotations.length}</span>
      </div>

      <div className="comments-scroll">
        {annotations.length === 0 ? (
          <div className="comments-empty">
            Nothing yet. Pick a tool above and mark up the page - Highlights,
            Notes and Stamps will show up here.
          </div>
        ) : (
          <div className="comments-list">
            {annotations.map((a) => (
              <div
                key={a.id}
                className={`comment ${a.id === selectedId ? "active" : ""}`}
                style={{ borderLeftColor: a.color }}
                onClick={() => {
                  setPage(a.page);
                  selectAnnotation(a.id);
                }}
              >
                <div className="comment-top">
                  <span className="dot" style={{ background: a.color }} />
                  <span className="comment-type">{labelFor(a)}</span>
                  <span className="comment-page">p.{a.page + 1}</span>
                  <span className="comment-time">{timeLabel(a.createdAt)}</span>
                </div>
                {(a.type === "note" || a.type === "stamp") && a.text && (
                  <div className="comment-body">{a.text}</div>
                )}
                <button
                  className="comment-del"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteAnnotation(a.id);
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
