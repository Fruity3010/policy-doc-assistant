from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import router
from app.core import config
from app.llm import ProviderError

app = FastAPI(title="Policy Document Assistant", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
app.include_router(router)


@app.exception_handler(ProviderError)
def provider_error_handler(_: Request, e: ProviderError):
    return JSONResponse(status_code=e.status, content={"detail": str(e)})
