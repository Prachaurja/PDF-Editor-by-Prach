from pathlib import Path

from app.utils.pdf_loader import open_pdf
from app.models.responses import DocumentInfo, PageInfo


def get_document_info(file_id: str, filename: str, path: Path) -> DocumentInfo:
    """Read page geometry and metadata for the viewer."""
    doc = open_pdf(path)
    try:
        pages = []
        for i in range(doc.page_count):
            page = doc.load_page(i)
            rect = page.rect
            pages.append(
                PageInfo(
                    index=i,
                    width=round(rect.width, 2),
                    height=round(rect.height, 2),
                    rotation=page.rotation,
                )
            )
        meta = doc.metadata or {}
        return DocumentInfo(
            file_id=file_id,
            filename=filename,
            page_count=doc.page_count,
            title=meta.get("title") or None,
            author=meta.get("author") or None,
            pages=pages,
        )
    finally:
        doc.close()
