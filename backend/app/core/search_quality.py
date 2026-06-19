from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models.patent_query import PatentQueryPlan


MIN_SOURCE_SCORE = 0.55
MIN_MATCHED_TERMS_FOR_COMPLEX_QUERY = 2
MIN_STRONG_TERM_LENGTH = 5


@dataclass(frozen=True)
class SearchQuality:
    should_auto_ingest: bool
    reason: str
    source_count: int
    best_score: float | None
    matched_terms: list[str]

    def to_event_data(self) -> dict[str, Any]:
        return {
            "shouldAutoIngest": self.should_auto_ingest,
            "reason": self.reason,
            "sourceCount": self.source_count,
            "bestScore": self.best_score,
            "matchedTerms": self.matched_terms,
        }


def evaluate_search_quality(
    sources: list[dict],
    query_plan: PatentQueryPlan,
    *,
    min_score: float = MIN_SOURCE_SCORE,
) -> SearchQuality:
    if not sources:
        return SearchQuality(
            should_auto_ingest=True,
            reason="no_sources",
            source_count=0,
            best_score=None,
            matched_terms=[],
        )

    best_score = _best_score(sources)
    semantic_terms = _semantic_query_terms(query_plan)
    matched_terms = _matched_terms(sources, semantic_terms)

    if _has_vector_score(sources) and best_score is not None and best_score < min_score:
        return SearchQuality(
            should_auto_ingest=True,
            reason="low_retrieval_score",
            source_count=len(sources),
            best_score=best_score,
            matched_terms=matched_terms,
        )

    if not matched_terms:
        return SearchQuality(
            should_auto_ingest=True,
            reason="low_keyword_overlap",
            source_count=len(sources),
            best_score=best_score,
            matched_terms=[],
        )

    if (
        _is_complex_query(semantic_terms)
        and len(matched_terms) < MIN_MATCHED_TERMS_FOR_COMPLEX_QUERY
        and not _has_strong_phrase_match(matched_terms)
    ):
        return SearchQuality(
            should_auto_ingest=True,
            reason="low_keyword_overlap",
            source_count=len(sources),
            best_score=best_score,
            matched_terms=matched_terms,
        )

    return SearchQuality(
        should_auto_ingest=False,
        reason="enough_sources",
        source_count=len(sources),
        best_score=best_score,
        matched_terms=matched_terms,
    )


def _best_score(sources: list[dict]) -> float | None:
    scores = []
    for source in sources:
        raw_score = source.get("score")
        if isinstance(raw_score, (int, float)):
            scores.append(float(raw_score))
    return max(scores) if scores else None


def _has_vector_score(sources: list[dict]) -> bool:
    return any(source.get("score_type") == "vector" for source in sources)


def _matched_terms(sources: list[dict], terms: list[str]) -> list[str]:
    source_text = _normalize_text(
        " ".join(
            str(source.get(key, ""))
            for source in sources
            for key in [
                "invention_title",
                "applicant_name",
                "application_number",
                "relevance_text",
                "full_content",
            ]
        )
    )
    matched = []
    for term in terms:
        normalized = _normalize_text(term)
        if len(normalized) < 2:
            continue
        if normalized in source_text:
            matched.append(term)
    return matched[:10]


def _semantic_query_terms(query_plan: PatentQueryPlan) -> list[str]:
    raw_terms = (
        query_plan.search_keywords
        + query_plan.technical_features
        + query_plan.synonyms
        + query_plan.kipris_queries
    )
    seen = set()
    terms = []
    for term in raw_terms:
        cleaned = " ".join(str(term).strip().split())
        key = _normalize_text(cleaned)
        if not cleaned or key in seen:
            continue
        seen.add(key)
        terms.append(cleaned)
    return terms


def _is_complex_query(terms: list[str]) -> bool:
    return len(terms) > MIN_MATCHED_TERMS_FOR_COMPLEX_QUERY


def _has_strong_phrase_match(terms: list[str]) -> bool:
    return any(len(_normalize_text(term)) >= MIN_STRONG_TERM_LENGTH for term in terms)


def _normalize_text(value: str) -> str:
    return "".join(str(value).lower().split())
