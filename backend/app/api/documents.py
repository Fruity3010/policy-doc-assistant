from fastapi import APIRouter, HTTPException, UploadFile

from app.core import config
from app.rag import pipeline, store
from app.schemas import Document

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", response_model=Document, status_code=201)
def upload_document(file: UploadFile):
    name = file.filename or "document.pdf"
    if not name.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported.")
    limit = config.MAX_UPLOAD_MB * 1024 * 1024
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"File is larger than {config.MAX_UPLOAD_MB} MB.")
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "This file is not a valid PDF.")
    try:
        return pipeline.ingest_pdf(name, data)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.get("", response_model=list[Document])
def list_documents():
    return store.list_documents()


@router.delete("/{doc_id}", status_code=204)
def delete_document(doc_id: str):
    if not store.delete_document(doc_id):
        raise HTTPException(404, "Document not found.")
