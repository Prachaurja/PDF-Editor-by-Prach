import { useDocument } from "../../store/useDocument";
import { pageUrl } from "../../api/client";
import AnnotationOverlay from "../Annotate/AnnotationOverlay";

export default function PageCanvas() {
  const { doc, plan, currentPage, zoom } = useDocument();
  if (!doc || plan.length === 0) return null;

  const entry = plan[currentPage];
  if (!entry) return null;

  const src = doc.pages[entry.sourceIndex];
  const rotated = entry.rotation % 180 !== 0;
  const w = src ? src.width : 595;
  const h = src ? src.height : 842;
  const aspect = rotated ? h / w : w / h;

  // Both width candidates scale with zoom: at 1 it matches the old "fit"
  // size; above 1 the sheet can outgrow the viewport and .canvas scrolls
  // (overflow: auto). The overlay is %-based, so everything inside scales
  // with the sheet for free.
  const sheetWidth = `min(${aspect * 78 * zoom}vh, ${100 * zoom}%)`;

  return (
    <div className="canvas">
      <div
        className="page-sheet fade-in"
        key={`${entry.key}-${entry.rotation}`}
        style={{ width: sheetWidth }}
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
