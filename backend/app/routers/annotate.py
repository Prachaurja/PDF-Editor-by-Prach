from fastapi import APIRouter

from app.utils.file_handler import get_upload_path
from app.services.annotate_service import apply_annotations
from app.services.annotation_store import (
    load_annotations,
    save_annotations,
)
from app.services.document_service import get_document_info
from app.models.requests import ApplyAnnotationsRequest
from app.models.responses import DocumentInfo

router = APIRouter(prefix="/api/annotate", tags=["annotate"])


@router.get("/{file_id}")
async def get_saved(file_id: str):
    """Return the editable annotation layer saved for this document."""
    get_upload_path(file_id)  # 404 if the document is gone
    return {"annotations": load_annotations(file_id)}


@router.post("/{file_id}/save")
async def save(file_id: str, req: ApplyAnnotationsRequest):
    """Persist the editable annotation layer (stays editable on reload).

    The document keeps its file_id, so re-opening it restores these marks.
    """
    get_upload_path(file_id)
    # store the raw annotation dicts exactly as sent, so they round-trip
    save_annotations(file_id, [a.model_dump() for a in req.annotations])
    return {"file_id": file_id, "count": len(req.annotations)}


@router.post("/{file_id}/export", response_model=DocumentInfo)
async def export_flat(file_id: str, req: ApplyAnnotationsRequest):
    """Burn annotations into a NEW flattened PDF (for download/sharing).

    Also persists the layer so the original stays editable.
    """
    src = get_upload_path(file_id)
    save_annotations(file_id, [a.model_dump() for a in req.annotations])
    new_id, new_path = apply_annotations(src, req.annotations)
    return get_document_info(new_id, "annotated.pdf", new_path)
