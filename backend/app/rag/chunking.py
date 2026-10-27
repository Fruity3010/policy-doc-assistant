import io
import re
from dataclasses import dataclass

from pypdf import PdfReader
from pypdf.errors import PdfReadError


@dataclass
class Chunk:
    text: str
    page: int
    index: int


def extract_pages(data: bytes) -> list[str]:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ValueError("This PDF is password-protected.")
        return [page.extract_text() or "" for page in reader.pages]
    except PdfReadError as e:
        raise ValueError(f"Could not read the PDF: {e}") from e


def split_text(text: str, size: int, overlap: int) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            cut = text.rfind(". ", start + size // 2, end)
            if cut == -1:
                cut = text.rfind(" ", start + size // 2, end)
            if cut != -1:
                end = cut + 1
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        next_start = end - overlap
        space = text.find(" ", next_start, end)
        start = max(space + 1 if space != -1 else next_start, start + 1)
    return [c for c in chunks if c]


def chunk_pages(pages: list[str], size: int, overlap: int) -> list[Chunk]:
    chunks: list[Chunk] = []
    for page_number, page_text in enumerate(pages, start=1):
        for piece in split_text(page_text, size, overlap):
            chunks.append(Chunk(text=piece, page=page_number, index=len(chunks)))
    return chunks
