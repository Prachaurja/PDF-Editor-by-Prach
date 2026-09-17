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
} from "../api/client";

let annotationSeq = 1;

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
    align: a.align ?? undefined,
    w: a.w ?? undefined,
    h: a.h ?? undefined,
    cover: a.cover ?? false,
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
    align: a.align ?? null,
    w: a.w ?? null,
    h: a.h ?? null,
    cover: a.cover ?? false,
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

export const useDocument = create((set, get) => ({
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
  textStyle: { fontSize: 14, bold: false, align: "left" },
  annotations: [], // staged annotation objects, PDF-space coords
  selectedId: null,
  annotationsDirty: false, // true once something changed since the last save/load
  resizing: null, // { id } while a text box is being resized (UI only)
  toast: null, // { message, id } — a brief confirmation banner
  pageLines: {}, // cache: source page index -> extracted text lines, for click-to-edit

  async load(file) {
    set({ loading: true, error: null, splitResult: null, annotations: [], selectedId: null, tool: "select", pageLines: {} });
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
      set({ doc, plan: planFromDoc(doc), currentPage: 0, loading: false, annotations, annotationsDirty: false });
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
      return { plan, currentPage, error: null };
    });
  },

  movePage(from, to) {
    set((s) => {
      if (to < 0 || to >= s.plan.length) return {};
      const plan = s.plan.slice();
      const [moved] = plan.splice(from, 1);
      plan.splice(to, 0, moved);
      return { plan, currentPage: to };
    });
  },

  resetPlan() {
    const { doc } = get();
    if (doc) set({ plan: planFromDoc(doc), error: null });
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
      set({ splitResult: result, saving: false });
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
      });
      get().showToast("Document Merged");
    } catch (e) {
      set({ error: e.message, saving: false });
    }
  },

  showToast(message) {
    set({ toast: { message, id: Date.now() } });
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

  setColor(color) {
    set((s) => {
      if (s.selectedId) {
        const annotations = s.annotations.map((a) =>
          a.id === s.selectedId ? { ...a, color } : a
        );
        return { color, annotations, annotationsDirty: true };
      }
      return { color };
    });
  },

  addAnnotation(ann) {
    const id = annotationSeq++;
    const withMeta = {
      id,
      createdAt: new Date().toISOString(),
      ...ann,
    };
    // Discrete, single-object tools drop back to Select so the new object
    // can be moved/resized right away. Marking tools (highlight, underline,
    // strike, pen) stay active so you can keep marking without re-selecting.
    // Existing-line edits (type "text" with cover:true) are also excluded —
    // that tool is meant for clicking through several lines in a row, and
    // reverting to Select after the first click made the second click land
    // on the just-created box instead of finding the next line.
    const isCoverEdit = ann.type === "text" && ann.cover;
    const discrete = !isCoverEdit && ["text", "note", "stamp", "shape", "line", "arrow"].includes(ann.type);
    set((s) => ({
      annotations: [...s.annotations, withMeta],
      selectedId: id,
      annotationsDirty: true,
      tool: discrete ? "select" : s.tool,
    }));
    return id;
  },

  updateAnnotation(id, patch) {
    set((s) => ({
      annotations: s.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      annotationsDirty: true,
    }));
  },

  selectAnnotation(id) {
    set({ selectedId: id });
  },

  deleteAnnotation(id) {
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      annotationsDirty: true,
    }));
  },

  clearAnnotations() {
    set({ annotations: [], selectedId: null, annotationsDirty: true });
  },

  hasAnnotations() {
    return get().annotations.length > 0;
  },

  isAnnotationsDirty() {
    return get().annotationsDirty;
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
    }
  },

  async exportAnnotated() {
    const { doc, annotations } = get();
    if (!doc) return null;
    set({ saving: true, error: null });
    try {
      const flat = await exportAnnotated(doc.file_id, annotations.map(toBackend));
      set({ saving: false, savedAt: Date.now(), annotationsDirty: false });
      get().showToast("Exported - Download Starting");
      return flat.file_id; // caller can download this flattened copy
    } catch (e) {
      set({ error: e.message, saving: false });
      return null;
    }
  },

  reset() {
    set({
      doc: null,
      plan: [],
      currentPage: 0,
      error: null,
      splitResult: null,
      annotations: [],
      selectedId: null,
      tool: "select",
      annotationsDirty: false,
    });
  },
}));
