import time
from abc import ABC, abstractmethod
from collections.abc import Callable, Iterator
from typing import TypeVar

T = TypeVar("T")


class ProviderError(Exception):
    status = 502


class ConfigError(ProviderError):
    status = 503


class RateLimitError(ProviderError):
    status = 429


class LLMProvider(ABC):
    name: str
    chat_model: str
    embed_model: str

    @property
    def embedding_id(self) -> str:
        return f"{self.name}:{self.embed_model}"

    @abstractmethod
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        ...

    @abstractmethod
    def embed_query(self, text: str) -> list[float]:
        ...

    @abstractmethod
    def generate(self, system: str, prompt: str) -> str:
        ...

    @abstractmethod
    def stream(self, system: str, prompt: str) -> Iterator[str]:
        ...


def with_retry(
    fn: Callable[[], T],
    is_rate_limit: Callable[[Exception], bool],
    attempts: int = 4,
    base_delay: float = 2.0,
    retry_after: Callable[[Exception], float | None] = lambda e: None,
) -> T:
    for attempt in range(attempts):
        try:
            return fn()
        except Exception as e:
            if not is_rate_limit(e):
                raise
            if attempt == attempts - 1:
                raise RateLimitError("The model provider's rate limit was hit. Wait a minute and try again.") from e
            delay = retry_after(e) or base_delay * 2**attempt
            time.sleep(min(delay + 1, 65))
    raise AssertionError("unreachable")


def batched(items: list[T], size: int) -> Iterator[list[T]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]
