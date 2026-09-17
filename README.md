# PDF Editor

A full-featured PDF editor. FastAPI backend + browser frontend.
Built slice by slice — Slice 1 (upload, view, thumbnails) is done and working.

## Backend

    cd ~/Downloads/PDF-Editor/backend
    rm -rf .venv
    /Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 -m venv .venv
    source .venv/bin/activate
    python --version
# That last line must say 3.12.x. If it does, continue:

    pip install --upgrade pip
    pip install -r requirements.txt
    uvicorn app.main:app --reload

API runs at http://localhost:8000  (docs at /docs)

## Frontend

    cd frontend
    npm install
    npm run dev

App runs at http://localhost:5173

## Structure

    backend/app/
      routers/     one router per feature group
      services/    the actual PDF logic (routers stay thin)
      models/      pydantic request/response schemas
      utils/       file handling + PyMuPDF wrapper
    frontend/src/
      components/  Viewer, Toolbar, thumbnails, ...
      api/         one client file per backend router
      store/       app state

## Roadmap (build order)

    1. Upload + view + thumbnails      <- DONE
    2. Page ops (rotate/delete/reorder/merge/split)
    3. Annotations
    4. Watermark / header / footer
    5. Forms
    6. Security + redaction
    7. Convert (PDF <-> Word/Excel/images/text)
    8. OCR
    9. Signatures
    10. Optimize + batch

Each slice adds one router + service on the backend and one panel on the
frontend. Uncomment its dependencies in requirements.txt as you go.

A standalone browser-only preview (no backend needed) is in preview.html.
