"""The two RAG flows end to end: ingesting a PDF, and answering a question."""

from collections.abc import Iterator

from app import config, memory
from app.llm import LLMProvider, get_provider
from app.rag import store
from app.rag.chunking import chunk_pages, extract_pages
from app.rag.prompts import ANSWER_SYSTEM, NOT_FOUND, REWRITE_SYSTEM, build_answer_prompt, build_rewrite_prompt

NO_DOCUMENTS = "No documents have been uploaded yet. Upload a PDF first, then ask your question."


# ---------- upload flow ----------


def ingest_pdf(filename: str, data: bytes) -> dict:
    """PDF bytes -> pages -> chunks -> embeddings -> stored in Chroma."""
    pages = extract_pages(data)
    chunks = chunk_pages(pages, config.CHUNK_SIZE, config.CHUNK_OVERLAP)
    if not chunks:
        raise ValueError("No text could be extracted. The PDF may be scanned images (OCR isn't supported).")
    provider = get_provider()
    store.ensure_compatible(provider)
    vectors = provider.embed_documents([c.text for c in chunks])
    return store.add_document(filename, len(pages), chunks, vectors)


# ---------- question flow ----------


def rewrite_question(provider: LLMProvider, history: list[dict], question: str) -> str:
    """Memory step: turn 'What about 2023?' into a full question using the chat history."""
    if not history:
        return question  # nothing to resolve, save an API call
    rewritten = provider.generate(REWRITE_SYSTEM, build_rewrite_prompt(history, question))
    return rewritten.strip().strip('"') or question


def retrieve(provider: LLMProvider, question: str, k: int) -> list[dict]:
    """Embed the question and find the k most similar chunks."""
    return store.search(provider.embed_query(question), k)


def answer_stream(session_id: str, question: str) -> Iterator[tuple[str, dict]]:
    """Yield (event, data) pairs: 'question', many 'token's, then 'sources'.

    Both messages are saved to memory only once the answer is complete.
    """
    if not store.list_documents():
        yield "token", {"text": NO_DOCUMENTS}
        memory.add_message(session_id, "user", question)
        memory.add_message(session_id, "assistant", NO_DOCUMENTS, [])
        yield "sources", {"sources": []}
        return

    provider = get_provider()
    store.ensure_compatible(provider)
    history = memory.get_messages(session_id, limit=config.HISTORY_TURNS)

    standalone = rewrite_question(provider, history, question)
    yield "question", {"standalone": standalone}

    chunks = retrieve(provider, standalone, config.TOP_K)
    prompt = build_answer_prompt(standalone, chunks, history)

    answer = ""
    for piece in provider.stream(ANSWER_SYSTEM, prompt):
        answer += piece
        yield "token", {"text": piece}

    # A "not found" answer shouldn't show unrelated chunks as its sources
    sources = [] if answer.strip().startswith(NOT_FOUND) else chunks
    memory.add_message(session_id, "user", question)
    memory.add_message(session_id, "assistant", answer, sources)
    yield "sources", {"sources": sources}
