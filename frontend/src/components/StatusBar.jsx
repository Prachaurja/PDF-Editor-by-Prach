import { useDocument } from "../store/useDocument";

export default function StatusBar() {
  const { doc, plan, currentPage, setPage, isDirty, error } = useDocument();
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
