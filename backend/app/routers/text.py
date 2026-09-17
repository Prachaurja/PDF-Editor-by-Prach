from fastapi import APIRouter

from app.utils.file_handler import get_upload_path
from app.services.text_service import extract_text_lines

router = APIRouter(prefix="/api/text", tags=["text"])


@router.get("/{file_id}/lines")
async def lines(file_id: str, page: int):
    """Return every text line on a page (bbox, text, approx font size/weight).

    The frontend fetches this once per page and does its own hit-testing
    against click position, rather than round-tripping per click.
    """
    path = get_upload_path(file_id)
    return {"lines": extract_text_lines(path, page)}
