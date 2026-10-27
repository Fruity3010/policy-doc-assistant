import json
import logging
from collections.abc import Iterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app import llm
from app.db import memory
from app.llm import ProviderError
from app.rag import pipeline, store
from app.schemas import ChatRequest, Message

log = logging.getLogger("uvicorn.error")

router = APIRouter(tags=["chat"])


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/chat")
def chat(req: ChatRequest):
    if store.list_documents():
        llm.get_provider()

    def events() -> Iterator[str]:
        try:
            for event, data in pipeline.answer_stream(req.session_id, req.question.strip()):
                yield _sse(event, data)
            yield _sse("done", {})
        except ProviderError as e:
            yield _sse("error", {"message": str(e), "status": e.status})
        except Exception:
            log.exception("chat failed")
            yield _sse("error", {"message": "Something went wrong while answering.", "status": 500})

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/sessions/{session_id}/messages", response_model=list[Message])
def session_messages(session_id: str):
    return memory.get_messages(session_id)
