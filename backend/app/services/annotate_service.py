"""Slice 3: Annotations.

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


_BUILTIN_FAMILIES = {
    "times": {"": "tiro", "b": "tibo", "i": "tibi", "bi": "tibl"},
    "courier": {"": "cour", "b": "cobo", "i": "cori", "bi": "cobi"},
    # Note: "hebo" is Helvetica-*Oblique*, not Helvetica-Bold — the correct
    # bold name is "hebi". (That mix-up is why bold lines used to be
    # exported slanted.)
    "helv": {"": "helv", "b": "hebi", "i": "heli", "bi": "hebo"},
}

# Hints for classifying a font name (PDF font name or a CSS family from the
# toolbar palette). Keep these in sync with the FONT list on the frontend —
# note "Century Gothic" is SANS (no "century" hint), while "Book Antiqua"
# and "Palatino Linotype" are serif.
_SERIF_HINTS = ("times", "tiro", "rome", "garamond", "georgia", "serif",
                "palatino", "cambria", "antiqua", "baskerville",
                "bookman", "schoolbook")
_MONO_HINTS = ("courier", "consolas", "console", "mono")


def _family_class(name: str) -> str:
    """Classify a font name (PDF font name or CSS family) as times/courier/helv."""
    n = name.lower()
    if any(h in n for h in _SERIF_HINTS):
        return "times"
    if any(h in n for h in _MONO_HINTS):
        return "courier"
    return "helv"  # Helvetica/Arial/sans, or anything we don't recognize


def _pick_font(bold: bool, italic: bool,
               pdf_font: str | None = None,
               css_family: str | None = None) -> str:
    """Pick the built-in PDF font for a text annotation.

    Priority:
    1. `css_family` — the user's explicit font-palette pick (e.g. "Georgia").
       It wins so an intentional choice is never silently overridden.
    2. `pdf_font` — the PDF font name of the clicked line (cover edits);
       matching the document's family/weight/italic is what makes an edited
       line blend in instead of standing out as Helvetica.
    3. Fall back to the Helvetica family.
    """
    if css_family:
        fam = _family_class(css_family)
    elif pdf_font:
        fam = _family_class(pdf_font)
    else:
        fam = "helv"
    return _BUILTIN_FAMILIES[fam][("b" if bold else "") + ("i" if italic else "")]


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


def _bullet_marker(page, box: "fitz.Rect", fs: float, color, style: str) -> None:
    """Draw one bullet marker just left of the FIRST line of `box`.

    Vectors, not characters: the base-14 PDF fonts render the "\u2022"
    character as a tiny middle dot (verified by rendering), so every marker
    style is a shape. Geometry is relative to the first line (box top +
    one font size) and always fits inside the 0.9*fs text indent the
    caller applies, so wrapped lines are never touched.
    """
    import math
    x = box.x0
    y = box.y0 + fs * 0.5  # mid-height of the first line

    if style == "open":
        page.draw_circle(
            fitz.Point(x + fs * 0.32, y), fs * 0.13,
            color=color, width=fs * 0.07, fill=None,
        )
    elif style == "square":
        s = fs * 0.24
        page.draw_rect(
            fitz.Rect(x + fs * 0.22, y - s / 2, x + fs * 0.22 + s, y + s / 2),
            color=None, fill=color,
        )
    elif style == "dash":
        page.draw_line(
            fitz.Point(x + fs * 0.14, y + fs * 0.03),
            fitz.Point(x + fs * 0.56, y + fs * 0.03),
            color=color, width=fs * 0.08,
        )
    elif style == "triangle":
        page.draw_polyline(
            [
                fitz.Point(x + fs * 0.20, y - fs * 0.18),
                fitz.Point(x + fs * 0.20, y + fs * 0.18),
                fitz.Point(x + fs * 0.58, y),
            ],
            closePath=True, color=None, fill=color,
        )
    elif style == "star":
        cx, cy = x + fs * 0.38, y
        outer, inner = fs * 0.26, fs * 0.11
        pts = []
        for i in range(10):
            ang = math.pi / 5 * i - math.pi / 2
            r = outer if i % 2 == 0 else inner
            pts.append(fitz.Point(cx + math.cos(ang) * r, cy + math.sin(ang) * r))
        page.draw_polyline(pts, closePath=True, color=None, fill=color)
    else:
        # "round" (the classic bullet) and any unknown value
        page.draw_circle(
            fitz.Point(x + fs * 0.32, y), fs * 0.15,
            color=None, fill=color,
        )


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
                # Paint the erase area with the line's OWN background color
                # (the user matched it to the page in the toolbar) instead
                # of hardcoded white - on a beige page a white patch reads
                # as a sticker, a matching tone reads as "same line, edited".
                # No/unknown cover color falls back to white (classic look).
                fill = _hex_to_rgb(ann.cover_color) if ann.cover_color else (1, 1, 1)
                page.add_redact_annot(cover_box, fill=fill)
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
                    # strong); older marks without it keep the 0.3 default
                    shape.finish(color=None, fill=color, fill_opacity=ann.opacity or 0.3)
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
                # Font choice: an explicit font-palette pick (ann.font_family)
                # wins; otherwise cover edits match the clicked line's
                # original font; otherwise Helvetica family.
                fontname = _pick_font(
                    ann.bold, ann.italic, pdf_font=ann.font, css_family=ann.font_family
                )
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
                    # Order matters: background FIRST, then the bullet
                    # marker (so it sits ON the tint), then the text.
                    # Opaque background behind a plain text box (the user's
                    # "text background" pick). Cover edits don't need this —
                    # their redaction already painted the patch.
                    if ann.bg_color:
                        page.draw_rect(box, color=None, fill=_hex_to_rgb(ann.bg_color))
                    # Bullet: one marker left of the first line, text
                    # indented to clear it — the vector equivalent of the
                    # preview's CSS ::before marker (the "\u2022" character
                    # can't be used: base-14 PDF fonts render it as a small
                    # middle dot, not a real bullet).
                    draw_box = box
                    if ann.bullet:
                        _bullet_marker(page, box, fs, color, ann.bullet)
                        draw_box = fitz.Rect(box.x0 + fs * 0.9, box.y0, box.x1, box.y1)
                    rc = page.insert_textbox(
                        draw_box, text, fontsize=fs, fontname=fontname,
                        color=color, align=align_map.get(ann.align, fitz.TEXT_ALIGN_LEFT),
                    )
                    if rc < 0:
                        # Still didn't fit (dense font, very long word, etc.)
                        # — grow the box downward and draw again rather than
                        # silently dropping the overflow. No extra erase
                        # here on purpose: this can only overlap whatever
                        # follows visually, never delete it, keeping the
                        # same safety guarantee as the main path above.
                        taller = fitz.Rect(box.x0, draw_box.y0, draw_box.x1, draw_box.y0 + h * 2 + 20)
                        if ann.bg_color:
                            page.draw_rect(taller, color=None, fill=_hex_to_rgb(ann.bg_color))
                        page.insert_textbox(
                            taller, text, fontsize=fs, fontname=fontname,
                            color=color, align=align_map.get(ann.align, fitz.TEXT_ALIGN_LEFT),
                        )
            elif ann.type == "note" and ann.x is not None and ann.y is not None:
                annot = page.add_text_annot(fitz.Point(ann.x, ann.y), ann.text or "")
                annot.set_colors(stroke=color)
                annot.update()

            elif ann.type == "stamp" and ann.x is not None and ann.y is not None:
                label = (ann.text or "APPROVED").strip()
                # Standalone check / cross marks: drawn as VECTORS, not text —
                # the base-14 PDF fonts have no ✔/✘ glyph, so text would come
                # out as a missing-glyph box. No border either: the mark
                # stands on its own, sized to sit inside a checkbox.
                if label in ("\u2714", "\u2713", "\u2714\ufe0e"):
                    s = 16.0
                    pts = [
                        fitz.Point(ann.x, ann.y + s * 0.55),
                        fitz.Point(ann.x + s * 0.35, ann.y + s * 0.85),
                        fitz.Point(ann.x + s, ann.y),
                    ]
                    page.draw_polyline(pts, color=color, width=2.5)
                elif label in ("\u2718", "\u2717", "\u2718\ufe0e"):
                    s = 16.0
                    page.draw_line(fitz.Point(ann.x, ann.y), fitz.Point(ann.x + s, ann.y + s), color=color, width=2.5)
                    page.draw_line(fitz.Point(ann.x + s, ann.y), fitz.Point(ann.x, ann.y + s), color=color, width=2.5)
                else:
                    # Regular word stamps: a bordered label drawn directly
                    # onto the page (reliable across PyMuPDF versions, unlike
                    # FreeText annotation styling).
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