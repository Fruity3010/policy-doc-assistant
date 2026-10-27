import pytest

from app.db import memory
from app.llm.base import RateLimitError, with_retry
from app.rag import pipeline, store
from app.rag.prompts import NOT_FOUND, build_answer_prompt, build_rewrite_prompt, has_citation
from tests.conftest import SAMPLE_PAGES, FakeProvider, make_pdf


def test_ingest_and_retrieve_finds_right_page(fake):
    doc = pipeline.ingest_pdf("report.pdf", make_pdf(SAMPLE_PAGES))
    assert doc["pages"] == 3 and doc["chunks"] == 3

    results = pipeline.retrieve(fake, "How much did ransomware attacks increase?", k=2)
    assert results[0]["page"] == 2
    assert results[0]["document"] == "report.pdf"
    assert results[0]["score"] >= results[1]["score"]


def test_ingest_rejects_pdf_without_text(fake):
    with pytest.raises(ValueError, match="No text"):
        pipeline.ingest_pdf("blank.pdf", make_pdf([""]))


def test_delete_removes_chunks(fake):
    doc = pipeline.ingest_pdf("report.pdf", make_pdf(SAMPLE_PAGES))
    assert store.delete_document(doc["id"])
    assert store.list_documents() == []
    assert pipeline.retrieve(fake, "ransomware", k=3) == []


def test_answer_prompt_labels_sources():
    chunks = [{"document": "a.pdf", "page": 4, "text": "Fact one."}]
    prompt = build_answer_prompt("What is fact one?", chunks, [], ["a.pdf", "b.pdf"])
    assert prompt.startswith("Uploaded documents: a.pdf, b.pdf")
    assert "--- [a.pdf, p. 4] ---\nFact one." in prompt
    assert prompt.endswith("Answer with citations:")


def test_rewrite_prompt_includes_history():
    prompt = build_rewrite_prompt([{"role": "user", "content": "Ransomware in 2022?"}], "What about 2023?")
    assert "User: Ransomware in 2022?" in prompt and "What about 2023?" in prompt


def test_first_question_skips_rewrite(fake):
    assert pipeline.rewrite_question(fake, [], "What is phishing?") == "What is phishing?"
    assert fake.generate_calls == []


def test_answer_stream_uses_memory_and_saves_messages(fake):
    pipeline.ingest_pdf("report.pdf", make_pdf(SAMPLE_PAGES))
    memory.add_message("s1", "user", "How did ransomware change in 2022?")
    memory.add_message("s1", "assistant", "It increased by 40 percent.")
    fake.rewrite_to = "What were the main cybercrime trends in 2023?"

    events = list(pipeline.answer_stream("s1", "What about 2023?"))

    assert events[0] == ("question", {"standalone": fake.rewrite_to})
    assert "".join(d["text"] for e, d in events if e == "token") == fake.answer
    name, data = events[-1]
    assert name == "sources" and data["sources"][0]["page"] == 3
    assert "Recent conversation" in fake.last_prompt

    history = memory.get_messages("s1")
    assert [m["role"] for m in history] == ["user", "assistant", "user", "assistant"]
    assert history[-1]["sources"][0]["page"] == 3


def test_not_found_answer_has_no_sources(fake):
    pipeline.ingest_pdf("report.pdf", make_pdf(SAMPLE_PAGES))
    fake.answer = NOT_FOUND
    events = list(pipeline.answer_stream("s2", "Who won the 2022 World Cup?"))
    assert events[-1] == ("sources", {"sources": []})


def test_small_talk_reply_has_no_sources(fake):
    pipeline.ingest_pdf("report.pdf", make_pdf(SAMPLE_PAGES))
    fake.answer = "Hi! I can answer questions about report.pdf."
    events = list(pipeline.answer_stream("s4", "hi"))
    assert events[-1] == ("sources", {"sources": []})
    assert memory.get_messages("s4")[-1]["sources"] == []


def test_has_citation():
    assert has_citation("Rose 40% [report.pdf, p. 2].")
    assert has_citation("See [a.pdf, pp. 11, 12]")
    assert not has_citation(NOT_FOUND)
    assert not has_citation("Hi! I can answer questions about report.pdf [1].")


def test_no_documents_short_circuits(fake):
    events = list(pipeline.answer_stream("s3", "Anything?"))
    assert events[0][1]["text"] == pipeline.NO_DOCUMENTS


def test_changed_embedding_model_is_refused(fake):
    pipeline.ingest_pdf("report.pdf", make_pdf(SAMPLE_PAGES))
    other = FakeProvider()
    other.embed_model = "other-embed"
    assert store.index_warning(other.embedding_id)
    with pytest.raises(store.IndexMismatchError):
        store.ensure_compatible(other)


def test_retry_backs_off_then_gives_up(monkeypatch):
    waits = []
    monkeypatch.setattr("app.llm.base.time.sleep", waits.append)

    def always_429():
        raise RuntimeError("429")

    with pytest.raises(RateLimitError):
        with_retry(always_429, lambda e: "429" in str(e), attempts=4, base_delay=2)
    assert waits == [3, 5, 9]


def test_retry_uses_provider_delay_and_recovers(monkeypatch):
    waits = []
    monkeypatch.setattr("app.llm.base.time.sleep", waits.append)
    attempts = iter([RuntimeError("429"), "ok"])

    def flaky():
        result = next(attempts)
        if isinstance(result, Exception):
            raise result
        return result

    assert with_retry(flaky, lambda e: "429" in str(e), retry_after=lambda e: 18.0) == "ok"
    assert waits == [19.0]
