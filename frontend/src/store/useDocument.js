import { create } from "zustand";
import {
  uploadDocument,
  applyPlan,
  splitDocument,
  mergeDocument,
  uploadRaw,
  saveAnnotationLayer,
  loadAnnotationLayer,
  exportAnnotated,
  fetchPageLines,
  extractPages,
} from "../api/client";

let annotationSeq = 1;

// Undo/redo of the annotation layer: snapshot-based, capped.
const HISTORY_LIMIT = 50;
// Coalescing bookkeeping: updates to the SAME object within COALESCE_MS are
// one gesture (a drag, a typing burst) -> a single undo step.
let lastHistoryPush = { id: null, at: 0 };
const COALESCE_MS = 600;

// Backend stores snake_case; the UI uses camelCase. Convert on the way in/out.
function fromBackend(a) {
  return {
    id: annotationSeq++,
    type: a.type,
    page: a.page,
    color: a.color,
    rects: a.rects || undefined,
    points: a.points || undefined,
    x: a.x ?? undefined,
    y: a.y ?? undefined,
    text: a.text ?? undefined,
    width: a.width ?? 2,
    shape: a.shape ?? undefined,
    fontSize: a.font_size ?? undefined,
    bold: a.bold ?? false,
    italic: a.italic ?? false,
    font: a.font || undefined,
    // User's explicit font-palette pick (CSS family). Wins over the
    // auto-detected document font for cover edits.
    fontFamily: a.font_family || undefined,
    align: a.align ?? undefined,
    w: a.w ?? undefined,
    h: a.h ?? undefined,
    opacity: a.opacity ?? undefined,
    cover: a.cover ?? false,
    coverColor: a.cover_color || undefined,
    bgColor: a.bg_color || undefined,
    // Bullet marker style ("round" | "open" | "square" | "dash" |
    // "triangle" | "star"). Older payloads sent a plain `true` — read it
    // as the classic round dot.
    bullet: a.bullet === true ? "round" : a.bullet || undefined,
    createdAt: a.created_at || new Date().toISOString(),
  };
}

function toBackend(a) {
  return {
    type: a.type,
    page: a.page,
    color: a.color,
    rects: a.rects || null,
    points: a.points || null,
    x: a.x ?? null,
    y: a.y ?? null,
    text: a.text ?? null,
    width: a.width ?? 2,
    shape: a.shape ?? null,
    font_size: a.fontSize ?? null,
    bold: a.bold ?? false,
    italic: a.italic ?? false,
    font: a.font ?? null,
    font_family: a.fontFamily ?? null,
    align: a.align ?? null,
    w: a.w ?? null,
    h: a.h ?? null,
    opacity: a.opacity ?? null,
    cover: a.cover ?? false,
    cover_color: a.coverColor ?? null,
    bg_color: a.bgColor ?? null,
    bullet: a.bullet ?? null,
    created_at: a.createdAt || null,
  };
}

// A plan is an ordered list of { key, sourceIndex, rotation }.
// `key` is a stable id for React lists and drag; sourceIndex points at the
// page in the currently-loaded document; rotation is absolute degrees.
function planFromDoc(doc) {
  return doc.pages.map((p) => ({
    key: `p${p.index}`,
    sourceIndex: p.index,
    rotation: p.rotation || 0,
  }));
}

export const useDocument = create((set, get) => {
  // Push a snapshot of the CURRENT annotation layer onto the undo stack.
  // With coalesceMs > 0, a second push for the same object inside the
  // window is skipped, so one drag / one typing burst stays one step.
  const pushHistory = ({ id = null, coalesceMs = 0 } = {}) => {
    const now = Date.now();
    if (coalesceMs > 0 && lastHistoryPush.id === id && now - lastHistoryPush.at < coalesceMs) return;
    lastHistoryPush = { id, at: now };
    set((s) => {
      const past = [...s.history.past, s.annotations];
      if (past.length > HISTORY_LIMIT) past.shift();
      return { history: { past, future: [] } };
    });
  };

  return {
  doc: null, // DocumentInfo of the loaded (saved) document
  plan: [], // staged pages, may differ from doc until saved
  currentPage: 0,
  loading: false,
  saving: false,
  error: null,
  splitResult: null, // { first, second } after a split

  // ---- annotations (Slice 3) ----
  tool: "select", // active annotation tool
  shape: "rect", // active shape when tool === "shape"
  color: "#0f6b62", // active color
  // Active background for NEW text boxes / edited lines. "transparent"
  // keeps the classic chrome-less look; cover edits fall back to white,
  // because a redaction must always paint something over the old line.
  textBgColor: "transparent",
  // textStyle.bullet = marker style for NEW text boxes ("round", "open",
  // "square", "dash", "triangle", "star") or undefined = no bullet.
  textStyle: { fontSize: 14, bold: false, italic: false, bullet: undefined, align: "left", fontFamily: "Helvetica" },
  lineWidth: 2, // pen/shape/line/arrow thickness, PDF points (1-4)
  highlightOpacity: 0.3, // highlight fill opacity (0.15 light / 0.3 medium / 0.5 strong)
  stampLabel: "APPROVED", // label the Stamp tool applies
  zoom: 1, // page zoom factor (0.5 - 2)
  annotations: [], // staged annotation objects, PDF-space coords
  selectedId: null,
  annotationsDirty: false, // true once something changed since the last save/load
  resizing: null, // { id } while a text box is being resized (UI only)
  toast: null, // { message, id } — a brief confirmation banner
  pageLines: {}, // cache: source page index -> extracted text lines, for click-to-edit
  // ---- ribbon (Word-style tabs) ----
  ribbonTab: "home", // "home" | "pages" | "rotate" | "sign" | "convert" | "optimize"
  // Pages tab: multi-select of plan positions (display order, 0-based).
  pageSelection: [],
  // ---- undo / redo (annotation layer, capped at HISTORY_LIMIT) ----
  history: { past: [], future: [] },

  async load(file) {
    lastHistoryPush = { id: null, at: 0 };
    set({ loading: true, error: null, splitResult: null, annotations: [], selectedId: null, tool: "select", pageLines: {}, zoom: 1, history: { past: [], future: [] }, ribbonTab: "home", pageSelection: [] });
    try {
      const doc = await uploadDocument(file);
      // restore any editable annotation layer saved for this document
      let annotations = [];
      try {
        const saved = await loadAnnotationLayer(doc.file_id);
        annotations = (saved.annotations || []).map(fromBackend);
      } catch {
        annotations = [];
      }
      set({ doc, plan: planFromDoc(doc), currentPage: 0, loading: false, annotations, annotationsDirty: false, history: { past: [], future: [] } });
    } catch (e) {
      set({ error: e.message, loading: false });
    }
  },

  setPage(index) {
    set({ currentPage: index });
  },

  // ---- staged operations (do not touch the backend) ----
  rotatePage(planIndex, dir = 1) {
    set((s) => {
      const plan = s.plan.slice();
      const step = dir >= 0 ? 90 : -90;
      plan[planIndex] = {
        ...plan[planIndex],
        rotation: (((plan[planIndex].rotation + step) % 360) + 360) % 360,
      };
      return { plan };
    });
  },

  deletePage(planIndex) {
    set((s) => {
      if (s.plan.length <= 1) return { error: "A document needs at least one page." };
      const plan = s.plan.slice();
      plan.splice(planIndex, 1);
      const currentPage = Math.min(s.currentPage, plan.length - 1);
      // Positions after the deleted one shift — the multi-select is stale.
      return { plan, currentPage, error: null, pageSelection: [] };
    });
  },

  movePage(from, to) {
    set((s) => {
      if (to < 0 || to >= s.plan.length) return {};
      const plan = s.plan.slice();
      const [moved] = plan.splice(from, 1);
      plan.splice(to, 0, moved);
      // Reordering shifts positions, so a multi-select would point at the
      // wrong pages — drop it.
      return { plan, currentPage: to, pageSelection: [] };
    });
  },

  resetPlan() {
    const { doc } = get();
    if (doc) set({ plan: planFromDoc(doc), error: null, pageSelection: [] });
  },
  // ---- ribbon + Pages-tab multi-select ----
  setRibbonTab(tab) {
    set({ ribbonTab: tab });
  },

  togglePageSelection(index) {
    set((s) => ({
      pageSelection: s.pageSelection.includes(index)
        ? s.pageSelection.filter((i) => i !== index)
        : [...s.pageSelection, index],
    }));
  },

  clearPageSelection() {
    set({ pageSelection: [] });
  },

  // Rotate every selected page 90° clockwise. The selection is kept so you
  // can rotate again (or rotate the same set twice for 180°).
  rotateSelectedPages() {
    const { pageSelection } = get();
    if (pageSelection.length === 0) return;
    set((s) => ({
      plan: s.plan.map((p, i) =>
        s.pageSelection.includes(i)
          ? { ...p, rotation: (((p.rotation + 90) % 360) + 360) % 360 }
          : p
      ),
    }));
  },

  // Delete every selected page (never the last remaining page).
  deleteSelectedPages() {
    const { pageSelection, plan } = get();
    if (pageSelection.length === 0) return;
    if (pageSelection.length >= plan.length) {
      set({ error: "A document needs at least one page." });
      return;
    }
    const toDelete = new Set(pageSelection);
    set((s) => {
      const kept = s.plan.filter((_, i) => !toDelete.has(i));
      return {
        plan: kept,
        currentPage: Math.min(s.currentPage, kept.length - 1),
        pageSelection: [],
        error: null,
      };
    });
  },

  // Extract the selected pages into a fresh document and open it.
  // Refuses to run while there are UNSAVED marks (they belong to the current
  // file and would otherwise be silently left behind).
  async extractSelectedPages() {
    const { doc, plan, pageSelection, isAnnotationsDirty, saving } = get();
    if (!doc || saving || pageSelection.length === 0) return;
    if (isAnnotationsDirty()) {
      get().showToast("Save your marks before extracting pages", "error");
      return;
    }
    const sourceIdx = [...new Set(pageSelection.map((i) => plan[i].sourceIndex))].sort(
      (a, b) => a - b
    );
    set({ saving: true, error: null });
    try {
      const newDoc = await extractPages(doc.file_id, sourceIdx);
      set({
        doc: newDoc,
        plan: planFromDoc(newDoc),
        currentPage: 0,
        saving: false,
        pageSelection: [],
        annotations: [],
        selectedId: null,
        tool: "select",
        annotationsDirty: false,
        ribbonTab: "pages",
        history: { past: [], future: [] },
      });
      get().showToast(
        `Extracted ${sourceIdx.length} page${sourceIdx.length > 1 ? "s" : ""} into a new document`
      );
    } catch (e) {
      set({ error: e.message, saving: false });
      get().showToast("Extract failed: " + e.message, "error");
    }
  },
  
  isDirty() {
    const { doc, plan } = get();
    if (!doc) return false;
    if (plan.length !== doc.pages.length) return true;
    return plan.some(
      (p, i) => p.sourceIndex !== i || p.rotation !== (doc.pages[i].rotation || 0)
    );
  },

  // ---- commit ----
  async save() {
    const { doc, plan } = get();
    if (!doc) return;
    set({ saving: true, error: null });
    try {
      const payload = plan.map((p) => ({
        source_index: p.sourceIndex,
        rotation: p.rotation,
      }));
            const newDoc = await applyPlan(doc.file_id, payload);
      set({
        doc: newDoc,
        plan: planFromDoc(newDoc),
        currentPage: 0,
        saving: false,
        pageSelection: [],
      });
      get().showToast("Page Saved");
    } catch (e) {
      set({ error: e.message, saving: false });
    }
  },

  async split(atIndex) {
    const { doc } = get();
    if (!doc) return;
    set({ saving: true, error: null });
    try {
      const result = await splitDocument(doc.file_id, atIndex);
      set({ splitResult: result, saving: false, pageSelection: [] });
    } catch (e) {
      set({ error: e.message, saving: false });
    }
  },

  clearSplitResult() {
    set({ splitResult: null });
  },

  async merge(file, afterIndex) {
    const { doc } = get();
    if (!doc) return;
    set({ saving: true, error: null });
    try {
      const other = await uploadRaw(file);
      const newDoc = await mergeDocument(doc.file_id, other.file_id, afterIndex);
      set({
        doc: newDoc,
        plan: planFromDoc(newDoc),
        currentPage: 0,
        saving: false,
        pageSelection: [],
      });
      get().showToast("Document Merged");
    } catch (e) {
      set({ error: e.message, saving: false });
    }
  },

  // kind: "ok" (green check) or "error" (red, longer visible) — failures
  // used to show only as tiny red text in the status bar, which is easy to
  // miss, so e.g. a failed export looked like "the button does nothing".
  showToast(message, kind = "ok") {
    set({ toast: { message, kind, id: Date.now() } });
  },

  dismissToast() {
    set({ toast: null });
  },

  // Fetch (and cache) the text lines on a source page, for click-to-edit.
  // Keyed by the FILE's actual page index, not the display/plan position.
  async getPageLines(sourcePageIndex) {
    const { doc, pageLines } = get();
    if (!doc) return [];
    if (pageLines[sourcePageIndex]) return pageLines[sourcePageIndex];
    try {
      const res = await fetchPageLines(doc.file_id, sourcePageIndex);
      const lines = res.lines || [];
      set((s) => ({ pageLines: { ...s.pageLines, [sourcePageIndex]: lines } }));
      return lines;
    } catch {
      return [];
    }
  },

  // ---- annotation actions ----
  setTool(tool) {
    set({ tool, selectedId: null });
  },

  setShape(shape) {
    set({ shape, tool: "shape", selectedId: null });
  },

  setTextStyle(patch) {
    const { selectedId, annotations } = get();
    if (selectedId && annotations.some((a) => a.id === selectedId && a.type === "text")) pushHistory();
    set((s) => {
      const textStyle = { ...s.textStyle, ...patch };
      if (s.selectedId) {
        const annotations = s.annotations.map((a) =>
          a.id === s.selectedId && a.type === "text" ? { ...a, ...patch } : a
        );
        return { textStyle, annotations, annotationsDirty: true };
      }
      return { textStyle };
    });
  },

  // MAIN swatch row = the INK for the drawing tools (pen, highlight,
  // shapes, lines, notes, stamps). With a drawing mark selected it
  // recolors THAT mark. It deliberately does NOT touch a selected text
  // box — text has its own color picker (setTextColor) and its own
  // background picker (setTextBgColor), so font color and background
  // color can no longer move together.
  setColor(color) {
    const { selectedId, annotations } = get();
    const selIsText = selectedId && annotations.some((a) => a.id === selectedId && a.type === "text");
    if (selectedId && !selIsText && annotations.some((a) => a.id === selectedId)) pushHistory();
    set((s) => {
      if (s.selectedId) {
        const annotations = s.annotations.map((a) =>
          a.id === s.selectedId && a.type !== "text" ? { ...a, color } : a
        );
        return { color, annotations, annotationsDirty: true };
      }
      return { color };
    });
  },

  // TEXT color — the "A" picker in the text cluster. Separate from the
  // drawing ink above and from the background color. With a text box
  // selected it recolors THAT box (plain box or edited line); with
  // nothing selected it sets the ink new text boxes are created with.
  setTextColor(color) {
    const { selectedId, annotations } = get();
    const sel = annotations.find((a) => a.id === selectedId && a.type === "text");
    if (sel) {
      pushHistory({ id: sel.id });
      set((s) => ({
        annotations: s.annotations.map((a) =>
          a.id === s.selectedId && a.type === "text" ? { ...a, color } : a
        ),
        annotationsDirty: true,
      }));
      return;
    }
    set({ color });
  },
  // Line thickness for pen/shape/line/arrow. Like color, it also patches
  // the currently selected (line-type) annotation so you can re-thicken a
  // mark you already drew.
  setLineWidth(width) {
    const { selectedId, annotations } = get();
    if (selectedId && annotations.some((a) => a.id === selectedId && ["pen", "line", "arrow", "shape", "rect"].includes(a.type))) pushHistory();
    set((s) => {
      if (s.selectedId) {
        const annotations = s.annotations.map((a) =>
          a.id === s.selectedId && ["pen", "line", "arrow", "shape", "rect"].includes(a.type)
            ? { ...a, width }
            : a
        );
        return { lineWidth: width, annotations, annotationsDirty: true };
      }
      return { lineWidth: width };
    });
  },

  // Highlight fill opacity. Also patches a selected highlight.
  setHighlightOpacity(opacity) {
    const { selectedId, annotations } = get();
    if (selectedId && annotations.some((a) => a.id === selectedId && a.type === "highlight")) pushHistory();
    set((s) => {
      if (s.selectedId) {
        const annotations = s.annotations.map((a) =>
          a.id === s.selectedId && a.type === "highlight" ? { ...a, opacity } : a
        );
        return { highlightOpacity: opacity, annotations, annotationsDirty: true };
      }
      return { highlightOpacity: opacity };
    });
  },

  // Background color for text boxes / edited lines. "transparent" = no
  // background (the classic look). Like color, it also patches a selected
  // text box — for an edited line it changes the patch color, so you can
  // tune it until the edit blends into a non-white page background.
  setTextBgColor(color) {
    const { selectedId, annotations } = get();
    if (selectedId && annotations.some((a) => a.id === selectedId && a.type === "text")) pushHistory();
    set((s) => {
      if (s.selectedId) {
        const annotations = s.annotations.map((a) => {
          if (a.id !== s.selectedId || a.type !== "text") return a;
          if (a.cover) return { ...a, coverColor: color === "transparent" ? "#ffffff" : color };
          return { ...a, bgColor: color === "transparent" ? undefined : color };
        });
        return { textBgColor: color, annotations, annotationsDirty: true };
      }
      return { textBgColor: color };
    });
  },

  setStampLabel(label) {
    set({ stampLabel: label });
  },

  // ---- viewer zoom (0.5 - 2) ----
  zoomIn() {
    set((s) => ({ zoom: Math.min(2, Math.round((s.zoom + 0.25) * 100) / 100) }));
  },

  zoomOut() {
    set((s) => ({ zoom: Math.max(0.5, Math.round((s.zoom - 0.25) * 100) / 100) }));
  },

  zoomFit() {
    set({ zoom: 1 });
  },

  addAnnotation(ann) {
    const id = annotationSeq++;
    const withMeta = {
      id,
      createdAt: new Date().toISOString(),
      ...ann,
    };
    // The tool stays ARMED after placement (no revert to Select): you can
    // put down several text boxes, stamps, shapes, lines in a row without
    // re-picking the tool each time. Press Esc — or click Select — to
    // switch back to selection/move mode.
    pushHistory({ id, coalesceMs: COALESCE_MS });
    set((s) => ({
      annotations: [...s.annotations, withMeta],
      selectedId: id,
      annotationsDirty: true,
    }));
    return id;
  },

  updateAnnotation(id, patch) {
    // Pure focus/blur bookkeeping (the `editing` flag) is not an undoable
    // change; everything else coalesces per object for COALESCE_MS, so one
    // drag or one typing burst is a single undo step.
    const onlyEditing = Object.keys(patch).length === 1 && "editing" in patch;
    if (!onlyEditing) pushHistory({ id, coalesceMs: COALESCE_MS });
    set((s) => ({
      annotations: s.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      annotationsDirty: true,
    }));
  },

  selectAnnotation(id) {
    set({ selectedId: id });
  },

  deleteAnnotation(id) {
    pushHistory({ id });
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      annotationsDirty: true,
    }));
  },

  clearAnnotations() {
    if (get().annotations.length === 0) return;
    pushHistory({ id: null });
    set({ annotations: [], selectedId: null, annotationsDirty: true });
  },

  hasAnnotations() {
    return get().annotations.length > 0;
  },

  isAnnotationsDirty() {
    return get().annotationsDirty;
  },

  // ---- undo / redo (annotation layer, capped at HISTORY_LIMIT steps) ----
  undo() {
    const { history, annotations, selectedId } = get();
    if (history.past.length === 0) return;
    const past = history.past.slice();
    const prev = past.pop();
    lastHistoryPush = { id: null, at: 0 };
    set({
      annotations: prev,
      history: { past, future: [...history.future, annotations].slice(-HISTORY_LIMIT) },
      selectedId: prev.some((a) => a.id === selectedId) ? selectedId : null,
      annotationsDirty: true,
    });
  },

  redo() {
    const { history, annotations, selectedId } = get();
    if (history.future.length === 0) return;
    const future = history.future.slice();
    const next = future.pop();
    lastHistoryPush = { id: null, at: 0 };
    set({
      annotations: next,
      history: { past: [...history.past, annotations].slice(-HISTORY_LIMIT), future },
      selectedId: next.some((a) => a.id === selectedId) ? selectedId : null,
      annotationsDirty: true,
    });
  },

  async saveAnnotations() {
    const { doc, annotations } = get();
    if (!doc) return;
    set({ saving: true, error: null });
    try {
      await saveAnnotationLayer(doc.file_id, annotations.map(toBackend));
      // annotations stay in place and editable — just mark as saved
      set({ saving: false, savedAt: Date.now(), annotationsDirty: false });
      get().showToast("Marks Saved");
    } catch (e) {
      set({ error: e.message, saving: false });
      get().showToast("Saving marks failed: " + e.message, "error");
    }
  },

  async exportAnnotated() {
    const { doc, annotations } = get();
    if (!doc) return null;
    set({ saving: true, error: null });
    try {
      const flat = await exportAnnotated(doc.file_id, annotations.map(toBackend));
      set({ saving: false, savedAt: Date.now(), annotationsDirty: false });
      return flat.file_id; // caller downloads this flattened copy
    } catch (e) {
      set({ error: e.message, saving: false });
      get().showToast("Export failed: " + e.message, "error");
      return null;
    }
  },

  reset() {
    lastHistoryPush = { id: null, at: 0 };
    set({
      doc: null,
      plan: [],
      error: null,
      splitResult: null,
      annotations: [],
      selectedId: null,
      tool: "select",
      annotationsDirty: false,
      zoom: 1,
      ribbonTab: "home",
      pageSelection: [],
      history: { past: [], future: [] },
    });
  },
  };
});