import { useRef } from "react";
import { useDocument } from "../../store/useDocument";
import { exportAnnotated } from "../../api/client";

/* Word-style title bar: brand, document name, document-level actions.
 * Per-page + annotation controls live in the Ribbon below. */
export default function TitleBar() {
  const {
    doc, loading, saving, annotationsDirty,
    clearAnnotations, save, reset, showToast,
  } = useDocument();
  const openRef = useRef(null);

  async function handleExport() {
    if (!doc) return;
    try {
      const { annotations, layerId } = useDocument.getState();
      const res = await exportAnnotated(doc.file_id, annotations, layerId);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "annotated.pdf";
      a.click();
      URL.revokeObjectURL(url);
      showToast("Exported PDF downloaded");
    } catch (e) {
      showToast("Export failed: " + e.message, "error");
    }
  }

  return (
    <div className="toolbar">
      <div className="brand">PDF Editor</div>

      {doc && (
        <div className="doc-name" title={doc.filename}>
          {doc.filename}
          <span className="doc-meta">{doc.page_count} page{doc.page_count === 1 ? "" : "s"}</span>
        </div>
      )}

      <div className="spacer" />

      {doc && (
        <>
          <button className="tool-btn" onClick={clearAnnotations} disabled={saving}
            title="Remove every mark from the current view (undo-able)">
            Clear marks
          </button>
          <button className="tool-btn" onClick={handleExport} disabled={saving}
            title="Download a copy of this file with your marks burned in">
            Export PDF
          </button>
          <button
            className={`tool-btn ${annotationsDirty ? "primary" : ""}`}
            onClick={save}
            disabled={saving || !annotationsDirty}
            title={annotationsDirty ? "Save your marks so they survive a reload" : "Your marks are saved"}
          >
            {saving ? "Saving..." : annotationsDirty ? "Save marks" : "Marks saved"}
          </button>
        </>
      )}

      <button
        className="tool-btn"
        onClick={() => reset()}
        title="Close the current document (saved marks stay attached to the file)"
      >
        Close
      </button>
      <button className="tool-btn primary" onClick={() => openRef.current?.click()} disabled={loading}>
        {loading ? "Opening..." : "Open PDF"}
      </button>

      <input
        ref={openRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) useDocument.getState().load(e.target.files[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}