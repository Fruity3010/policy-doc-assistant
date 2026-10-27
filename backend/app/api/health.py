from fastapi import APIRouter

from app import llm
from app.core import config
from app.llm import ConfigError
from app.rag import store
from app.schemas import Health

router = APIRouter(tags=["health"])


@router.get("/health", response_model=Health)
def health():
    docs = len(store.list_documents())
    try:
        provider = llm.get_provider()
    except ConfigError as e:
        return Health(status="degraded", provider=config.LLM_PROVIDER, chat_model=None, embedding_model=None, error=str(e), documents=docs)
    return Health(
        status="ok",
        provider=provider.name,
        chat_model=provider.chat_model,
        embedding_model=provider.embed_model,
        index_warning=store.index_warning(provider.embedding_id),
        documents=docs,
    )
