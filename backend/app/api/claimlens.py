import json
from collections.abc import AsyncIterator
from dataclasses import dataclass

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.claimlens.vector_search import search_claim_candidates
from app.core.claimlens.workflow import run_claimlens_v1_workflow
from app.core.patent_query_agent import build_patent_query_plan
from app.db.database import SessionLocal
from app.ingestion.auto_ingest import maybe_auto_ingest_for_claimlens
from app.models.claimlens_api import ClaimLensAgentEvent, ClaimLensAnalysisRequest

router = APIRouter()

MIN_ACCEPTABLE_CANDIDATE_SCORE = 0.45
MIN_ACCEPTABLE_MATCH_SCORE = 0.55


def _encode_sse(event: ClaimLensAgentEvent) -> str:
    return f"event: {event.type}\ndata: {json.dumps(event.model_dump(), ensure_ascii=False)}\n\n"


@router.post("/stream")
async def stream_claimlens_analysis(
    request: ClaimLensAnalysisRequest,
) -> StreamingResponse:
    return StreamingResponse(
        _stream_analysis(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _stream_analysis(request: ClaimLensAnalysisRequest) -> AsyncIterator[str]:
    steps = {
        "input_analysis": "제품 설명에서 핵심 기능과 검색 질의를 추출합니다.",
        "patent_search": "ClaimLens 벡터 인덱스에서 관련 청구항 후보를 검색합니다.",
        "claim_loading": "후보 특허의 청구항과 claim element를 불러옵니다.",
        "feature_matching": "claim element와 제품 기능을 비교합니다.",
        "report_generation": "근거 기반 기술 검토 초안을 생성합니다.",
    }

    try:
        yield _encode_sse(
            ClaimLensAgentEvent(
                type="step_started",
                step="input_analysis",
                message=steps["input_analysis"],
            )
        )
        query_plan = build_patent_query_plan(
            request.product_description,
            intent_hint="claim_analysis",
        )
        claim_search_query = query_plan.rag_query or request.product_description
        yield _encode_sse(
            ClaimLensAgentEvent(
                type="query_plan",
                step="input_analysis",
                data=query_plan.to_event_data(),
            )
        )
        yield _encode_sse(ClaimLensAgentEvent(type="step_completed", step="input_analysis"))

        yield _encode_sse(
            ClaimLensAgentEvent(
                type="step_started",
                step="patent_search",
                message=steps["patent_search"],
            )
        )
        state = _run_workflow(request, claim_search_query)
        yield _encode_sse(_candidate_event(state))

        decision = _evaluate_search_quality(state)
        yield _encode_sse(
            ClaimLensAgentEvent(
                type="supervisor_decision",
                step="patent_search",
                message=decision.message,
                data=decision.to_event_data(),
            )
        )

        if decision.should_auto_ingest:
            yield _encode_sse(
                ClaimLensAgentEvent(
                    type="auto_ingest_started",
                    step="patent_search",
                    message="검색 품질이 부족해 KIPRIS에서 후보 특허를 자동 수집합니다.",
                )
            )
            auto_ingest_result = await maybe_auto_ingest_for_claimlens(
                request.product_description,
                query_plan=query_plan,
            )
            yield _encode_sse(
                ClaimLensAgentEvent(
                    type="auto_ingest_completed",
                    step="patent_search",
                    data=auto_ingest_result.to_event_data(),
                )
            )
            if auto_ingest_result.should_retry_search:
                yield _encode_sse(
                    ClaimLensAgentEvent(
                        type="retry_search",
                        step="patent_search",
                        message="수집된 ClaimLens 데이터로 후보 검색을 다시 실행합니다.",
                    )
                )
                state = _run_workflow(request, claim_search_query)
                yield _encode_sse(_candidate_event(state))
                decision = _evaluate_search_quality(state)
                yield _encode_sse(
                    ClaimLensAgentEvent(
                        type="supervisor_decision",
                        step="patent_search",
                        message=decision.message,
                        data={**decision.to_event_data(), "afterRetry": True},
                    )
                )
        yield _encode_sse(ClaimLensAgentEvent(type="step_completed", step="patent_search"))

        yield _encode_sse(
            ClaimLensAgentEvent(
                type="step_started",
                step="claim_loading",
                message=steps["claim_loading"],
            )
        )
        yield _encode_sse(
            ClaimLensAgentEvent(
                type="tool_result",
                step="input_analysis",
                tool="extract_product_features",
                data={"features": state.get("product_features", [])},
            )
        )
        yield _encode_sse(
            ClaimLensAgentEvent(
                type="tool_result",
                step="claim_loading",
                tool="load_claim_elements",
                data={"claimElementCount": len(state.get("claim_elements", []))},
            )
        )
        yield _encode_sse(ClaimLensAgentEvent(type="step_completed", step="claim_loading"))

        yield _encode_sse(
            ClaimLensAgentEvent(
                type="step_started",
                step="feature_matching",
                message=steps["feature_matching"],
            )
        )
        for row in state.get("comparison_results", []):
            yield _encode_sse(ClaimLensAgentEvent(type="claim_chart_row", data=row))
        yield _encode_sse(ClaimLensAgentEvent(type="step_completed", step="feature_matching"))

        yield _encode_sse(
            ClaimLensAgentEvent(
                type="step_started",
                step="report_generation",
                message=steps["report_generation"],
            )
        )
        yield _encode_sse(
            ClaimLensAgentEvent(
                type="final_report",
                data={"markdown": state.get("final_report", "")},
            )
        )
        yield _encode_sse(ClaimLensAgentEvent(type="step_completed", step="report_generation"))
    except Exception as exc:
        yield _encode_sse(
            ClaimLensAgentEvent(
                type="error",
                step="analysis",
                message="ClaimLens 분석 워크플로우 실행 중 오류가 발생했습니다.",
                data={"error": str(exc)},
            )
        )


def _run_workflow(request: ClaimLensAnalysisRequest, claim_search_query: str) -> dict:
    with SessionLocal() as db:
        return run_claimlens_v1_workflow(
            request.product_description,
            technical_domain=request.technical_domain,
            candidate_searcher=lambda query: search_claim_candidates(
                db,
                claim_search_query or query,
                top_k=request.top_k,
            ),
        )


def _candidate_event(state: dict) -> ClaimLensAgentEvent:
    return ClaimLensAgentEvent(
        type="tool_result",
        step="patent_search",
        tool="search_claim_candidates",
        data={"candidates": state.get("patent_candidates", [])[:5]},
    )


@dataclass(frozen=True)
class SearchQualityDecision:
    verdict: str
    action: str
    reason: str
    should_auto_ingest: bool
    top_score: float
    unique_patent_count: int
    candidate_count: int
    claim_element_count: int
    matched_count: int
    partial_count: int

    @property
    def message(self) -> str:
        return f"{self.reason} 조치: {self.action}"

    def to_event_data(self) -> dict:
        return {
            "verdict": self.verdict,
            "action": self.action,
            "reason": self.reason,
            "shouldAutoIngest": self.should_auto_ingest,
            "topScore": round(self.top_score, 4),
            "thresholds": {
                "candidateScore": MIN_ACCEPTABLE_CANDIDATE_SCORE,
                "matchScore": MIN_ACCEPTABLE_MATCH_SCORE,
            },
            "candidateCount": self.candidate_count,
            "uniquePatentCount": self.unique_patent_count,
            "claimElementCount": self.claim_element_count,
            "matchedCount": self.matched_count,
            "partialCount": self.partial_count,
        }


def _evaluate_search_quality(state: dict) -> SearchQualityDecision:
    candidates = state.get("patent_candidates", []) or []
    claim_elements = state.get("claim_elements", []) or []
    rows = state.get("comparison_results", []) or []
    top_score = _top_candidate_score(candidates)
    unique_patents = _unique_patent_count(candidates)
    matched_count = _count_matches(rows, "matched")
    partial_count = _count_matches(rows, "partial")

    if not candidates:
        return SearchQualityDecision(
            verdict="insufficient",
            action="auto_ingest",
            reason="검색 후보가 없습니다.",
            should_auto_ingest=True,
            top_score=0.0,
            unique_patent_count=0,
            candidate_count=0,
            claim_element_count=len(claim_elements),
            matched_count=matched_count,
            partial_count=partial_count,
        )
    if not claim_elements:
        return SearchQualityDecision(
            verdict="insufficient",
            action="auto_ingest",
            reason="후보 특허에 비교할 청구항 구성요소가 없습니다.",
            should_auto_ingest=True,
            top_score=top_score,
            unique_patent_count=unique_patents,
            candidate_count=len(candidates),
            claim_element_count=0,
            matched_count=matched_count,
            partial_count=partial_count,
        )
    if top_score < MIN_ACCEPTABLE_CANDIDATE_SCORE:
        return SearchQualityDecision(
            verdict="low_relevance",
            action="auto_ingest",
            reason=f"최고 후보 관련도 {top_score:.3f}가 기준보다 낮습니다.",
            should_auto_ingest=True,
            top_score=top_score,
            unique_patent_count=unique_patents,
            candidate_count=len(candidates),
            claim_element_count=len(claim_elements),
            matched_count=matched_count,
            partial_count=partial_count,
        )
    if rows and matched_count == 0 and partial_count == 0 and top_score < MIN_ACCEPTABLE_MATCH_SCORE:
        return SearchQualityDecision(
            verdict="weak_match",
            action="auto_ingest",
            reason="청구항 대조표에서 매칭 근거가 발견되지 않았습니다.",
            should_auto_ingest=True,
            top_score=top_score,
            unique_patent_count=unique_patents,
            candidate_count=len(candidates),
            claim_element_count=len(claim_elements),
            matched_count=matched_count,
            partial_count=partial_count,
        )
    return SearchQualityDecision(
        verdict="accepted",
        action="continue",
        reason="검색 후보 품질이 분석을 계속할 수준입니다.",
        should_auto_ingest=False,
        top_score=top_score,
        unique_patent_count=unique_patents,
        candidate_count=len(candidates),
        claim_element_count=len(claim_elements),
        matched_count=matched_count,
        partial_count=partial_count,
    )


def _top_candidate_score(candidates: list) -> float:
    scores = [
        float(candidate.get("score") or 0.0)
        for candidate in candidates
        if isinstance(candidate, dict)
    ]
    return max(scores, default=0.0)


def _unique_patent_count(candidates: list) -> int:
    application_numbers = {
        ((candidate.get("patent") or {}).get("applicationNumber"))
        for candidate in candidates
        if isinstance(candidate, dict) and isinstance(candidate.get("patent"), dict)
    }
    return len({number for number in application_numbers if number})


def _count_matches(rows: list, status: str) -> int:
    return sum(
        1
        for row in rows
        if isinstance(row, dict) and row.get("match") == status
    )
