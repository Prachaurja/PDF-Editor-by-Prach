from fastapi import APIRouter, UploadFile, File, Response

from app.utils.file_handler import save_upload, get_upload_path
from app.utils.pdf_loader import open_pdf, render_page_png
from app.services.document_service import get_document_info
from app.services.text_service import extract_text_lines
from app.models.responses import DocumentInfo
from app.config import THUMBNAIL_DPI, PAGE_PREVIEW_DPI

router = APIRouter(prefix="/api/documents", tags=["documents"])

# Keep original filenames in memory keyed by file_id (simple for slice 1).
_filenames: dict[str, str] = {}


@router.post("/upload", response_model=DocumentInfo)
async def upload_document(file: UploadFile = File(...)):
    file_id, path = await save_upload(file)
    filename = file.filename or "document.pdf"
    _filenames[file_id] = filename
    return get_document_info(file_id, filename, path)


@router.get("/{file_id}/info", response_model=DocumentInfo)
async def document_info(file_id: str):
    path = get_upload_path(file_id)
    filename = _filenames.get(file_id, "document.pdf")
    return get_document_info(file_id, filename, path)


@router.get("/{file_id}/thumbnail/{page_index}")
async def page_thumbnail(file_id: str, page_index: int):
    path = get_upload_path(file_id)
    doc = open_pdf(path)
    try:
        png = render_page_png(doc, page_index, THUMBNAIL_DPI)
    finally:
        doc.close()
    return Response(content=png, media_type="image/png")


@router.get("/{file_id}/page/{page_index}")
async def page_preview(file_id: str, page_index: int):
    path = get_upload_path(file_id)
    doc = open_pdf(path)
    try:
        png = render_page_png(doc, page_index, PAGE_PREVIEW_DPI)
    finally:
        doc.close()
    return Response(content=png, media_type="image/png")


@router.get("/{file_id}/raw")
async def raw_pdf(file_id: str):
    path = get_upload_path(file_id)
    return Response(content=path.read_bytes(), media_type="application/pdf")


@router.get("/{file_id}/text-lines/{page_index}")
async def text_lines(file_id: str, page_index: int):
    """Lines of existing text on a page, with bounding boxes, for click-to-edit."""
    path = get_upload_path(file_id)
    return {"lines": extract_text_lines(path, page_index)}
