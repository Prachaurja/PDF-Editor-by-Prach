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
                # Use the DOMINANT span (most characters) rather than the first
                # one, so a mixed line (e.g. a bold lead-in) reports the font
                # of the line's body. The font name + style are returned so the
                # frontend can render the editable line — and the export can
                # draw the replacement — in the SAME typeface as the document.
                dom = max(spans, key=lambda s: len(s.get("text", "")))
                size = dom.get("size", 11)
                font = dom.get("font") or ""
                font_l = font.lower()
                bold = "bold" in font_l
                italic = "italic" in font_l or "oblique" in font_l
                # Text color (0xRRGGBB int from PyMuPDF) as a hex string, so
                # the editable line matches the original — colored headings
                # shouldn't turn black when edited.
                color_hex = f"#{dom.get('color', 0):06x}"
                lines.append(
                    {
                        "bbox": [round(v, 2) for v in bbox],
                        "text": text,
                        "font_size": round(size, 1),
                        "bold": bold,
                        "italic": italic,
                        "font": font,
                        "color": color_hex,
                    }
                )
        return lines
    finally:
        doc.close()
