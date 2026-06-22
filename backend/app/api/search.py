import json
import time

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.config import settings
from app.core.patent_query_agent import build_patent_query_plan
from app.core.rag_pipeline import rag_pipeline
from app.core.rate_limit import limiter
from app.db.database import SessionLocal
from app.models.feedback import QueryLog
from app.models.search import (
    SearchRequest,
    SearchResponse,
    SimilarityRequest,
    SimilarityResponse,
)

# Multi-agent components
from app.agents.protocol import AgentAction, AgentMessage
from app.agents.supervisor import SupervisorAgent
from app.agents.retriever import RetrieverAgent
from app.agents.ingest import IngestAgent
from app.agents.generator import GeneratorAgent

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
        query_plan = build_patent_query_plan(body.query, intent_hint="rag_search")

        supervisor = SupervisorAgent(llm=rag_pipeline.llm)
        retriever = RetrieverAgent(pipeline=rag_pipeline)
        ingestion = IngestAgent()
        generator = GeneratorAgent(pipeline=rag_pipeline)

        state = {
            "query": body.query,
            "query_plan": query_plan,
            "source_count": 0,
            "best_score": 0.0,
            "matched_terms": [],
            "quality_reason": "no_sources",
            "ingest_done": False,
            "ingest_result": None,
            "sources": [],
        }

        final_answer = ""
        final_sources = []

        for _ in range(supervisor.max_iterations):
            decision = await supervisor.decide(state)

            if decision.next_action == AgentAction.SEARCH:
                strategy = decision.parameters.get("strategy", "hybrid" if body.use_hybrid else "vector")
                top_k = decision.parameters.get("top_k", body.top_k)

                msg = AgentMessage(
                    sender="supervisor",
                    action=AgentAction.SEARCH,
                    payload={
                        "query": body.query,
                        "strategy": strategy,
                        "top_k": top_k,
                        "query_plan": query_plan,
                    }
                )
                result_msg = await retriever.execute(msg)
                supervisor.record(result_msg)

                sources = result_msg.payload.get("sources", [])
                state["sources"] = sources
                state["source_count"] = len(sources)

                quality = result_msg.payload.get("quality")
                if quality:
                    state["quality_reason"] = quality.get("reason", "unknown")
                    state["best_score"] = max([s.get("score", 0.0) for s in sources]) if sources else 0.0
                    terms = set()
                    for s in sources:
                        for term in s.get("matched_terms", []):
                            terms.add(term)
                    state["matched_terms"] = list(terms)
                else:
                    state["quality_reason"] = "unknown"
                    state["best_score"] = max([s.get("score", 0.0) for s in sources]) if sources else 0.0
                    state["matched_terms"] = []

            elif decision.next_action == AgentAction.INGEST:
                if not body.auto_ingest:
                    state["ingest_done"] = True
                    continue

                msg = AgentMessage(
                    sender="supervisor",
                    action=AgentAction.INGEST,
                    payload={
                        "query": body.query,
                        "query_plan": query_plan,
                    }
                )
                result_msg = await ingestion.execute(msg)
                supervisor.record(result_msg)

                state["ingest_done"] = True
                state["ingest_result"] = {
                    "patents_found": result_msg.payload.get("patents_found", 0),
                    "patents_saved": result_msg.payload.get("patents_saved", 0),
                    "rag_vectors_stored": result_msg.payload.get("rag_vectors_stored", 0),
                }

            elif decision.next_action == AgentAction.GENERATE:
                msg = AgentMessage(
                    sender="supervisor",
                    action=AgentAction.GENERATE,
                    payload={
                        "query": body.query,
                        "sources": state.get("sources", []),
                    }
                )
                result_msg = await generator.execute(msg)
                supervisor.record(result_msg)

                final_answer = result_msg.payload.get("answer", "")
                final_sources = result_msg.payload.get("sources", [])
                break

            elif decision.next_action == AgentAction.DONE:
                break

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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"search failed: {str(e)}")


@router.post("/stream")
@limiter.limit("10/minute")
async def search_stream(request: Request, body: SearchRequest):
    start = time.time()

    async def event_generator():
        answer_chunks: list[str] = []
        try:
            query_plan = build_patent_query_plan(body.query, intent_hint="rag_search")
            yield _encode_stream_event(
                {
                    "type": "query_plan",
                    "data": query_plan.to_event_data(),
                }
            )

            supervisor = SupervisorAgent(llm=rag_pipeline.llm)
            retriever = RetrieverAgent(pipeline=rag_pipeline)
            ingestion = IngestAgent()
            generator = GeneratorAgent(pipeline=rag_pipeline)

            state = {
                "query": body.query,
                "query_plan": query_plan,
                "source_count": 0,
                "best_score": 0.0,
                "matched_terms": [],
                "quality_reason": "no_sources",
                "ingest_done": False,
                "ingest_result": None,
                "sources": [],
            }

            final_sources = []
            prompt_value = None

            for _ in range(supervisor.max_iterations):
                decision = await supervisor.decide(state)

                # Supervisor Decision 스트리밍 방출
                yield _encode_stream_event(
                    {
                        "type": "agent_decision",
                        "agent": "supervisor",
                        "decision": {
                            "next_action": decision.next_action.value,
                            "reasoning": decision.reasoning,
                            "parameters": decision.parameters,
                        }
                    }
                )

                if decision.next_action == AgentAction.SEARCH:
                    strategy = decision.parameters.get("strategy", "hybrid" if body.use_hybrid else "vector")
                    top_k = decision.parameters.get("top_k", body.top_k)

                    yield _encode_stream_event(
                        {
                            "type": "agent_action",
                            "agent": "retriever",
                            "message": f"{strategy} 검색을 준비하고 있습니다. (top_k={top_k})",
                        }
                    )

                    msg = AgentMessage(
                        sender="supervisor",
                        action=AgentAction.SEARCH,
                        payload={
                            "query": body.query,
                            "strategy": strategy,
                            "top_k": top_k,
                            "query_plan": query_plan,
                        }
                    )
                    result_msg = await retriever.execute(msg)
                    supervisor.record(result_msg)

                    sources = result_msg.payload.get("sources", [])
                    state["sources"] = sources
                    state["source_count"] = len(sources)

                    quality = result_msg.payload.get("quality")
                    if quality:
                        state["quality_reason"] = quality.get("reason", "unknown")
                        state["best_score"] = max([s.get("score", 0.0) for s in sources]) if sources else 0.0
                        terms = set()
                        for s in sources:
                            for term in s.get("matched_terms", []):
                                terms.add(term)
                        state["matched_terms"] = list(terms)
                    else:
                        state["quality_reason"] = "unknown"
                        state["best_score"] = max([s.get("score", 0.0) for s in sources]) if sources else 0.0
                        state["matched_terms"] = []

                    # 기존 UI와의 호환성을 위한 search_quality
                    yield _encode_stream_event(
                        {
                            "type": "search_quality",
                            "phase": "retry" if state["ingest_done"] else "initial",
                            "data": quality if quality else {"reason": state["quality_reason"], "should_auto_ingest": False},
                        }
                    )

                    yield _encode_stream_event(
                        {
                            "type": "agent_completed",
                            "agent": "retriever",
                            "reasoning": result_msg.reasoning,
                            "payload": {
                                "source_count": len(sources),
                                "best_score": state["best_score"],
                            }
                        }
                    )

                elif decision.next_action == AgentAction.INGEST:
                    if not body.auto_ingest:
                        state["ingest_done"] = True
                        continue

                    yield _encode_stream_event(
                        {
                            "type": "auto_ingest_started",
                            "reason": decision.reasoning,
                            "message": "관련 데이터가 부족하여 KIPRIS에서 데이터를 수집합니다.",
                        }
                    )

                    msg = AgentMessage(
                        sender="supervisor",
                        action=AgentAction.INGEST,
                        payload={
                            "query": body.query,
                            "query_plan": query_plan,
                        }
                    )
                    result_msg = await ingestion.execute(msg)
                    supervisor.record(result_msg)

                    state["ingest_done"] = True
                    state["ingest_result"] = {
                        "patents_found": result_msg.payload.get("patents_found", 0),
                        "patents_saved": result_msg.payload.get("patents_saved", 0),
                        "rag_vectors_stored": result_msg.payload.get("rag_vectors_stored", 0),
                    }

                    yield _encode_stream_event(
                        {
                            "type": "auto_ingest_completed",
                            "data": result_msg.payload.get("event_data"),
                        }
                    )

                    if result_msg.payload.get("should_retry_search"):
                        yield _encode_stream_event(
                            {
                                "type": "retry_search",
                                "message": "새로 수집된 데이터를 RAG 파이프라인에 검색 반영합니다.",
                            }
                        )

                elif decision.next_action == AgentAction.GENERATE:
                    yield _encode_stream_event(
                        {
                            "type": "agent_action",
                            "agent": "generator",
                            "message": f"검색된 특허 {len(state.get('sources', []))}건의 요약 및 답변을 생성합니다.",
                        }
                    )

                    msg = AgentMessage(
                        sender="supervisor",
                        action=AgentAction.GENERATE,
                        payload={
                            "query": body.query,
                            "sources": state.get("sources", []),
                        }
                    )
                    result_msg = await generator.execute(msg)
                    supervisor.record(result_msg)

                    final_sources = result_msg.payload.get("sources", [])
                    prompt_value = result_msg.payload.get("prompt_value")

                    yield _encode_stream_event(
                        {
                            "type": "agent_completed",
                            "agent": "generator",
                            "reasoning": result_msg.reasoning,
                            "payload": {
                                "sources_count": len(final_sources),
                                "citation_valid": result_msg.payload.get("citation_valid", True),
                            }
                        }
                    )
                    break

                elif decision.next_action == AgentAction.DONE:
                    break

            if not final_sources:
                prepared = rag_pipeline.prepare_empty_search(body.query)
                prompt_value = prepared["prompt_value"]
                final_sources = []

            # 최종 소스 데이터 방출
            yield _encode_stream_event(
                {
                    "type": "sources",
                    "query": body.query,
                    "sources": final_sources,
                }
            )

            # LLM 답변 스트리밍 방출
            async for chunk in generator.stream_answer(prompt_value):
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
                sources=final_sources,
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

