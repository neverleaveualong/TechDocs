from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypedDict

from app.core.claimlens.feature_matcher import (
    build_claim_chart_rows,
    claim_candidate_to_dict,
    claim_chart_row_to_event_data,
    extract_product_features,
    generate_claim_chart_report,
)
from app.core.claimlens.vector_search import ClaimSearchCandidate


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
    candidates = candidate_searcher(state["product_description"])
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
