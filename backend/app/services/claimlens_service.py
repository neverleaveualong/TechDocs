"""
============================================================
작성자   : 심우현
수정일자 : 2026-07-30
기능요약 : ClaimLens 분석 스트림 오케스트레이션
수정내용 : 질의 계획, 후보 검색, 자동 수집·재검색, 분석 결과 이벤트 변환을 API에서 분리
변경이유 : ClaimLens Router의 책임을 HTTP 스트림 생성으로 제한하고 단계별 테스트 가능성을 개선
주의사항 : 기존 SSE 이벤트 타입·필드·순서와 오류 이벤트 계약을 유지
============================================================
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Callable
from typing import Any

from app.api.errors import log_stream_error
from app.models.claimlens_api import ClaimLensAgentEvent, ClaimLensAnalysisRequest


class ClaimLensAnalysisService:
    def __init__(
        self,
        *,
        query_plan_builder: Callable[..., Any],
        workflow_runner: Callable[[ClaimLensAnalysisRequest, str], dict],
        quality_evaluator: Callable[[dict], Any],
        candidate_event_builder: Callable[[dict], ClaimLensAgentEvent],
        auto_ingest: Callable[..., Any],
        sse_encoder: Callable[[ClaimLensAgentEvent], str],
        logger: logging.Logger | None = None,
    ) -> None:
        self._query_plan_builder = query_plan_builder
        self._workflow_runner = workflow_runner
        self._quality_evaluator = quality_evaluator
        self._candidate_event_builder = candidate_event_builder
        self._auto_ingest = auto_ingest
        self._sse_encoder = sse_encoder
        self._logger = logger or logging.getLogger(__name__)

    async def stream(self, request: ClaimLensAnalysisRequest) -> AsyncIterator[str]:
        steps = {
            "input_analysis": "제품 설명에서 핵심 기능과 검색 질의를 추출합니다.",
            "patent_search": "ClaimLens 벡터 인덱스에서 관련 청구항 후보를 검색합니다.",
            "claim_loading": "후보 특허의 청구항과 claim element를 불러옵니다.",
            "feature_matching": "claim element와 제품 기능을 비교합니다.",
            "report_generation": "근거 기반 기술 검토 초안을 생성합니다.",
        }

        try:
            yield self._sse_encoder(
                ClaimLensAgentEvent(
                    type="step_started",
                    step="input_analysis",
                    message=steps["input_analysis"],
                )
            )
            query_plan = self._query_plan_builder(
                request.product_description,
                intent_hint="claim_analysis",
            )
            claim_search_query = query_plan.rag_query or request.product_description
            yield self._sse_encoder(
                ClaimLensAgentEvent(
                    type="query_plan",
                    step="input_analysis",
                    data=query_plan.to_event_data(),
                )
            )
            yield self._sse_encoder(ClaimLensAgentEvent(type="step_completed", step="input_analysis"))

            yield self._sse_encoder(
                ClaimLensAgentEvent(
                    type="step_started",
                    step="patent_search",
                    message=steps["patent_search"],
                )
            )
            state = self._workflow_runner(request, claim_search_query)
            yield self._sse_encoder(self._candidate_event_builder(state))

            decision = self._quality_evaluator(state)
            yield self._sse_encoder(
                ClaimLensAgentEvent(
                    type="supervisor_decision",
                    step="patent_search",
                    message=decision.message,
                    data=decision.to_event_data(),
                )
            )

            if decision.should_auto_ingest:
                yield self._sse_encoder(
                    ClaimLensAgentEvent(
                        type="auto_ingest_started",
                        step="patent_search",
                        message="검색 품질이 부족해 KIPRIS에서 후보 특허를 자동 수집합니다.",
                    )
                )
                auto_ingest_result = await self._auto_ingest(
                    request.product_description,
                    query_plan=query_plan,
                )
                yield self._sse_encoder(
                    ClaimLensAgentEvent(
                        type="auto_ingest_completed",
                        step="patent_search",
                        data=auto_ingest_result.to_event_data(),
                    )
                )
                if auto_ingest_result.should_retry_search:
                    yield self._sse_encoder(
                        ClaimLensAgentEvent(
                            type="retry_search",
                            step="patent_search",
                            message="수집된 ClaimLens 데이터로 후보 검색을 다시 실행합니다.",
                        )
                    )
                    state = self._workflow_runner(request, claim_search_query)
                    yield self._sse_encoder(self._candidate_event_builder(state))
                    decision = self._quality_evaluator(state)
                    yield self._sse_encoder(
                        ClaimLensAgentEvent(
                            type="supervisor_decision",
                            step="patent_search",
                            message=decision.message,
                            data={**decision.to_event_data(), "afterRetry": True},
                        )
                    )
            yield self._sse_encoder(ClaimLensAgentEvent(type="step_completed", step="patent_search"))

            yield self._sse_encoder(
                ClaimLensAgentEvent(
                    type="step_started",
                    step="claim_loading",
                    message=steps["claim_loading"],
                )
            )
            yield self._sse_encoder(
                ClaimLensAgentEvent(
                    type="tool_result",
                    step="input_analysis",
                    tool="extract_product_features",
                    data={"features": state.get("product_features", [])},
                )
            )
            yield self._sse_encoder(
                ClaimLensAgentEvent(
                    type="tool_result",
                    step="claim_loading",
                    tool="load_claim_elements",
                    data={"claimElementCount": len(state.get("claim_elements", []))},
                )
            )
            yield self._sse_encoder(ClaimLensAgentEvent(type="step_completed", step="claim_loading"))

            yield self._sse_encoder(
                ClaimLensAgentEvent(
                    type="step_started",
                    step="feature_matching",
                    message=steps["feature_matching"],
                )
            )
            for row in state.get("comparison_results", []):
                yield self._sse_encoder(ClaimLensAgentEvent(type="claim_chart_row", data=row))
            yield self._sse_encoder(ClaimLensAgentEvent(type="step_completed", step="feature_matching"))

            yield self._sse_encoder(
                ClaimLensAgentEvent(
                    type="step_started",
                    step="report_generation",
                    message=steps["report_generation"],
                )
            )
            yield self._sse_encoder(
                ClaimLensAgentEvent(
                    type="final_report",
                    data={"markdown": state.get("final_report", "")},
                )
            )
            yield self._sse_encoder(ClaimLensAgentEvent(type="step_completed", step="report_generation"))
        except Exception as exc:
            log_stream_error(self._logger, exc, "ClaimLens analysis stream failed")
            yield self._sse_encoder(
                ClaimLensAgentEvent(
                    type="error",
                    step="analysis",
                    message="ClaimLens 분석 워크플로우 실행 중 오류가 발생했습니다.",
                    data={"error": "ClaimLens 분석 워크플로우 실행 중 오류가 발생했습니다."},
                )
            )
