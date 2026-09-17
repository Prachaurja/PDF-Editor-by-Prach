import { useDocument } from "../store/useDocument";

export default function StatusBar() {
  const {
    doc, plan, currentPage, setPage, isDirty, error,
    zoom, zoomIn, zoomOut, zoomFit,
  } = useDocument();
  if (!doc) return null;

  const entry = plan[currentPage];
  const src = entry ? doc.pages[entry.sourceIndex] : null;
  const dirty = isDirty();

  return (
    <footer className="statusbar">
      <div className="pager">
        <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
          Prev
        </button>
        <span>
          Page {currentPage + 1} of {plan.length}
        </span>
        <button
          disabled={currentPage >= plan.length - 1}
          onClick={() => setPage(currentPage + 1)}
        >
          Next
        </button>
      </div>

      <div className="zoom" title="Page zoom (click the % to reset)">
        <button
          className="zoom-btn"
          onClick={zoomOut}
          disabled={zoom <= 0.5}
          title="Zoom out"
        >
          −
        </button>
        <button className="zoom-val" onClick={zoomFit} title="Reset zoom (fit)">
          {Math.round(zoom * 100)}%
        </button>
        <button
          className="zoom-btn"
          onClick={zoomIn}
          disabled={zoom >= 2}
          title="Zoom in"
        >
          +
        </button>
      </div>
      
      {src && (
        <span>
          {Math.round(src.width)} x {Math.round(src.height)} pt
        </span>
      )}

      {dirty && <span className="unsaved">Unsaved changes</span>}
      {error && <span className="status-error">{error}</span>}
    </footer>
  );
}
