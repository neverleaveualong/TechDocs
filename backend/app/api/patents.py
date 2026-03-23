from fastapi import APIRouter, HTTPException

from app.ingestion.kipris_client import kipris_client
from app.models.patent import PatentSearchRequest, PatentSearchResponse

router = APIRouter()


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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"KIPRIS API 호출 실패: {str(e)}")
