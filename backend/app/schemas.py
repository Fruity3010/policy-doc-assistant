from pydantic import BaseModel, Field


class Document(BaseModel):
    id: str
    name: str
    pages: int
    chunks: int
    created_at: str | None = None


class Source(BaseModel):
    document: str
    document_id: str
    page: int
    text: str
    score: float


class Message(BaseModel):
    role: str
    content: str
    sources: list[Source] = []
    created_at: str


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=100)
    question: str = Field(min_length=1, max_length=2000)


class Health(BaseModel):
    status: str
    provider: str
    chat_model: str | None
    embedding_model: str | None
    error: str | None = None
    index_warning: str | None = None
    documents: int
