"""Conversation memory: every chat message is saved to SQLite, grouped by session."""

import json

from app.db import get_db


def add_message(session_id: str, role: str, content: str, sources: list[dict] | None = None) -> None:
    with get_db() as db:
        db.execute("INSERT OR IGNORE INTO sessions (id) VALUES (?)", (session_id,))
        db.execute(
            "INSERT INTO messages (session_id, role, content, sources) VALUES (?, ?, ?, ?)",
            (session_id, role, content, json.dumps(sources) if sources is not None else None),
        )


def get_messages(session_id: str, limit: int | None = None) -> list[dict]:
    """Messages oldest-first. With `limit`, only the most recent `limit` messages."""
    with get_db() as db:
        rows = db.execute(
            "SELECT role, content, sources, created_at FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?",
            (session_id, -1 if limit is None else limit),
        ).fetchall()
    return [
        {
            "role": r["role"],
            "content": r["content"],
            "sources": json.loads(r["sources"]) if r["sources"] else [],
            "created_at": r["created_at"],
        }
        for r in reversed(rows)
    ]
