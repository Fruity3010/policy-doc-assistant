"""All prompt text lives here, so it's easy to read and tweak."""

NOT_FOUND = "I couldn't find that in the uploaded documents."

REWRITE_SYSTEM = (
    "You rewrite follow-up questions into standalone search questions. "
    "Use the conversation only to resolve references like 'it', 'that report' or 'what about 2023?'. "
    "If the question is already standalone, return it unchanged. "
    "Return ONLY the rewritten question, with no explanation or quotes."
)

ANSWER_SYSTEM = f"""You are a careful research assistant for policy documents.
Rules:
1. Answer ONLY using the context excerpts provided. Do not use outside knowledge.
2. After every fact, copy the citation from that excerpt's header, e.g. [report.pdf, p. 12]. Never write "Excerpt" or excerpt numbers.
3. If the excerpts don't contain the answer, reply exactly: "{NOT_FOUND}" You may then briefly say what the documents do cover.
4. Be concise. Use short paragraphs or bullet points. Never invent figures, dates or names."""


def format_history(messages: list[dict]) -> str:
    return "\n".join(f"{m['role'].capitalize()}: {m['content']}" for m in messages)


def build_rewrite_prompt(history: list[dict], question: str) -> str:
    return f"Conversation so far:\n{format_history(history)}\n\nFollow-up question: {question}\n\nStandalone question:"


def build_answer_prompt(question: str, chunks: list[dict], history: list[dict]) -> str:
    """Context excerpts (each labelled with its source) + recent chat + the question."""
    context = "\n\n".join(f"--- [{c['document']}, p. {c['page']}] ---\n{c['text']}" for c in chunks)
    parts = [f"Context excerpts:\n{context}"]
    if history:
        parts.append(f"Recent conversation (for tone and references only, not a source of facts):\n{format_history(history)}")
    parts.append(f"Question: {question}\n\nAnswer with citations:")
    return "\n\n".join(parts)
