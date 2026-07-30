import logging

from fastapi import APIRouter

from app.api.errors import raise_internal_error
from app.models.ingest import IngestRequest, IngestResponse
from app.ingestion.pipeline import ingest_patents

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/", response_model=IngestResponse)
async def ingest(request: IngestRequest):
    """특허 데이터 인제스트 (수집 → 청킹 → 임베딩 → Pinecone 저장)"""
    try:
        result = await ingest_patents(
            applicant=request.applicant,
            start_date=request.start_date,
            end_date=request.end_date,
            pages=request.pages,
        )
        return result
    except Exception as exc:
        raise_internal_error(logger, exc, "인제스트 실패")
