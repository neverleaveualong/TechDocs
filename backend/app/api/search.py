from fastapi import APIRouter, HTTPException, Request

from app.core.rag_pipeline import rag_pipeline
from app.core.rate_limit import limiter
from app.models.search import (
    SearchRequest,
    SearchResponse,
    SimilarityRequest,
    SimilarityResponse,
)

router = APIRouter()


@router.post("/", response_model=SearchResponse)
@limiter.limit("10/minute")
async def search(request: Request, body: SearchRequest):
    """RAG 검색 — 자연어 질문 → AI 답변 + 출처 특허 (분당 10회 제한)"""
    try:
        result = rag_pipeline.search(
            query=body.query,
            top_k=body.top_k,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"검색 실패: {str(e)}")


@router.post("/similar", response_model=SimilarityResponse)
@limiter.limit("10/minute")
async def similarity_search(request: Request, body: SimilarityRequest):
    """유사도 검색 — LLM 답변 없이 관련 문서만 반환 (분당 10회 제한)"""
    try:
        results = rag_pipeline.similarity_search(
            query=body.query,
            top_k=body.top_k,
        )
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"유사도 검색 실패: {str(e)}")
