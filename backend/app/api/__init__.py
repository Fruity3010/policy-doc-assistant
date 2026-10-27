from fastapi import APIRouter

from app.api import chat, documents, health

router = APIRouter()
for module in (health, documents, chat):
    router.include_router(module.router)
