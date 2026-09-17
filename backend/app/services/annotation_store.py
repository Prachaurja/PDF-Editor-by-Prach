"""Persistent, editable annotation layer.

Annotations are stored as a JSON sidecar keyed by the document's file_id, so
they survive save/reload and stay editable. This is separate from burning them
into a flattened PDF for export — the sidecar is the editable source of truth.
"""

import json
from pathlib import Path

from app.config import STORAGE_DIR

ANNOT_DIR = STORAGE_DIR / "annotations"
ANNOT_DIR.mkdir(parents=True, exist_ok=True)


def _sidecar_path(file_id: str) -> Path:
    return ANNOT_DIR / f"{file_id}.json"


def load_annotations(file_id: str) -> list[dict]:
    """Return the saved annotation list for a document, or [] if none."""
    path = _sidecar_path(file_id)
    if not path.exists():
        return []
    try:
        with open(path, "r") as f:
            data = json.load(f)
        return data.get("annotations", []) if isinstance(data, dict) else []
    except (json.JSONDecodeError, OSError):
        return []


def save_annotations(file_id: str, annotations: list[dict]) -> None:
    """Persist the annotation list for a document."""
    path = _sidecar_path(file_id)
    with open(path, "w") as f:
        json.dump({"annotations": annotations}, f)


def delete_annotations(file_id: str) -> None:
    path = _sidecar_path(file_id)
    if path.exists():
        path.unlink()
