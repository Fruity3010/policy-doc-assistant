import json
from collections.abc import Iterator

import httpx

from app.core import config
from app.llm.base import ConfigError, LLMProvider, ProviderError, batched, with_retry

EMBED_BATCH_SIZE = 32


def _is_rate_limit(e: Exception) -> bool:
    return isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 429


class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(self):
        self.base_url = config.OLLAMA_BASE_URL.rstrip("/")
        self.chat_model = config.OLLAMA_CHAT_MODEL
        self.embed_model = config.OLLAMA_EMBED_MODEL
        self.http = httpx.Client(base_url=self.base_url, timeout=300)

    def _post(self, path: str, body: dict) -> dict:
        def call():
            r = self.http.post(path, json=body)
            r.raise_for_status()
            return r.json()

        try:
            return with_retry(call, _is_rate_limit)
        except httpx.ConnectError as e:
            raise ConfigError(f"Can't reach Ollama at {self.base_url}. Is `ollama serve` running?") from e
        except httpx.HTTPStatusError as e:
            raise ProviderError(f"Ollama error: {e.response.text}") from e

    def _embed(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for batch in batched(texts, EMBED_BATCH_SIZE):
            vectors.extend(self._post("/api/embed", {"model": self.embed_model, "input": batch})["embeddings"])
        return vectors

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embed([f"search_document: {t}" for t in texts])

    def embed_query(self, text: str) -> list[float]:
        return self._embed([f"search_query: {text}"])[0]

    def _chat_body(self, system: str, prompt: str, stream: bool) -> dict:
        return {
            "model": self.chat_model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            "stream": stream,
            "options": {"temperature": 0.2},
        }

    def generate(self, system: str, prompt: str) -> str:
        return self._post("/api/chat", self._chat_body(system, prompt, False))["message"]["content"]

    def stream(self, system: str, prompt: str) -> Iterator[str]:
        try:
            with self.http.stream("POST", "/api/chat", json=self._chat_body(system, prompt, True)) as r:
                if r.status_code >= 400:
                    raise ProviderError(f"Ollama error: {r.read().decode()}")
                for line in r.iter_lines():
                    if line:
                        piece = json.loads(line).get("message", {}).get("content", "")
                        if piece:
                            yield piece
        except httpx.ConnectError as e:
            raise ConfigError(f"Can't reach Ollama at {self.base_url}. Is `ollama serve` running?") from e
