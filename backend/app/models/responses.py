from pydantic import BaseModel


class PageInfo(BaseModel):
    index: int
    width: float
    height: float
    rotation: int


class DocumentInfo(BaseModel):
    file_id: str
    filename: str
    page_count: int
    title: str | None = None
    author: str | None = None
    pages: list[PageInfo]
