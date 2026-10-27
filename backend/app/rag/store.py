import uuid
from functools import lru_cache

import chromadb
from chromadb.config import Settings

from app.core import config
from app.db.session import get_db
from app.llm import LLMProvider, ProviderError
from app.rag.chunking import Chunk


class IndexMismatchError(ProviderError):
    status = 409


@lru_cache
def _client(path: str):
    return chromadb.PersistentClient(path=path, settings=Settings(anonymized_telemetry=False))


def _collection():
    return _client(str(config.CHROMA_DIR)).get_or_create_collection("chunks", metadata={"hnsw:space": "cosine"})


def get_index_embedding_id() -> str | None:
    with get_db() as db:
        row = db.execute("SELECT value FROM meta WHERE key = 'embedding_id'").fetchone()
    return row["value"] if row else None


def index_warning(provider_embedding_id: str) -> str | None:
    stored = get_index_embedding_id()
    if stored and stored != provider_embedding_id and list_documents():
        return (
            f"Documents were indexed with '{stored}' but the current embedding model is "
            f"'{provider_embedding_id}'. Vectors from different models aren't comparable: "
            "switch back, or delete and re-upload the documents."
        )
    return None


def ensure_compatible(provider: LLMProvider) -> None:
    warning = index_warning(provider.embedding_id)
    if warning:
        raise IndexMismatchError(warning)
    stored = get_index_embedding_id()
    if stored and stored != provider.embedding_id:
        _client(str(config.CHROMA_DIR)).delete_collection("chunks")
    with get_db() as db:
        db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('embedding_id', ?)", (provider.embedding_id,))


def add_document(name: str, page_count: int, chunks: list[Chunk], vectors: list[list[float]]) -> dict:
    doc_id = uuid.uuid4().hex
    _collection().add(
        ids=[f"{doc_id}:{c.index}" for c in chunks],
        embeddings=vectors,
        documents=[c.text for c in chunks],
        metadatas=[{"doc_id": doc_id, "doc_name": name, "page": c.page, "chunk": c.index} for c in chunks],
    )
    with get_db() as db:
        db.execute("INSERT INTO documents (id, name, pages, chunks) VALUES (?, ?, ?, ?)", (doc_id, name, page_count, len(chunks)))
        row = db.execute("SELECT id, name, pages, chunks, created_at FROM documents WHERE id = ?", (doc_id,)).fetchone()
    return dict(row)


def list_documents() -> list[dict]:
    with get_db() as db:
        rows = db.execute("SELECT id, name, pages, chunks, created_at FROM documents ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def delete_document(doc_id: str) -> bool:
    with get_db() as db:
        deleted = db.execute("DELETE FROM documents WHERE id = ?", (doc_id,)).rowcount
    if deleted:
        _collection().delete(where={"doc_id": doc_id})
    return bool(deleted)


def search(query_vector: list[float], k: int) -> list[dict]:
    collection = _collection()
    if collection.count() == 0:
        return []
    result = collection.query(query_embeddings=[query_vector], n_results=min(k, collection.count()))
    return [
        {
            "document": meta["doc_name"],
            "document_id": meta["doc_id"],
            "page": meta["page"],
            "text": text,
            "score": round(1 - distance, 4),
        }
        for text, meta, distance in zip(result["documents"][0], result["metadatas"][0], result["distances"][0])
    ]
