"""Line extraction for click-to-edit text (Slice: existing-text editing).

Real PDFs don't store editable paragraphs, so we don't attempt true text
reflow. Instead we read each line's bounding box and an approximate font
size/weight from the page's text layer, so the frontend can let someone click
a line, see it turn editable, and replace it. The replacement is drawn fresh
(covering the original with a white patch) rather than rewriting the PDF's
internal text objects — this is the same approach most non-Adobe editors use.
"""

from pathlib import Path

from app.utils.pdf_loader import open_pdf


def extract_text_lines(path: Path, page_index: int) -> list[dict]:
    doc = open_pdf(path)
    try:
        if page_index < 0 or page_index >= doc.page_count:
            return []
        page = doc.load_page(page_index)
        raw = page.get_text("dict")
        lines = []
        for block in raw.get("blocks", []):
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                text = "".join(s.get("text", "") for s in spans).strip()
                if not text or not spans:
                    continue
                bbox = line.get("bbox")
                if not bbox:
                    continue
                size = spans[0].get("size", 11)
                font = (spans[0].get("font") or "").lower()
                bold = "bold" in font
                lines.append(
                    {
                        "bbox": [round(v, 2) for v in bbox],
                        "text": text,
                        "font_size": round(size, 1),
                        "bold": bold,
                    }
                )
        return lines
    finally:
        doc.close()
