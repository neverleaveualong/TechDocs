import json
import time

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.core.rag_pipeline import rag_pipeline
from app.core.rate_limit import limiter
from app.db.database import get_connection
from app.models.search import (
    SearchRequest,
    SearchResponse,
    SimilarityRequest,
    SimilarityResponse,
)

router = APIRouter()


def _save_query_log(
    query: str,
    answer: str,
    sources: list[dict],
    use_hybrid: bool,
    elapsed_ms: int,
) -> int | None:
    try:
        conn = get_connection()
        sources_json = json.dumps(sources, ensure_ascii=False)
        cursor = conn.execute(
            "INSERT INTO query_logs (query, answer, sources, search_mode, response_time_ms) VALUES (?, ?, ?, ?, ?)",
            (
                query,
                answer,
                sources_json,
                "hybrid" if use_hybrid else "vector",
                elapsed_ms,
            ),
        )
        conn.commit()
        query_log_id = cursor.lastrowid
        conn.close()
        return query_log_id
    except Exception:
        return None


def _encode_stream_event(payload: dict) -> bytes:
    return (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")


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
        result["query_log_id"] = _save_query_log(
            query=body.query,
            answer=result.get("answer", ""),
            sources=result.get("sources", []),
            use_hybrid=body.use_hybrid,
            elapsed_ms=elapsed_ms,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"search failed: {str(e)}")


@router.post("/stream")
@limiter.limit("10/minute")
async def search_stream(request: Request, body: SearchRequest):
    start = time.time()

    async def event_generator():
        answer_chunks: list[str] = []
        try:
            prepared = rag_pipeline.prepare_search(
                query=body.query,
                top_k=body.top_k,
                use_hybrid=body.use_hybrid,
                use_reranker=body.use_reranker,
            )

            yield _encode_stream_event(
                {
                    "type": "sources",
                    "query": body.query,
                    "sources": prepared["sources"],
                }
            )

            async for chunk in rag_pipeline.stream_answer(prepared["prompt_value"]):
                text = chunk.content if hasattr(chunk, "content") else str(chunk)
                if not text:
                    continue
                answer_chunks.append(text)
                yield _encode_stream_event({"type": "answer_delta", "delta": text})

            answer = "".join(answer_chunks)
            elapsed_ms = int((time.time() - start) * 1000)
            query_log_id = _save_query_log(
                query=body.query,
                answer=answer,
                sources=prepared["sources"],
                use_hybrid=body.use_hybrid,
                elapsed_ms=elapsed_ms,
            )

            yield _encode_stream_event(
                {
                    "type": "done",
                    "query": body.query,
                    "query_log_id": query_log_id,
                }
            )
        except Exception as e:
            yield _encode_stream_event(
                {
                    "type": "error",
                    "detail": f"search failed: {str(e)}",
                }
            )

    return StreamingResponse(
        event_generator(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


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
