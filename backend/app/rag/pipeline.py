from collections.abc import Iterator

from app.core import config
from app.db import memory
from app.llm import LLMProvider, get_provider
from app.rag import store
from app.rag.chunking import chunk_pages, extract_pages
from app.rag.prompts import ANSWER_SYSTEM, REWRITE_SYSTEM, build_answer_prompt, build_rewrite_prompt, has_citation

NO_DOCUMENTS = "No documents have been uploaded yet. Upload a PDF first, then ask your question."


def ingest_pdf(filename: str, data: bytes) -> dict:
    pages = extract_pages(data)
    chunks = chunk_pages(pages, config.CHUNK_SIZE, config.CHUNK_OVERLAP)
    if not chunks:
        raise ValueError("No text could be extracted. The PDF may be scanned images (OCR isn't supported).")
    provider = get_provider()
    store.ensure_compatible(provider)
    vectors = provider.embed_documents([c.text for c in chunks])
    return store.add_document(filename, len(pages), chunks, vectors)


def rewrite_question(provider: LLMProvider, history: list[dict], question: str) -> str:
    if not history:
        return question
    rewritten = provider.generate(REWRITE_SYSTEM, build_rewrite_prompt(history, question))
    return rewritten.strip().strip('"') or question


def retrieve(provider: LLMProvider, question: str, k: int) -> list[dict]:
    return store.search(provider.embed_query(question), k)


def answer_stream(session_id: str, question: str) -> Iterator[tuple[str, dict]]:
    documents = store.list_documents()
    if not documents:
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
    prompt = build_answer_prompt(standalone, chunks, history, [d["name"] for d in documents])

    answer = ""
    for piece in provider.stream(ANSWER_SYSTEM, prompt):
        answer += piece
        yield "token", {"text": piece}

    sources = chunks if has_citation(answer) else []
    memory.add_message(session_id, "user", question)
    memory.add_message(session_id, "assistant", answer, sources)
    yield "sources", {"sources": sources}
