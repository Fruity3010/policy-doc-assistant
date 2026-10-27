import json

import pytest
from fastapi.testclient import TestClient

from app.llm import ConfigError
from app.main import app
from tests.conftest import SAMPLE_PAGES, make_pdf

client = TestClient(app)


def upload(content: bytes, name: str = "report.pdf"):
    return client.post("/documents", files={"file": (name, content, "application/pdf")})


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.split("\n"))
        events.append((lines["event"], json.loads(lines["data"])))
    return events


def test_upload_list_chat_history_delete(fake):
    r = upload(make_pdf(SAMPLE_PAGES))
    assert r.status_code == 201
    doc = r.json()
    assert doc["pages"] == 3 and doc["chunks"] == 3

    assert [d["id"] for d in client.get("/documents").json()] == [doc["id"]]

    r = client.post("/chat", json={"session_id": "abc", "question": "How much did ransomware attacks increase?"})
    assert r.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(r.text)
    assert [e for e, _ in events][0] == "question"
    assert events[-2][0] == "sources" and events[-1][0] == "done"

    history = client.get("/sessions/abc/messages").json()
    assert [m["role"] for m in history] == ["user", "assistant"]
    assert history[1]["sources"][0]["page"] == 2

    assert client.delete(f"/documents/{doc['id']}").status_code == 204
    assert client.delete(f"/documents/{doc['id']}").status_code == 404


@pytest.mark.parametrize(
    "content,name,message",
    [
        (b"hello", "notes.txt", "Only PDF"),
        (b"not really a pdf", "fake.pdf", "not a valid PDF"),
        (make_pdf([""]), "blank.pdf", "No text"),
    ],
)
def test_upload_rejects_bad_files(fake, content, name, message):
    r = upload(content, name)
    assert r.status_code == 400
    assert message in r.json()["detail"]


def test_missing_api_key_returns_503(monkeypatch):
    def no_key():
        raise ConfigError("GEMINI_API_KEY is not set.")

    monkeypatch.setattr("app.rag.pipeline.get_provider", no_key)
    monkeypatch.setattr("app.llm.get_provider", no_key)
    r = upload(make_pdf(SAMPLE_PAGES))
    assert r.status_code == 503 and "GEMINI_API_KEY" in r.json()["detail"]
    assert client.get("/health").json()["status"] == "degraded"


def test_health_reports_models(fake):
    body = client.get("/health").json()
    assert body["provider"] == "fake" and body["chat_model"] == "fake-chat"


def test_chat_validates_input(fake):
    assert client.post("/chat", json={"session_id": "x", "question": ""}).status_code == 422
