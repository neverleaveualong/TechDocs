import asyncio
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

# LangGraph Components
from app.agents.graph import rag_agent_graph
from app.agents.protocol import AgentAction

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


def _serialize_query_plan(plan) -> dict:
    if plan is None:
        return {}
    if isinstance(plan, dict):
        return plan
    # Pydantic 모델인 경우
    if hasattr(plan, "model_dump"):
        return plan.model_dump()
    elif hasattr(plan, "dict"):
        return plan.dict()
    # 일반 클래스 인스턴스(Mock)인 경우
    return {
        "intent": getattr(plan, "intent", "mixed"),
        "summary": getattr(plan, "summary", ""),
        "technical_features": getattr(plan, "technical_features", []),
        "search_keywords": getattr(plan, "search_keywords", []),
        "synonyms": getattr(plan, "synonyms", []),
        "ipc_candidates": getattr(plan, "ipc_candidates", []),
        "rag_query": getattr(plan, "rag_query", ""),
        "kipris_queries": getattr(plan, "kipris_queries", []),
        "applicant_candidates": getattr(plan, "applicant_candidates", []),
    }


@router.post("/search", response_model=SearchResponse)
@limiter.limit("10/minute")
async def search(request: Request, body: SearchRequest):
    start = time.time()
    try:
        query_plan = build_patent_query_plan(body.query, intent_hint="rag_search")

        # LangGraph 초기 상태 설정
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

        # Checkpointer 세션 구성을 위한 고유 thread_id
        config = {"configurable": {"thread_id": f"search_{int(time.time() * 1000)}"}}

        # LangGraph 동기식 실행 (ainvoke 사용)
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

            # LangGraph 초기 상태 설정
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

            config = {"configurable": {"thread_id": f"stream_{int(time.time() * 1000)}"}}

            final_sources = []
            prompt_value = None

            # LangGraph updates 스트림 실행
            graph_stream = rag_agent_graph.astream(initial_state, config=config, stream_mode="updates").__aiter__()
            pending_event = asyncio.create_task(anext(graph_stream))
            while True:
                try:
                    event = await asyncio.wait_for(asyncio.shield(pending_event), timeout=5)
                except asyncio.TimeoutError:
                    yield _encode_stream_event(
                        {
                            "type": "keepalive",
                            "elapsed_ms": int((time.time() - start) * 1000),
                        }
                    )
                    continue
                except StopAsyncIteration:
                    break

                pending_event = asyncio.create_task(anext(graph_stream))
                node_name = list(event.keys())[0]
                node_output = event[node_name]

                # 1. Supervisor 결정 스트리밍
                if node_name == "supervisor" and "_latest_decision" in node_output:
                    decision_evt = node_output["_latest_decision"]
                    yield _encode_stream_event(decision_evt)

                    next_action = decision_evt["decision"]["next_action"]
                    if next_action == "ingest":
                        yield _encode_stream_event(
                            {
                                "type": "auto_ingest_started",
                                "reason": decision_evt["decision"]["reasoning"],
                                "message": "관련 데이터가 부족하여 KIPRIS에서 데이터를 수집합니다.",
                            }
                        )
                    elif next_action == "search":
                        params = decision_evt["decision"]["parameters"]
                        strategy = params.get("strategy", "hybrid" if body.use_hybrid else "vector")
                        top_k = params.get("top_k", body.top_k)
                        yield _encode_stream_event(
                            {
                                "type": "agent_action",
                                "agent": "retriever",
                                "message": f"{strategy} 검색을 준비하고 있습니다. (top_k={top_k})",
                            }
                        )
                    elif next_action == "generate":
                        yield _encode_stream_event(
                            {
                                "type": "agent_action",
                                "agent": "generator",
                                "message": "검색된 특허 문장의 요약 및 답변을 생성합니다.",
                            }
                        )

                # 2. Retriever 완료 스트리밍
                elif node_name == "retriever" and "_latest_agent_event" in node_output:
                    retriever_evt = node_output["_latest_agent_event"]
                    best_score = node_output.get("best_score", 0.0)
                    quality_reason = node_output.get("quality_reason", "unknown")
                    ingest_done = node_output.get("ingest_done", False)

                    # 기존 UI 호환을 위한 search_quality
                    yield _encode_stream_event(
                        {
                            "type": "search_quality",
                            "phase": "retry" if ingest_done else "initial",
                            "data": {
                                "reason": quality_reason,
                                "best_score": best_score,
                                "should_auto_ingest": False
                            },
                        }
                    )
                    yield _encode_stream_event(retriever_evt)

                # 3. Ingest 완료 스트리밍
                elif node_name == "ingest" and "_latest_agent_event" in node_output:
                    ingest_evt = node_output["_latest_agent_event"]
                    yield _encode_stream_event(ingest_evt)

                    yield _encode_stream_event(
                        {
                            "type": "retry_search",
                            "message": "새로 수집된 데이터를 RAG 파이프라인에 검색 반영합니다.",
                        }
                    )

                # 4. Generator 완료 스트리밍 (최종 RAG 문서 획득)
                elif node_name == "generator" and "_latest_agent_event" in node_output:
                    generator_evt = node_output["_latest_agent_event"]
                    final_sources = node_output.get("sources", [])
                    prompt_value = node_output.get("prompt_value")
                    yield _encode_stream_event(generator_evt)

            # LangGraph 실행이 끝난 후 최종 확보한 state 정보 로드
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

            # LLM 답변 스트리밍 방출 (generator_agent 활용)
            from app.agents.graph import generator_agent
            async for chunk in generator_agent.stream_answer(prompt_value):
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

