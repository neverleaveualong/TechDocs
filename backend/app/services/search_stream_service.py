"""
============================================================
작성자   : 심우현
수정일자 : 2026-07-30
기능요약 : 검색 스트림 오케스트레이션 및 NDJSON 이벤트 변환
수정내용 : LangGraph 실행, 에이전트 이벤트 변환, 답변 스트리밍을 API 계층에서 분리
변경이유 : 검색 Router의 책임을 HTTP 요청·응답 처리로 제한하고 스트림 로직의 테스트 가능성을 개선
주의사항 : 기존 NDJSON 이벤트 타입·필드·순서와 QueryLog 저장 시점을 유지
============================================================
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator, Callable
from typing import Any

from app.api.errors import log_stream_error
from app.models.search import SearchRequest


def encode_stream_event(payload: dict) -> bytes:
    return (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")


def serialize_query_plan(plan: Any) -> dict:
    if plan is None:
        return {}
    if isinstance(plan, dict):
        return plan
    if hasattr(plan, "model_dump"):
        return plan.model_dump()
    if hasattr(plan, "dict"):
        return plan.dict()
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


class SearchStreamService:
    def __init__(
        self,
        *,
        query_plan_builder: Callable[..., Any],
        rag_agent_graph: Any,
        rag_pipeline: Any,
        generator_agent: Any,
        save_query_log: Callable[..., int | None],
        logger: logging.Logger | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._query_plan_builder = query_plan_builder
        self._rag_agent_graph = rag_agent_graph
        self._rag_pipeline = rag_pipeline
        self._generator_agent = generator_agent
        self._save_query_log = save_query_log
        self._logger = logger or logging.getLogger(__name__)
        self._clock = clock

    async def stream(self, body: SearchRequest) -> AsyncIterator[bytes]:
        start = self._clock()
        answer_chunks: list[str] = []

        try:
            query_plan = self._query_plan_builder(body.query, intent_hint="rag_search")
            yield encode_stream_event(
                {
                    "type": "query_plan",
                    "data": query_plan.to_event_data(),
                }
            )

            initial_state = {
                "query": body.query,
                "query_plan": serialize_query_plan(query_plan),
                "top_k": body.top_k,
                "use_hybrid": body.use_hybrid,
                "sources": [],
                "ingest_done": False,
                "auto_ingest": body.auto_ingest,
                "history": [],
            }
            config = {"configurable": {"thread_id": f"stream_{int(self._clock() * 1000)}"}}

            final_sources = []
            prompt_value = None
            graph_stream = self._rag_agent_graph.astream(
                initial_state,
                config=config,
                stream_mode="updates",
            ).__aiter__()
            pending_event = asyncio.create_task(anext(graph_stream))

            while True:
                try:
                    event = await asyncio.wait_for(asyncio.shield(pending_event), timeout=5)
                except asyncio.TimeoutError:
                    yield encode_stream_event(
                        {
                            "type": "keepalive",
                            "elapsed_ms": int((self._clock() - start) * 1000),
                        }
                    )
                    continue
                except StopAsyncIteration:
                    break

                pending_event = asyncio.create_task(anext(graph_stream))
                node_name = list(event.keys())[0]
                node_output = event[node_name]

                if node_name == "supervisor" and "_latest_decision" in node_output:
                    decision_evt = node_output["_latest_decision"]
                    yield encode_stream_event(decision_evt)

                    next_action = decision_evt["decision"]["next_action"]
                    if next_action == "ingest":
                        yield encode_stream_event(
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
                        yield encode_stream_event(
                            {
                                "type": "agent_action",
                                "agent": "retriever",
                                "message": f"{strategy} 검색을 준비하고 있습니다. (top_k={top_k})",
                            }
                        )
                    elif next_action == "generate":
                        yield encode_stream_event(
                            {
                                "type": "agent_action",
                                "agent": "generator",
                                "message": "검색된 특허 문장의 요약 및 답변을 생성합니다.",
                            }
                        )

                elif node_name == "retriever" and "_latest_agent_event" in node_output:
                    retriever_evt = node_output["_latest_agent_event"]
                    yield encode_stream_event(
                        {
                            "type": "search_quality",
                            "phase": "retry" if node_output.get("ingest_done", False) else "initial",
                            "data": {
                                "reason": node_output.get("quality_reason", "unknown"),
                                "best_score": node_output.get("best_score", 0.0),
                                "should_auto_ingest": False,
                            },
                        }
                    )
                    yield encode_stream_event(retriever_evt)

                elif node_name == "ingest" and "_latest_agent_event" in node_output:
                    yield encode_stream_event(node_output["_latest_agent_event"])
                    ingest_result = node_output.get("ingest_result") or {}
                    if ingest_result.get("should_retry_search"):
                        yield encode_stream_event(
                            {
                                "type": "retry_search",
                                "message": "새로 수집된 데이터를 RAG 파이프라인에 검색 반영합니다.",
                            }
                        )
                    else:
                        yield encode_stream_event(
                            {
                                "type": "auto_ingest_skipped_retry",
                                "message": "자동 수집으로 추가된 벡터가 없어 재검색을 생략합니다.",
                            }
                        )

                elif node_name == "generator" and "_latest_agent_event" in node_output:
                    final_sources = node_output.get("sources", [])
                    prompt_value = node_output.get("prompt_value")
                    yield encode_stream_event(node_output["_latest_agent_event"])

            if not final_sources:
                prepared = self._rag_pipeline.prepare_empty_search(body.query)
                prompt_value = prepared["prompt_value"]
                final_sources = []

            yield encode_stream_event(
                {
                    "type": "sources",
                    "query": body.query,
                    "sources": final_sources,
                }
            )

            async for chunk in self._generator_agent.stream_answer(prompt_value):
                text = chunk.content if hasattr(chunk, "content") else str(chunk)
                if not text:
                    continue
                answer_chunks.append(text)
                yield encode_stream_event({"type": "answer_delta", "delta": text})

            answer = "".join(answer_chunks)
            query_log_id = self._save_query_log(
                query=body.query,
                answer=answer,
                sources=final_sources,
                use_hybrid=body.use_hybrid,
                elapsed_ms=int((self._clock() - start) * 1000),
            )
            yield encode_stream_event(
                {
                    "type": "done",
                    "query": body.query,
                    "query_log_id": query_log_id,
                }
            )
        except Exception as exc:
            log_stream_error(self._logger, exc, "search stream failed")
            yield encode_stream_event(
                {
                    "type": "error",
                    "detail": "search failed",
                }
            )
