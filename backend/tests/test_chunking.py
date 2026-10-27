from app.rag.chunking import chunk_pages, extract_pages, split_text
from tests.conftest import SAMPLE_PAGES, make_pdf


def test_short_text_is_one_chunk():
    assert split_text("Hello   world.\n\nSecond line.", 800, 150) == ["Hello world. Second line."]


def test_empty_text_gives_no_chunks():
    assert split_text("   \n ", 800, 150) == []


def test_chunks_respect_size_and_overlap():
    text = " ".join(f"Sentence number {i} talks about policy." for i in range(200))
    chunks = split_text(text, 800, 150)
    assert len(chunks) > 5
    assert all(len(c) <= 800 for c in chunks)
    for prev, nxt in zip(chunks, chunks[1:]):
        assert nxt[:40] in prev


def test_every_word_is_kept():
    words = [f"w{i}" for i in range(1000)]
    chunks = split_text(" ".join(words), 100, 20)
    assert set(" ".join(chunks).split()) == set(words)


def test_overlap_bigger_than_chunk_still_terminates():
    assert split_text("a " * 500, 50, 60)


def test_chunks_keep_page_numbers():
    chunks = chunk_pages(["page one text", "", "page three text"], 800, 150)
    assert [(c.page, c.index) for c in chunks] == [(1, 0), (3, 1)]


def test_extract_pages_from_pdf():
    pages = extract_pages(make_pdf(SAMPLE_PAGES))
    assert len(pages) == 3
    assert "Ransomware" in pages[1]
