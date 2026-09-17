"""Slice 3: annotations.

Annotations arrive in PDF-space (points, top-left origin) and are burned into
a new document with PyMuPDF. The original upload is never mutated — we copy it
to a fresh output file and draw onto that, consistent with the stage-then-save
model from Slice 2.
"""

import uuid
from pathlib import Path

import fitz  # PyMuPDF
from fastapi import HTTPException

from app.config import PROCESSED_DIR
from app.utils.pdf_loader import open_pdf
from app.models.requests import Annotation


def _hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    """'#0f6b62' -> (0.06, 0.42, 0.38) floats in 0..1 for PyMuPDF."""
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        r = int(h[0:2], 16) / 255
        g = int(h[2:4], 16) / 255
        b = int(h[4:6], 16) / 255
        return (r, g, b)
    except (ValueError, IndexError):
        return (0.06, 0.42, 0.38)  # fall back to the app green


def _new_output_path() -> tuple[str, Path]:
    file_id = uuid.uuid4().hex
    return file_id, PROCESSED_DIR / f"{file_id}.pdf"


def _draw_shape(page, shape: str, rect: "fitz.Rect", color, width: float) -> None:
    """Draw a vector shape onto the page (burned in)."""
    x0, y0, x1, y1 = rect.x0, rect.y0, rect.x1, rect.y1
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2

    if shape == "rect":
        page.draw_rect(rect, color=color, width=width)
    elif shape == "ellipse":
        page.draw_oval(rect, color=color, width=width)
    elif shape == "triangle":
        pts = [fitz.Point(cx, y0), fitz.Point(x1, y1), fitz.Point(x0, y1)]
        page.draw_polyline(pts + [pts[0]], color=color, width=width)
    elif shape == "diamond":
        pts = [fitz.Point(cx, y0), fitz.Point(x1, cy), fitz.Point(cx, y1), fitz.Point(x0, cy)]
        page.draw_polyline(pts + [pts[0]], color=color, width=width)
    elif shape == "star":
        import math
        pts = []
        rx, ry = (x1 - x0) / 2, (y1 - y0) / 2
        for i in range(10):
            ang = math.pi / 5 * i - math.pi / 2
            r = 1 if i % 2 == 0 else 0.42
            pts.append(fitz.Point(cx + math.cos(ang) * rx * r, cy + math.sin(ang) * ry * r))
        page.draw_polyline(pts + [pts[0]], color=color, width=width)
    elif shape == "check":
        pts = [fitz.Point(x0, cy), fitz.Point(x0 + (x1 - x0) * 0.4, y1), fitz.Point(x1, y0)]
        page.draw_polyline(pts, color=color, width=width)
    elif shape == "cross":
        page.draw_line(fitz.Point(x0, y0), fitz.Point(x1, y1), color=color, width=width)
        page.draw_line(fitz.Point(x1, y0), fitz.Point(x0, y1), color=color, width=width)
    else:
        page.draw_rect(rect, color=color, width=width)


def _text_box_rect(ann: Annotation) -> "fitz.Rect":
    """The box used for both drawing an annotation's text and, for a cover
    edit, the area to redact. Height is the larger of what the client sent
    and an estimate from the actual text length — insert_textbox silently
    drops text that overflows its box, with no error, so under-sizing is a
    silent failure we protect against here rather than trusting either
    source alone.
    """
    fs = ann.font_size or 14
    w = ann.w or 180
    text = ann.text or ""

    avg_char_w = fs * 0.52  # rough average for a proportional font
    chars_per_line = max(1, int(w / avg_char_w))
    est_lines = -(-len(text) // chars_per_line) if text else 1  # ceil div
    # Cap how many lines we'll auto-grow to. PDFs don't reflow, so a very
    # long replacement growing unboundedly tall risks eating into whatever
    # sits further down the page, not just the line directly below. Capping
    # keeps that risk bounded; a genuinely longer rewrite is better placed
    # in a separate text box than forced into one line's original slot.
    est_lines = min(est_lines, 4)
    estimated_h = est_lines * fs * 1.3 + 8

    detected_h = ann.h or (fs * 2)
    h = max(detected_h, estimated_h, fs * 1.8 + 4)
    return fitz.Rect(ann.x, ann.y, ann.x + w, ann.y + h)


def _erase_box_rect(ann: Annotation) -> "fitz.Rect":
    """The area to actually redact for a cover edit.

    Deliberately NOT the same as the draw box: the draw box grows to fit a
    longer replacement (which can wrap to extra lines), but erasing that
    same, larger area risks deleting unrelated content below it that was
    never part of this edit. `rects[0]`, when present, is the ORIGINAL
    detected line's bbox, frozen at creation time — always small and safe.
    A replacement that needs more room may then visually overlap whatever
    follows, which is a visible, fixable problem; silently deleting
    unrelated content is not. Falls back to the draw box for older
    annotations saved before this existed.
    """
    if ann.rects:
        return fitz.Rect(ann.rects[0])
    return _text_box_rect(ann)


def apply_annotations(source_path: Path, annotations: list[Annotation]) -> tuple[str, Path]:
    doc = open_pdf(source_path)
    try:
        for ann in annotations:
            if ann.page < 0 or ann.page >= doc.page_count:
                raise HTTPException(
                    status_code=400,
                    detail=f"Annotation references page {ann.page}, which does not exist.",
                )

        # Pass 1: queue and apply EVERY redaction (from cover-text edits)
        # first, on every page, before any replacement content is drawn.
        # Editing one line to be longer can make its replacement text wrap
        # into the vertical space of the line below it. If that next line
        # is also being edited, drawing-then-redacting in annotation order
        # would let a later edit's redaction erase an earlier edit's
        # already-drawn text. Redacting everything up front, then drawing
        # everything, removes that collision entirely.
        pages_with_redactions = set()
        for ann in annotations:
            if ann.type == "text" and ann.cover and ann.x is not None and ann.y is not None:
                page = doc.load_page(ann.page)
                box = _erase_box_rect(ann)
                pad = 1.5
                cover_box = fitz.Rect(
                    box.x0 - pad, box.y0 - pad, box.x1 + pad, box.y1 + pad
                )
                page.add_redact_annot(cover_box, fill=(1, 1, 1))
                pages_with_redactions.add(ann.page)
        for page_index in pages_with_redactions:
            doc.load_page(page_index).apply_redactions()

        # Pass 2: draw everything — marks, shapes, and all text (including
        # the cover edits, whose redaction already happened above).
        for ann in annotations:
            page = doc.load_page(ann.page)
            color = _hex_to_rgb(ann.color)

            if ann.type == "highlight" and ann.rects:
                for r in ann.rects:
                    # Draw a filled rectangle (square corners) with transparency,
                    # rather than a highlight annot which viewers round off.
                    rect = fitz.Rect(r)
                    shape = page.new_shape()
                    shape.draw_rect(rect)
                    shape.finish(color=None, fill=color, fill_opacity=0.3)
                    shape.commit()

            elif ann.type == "underline" and ann.rects:
                for r in ann.rects:
                    annot = page.add_underline_annot(fitz.Rect(r))
                    annot.set_colors(stroke=color)
                    annot.update()

            elif ann.type == "strike" and ann.rects:
                for r in ann.rects:
                    annot = page.add_strikeout_annot(fitz.Rect(r))
                    annot.set_colors(stroke=color)
                    annot.update()

            elif ann.type == "rect" and ann.rects:
                for r in ann.rects:
                    annot = page.add_rect_annot(fitz.Rect(r))
                    annot.set_colors(stroke=color)
                    annot.set_border(width=ann.width)
                    annot.update()

            elif ann.type == "pen" and ann.points and len(ann.points) >= 2:
                stroke = [[float(p[0]), float(p[1])] for p in ann.points]
                annot = page.add_ink_annot([stroke])
                annot.set_colors(stroke=color)
                annot.set_border(width=ann.width)
                annot.update()

            elif ann.type == "arrow" and ann.points and len(ann.points) >= 2:
                start = fitz.Point(ann.points[0][0], ann.points[0][1])
                end = fitz.Point(ann.points[-1][0], ann.points[-1][1])
                annot = page.add_line_annot(start, end)
                annot.set_colors(stroke=color)
                annot.set_border(width=ann.width)
                annot.set_line_ends(fitz.PDF_ANNOT_LE_NONE, fitz.PDF_ANNOT_LE_OPEN_ARROW)
                annot.update()

            elif ann.type == "line" and ann.points and len(ann.points) >= 2:
                start = fitz.Point(ann.points[0][0], ann.points[0][1])
                end = fitz.Point(ann.points[-1][0], ann.points[-1][1])
                annot = page.add_line_annot(start, end)
                annot.set_colors(stroke=color)
                annot.set_border(width=ann.width)
                annot.update()

            elif ann.type == "shape" and ann.rects:
                _draw_shape(page, ann.shape or "rect", fitz.Rect(ann.rects[0]), color, ann.width)

            elif ann.type == "text" and ann.x is not None and ann.y is not None:
                fs = ann.font_size or 14
                text = ann.text or ""
                fontname = "hebo" if ann.bold else "helv"
                align_map = {
                    "left": fitz.TEXT_ALIGN_LEFT,
                    "center": fitz.TEXT_ALIGN_CENTER,
                    "right": fitz.TEXT_ALIGN_RIGHT,
                }
                box = _text_box_rect(ann)
                h = box.y1 - box.y0

                # Redaction for cover edits already happened in pass 1
                # (before any text was drawn), using the SAFE, small erase
                # boundary — not this possibly-taller draw box. So nothing
                # to do here for that part — just draw the replacement text.
                if text.strip():
                    rc = page.insert_textbox(
                        box, text, fontsize=fs, fontname=fontname,
                        color=color, align=align_map.get(ann.align, fitz.TEXT_ALIGN_LEFT),
                    )
                    if rc < 0:
                        # Still didn't fit (dense font, very long word, etc.)
                        # — grow the box downward and draw again rather than
                        # silently dropping the overflow. No extra erase
                        # here on purpose: this can only overlap whatever
                        # follows visually, never delete it, keeping the
                        # same safety guarantee as the main path above.
                        taller = fitz.Rect(box.x0, box.y0, box.x1, box.y0 + h * 2 + 20)
                        page.insert_textbox(
                            taller, text, fontsize=fs, fontname=fontname,
                            color=color, align=align_map.get(ann.align, fitz.TEXT_ALIGN_LEFT),
                        )

            elif ann.type == "note" and ann.x is not None and ann.y is not None:
                annot = page.add_text_annot(fitz.Point(ann.x, ann.y), ann.text or "")
                annot.set_colors(stroke=color)
                annot.update()

            elif ann.type == "stamp" and ann.x is not None and ann.y is not None:
                # Draw a bordered label directly onto the page (reliable across
                # PyMuPDF versions, unlike FreeText annotation styling).
                label = ann.text or "APPROVED"
                box = fitz.Rect(ann.x, ann.y, ann.x + 130, ann.y + 26)
                page.draw_rect(box, color=color, width=1.2)
                page.insert_textbox(
                    box, label, fontsize=11, color=color,
                    align=fitz.TEXT_ALIGN_CENTER,
                )

        file_id, dest = _new_output_path()
        doc.save(dest)
        return file_id, dest
    finally:
        doc.close()
