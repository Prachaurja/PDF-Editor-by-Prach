"""Slice 2: page operations.

The editing model is 'stage then save'. The frontend tracks an ordered plan
of pages (which source page, what rotation) and sends the whole plan here when
the user saves. We build a fresh document from the plan so the original upload
is never mutated.
"""

import uuid
from pathlib import Path

import fitz  # PyMuPDF
from fastapi import HTTPException

from app.config import UPLOAD_DIR, PROCESSED_DIR
from app.utils.pdf_loader import open_pdf
from app.models.requests import PageOp


def _new_output_path() -> tuple[str, Path]:
    file_id = uuid.uuid4().hex
    return file_id, PROCESSED_DIR / f"{file_id}.pdf"


def apply_plan(source_path: Path, plan: list[PageOp]) -> tuple[str, Path]:
    """Build a new PDF from an ordered plan of source pages + rotations.

    Reorder = the order of the plan. Delete = a source page left out of it.
    Rotate = the rotation field on that entry.
    """
    if not plan:
        raise HTTPException(status_code=400, detail="Cannot save a document with no pages.")

    src = open_pdf(source_path)
    try:
        out = fitz.open()
        for op in plan:
            if op.source_index < 0 or op.source_index >= src.page_count:
                out.close()
                raise HTTPException(
                    status_code=400,
                    detail=f"Plan references page {op.source_index}, which does not exist.",
                )
            if op.rotation % 90 != 0:
                out.close()
                raise HTTPException(status_code=400, detail="Rotation must be a multiple of 90.")

            out.insert_pdf(src, from_page=op.source_index, to_page=op.source_index)
            new_page = out[-1]
            # insert_pdf preserves the source rotation; set the absolute target.
            new_page.set_rotation(op.rotation % 360)

        file_id, dest = _new_output_path()
        out.save(dest)
        out.close()
        return file_id, dest
    finally:
        src.close()


def split_document(source_path: Path, at_index: int) -> tuple[tuple[str, Path], tuple[str, Path]]:
    """Split into two documents: pages [0, at_index) and [at_index, end).

    at_index is the first page of the SECOND file, so it must be 1..count-1.
    """
    src = open_pdf(source_path)
    try:
        if at_index < 1 or at_index >= src.page_count:
            raise HTTPException(
                status_code=400,
                detail="Split point must fall between two pages.",
            )

        first = fitz.open()
        first.insert_pdf(src, from_page=0, to_page=at_index - 1)
        id_a, path_a = _new_output_path()
        first.save(path_a)
        first.close()

        second = fitz.open()
        second.insert_pdf(src, from_page=at_index, to_page=src.page_count - 1)
        id_b, path_b = _new_output_path()
        second.save(path_b)
        second.close()

        return (id_a, path_a), (id_b, path_b)
    finally:
        src.close()


def merge_documents(base_path: Path, other_path: Path, after_index: int) -> tuple[str, Path]:
    """Insert `other` into `base` after the given position (-1 = at the very start)."""
    base = open_pdf(base_path)
    other = open_pdf(other_path)
    try:
        out = fitz.open()
        insert_point = after_index + 1  # convert 'after' to an insertion cut

        if insert_point > 0:
            out.insert_pdf(base, from_page=0, to_page=min(insert_point, base.page_count) - 1)
        out.insert_pdf(other)
        if insert_point < base.page_count:
            out.insert_pdf(base, from_page=insert_point, to_page=base.page_count - 1)

        file_id, dest = _new_output_path()
        out.save(dest)
        out.close()
        return file_id, dest
    finally:
        base.close()
        other.close()
