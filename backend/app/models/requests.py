from pydantic import BaseModel, Field, field_validator


class PageOp(BaseModel):
    """One entry in the staged page plan.

    The plan is an ordered list of the pages the output should contain,
    each referencing a page in the SOURCE document by its original index,
    plus an accumulated rotation. Deletion is expressed by omission:
    a source page with no entry in the plan is dropped.
    """

    source_index: int = Field(..., ge=0, description="0-based page index in the original document")
    rotation: int = Field(0, description="Clockwise rotation in degrees: 0, 90, 180, or 270")


class ApplyPlanRequest(BaseModel):
    plan: list[PageOp] = Field(..., description="Ordered pages for the output document")


class MergeRequest(BaseModel):
    """Merge another already-uploaded document after a given position."""

    other_file_id: str
    after_index: int = Field(-1, description="Insert after this output position; -1 = prepend at start")


# ---- Slice 3: annotations ----

from typing import Literal, Optional


class Annotation(BaseModel):
    """One annotation, positioned in PDF-space (points, origin top-left)."""

    type: Literal[
        "highlight", "underline", "strike", "pen", "rect", "arrow", "line",
        "note", "stamp", "shape", "text",
    ]
    page: int = Field(..., ge=0, description="0-based page index this annotation belongs to")
    color: str = Field("#0f6b62", description="Hex color")

    rects: Optional[list[list[float]]] = None
    points: Optional[list[list[float]]] = None
    x: Optional[float] = None
    y: Optional[float] = None
    text: Optional[str] = None
    width: float = 2.0

    # shape kind when type == "shape"
    shape: Optional[str] = None
    # text box styling + size
    font_size: Optional[float] = None
    bold: bool = False
    italic: bool = False
    # Original line's PDF font name, for cover edits — the export draws the
    # replacement in a matching base font so it blends into the document.
    font: Optional[str] = None
    # User's explicit font-palette pick (a CSS family name like "Georgia").
    # When present it wins over the auto-detected document font; the export
    # maps it to the closest built-in PDF font of the same class.
    font_family: Optional[str] = None
    align: Optional[str] = None
    w: Optional[float] = None
    h: Optional[float] = None
    # highlight fill opacity (0-1); None = the app default of 0.3
    opacity: Optional[float] = Field(None, ge=0.01, le=1.0)
    # when true (only meaningful for type == "text"): paint an opaque white
    # patch behind the text first, so it visually replaces existing PDF
    # content rather than overlaying on top of it
    cover: bool = False
    # bullet marker for type == "text": "round" (filled dot — the classic
    # bullet), "open" (open circle), "square", "dash", "triangle" or
    # "star". None = no bullet. The export draws the marker as a vector
    # (the character "\u2022" can't be used: base-14 PDF fonts render it
    # as a middle dot, not a bullet). Older payloads sent true/false:
    # true is read as "round", false as no bullet.
    bullet: Optional[str] = None
    # background painted UNDER an edited (cover) line, in place of white —
    # pick a tone matching the page background so the edit blends in.
    # None = white (the classic behavior)
    cover_color: Optional[str] = None
    # opaque background color behind a plain text box (None = none,
    # text sits directly on the page)
    bg_color: Optional[str] = None

    @field_validator("bullet", mode="before")
    @classmethod
    def _coerce_bullet(cls, v):
        # Legacy payloads sent a plain boolean: true -> the classic round
        # dot, false/None -> no bullet.
        if v is True:
            return "round"
        if v is False or v is None:
            return None
        return v


class ApplyAnnotationsRequest(BaseModel):
    annotations: list[Annotation]