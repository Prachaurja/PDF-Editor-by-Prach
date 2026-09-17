import { useState } from "react";
import { useDocument } from "../../store/useDocument";
import { thumbnailUrl } from "../../api/client";

export default function ThumbnailRail() {
  const {
    doc,
    plan,
    currentPage,
    setPage,
    rotatePage,
    deletePage,
    movePage,
  } = useDocument();
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  if (!doc) return null;

  function onDrop(to) {
    if (dragIndex !== null && dragIndex !== to) movePage(dragIndex, to);
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <aside className="rail">
      <div className="rail-title">Pages ({plan.length})</div>
      {plan.map((p, i) => (
        <div
          key={p.key}
          className={
            "thumb-row" +
            (i === currentPage ? " active" : "") +
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
          onClick={() => setPage(i)}
        >
          <div className="thumb">
            <img
              src={thumbnailUrl(doc.file_id, p.sourceIndex)}
              alt={`Page ${i + 1}`}
              loading="lazy"
              style={{ transform: `rotate(${p.rotation}deg)` }}
            />
            <span className="num">{i + 1}</span>
          </div>
          <div className="thumb-actions" onClick={(e) => e.stopPropagation()}>
            <button title="Rotate left" onClick={() => rotatePage(i, -1)}>
              &#8630;
            </button>
            <button title="Rotate right" onClick={() => rotatePage(i, 1)}>
              &#8631;
            </button>
            <button
              className="del"
              title="Delete page"
              onClick={() => deletePage(i)}
            >
              &#215;
            </button>
          </div>
        </div>
      ))}
      <div className="rail-hint">Drag a page to reorder</div>
    </aside>
  );
}
