from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from typing import Any, TypedDict

from app.core.claimlens.feature_matcher import (
    build_claim_chart_rows,
    claim_candidate_to_dict,
    claim_chart_row_to_event_data,
    extract_product_features,
    generate_claim_chart_report,
)
from app.core.claimlens.vector_search import (
    TEXT_TYPE_CLAIM_ELEMENT,
    TEXT_TYPE_INDEPENDENT_CLAIM,
    TEXT_TYPE_PATENT_ABSTRACT,
    ClaimSearchCandidate,
)

_STRONG_PATENT_TERMS = ("특허", "청구항", "지식재산", "선행기술", "문헌", "특허분석")
_MEDIUM_PATENT_TERMS = ("검색", "분석", "AI", "인공지능", "자연어처리", "데이터")
_GENERIC_SEARCH_TERMS = ("사내 정보", "상품 검색", "입찰", "추천", "전자상거래")


class ClaimLensState(TypedDict, total=False):
    product_description: str
    technical_domain: str | None
    product_features: list[str]
    patent_candidates: list[dict[str, Any]]
    claim_elements: list[dict[str, Any]]
    comparison_results: list[dict[str, Any]]
    final_report: str
    _search_candidates: list[ClaimSearchCandidate]
    _claim_chart_rows: list[Any]


CandidateSearcher = Callable[[str], list[ClaimSearchCandidate]]


def run_claimlens_v1_workflow(
    product_description: str,
    *,
    technical_domain: str | None = None,
    candidate_searcher: CandidateSearcher,
) -> ClaimLensState:
    state: ClaimLensState = {
        "product_description": product_description,
        "technical_domain": technical_domain,
    }
    state = _analyze_input(state)
    state = _search_patents(state, candidate_searcher)
    state = _load_claim_elements(state)
    state = _match_features(state)
    state = _generate_report(state)
    return state


def _analyze_input(state: ClaimLensState) -> ClaimLensState:
    return {
        **state,
        "product_features": extract_product_features(state["product_description"]),
    }


def _search_patents(
    state: ClaimLensState,
    candidate_searcher: CandidateSearcher,
) -> ClaimLensState:
    candidates = _rerank_claimlens_candidates(
        candidate_searcher(state["product_description"]),
        product_description=state["product_description"],
        product_features=state.get("product_features", []),
    )
    return {
        **state,
        "_search_candidates": candidates,
        "patent_candidates": [claim_candidate_to_dict(candidate) for candidate in candidates],
    }


def _load_claim_elements(state: ClaimLensState) -> ClaimLensState:
    elements: list[dict[str, Any]] = []
    for candidate in state.get("_search_candidates", []):
        for element in candidate.claim_elements:
            elements.append(
                {
                    "applicationNumber": candidate.patent.application_number,
                    "claimNumber": candidate.claim.claim_number if candidate.claim else None,
                    "elementOrder": element.element_order,
                    "elementText": element.element_text,
                }
            )
    return {**state, "claim_elements": elements}


def _match_features(state: ClaimLensState) -> ClaimLensState:
    rows = build_claim_chart_rows(
        state.get("_search_candidates", []),
        state.get("product_features", []),
    )
    return {
        **state,
        "_claim_chart_rows": rows,
        "comparison_results": [claim_chart_row_to_event_data(row) for row in rows],
    }


def _generate_report(state: ClaimLensState) -> ClaimLensState:
    return {
        **state,
        "final_report": generate_claim_chart_report(state.get("_claim_chart_rows", [])),
    }


def _rerank_claimlens_candidates(
    candidates: list[ClaimSearchCandidate],
    *,
    product_description: str,
    product_features: list[str],
) -> list[ClaimSearchCandidate]:
    if not candidates:
        return []
    scored = [
        (_claimlens_candidate_score(candidate, product_description, product_features), candidate)
        for candidate in candidates
    ]
    return [
        replace(candidate, score=round(score, 6))
        for score, candidate in sorted(scored, key=lambda item: item[0], reverse=True)
    ]


def _claimlens_candidate_score(
    candidate: ClaimSearchCandidate,
    product_description: str,
    product_features: list[str],
) -> float:
    text = _candidate_text(candidate)
    query_text = f"{product_description}\n{' '.join(product_features)}"
    patent_query = any(term in query_text for term in _STRONG_PATENT_TERMS)
    score = candidate.score

    strong_hits = sum(1 for term in _STRONG_PATENT_TERMS if term in text)
    medium_hits = sum(1 for term in _MEDIUM_PATENT_TERMS if term.lower() in text.lower())
    score += min(0.12, strong_hits * 0.035)
    score += min(0.06, medium_hits * 0.012)

    if candidate.claim_elements or candidate.matched_claim_element:
        score += 0.05
    if candidate.matched_text_type == TEXT_TYPE_CLAIM_ELEMENT:
        score += 0.04
    elif candidate.matched_text_type == TEXT_TYPE_INDEPENDENT_CLAIM:
        score += 0.025
    elif candidate.matched_text_type == TEXT_TYPE_PATENT_ABSTRACT:
        score -= 0.035

    if patent_query and not any(term in text for term in ("특허", "청구항", "지식재산", "선행기술")):
        score -= 0.08
    if patent_query and any(term in text for term in _GENERIC_SEARCH_TERMS):
        score -= 0.04
    return score


def _candidate_text(candidate: ClaimSearchCandidate) -> str:
    return "\n".join(
        part
        for part in [
            candidate.patent.title,
            candidate.patent.abstract or "",
            candidate.matched_text,
        ]
        if part
    )
