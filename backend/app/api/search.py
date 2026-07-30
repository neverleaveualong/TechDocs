import logging
import time

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.agents.graph import rag_agent_graph, generator_agent
from app.api.errors import raise_internal_error
from app.config import settings
from app.core.patent_query_agent import build_patent_query_plan
from app.core.rag_pipeline import rag_pipeline
from app.core.rate_limit import limiter
from app.models.search import (
    SearchRequest,
    SearchResponse,
    SimilarityRequest,
    SimilarityResponse,
)
from app.repositories.query_log_repository import save_query_log as _save_query_log
from app.services.search_stream_service import (
    SearchStreamService,
    serialize_query_plan as _serialize_query_plan,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/search", response_model=SearchResponse)
@limiter.limit("10/minute")
async def search(request: Request, body: SearchRequest):
    start = time.time()
    try:
        query_plan = build_patent_query_plan(body.query, intent_hint="rag_search")

        initial_state = {
            "query": body.query,
            "query_plan": _serialize_query_plan(query_plan),
            "top_k": body.top_k,
            "use_hybrid": body.use_hybrid,
            "sources": [],
            "ingest_done": False,
            "auto_ingest": body.auto_ingest,
            "history": [],
        }
        config = {"configurable": {"thread_id": f"search_{int(time.time() * 1000)}"}}
        final_state = await rag_agent_graph.ainvoke(initial_state, config=config)

        final_answer = final_state.get("answer", "")
        final_sources = final_state.get("sources", [])

        if not final_answer:
            prepared = rag_pipeline.prepare_empty_search(body.query)
            answer_obj = await rag_pipeline.llm.ainvoke(prepared["prompt_value"])
            final_answer = answer_obj.content if hasattr(answer_obj, "content") else str(answer_obj)
            final_sources = []

        elapsed_ms = int((time.time() - start) * 1000)
        query_log_id = _save_query_log(
            query=body.query,
            answer=final_answer,
            sources=final_sources,
            use_hybrid=body.use_hybrid,
            elapsed_ms=elapsed_ms,
        )

        return {
            "answer": final_answer,
            "sources": final_sources,
            "query": body.query,
            "query_log_id": query_log_id,
        }
    except Exception as exc:
        raise_internal_error(logger, exc, "search failed")


@router.post("/stream")
@limiter.limit("10/minute")
async def search_stream(request: Request, body: SearchRequest):
    service = SearchStreamService(
        query_plan_builder=build_patent_query_plan,
        rag_agent_graph=rag_agent_graph,
        rag_pipeline=rag_pipeline,
        generator_agent=generator_agent,
        save_query_log=_save_query_log,
        logger=logger,
    )
    return StreamingResponse(
        service.stream(body),
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
    except Exception as exc:
        raise_internal_error(logger, exc, "similarity search failed")
