import json
import time

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.config import settings
from app.core.rag_pipeline import rag_pipeline
from app.core.rate_limit import limiter
from app.db.database import SessionLocal
from app.ingestion.auto_ingest import maybe_auto_ingest_for_rag
from app.models.feedback import QueryLog
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
        with SessionLocal() as db:
            log_entry = QueryLog(
                query=query,
                answer=answer,
                sources=sources,
                search_mode="hybrid" if use_hybrid else "vector",
                response_time_ms=elapsed_ms,
            )
            db.add(log_entry)
            db.commit()
            return log_entry.id
    except Exception:
        return None



def _encode_stream_event(payload: dict) -> bytes:
    return (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")


@router.post("/search", response_model=SearchResponse)
@limiter.limit("10/minute")
async def search(request: Request, body: SearchRequest):
    start = time.time()
    try:
        prepared = rag_pipeline.prepare_search(
            query=body.query,
            top_k=body.top_k,
            namespace=settings.rag_namespace,
            use_hybrid=body.use_hybrid,
            use_reranker=body.use_reranker,
        )
        if body.auto_ingest and not prepared["sources"]:
            auto_ingest_result = await maybe_auto_ingest_for_rag(body.query)
            if auto_ingest_result.should_retry_search:
                prepared = rag_pipeline.prepare_search(
                    query=body.query,
                    top_k=body.top_k,
                    namespace=settings.rag_namespace,
                    use_hybrid=body.use_hybrid,
                    use_reranker=body.use_reranker,
                )

        answer = rag_pipeline.llm.invoke(prepared["prompt_value"])
        result = {
            "answer": answer.content if hasattr(answer, "content") else str(answer),
            "sources": prepared["sources"],
            "query": body.query,
        }
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
                namespace=settings.rag_namespace,
                use_hybrid=body.use_hybrid,
                use_reranker=body.use_reranker,
            )

            if body.auto_ingest and not prepared["sources"]:
                yield _encode_stream_event(
                    {
                        "type": "auto_ingest_started",
                        "message": "관련 데이터가 부족해 KIPRIS에서 샘플 특허를 소량 수집합니다.",
                    }
                )
                auto_ingest_result = await maybe_auto_ingest_for_rag(body.query)
                yield _encode_stream_event(
                    {
                        "type": "auto_ingest_completed",
                        "data": auto_ingest_result.to_event_data(),
                    }
                )
                if auto_ingest_result.should_retry_search:
                    yield _encode_stream_event(
                        {
                            "type": "retry_search",
                            "message": "수집한 샘플 데이터로 다시 검색합니다.",
                        }
                    )
                    prepared = rag_pipeline.prepare_search(
                        query=body.query,
                        top_k=body.top_k,
                        namespace=settings.rag_namespace,
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
            namespace=settings.rag_namespace,
        )
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"similarity search failed: {str(e)}")
