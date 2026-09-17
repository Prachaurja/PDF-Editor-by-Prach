import { useDocument } from "../../store/useDocument";
import { pageUrl } from "../../api/client";
import AnnotationOverlay from "../Annotate/AnnotationOverlay";

export default function PageCanvas() {
  const { doc, plan, currentPage } = useDocument();
  if (!doc || plan.length === 0) return null;

  const entry = plan[currentPage];
  if (!entry) return null;

  const src = doc.pages[entry.sourceIndex];
  const rotated = entry.rotation % 180 !== 0;
  const w = src ? src.width : 595;
  const h = src ? src.height : 842;
  const aspect = rotated ? h / w : w / h;

  return (
    <div className="canvas">
      <div
        className="page-sheet fade-in"
        key={`${entry.key}-${entry.rotation}`}
        style={{ width: `min(${aspect * 78}vh, 100%)` }}
      >
        <img
          src={pageUrl(doc.file_id, entry.sourceIndex)}
          alt={`Page ${currentPage + 1}`}
          style={{ transform: `rotate(${entry.rotation}deg)` }}
          draggable={false}
        />
        <AnnotationOverlay pageEntry={entry} pdfWidth={w} pdfHeight={h} />
      </div>
    </div>
  );
}
