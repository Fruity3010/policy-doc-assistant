"""FastAPI app: HTTP endpoints for documents, chat (streamed with SSE), history and health."""

import json
import logging
from collections.abc import Iterator

from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from app import config, memory
from app.llm import ConfigError, ProviderError, get_provider
from app.rag import pipeline, store

log = logging.getLogger("uvicorn.error")

app = FastAPI(title="Policy Document Assistant", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- request / response models ----------


class Document(BaseModel):
    id: str
    name: str
    pages: int
    chunks: int
    created_at: str | None = None


class Source(BaseModel):
    document: str
    document_id: str
    page: int
    text: str
    score: float


class Message(BaseModel):
    role: str
    content: str
    sources: list[Source] = []
    created_at: str


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=100)
    question: str = Field(min_length=1, max_length=2000)


class Health(BaseModel):
    status: str
    provider: str
    chat_model: str | None
    embedding_model: str | None
    error: str | None = None  # e.g. missing API key
    index_warning: str | None = None  # embedding model changed since upload
    documents: int


# ---------- errors ----------


@app.exception_handler(ProviderError)
def provider_error_handler(_: Request, e: ProviderError):
    """Missing key -> 503, rate limit -> 429, embedding mismatch -> 409, other provider errors -> 502."""
    return JSONResponse(status_code=e.status, content={"detail": str(e)})


# ---------- endpoints ----------


@app.get("/health", response_model=Health)
def health():
    docs = len(store.list_documents())
    try:
        provider = get_provider()
    except ConfigError as e:
        return Health(status="degraded", provider=config.LLM_PROVIDER, chat_model=None, embedding_model=None, error=str(e), documents=docs)
    return Health(
        status="ok",
        provider=provider.name,
        chat_model=provider.chat_model,
        embedding_model=provider.embed_model,
        index_warning=store.index_warning(provider.embedding_id),
        documents=docs,
    )


@app.post("/documents", response_model=Document, status_code=201)
def upload_document(file: UploadFile):
    name = file.filename or "document.pdf"
    if not name.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported.")
    data = file.file.read(config.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(data) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"File is larger than {config.MAX_UPLOAD_MB} MB.")
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "This file is not a valid PDF.")
    try:
        return pipeline.ingest_pdf(name, data)
    except ValueError as e:  # unreadable / empty PDF
        raise HTTPException(400, str(e)) from e


@app.get("/documents", response_model=list[Document])
def list_documents():
    return store.list_documents()


@app.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: str):
    if not store.delete_document(doc_id):
        raise HTTPException(404, "Document not found.")


def _sse(event: str, data: dict) -> str:
    """Format one Server-Sent Event."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@app.post("/chat")
def chat(req: ChatRequest):
    """Streams events: `question` (rewritten query), `token` (answer text), `sources`, `done`, or `error`."""
    if store.list_documents():
        get_provider()  # fail fast with a normal JSON error (e.g. missing key) before streaming starts

    def events() -> Iterator[str]:
        try:
            for event, data in pipeline.answer_stream(req.session_id, req.question.strip()):
                yield _sse(event, data)
            yield _sse("done", {})
        except ProviderError as e:
            # Headers are already sent, so errors mid-stream are reported as an event
            yield _sse("error", {"message": str(e), "status": e.status})
        except Exception:
            log.exception("chat failed")
            yield _sse("error", {"message": "Something went wrong while answering.", "status": 500})

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/sessions/{session_id}/messages", response_model=list[Message])
def session_messages(session_id: str):
    return memory.get_messages(session_id)
