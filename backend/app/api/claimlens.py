import json
from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.claimlens.vector_search import search_claim_candidates
from app.core.claimlens.workflow import run_claimlens_v1_workflow
from app.db.database import SessionLocal
from app.models.claimlens_api import ClaimLensAgentEvent, ClaimLensAnalysisRequest

router = APIRouter()


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
    steps = [
        ("input_analysis", "제품/기술 설명에서 기능 후보를 추출합니다."),
        ("patent_search", "ClaimLens 벡터 인덱스에서 관련 청구항 후보를 검색합니다."),
        ("claim_loading", "검색 후보의 원문 청구항과 claim element를 PostgreSQL에서 불러옵니다."),
        ("feature_matching", "claim element와 제품 기능을 비교합니다."),
        ("report_generation", "근거 기반 기술 검토 초안을 생성합니다."),
    ]
    for step, message in steps:
        yield _encode_sse(ClaimLensAgentEvent(type="step_started", step=step, message=message))

    try:
        with SessionLocal() as db:

            state = run_claimlens_v1_workflow(
                request.product_description,
                technical_domain=request.technical_domain,
                candidate_searcher=lambda query: search_claim_candidates(
                    db,
                    query,
                    top_k=request.top_k,
                ),
            )
    except Exception as exc:
        yield _encode_sse(
            ClaimLensAgentEvent(
                type="error",
                step="analysis",
                message="ClaimLens 분석 워크플로우 실행 중 오류가 발생했습니다.",
                data={"error": str(exc)},
            )
        )
        return

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
            step="patent_search",
            tool="search_claim_candidates",
            data={"candidates": state.get("patent_candidates", [])[:5]},
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

    for step, _ in steps:
        yield _encode_sse(ClaimLensAgentEvent(type="step_completed", step=step))

    for row in state.get("comparison_results", []):
        yield _encode_sse(ClaimLensAgentEvent(type="claim_chart_row", data=row))

    yield _encode_sse(
        ClaimLensAgentEvent(
            type="final_report",
            data={"markdown": state.get("final_report", "")},
        )
    )
