from fastapi import APIRouter

from app.utils.file_handler import get_upload_path
from app.services.page_service import apply_plan, split_document, merge_documents
from app.services.document_service import get_document_info
from app.models.requests import ApplyPlanRequest, MergeRequest
from app.models.responses import DocumentInfo

router = APIRouter(prefix="/api/pages", tags=["pages"])


@router.post("/{file_id}/apply", response_model=DocumentInfo)
async def apply(file_id: str, req: ApplyPlanRequest):
    """Apply a staged plan (reorder / delete / rotate) and return the new doc."""
    src = get_upload_path(file_id)
    new_id, new_path = apply_plan(src, req.plan)
    return get_document_info(new_id, "edited.pdf", new_path)


@router.post("/{file_id}/split")
async def split(file_id: str, at_index: int):
    """Split into two documents at a page boundary."""
    src = get_upload_path(file_id)
    (id_a, path_a), (id_b, path_b) = split_document(src, at_index)
    return {
        "first": get_document_info(id_a, "part-1.pdf", path_a),
        "second": get_document_info(id_b, "part-2.pdf", path_b),
    }


@router.post("/{file_id}/merge", response_model=DocumentInfo)
async def merge(file_id: str, req: MergeRequest):
    """Merge another uploaded document into this one."""
    base = get_upload_path(file_id)
    other = get_upload_path(req.other_file_id)
    new_id, new_path = merge_documents(base, other, req.after_index)
    return get_document_info(new_id, "merged.pdf", new_path)
