import { useRef } from "react";
import { useDocument } from "../../store/useDocument";

export default function Toolbar() {
  const {
    doc,
    plan,
    currentPage,
    load,
    reset,
    save,
    resetPlan,
    isDirty,
    saving,
    merge,
    split,
    hasAnnotations,
    isAnnotationsDirty,
    saveAnnotations,
    exportAnnotated,
    clearAnnotations,
    showToast,
  } = useDocument();
  const openRef = useRef(null);
  const mergeRef = useRef(null);
  const pagesDirty = isDirty();
  const hasAnnots = hasAnnotations();
  const annotsDirty = isAnnotationsDirty();

  async function handleExport() {
    const flatId = await exportAnnotated();
    if (!flatId) return; // the store already surfaced the error as a toast
    // Download via blob: a plain anchor click can silently do nothing in
    // some browsers (no Content-Disposition, popup blockers), which is
    // what made Export look dead. Fetching the bytes and using an object
    // URL always triggers the download — and a failed fetch is reported.
    try {
      const res = await fetch(`/api/documents/${flatId}/raw`);
      if (!res.ok) throw new Error(`server responded ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "annotated.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Exported - Download Starting");
    } catch (e) {
      showToast("Exported, but the download failed: " + e.message, "error");
    }
  }

  return (
    <header className="toolbar">
      <div className="brand">
        PDF<span>Editor</span>
      </div>
      {doc && <div className="doc-name">{doc.filename}</div>}
      <div className="spacer" />

      {doc && (
        <>
          <button
            className="tool-btn"
            onClick={() => mergeRef.current?.click()}
            disabled={saving}
          >
            Merge
          </button>
          <button
            className="tool-btn"
            onClick={() => split(currentPage + 1)}
            disabled={saving || currentPage >= plan.length - 1}
            title="Split into two files after the current page"
          >
            Split here
          </button>
          <div className="tool-sep" />

          {hasAnnots && (
            <>
              <button className="tool-btn" onClick={clearAnnotations} disabled={saving}>
                Clear marks
              </button>
              <button
                className="tool-btn"
                onClick={handleExport}
                disabled={saving}
                title="Download a flattened copy with marks burned in"
              >
                Export PDF
              </button>
              {annotsDirty ? (
                <button
                  className="tool-btn primary"
                  onClick={saveAnnotations}
                  disabled={saving}
                  title="Save marks (they stay editable when you reopen)"
                >
                  {saving ? "Saving..." : "Save marks"}
                </button>
              ) : (
                <span className="saved-tag">Marks saved</span>
              )}
            </>
          )}

          {pagesDirty && (
            <>
              <button className="tool-btn" onClick={resetPlan} disabled={saving}>
                Reset
              </button>
              <button
                className="tool-btn primary"
                onClick={save}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save pages"}
              </button>
            </>
          )}

          {!pagesDirty && !hasAnnots && (
            <span className="saved-tag">Saved</span>
          )}

          <div className="tool-sep" />
          <button className="tool-btn" onClick={reset} disabled={saving}>
            Close
          </button>
        </>
      )}

      <button
        className="tool-btn primary"
        onClick={() => openRef.current?.click()}
      >
        Open PDF
      </button>

      <input
        ref={openRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => e.target.files?.[0] && load(e.target.files[0])}
      />
      <input
        ref={mergeRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) merge(e.target.files[0], currentPage);
          e.target.value = "";
        }}
      />
    </header>
  );
}