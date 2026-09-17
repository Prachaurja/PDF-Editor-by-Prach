from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import ALLOWED_ORIGINS
from app.routers import documents, pages, annotate, text

app = FastAPI(
    title="PDF Editor API",
    version="0.1.0",
    description="Backend for the PDF editor. Slice 1: upload, view, thumbnails.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(pages.router)
app.include_router(annotate.router)
app.include_router(text.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
