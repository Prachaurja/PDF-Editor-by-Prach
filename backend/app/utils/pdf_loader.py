import fitz  # PyMuPDF
from pathlib import Path
from fastapi import HTTPException


def open_pdf(path: Path) -> fitz.Document:
    """Open a PDF, raising a clean 400 if it is corrupt or not a PDF."""
    try:
        doc = fitz.open(path)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not open file as a PDF.")
    if doc.page_count == 0:
        doc.close()
        raise HTTPException(status_code=400, detail="PDF has no pages.")
    return doc


def render_page_png(doc: fitz.Document, page_index: int, dpi: int) -> bytes:
    """Render a single page to PNG bytes at the given DPI."""
    if page_index < 0 or page_index >= doc.page_count:
        raise HTTPException(status_code=404, detail="Page index out of range.")
    page = doc.load_page(page_index)
    zoom = dpi / 72
    matrix = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    return pix.tobytes("png")
