# How it works

A plain-English walkthrough of the code, in the order a request flows through it. File paths are relative to `backend/`.

## The big idea

An LLM doesn't know what's in your PDFs, and you can't paste a 300-page report into every question. RAG (Retrieval-Augmented Generation) solves this in two phases:

1. **Ahead of time:** cut the documents into small pieces and store each piece with a vector (a list of numbers) that represents its meaning.
2. **At question time:** turn the question into a vector too, find the pieces whose vectors are closest, and give only those pieces to the LLM with strict instructions to answer from them and cite them.

## Part 1: Uploading a PDF

Entry point: `app/api/documents.py` → `upload_document()`.

1. **Validate the file.** The name must end in `.pdf`, the size must be under `MAX_UPLOAD_MB`, and the bytes must start with `%PDF` (the magic header every PDF has). Anything else is a 400 before we spend any work on it.
2. **Extract text per page.** `app/rag/chunking.py` → `extract_pages()` uses pypdf to read each page's text layer. Password-protected or corrupt files raise `ValueError`, which becomes a 400.
3. **Chunk.** `chunk_pages()` calls `split_text()` on each page separately:
   - Collapse whitespace (PDFs are full of hard line breaks).
   - Take ~800 characters. If that cuts mid-sentence, move the end back to the last `". "` (or failing that, the last space) in the second half of the window.
   - Start the next chunk 150 characters before the previous one ended (the **overlap**), snapped forward to a word start.
   - Each `Chunk` keeps its `page` (for citations) and `index` (its position in the document).
   - If no chunks come out at all, the PDF is probably scanned images → 400 "No text could be extracted".
4. **Check the embedding model.** `app/rag/store.py` → `ensure_compatible()`. The SQLite `meta` table records which embedding model built the index (e.g. `gemini:gemini-embedding-2:768`). If documents exist and the current provider's model is different, we refuse with 409, because the two sets of vectors live in different "spaces" and comparing them gives nonsense.
5. **Embed.** `provider.embed_documents(texts)`, see Part 4. Chunks are sent in batches (50 per request for Gemini) to stay under free-tier request limits.
6. **Store.** `store.add_document()`:
   - Chroma gets one record per chunk: id `"{doc_id}:{index}"`, the vector, the text, and metadata `{doc_id, doc_name, page, chunk}`.
   - SQLite's `documents` table gets one row: id, name, page count, chunk count. This is what `GET /documents` lists.

Deleting (`store.delete_document()`) removes the SQLite row and then every Chroma record `where doc_id = …`.

## Part 2: Answering a question

Entry point: `app/api/chat.py` → `chat()`, which streams whatever `app/rag/pipeline.py` → `answer_stream()` yields.

1. **No documents?** Reply with a fixed message and skip the LLM entirely.
2. **Load memory.** `app/db/memory.py` → `get_messages(session_id, limit=6)` fetches the last 6 messages of this chat from SQLite.
3. **Rewrite the question (the memory step).** `rewrite_question()`. A follow-up like *"What about 2023?"* has no meaning by itself, so embedding it would retrieve random chunks. We send the history plus the follow-up to the LLM with `REWRITE_SYSTEM` (in `app/rag/prompts.py`) and get back a standalone question, e.g. *"What were the main cybercrime trends in 2023?"*. On the first message there's no history, so we skip this call. The rewritten question is streamed to the client as the `question` event.
4. **Retrieve.** `retrieve()` embeds the standalone question with `embed_query()` and calls `store.search()`, which asks Chroma for the `TOP_K` (5) nearest chunks by cosine distance. We convert distance to a similarity score (`1 - distance`, higher is better).
5. **Build the grounded prompt.** `prompts.py` → `build_answer_prompt()`:
   ```
   Context excerpts:
   --- [NIST_CSF_2.0.pdf, p. 42] ---
   <chunk text>
   --- [NIST_CSF_2.0.pdf, p. 7] ---
   …

   Recent conversation (for tone and references only, not a source of facts):
   User: …
   Assistant: …

   Question: <standalone question>
   ```
   The system prompt `ANSWER_SYSTEM` says: use only the excerpts, cite every fact as `[Document name, p. X]`, and if the answer isn't there, reply with the exact `NOT_FOUND` sentence. A separate rule handles greetings and thanks (a friendly one-liner naming the uploaded documents, which are listed at the top of the prompt), while making clear that this never allows answering factual questions from outside knowledge. Because each excerpt's header *is* the citation, the model just copies it. (Numbering the excerpts `[1]`, `[2]` made llama3.2 cite `[1]` instead of the page, so the numbers were removed.)
6. **Stream the answer.** `provider.stream()` yields text pieces as the model generates them; each becomes an SSE `token` event, and the React app appends it to the message on screen.
7. **Send the sources.** After the text, a `sources` event carries the retrieved chunks (document, page, snippet, score) so the UI can show expandable citations. If the answer contains no citation (`prompts.py` → `has_citation()`), we send an empty list. That covers the "not found" reply and small talk: saying "hi" still runs a search, and the chunks it finds are irrelevant, so they must not be shown as evidence.
8. **Save to memory.** Only now, once the answer is complete, both the user message and the assistant message (with its sources as JSON) are written to SQLite. A failed request therefore doesn't leave half a conversation behind.

### Why Server-Sent Events?

SSE is one-way server→client streaming over plain HTTP: the response is `text/event-stream`, and each event is `event: name\ndata: json\n\n`. That's all we need (the client only sends one question per request), and it's simpler than WebSockets. The browser's built-in `EventSource` only supports GET, so `frontend/src/api.ts` → `chat()` uses `fetch` and reads the body stream, splitting on blank lines.

## Part 3: Memory storage

`app/db/session.py` creates four SQLite tables: `documents`, `sessions`, `messages` (role, content, sources JSON, timestamp) and `meta`. `get_db()` is a context manager that opens a connection, commits on success and always closes it.

The frontend generates a session id with `crypto.randomUUID()` and keeps it in localStorage, so refreshing the page restores the chat via `GET /sessions/{id}/messages`. "New chat" just makes a new id. Old chats stay in the database.

## Part 4: Providers (`app/llm/`)

- `base.py` → `LLMProvider` is the interface: `embed_documents`, `embed_query`, `generate`, `stream`. The rest of the app only uses these four methods.
- `base.py` → `with_retry()` calls a function and, if the error is a rate limit (HTTP 429), waits and tries again. If the provider says how long to wait (Gemini's 429 includes `retryDelay`, e.g. `"18s"`, read by `gemini.py` → `_retry_delay()`), it waits that long; otherwise 2s, 4s, 8s. After the last attempt (6 for Gemini) it raises `RateLimitError`, which `main.py` turns into an HTTP 429 (or an SSE `error` event) that the UI shows.
- `gemini.py` → `GeminiProvider` uses the `google-genai` SDK. Three details worth knowing:
  - `gemini-embedding-2` merges a plain list of strings into **one** vector. To get one vector per chunk, each text is wrapped in its own `types.Content`.
  - Documents and queries get different prefixes (`title: none | text: …` vs `task: search result | query: …`), as Google recommends for retrieval.
  - The streaming call is lazy, so a 429 only shows up when the first chunk is requested. That's why `stream()` fetches the first chunk inside the retry wrapper.
- `ollama.py` → `OllamaProvider` calls Ollama's local REST API (`/api/embed`, `/api/chat`) with httpx. Streaming responses are newline-delimited JSON.
- `__init__.py` → `get_provider()` reads `LLM_PROVIDER` and builds the provider on first use. It's cached with `lru_cache`, and building it lazily means `/health` still works (and reports the problem) when a key is missing.

## Part 5: Tests (`tests/`)

`conftest.py` defines `FakeProvider`: embeddings are word counts hashed into a 256-number vector (texts that share words end up close), and the "LLM" streams a canned answer. Every test gets a fresh temp folder for SQLite and Chroma. `make_pdf()` writes a tiny valid PDF by hand, so there are no binary fixtures.

- `test_chunking.py`: sizes, overlap, no lost words, page numbers, PDF extraction.
- `test_pipeline.py`: ingest → retrieve finds the right page, the rewrite step, memory saved, not-found clears sources, embedding-model mismatch, retry/backoff.
- `test_api.py`: the HTTP layer end to end, including SSE parsing and the 400/404/422/503 errors.

---

## Likely interview questions

**1. Walk me through what happens when a user asks a question.**
We load the last few messages, ask the LLM to rewrite the question so it stands alone, embed it, pull the 5 most similar chunks from Chroma, build a prompt with those chunks labelled by document and page, stream the model's answer to the browser over SSE, send the source chunks, and save both messages to SQLite.

**2. Why chunk at all, and why 800 characters with 150 overlap?**
Embeddings of whole documents blur many topics into one vector, and the LLM's context is limited. Small chunks give precise matches. 800 characters (~150–200 tokens) is big enough to keep a statistic together with its context, and small enough that each chunk is about one thing. The 150-character overlap stops a fact from being lost when it straddles a boundary. These are starting values I'd tune with an evaluation set.

**3. How does conversation memory work?**
Messages are stored per session in SQLite. Before retrieval, the last 6 messages plus the new question go to the LLM, which rewrites the question into a standalone one, so "What about 2023?" becomes a full question that retrieves well. The recent history is also included in the answer prompt so the reply reads naturally, but it's marked as not a source of facts.

**4. How do you stop the model making things up?**
Several layers: the model only sees retrieved excerpts; the system prompt says to answer only from them and gives an exact sentence to use when the answer isn't there; every fact must carry a `[Document, p. X]` citation that the user can check against the snippet in the UI; and temperature is low (0.2). It reduces hallucination rather than eliminating it, which is why I'd add a faithfulness evaluation next.

**5. What is an embedding and how do you measure similarity?**
A vector of numbers (768 here) produced by a model so that texts with similar meaning have vectors pointing in similar directions. We use cosine similarity, the cosine of the angle between two vectors: 1 means same direction. Chroma returns cosine distance (1 − similarity), and its HNSW index finds nearest neighbours quickly without comparing against every chunk.

**6. Why can't you switch embedding models without re-indexing?**
Each model defines its own vector space (often with a different number of dimensions). A query embedded by model B can't be compared to chunks embedded by model A. So I store which model built the index and refuse uploads and questions with a 409 if the provider changes while documents exist.

**7. Why the provider abstraction?**
The RAG code depends on four methods, not on a vendor SDK. That let me support Gemini and local Ollama with the same pipeline, makes tests possible with a fake provider (no key, no network, deterministic), and means adding OpenAI or Claude is one new class.

**8. How do you handle the free tier's rate limits?**
Chunks are embedded in batches of 50 per request; the rewrite call is skipped on first messages; on a 429 we wait for the `retryDelay` Gemini sends back, falling back to exponential backoff. I found in testing that the free tier counts every chunk in a batch as a request (~100 per minute), so batching cuts round trips but not quota, and honouring `retryDelay` is what makes large uploads succeed. If it still fails the API returns 429 with a clear message, which the UI displays.

**9. Why stream with SSE, and how do you handle errors mid-stream?**
Streaming makes the app feel fast because the first words appear in about a second. SSE is simpler than WebSockets for one-way streaming. Once streaming starts the HTTP status is already 200, so failures are sent as an `error` event that the client turns into an error message. Before streaming starts (e.g. missing key), we return a normal JSON error.

**10. What would you improve for production?**
Hybrid search (BM25 + vectors) and a reranker for exact terms like acronyms; an evaluation set measuring retrieval hit-rate and answer faithfulness; pgvector to keep everything in one managed Postgres; background ingestion with progress for big PDFs; OCR and table-aware parsing; authentication with per-user document spaces.
