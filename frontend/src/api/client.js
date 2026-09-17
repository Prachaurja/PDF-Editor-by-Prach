const BASE = "/api";

export async function uploadDocument(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/documents/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Upload failed. Try a different file.");
  }
  return res.json();
}

export function thumbnailUrl(fileId, pageIndex) {
  return `${BASE}/documents/${fileId}/thumbnail/${pageIndex}`;
}

export function pageUrl(fileId, pageIndex) {
  return `${BASE}/documents/${fileId}/page/${pageIndex}`;
}

export function rawUrl(fileId) {
  return `${BASE}/documents/${fileId}/raw`;
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Something went wrong. Try again.");
  }
  return res.json();
}

// Apply a staged plan (reorder / delete / rotate). Returns the new DocumentInfo.
export function applyPlan(fileId, plan) {
  return postJSON(`${BASE}/pages/${fileId}/apply`, { plan });
}

// Split at a page boundary. Returns { first, second }.
export async function splitDocument(fileId, atIndex) {
  const res = await fetch(`${BASE}/pages/${fileId}/split?at_index=${atIndex}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Could not split the document.");
  }
  return res.json();
}

// Fetch every text line on a page (for click-to-edit existing text).
export async function fetchPageLines(fileId, page) {
  const res = await fetch(`${BASE}/text/${fileId}/lines?page=${page}`);
  if (!res.ok) return { lines: [] };
  return res.json();
}

// Merge another uploaded document into this one.
export function mergeDocument(fileId, otherFileId, afterIndex) {
  return postJSON(`${BASE}/pages/${fileId}/merge`, {
    other_file_id: otherFileId,
    after_index: afterIndex,
  });
}

// Persist the editable annotation layer (annotations stay editable on reload).
export function saveAnnotationLayer(fileId, annotations) {
  return postJSON(`${BASE}/annotate/${fileId}/save`, { annotations });
}

// Load the saved annotation layer for a document.
export async function loadAnnotationLayer(fileId) {
  const res = await fetch(`${BASE}/annotate/${fileId}`);
  if (!res.ok) return { annotations: [] };
  return res.json();
}

// Export a flattened annotated PDF (for download).
export function exportAnnotated(fileId, annotations) {
  return postJSON(`${BASE}/annotate/${fileId}/export`, { annotations });
}

// Upload without touching global state (used to bring in a file to merge).
export async function uploadRaw(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/documents/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Upload failed.");
  }
  return res.json();
}
