from fastapi import APIRouter, HTTPException, Request
import time
import json

from app.core.rag_pipeline import rag_pipeline
from app.core.rate_limit import limiter
from app.models.search import (
    SearchRequest,
    SearchResponse,
    SimilarityRequest,
    SimilarityResponse,
)
from app.db.database import get_connection

router = APIRouter()


@router.post("/search", response_model=SearchResponse)
@limiter.limit("10/minute")
async def search(request: Request, body: SearchRequest):
    start = time.time()
    try:
        result = rag_pipeline.search(
            query=body.query,
            top_k=body.top_k,
            use_hybrid=body.use_hybrid,
            use_reranker=body.use_reranker,
        )
        elapsed_ms = int((time.time() - start) * 1000)

        # Save query log for feedback tracking
        try:
            conn = get_connection()
            sources_json = json.dumps(result.get("sources", []), ensure_ascii=False)
            cursor = conn.execute(
                "INSERT INTO query_logs (query, answer, sources, search_mode, response_time_ms) VALUES (?, ?, ?, ?, ?)",
                (body.query, result.get("answer", ""), sources_json,
                 "hybrid" if body.use_hybrid else "vector", elapsed_ms),
            )
            conn.commit()
            result["query_log_id"] = cursor.lastrowid
            conn.close()
        except Exception:
            pass

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"search failed: {str(e)}")


@router.post("/similarity", response_model=SimilarityResponse)
@limiter.limit("10/minute")
async def similarity_search(request: Request, body: SimilarityRequest):
    try:
        results = rag_pipeline.similarity_search(
            query=body.query,
            top_k=body.top_k,
        )
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"similarity search failed: {str(e)}")
