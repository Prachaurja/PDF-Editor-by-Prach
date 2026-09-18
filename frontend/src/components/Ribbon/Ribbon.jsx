import { useEffect } from "react";
import { useDocument } from "../../store/useDocument";
import HomeRibbon from "../Annotate/AnnotationToolbar";
import PagesRibbon from "./PagesRibbon";
import PlaceholderRibbon from "./PlaceholderRibbon";

/* The Word-style tab strip + active tab's ribbon.
 *
 * Home            – everything that already works (annotating, styles, history)
 * Pages           – all pages as cards: select, insert, extract, rotate,
 *                   delete, split, merge, reorder
 * Rotate          – planned: page → image → text-line rotation (roadmap shown)
 * Sign & OCR      – planned: signatures, scanning, OCR
 * Convert & Export– planned: PDF → Word / Excel / PowerPoint / images / text
 * Optimize & Batch– planned: compression + batch operations
 */
const TABS = [
  { id: "home", label: "Home" },
  { id: "pages", label: "Pages" },
  { id: "rotate", label: "Rotate" },
  { id: "sign", label: "Sign & OCR" },
  { id: "convert", label: "Convert" },
  { id: "optimize", label: "Optimize & Batch" },
];

/* What each planned tab will contain — the rendered roadmap. */
const PLACEHOLDERS = {
  rotate: {
    title: "Rotate",
    note: "Rotation, in layers — starting with what's already built (page rotation lives in Pages), then going deeper.",
    items: [
      { tile: "PAGE", tileBg: "#0f6b62", tileColor: "#fff", title: "Page rotation", sub: "90° steps on any page(s)", badge: "Now — see Pages tab" },
      { tile: "IMG", tileBg: "#127d5f", tileColor: "#fff", title: "Image rotation", sub: "Rotate embedded photos 90° in place", badge: "Next" },
      { tile: "TXT", tileBg: "#3a6ea5", tileColor: "#fff", title: "Text line rotation", sub: "Free-angle rotation of a selected line", badge: "Later" },
      { tile: "TBL", tileBg: "#6b6862", tileColor: "#fff", title: "Table rotation", sub: "Covered by page rotation — no separate feature", badge: "Planned" },
    ],
  },
  sign: {
    title: "Sign & OCR",
    note: "Make the PDF yours, then make it searchable.",
    items: [
      { tile: "✍", tileBg: "#a4443a", tileColor: "#fff", title: "Signature", sub: "Type, draw, or upload — stamp it anywhere", badge: "Planned" },
      { tile: "OCR", tileBg: "#5b4b8a", tileColor: "#fff", title: "Scan & OCR", sub: "Searchable text layer via Tesseract", badge: "Planned" },
    ],
  },
  convert: {
    title: "Convert & export",
    fileHeader: true,
    note: "Where applicable — each format uses its best engine (pdf2docx, camelot, LibreOffice…).",
    grid: 2,
    items: [
      { tile: "W", tileBg: "#3a6ea5", tileColor: "#fff", title: "Word", sub: ".docx", badge: "Planned" },
      { tile: "X", tileBg: "#127d5f", tileColor: "#fff", title: "Excel", sub: ".xlsx tables", badge: "Planned" },
      { tile: "P", tileBg: "#c0392b", tileColor: "#fff", title: "PowerPoint", sub: ".pptx slides", badge: "Planned" },
      { tile: "IMG", tileBg: "#e08a1e", tileColor: "#fff", title: "Images", sub: "PNG / JPG per page", badge: "Planned" },
      { tile: "TXT", tileBg: "#1a1a1a", tileColor: "#fff", title: "Plain text", sub: ".txt", badge: "Planned" },
      { tile: "CSV", tileBg: "#0f6b62", tileColor: "#fff", title: "CSV", sub: "tables to spreadsheet", badge: "Planned" },
      { tile: "HTML", tileBg: "#5b4b8a", tileColor: "#fff", title: "HTML", sub: "web page", badge: "Planned" },
    ],
  },
  optimize: {
    title: "Optimize & Batch",
    note: "Smaller files, done by the hundred.",
    items: [
      { tile: "ZIP", tileBg: "#0f6b62", tileColor: "#fff", title: "Compress", sub: "Ghostscript quality presets", badge: "Planned" },
      { tile: "BATCH", tileBg: "#3a6ea5", tileColor: "#fff", title: "Batch operations", sub: "Apply one action to many files", badge: "Planned" },
      { tile: "PDF/A", tileBg: "#a4443a", tileColor: "#fff", title: "Archival", sub: "PDF/A long-term format", badge: "Planned" },
    ],
  },
};

export default function Ribbon() {
  const { ribbonTab, setRibbonTab, setTool, undo, redo } = useDocument();

  // Global shortcuts: Esc -> Home tab + Select; Ctrl/Cmd+Z undo;
  // Ctrl/Cmd+Shift+Z / Ctrl+Y redo. Work from any tab.
  useEffect(() => {
    function onKey(e) {
      const t = e.target;
      const inField =
        t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "Escape" && !inField) {
        setRibbonTab("home");
        setTool("select");
        return;
      }
      if (inField) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setRibbonTab, setTool, undo, redo]);

  return (
    <div className="ribbon">
      <div className="ribbon-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`ribbon-tab ${ribbonTab === t.id ? "active" : ""}`}
            onClick={() => setRibbonTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="ribbon-body">
        {ribbonTab === "home" && <HomeRibbon />}
        {ribbonTab === "pages" && <PagesRibbon />}
        {PLACEHOLDERS[ribbonTab] && <PlaceholderRibbon config={PLACEHOLDERS[ribbonTab]} />}
      </div>
    </div>
  );
}