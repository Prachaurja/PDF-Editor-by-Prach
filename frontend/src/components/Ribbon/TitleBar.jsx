import { useRef } from "react";
import { useDocument } from "../../store/useDocument";

/* Slim Word-style title bar: brand, document name, and the document-level
 * actions (clear / save / export marks, close, open). Page-level actions
 * (merge, split, reorder, ...) live on the Pages ribbon tab. */
export default function TitleBar() {
  const {
    doc,
    load,
    reset,
    hasAnnotations,
    isAnnotationsDirty,
    saveAnnotations,
    exportAnnotated,
    clearAnnotations,
    saving,
    showToast,
  } = useDocument();
  const openRef = useRef(null);

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

  const hasAnnots = hasAnnotations();
  const annotsDirty = isAnnotationsDirty();

  return (
    <header className="toolbar">
      <div className="brand">
        PDF<span>Editor</span>
      </div>
      {doc && (
        <div className="doc-name">
          {doc.filename}
          <span className="doc-meta">
            {" "}
            · {doc.page_count} page{doc.page_count === 1 ? "" : "s"}
          </span>
        </div>
      )}
      <div className="spacer" />

      {doc && (
        <>
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

          {!hasAnnots && <span className="saved-tag">Saved</span>}

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
    </header>
  );
}