import logging

from fastapi import APIRouter

from app.api.errors import raise_internal_error
from app.ingestion.kipris_client import kipris_client
from app.models.patent import PatentSearchRequest, PatentSearchResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/search", response_model=PatentSearchResponse)
async def search_patents(request: PatentSearchRequest):
    """KIPRIS API를 통한 특허 검색"""
    try:
        patents, total_count = await kipris_client.search_patents(
            applicant=request.applicant,
            start_date=request.start_date,
            end_date=request.end_date,
            page=request.page,
            num_of_rows=request.num_of_rows,
        )
        return PatentSearchResponse(patents=patents, total_count=total_count)
    except Exception as exc:
        raise_internal_error(logger, exc, "KIPRIS API 호출 실패")
