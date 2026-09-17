import uuid
from pathlib import Path
from fastapi import UploadFile, HTTPException

from app.config import UPLOAD_DIR, PROCESSED_DIR, MAX_FILE_SIZE, ALLOWED_EXTENSIONS


def validate_pdf(file: UploadFile) -> None:
    """Reject anything that is not a plausible PDF upload."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Only PDF files are accepted.",
        )


async def save_upload(file: UploadFile) -> tuple[str, Path]:
    """Stream an upload to disk under a unique id. Returns (file_id, path)."""
    validate_pdf(file)

    file_id = uuid.uuid4().hex
    dest = UPLOAD_DIR / f"{file_id}.pdf"

    size = 0
    with open(dest, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_FILE_SIZE:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail="File exceeds the 100 MB limit.",
                )
            out.write(chunk)

    if size == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    return file_id, dest


def get_upload_path(file_id: str) -> Path:
    """Resolve a stored file by id, checking uploads then processed outputs."""
    for base in (UPLOAD_DIR, PROCESSED_DIR):
        path = base / f"{file_id}.pdf"
        if path.exists():
            return path
    raise HTTPException(status_code=404, detail="File not found.")
