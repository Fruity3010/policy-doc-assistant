"""Google Gemini provider, using the official google-genai SDK."""

from collections.abc import Callable, Iterator

from google import genai
from google.genai import errors, types

from app import config
from app.llm.base import ConfigError, LLMProvider, ProviderError, batched, with_retry

EMBED_BATCH_SIZE = 50  # chunks per embedding request, keeps free-tier request count low


def _is_rate_limit(e: Exception) -> bool:
    return isinstance(e, errors.APIError) and e.code == 429


def _call(fn: Callable):
    """Run an SDK call with retry, turning SDK errors into our own error types."""
    try:
        return with_retry(fn, _is_rate_limit)
    except errors.APIError as e:
        if e.code in (400, 401, 403) and "key" in str(e).lower():
            raise ConfigError("Gemini rejected the API key. Check GEMINI_API_KEY in backend/.env.") from e
        raise ProviderError(f"Gemini error: {e.message or e}") from e


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(self):
        if not config.GEMINI_API_KEY:
            raise ConfigError("GEMINI_API_KEY is not set. Add it to backend/.env (free key: https://aistudio.google.com/apikey).")
        self.client = genai.Client(api_key=config.GEMINI_API_KEY)
        self.chat_model = config.GEMINI_CHAT_MODEL
        self.embed_model = config.GEMINI_EMBED_MODEL
        self.dim = config.GEMINI_EMBED_DIM

    @property
    def embedding_id(self) -> str:
        return f"gemini:{self.embed_model}:{self.dim}"

    def _embed(self, texts: list[str]) -> list[list[float]]:
        # Each text is wrapped in its own Content, otherwise gemini-embedding-2
        # merges the whole list into ONE vector.
        contents = [types.Content(parts=[types.Part.from_text(text=t)]) for t in texts]
        result = _call(
            lambda: self.client.models.embed_content(
                model=self.embed_model,
                contents=contents,
                config=types.EmbedContentConfig(output_dimensionality=self.dim),
            )
        )
        return [e.values for e in result.embeddings]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        # Prefixes recommended by Google for asymmetric retrieval (document side)
        prefixed = [f"title: none | text: {t}" for t in texts]
        vectors: list[list[float]] = []
        for batch in batched(prefixed, EMBED_BATCH_SIZE):
            vectors.extend(self._embed(batch))
        return vectors

    def embed_query(self, text: str) -> list[float]:
        return self._embed([f"task: search result | query: {text}"])[0]

    def _config(self, system: str) -> types.GenerateContentConfig:
        return types.GenerateContentConfig(system_instruction=system, temperature=0.2)

    def generate(self, system: str, prompt: str) -> str:
        response = _call(lambda: self.client.models.generate_content(model=self.chat_model, contents=prompt, config=self._config(system)))
        return response.text or ""

    def stream(self, system: str, prompt: str) -> Iterator[str]:
        # Rate-limit errors surface when the first chunk is requested,
        # so we fetch the first chunk inside the retry wrapper.
        def start():
            it = iter(self.client.models.generate_content_stream(model=self.chat_model, contents=prompt, config=self._config(system)))
            return next(it, None), it

        first, rest = _call(start)
        if first is not None and first.text:
            yield first.text
        try:
            for chunk in rest:
                if chunk.text:
                    yield chunk.text
        except errors.APIError as e:
            raise ProviderError(f"Gemini error: {e.message or e}") from e
