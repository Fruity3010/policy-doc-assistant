"""Shared test setup: a fake LLM provider, a temp data folder, and a tiny PDF builder."""

import math
import re
import zlib
from collections.abc import Iterator

import pytest

from app import config
from app.llm.base import LLMProvider

DIM = 256


def _embed(text: str) -> list[float]:
    """Bag-of-words hashed into a fixed-size vector: texts sharing words end up close."""
    vec = [0.0] * DIM
    for word in re.findall(r"[a-z0-9]+", text.lower()):
        vec[zlib.crc32(word.encode()) % DIM] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


class FakeProvider(LLMProvider):
    name = "fake"
    chat_model = "fake-chat"
    embed_model = "fake-embed"

    def __init__(self, answer: str = "Ransomware attacks rose sharply [report.pdf, p. 2]."):
        self.answer = answer
        self.generate_calls: list[str] = []
        self.rewrite_to: str | None = None

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [_embed(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return _embed(text)

    def generate(self, system: str, prompt: str) -> str:
        self.generate_calls.append(prompt)
        return self.rewrite_to or prompt.rsplit("Follow-up question: ", 1)[-1].split("\n")[0]

    def stream(self, system: str, prompt: str) -> Iterator[str]:
        self.last_prompt = prompt
        yield from re.findall(r"\S+\s*", self.answer)


@pytest.fixture(autouse=True)
def temp_data(tmp_path, monkeypatch):
    """Every test gets an empty SQLite database and Chroma folder."""
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(config, "CHROMA_DIR", tmp_path / "chroma")
    monkeypatch.setattr(config, "SQLITE_PATH", tmp_path / "app.db")


@pytest.fixture
def fake(monkeypatch) -> FakeProvider:
    provider = FakeProvider()
    monkeypatch.setattr("app.rag.pipeline.get_provider", lambda: provider)
    monkeypatch.setattr("app.main.get_provider", lambda: provider)
    return provider


def make_pdf(pages: list[str]) -> bytes:
    """Build a minimal valid PDF with one line of text per page (no extra dependency needed)."""
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{' '.join(f'{4 + 2 * i} 0 R' for i in range(len(pages)))}] /Count {len(pages)} >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    for i, text in enumerate(pages):
        safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream = f"BT /F1 10 Tf 40 700 Td ({safe}) Tj ET"
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {5 + 2 * i} 0 R >>")
        objects.append(f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream")
    out = "%PDF-1.4\n"
    offsets = []
    for n, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{n} 0 obj\n{obj}\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offsets)
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    return out.encode("latin-1")


SAMPLE_PAGES = [
    "Introduction. This report covers global cybercrime trends and international police cooperation.",
    "Ransomware attacks increased by 40 percent in 2022, targeting hospitals and local governments.",
    "In 2023 phishing campaigns became the most reported cybercrime, with losses estimated at 2 billion dollars.",
]
