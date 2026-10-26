"""The interface every model provider implements, plus shared errors and retry logic."""

import time
from abc import ABC, abstractmethod
from collections.abc import Callable, Iterator
from typing import TypeVar

T = TypeVar("T")


class ProviderError(Exception):
    """Any failure talking to the model provider. `status` becomes the HTTP status code."""

    status = 502


class ConfigError(ProviderError):
    """Provider is not configured, e.g. missing API key."""

    status = 503


class RateLimitError(ProviderError):
    """Provider returned 429 (free-tier quota hit) even after retrying."""

    status = 429


class LLMProvider(ABC):
    name: str
    chat_model: str
    embed_model: str

    @property
    def embedding_id(self) -> str:
        """Identifies the embedding space. Vectors from different ids can't be compared."""
        return f"{self.name}:{self.embed_model}"

    @abstractmethod
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed chunks of a document (batched)."""

    @abstractmethod
    def embed_query(self, text: str) -> list[float]:
        """Embed a search query."""

    @abstractmethod
    def generate(self, system: str, prompt: str) -> str:
        """Return a complete answer in one go."""

    @abstractmethod
    def stream(self, system: str, prompt: str) -> Iterator[str]:
        """Yield the answer piece by piece as the model produces it."""


def with_retry(fn: Callable[[], T], is_rate_limit: Callable[[Exception], bool], attempts: int = 4, base_delay: float = 2.0) -> T:
    """Call fn(); on a rate-limit error wait 2s, 4s, 8s... then try again.

    Any other error is raised straight away. After the last attempt we raise RateLimitError.
    """
    for attempt in range(attempts):
        try:
            return fn()
        except Exception as e:
            if not is_rate_limit(e):
                raise
            if attempt == attempts - 1:
                raise RateLimitError("The model provider's rate limit was hit. Wait a minute and try again.") from e
            time.sleep(base_delay * 2**attempt)
    raise AssertionError("unreachable")


def batched(items: list[T], size: int) -> Iterator[list[T]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]
