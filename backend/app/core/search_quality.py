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


@dataclass(frozen=True)
class SourceRelevance:
    is_relevant: bool
    reason: str
    matched_terms: list[str]
    best_score: float | None

    def to_metadata(self) -> dict[str, Any]:
        return {
            "isRelevant": self.is_relevant,
            "reason": self.reason,
            "matchedTerms": self.matched_terms,
            "bestScore": self.best_score,
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


def filter_relevant_documents(
    documents: list[Any],
    query_plan: PatentQueryPlan,
    *,
    min_score: float = MIN_SOURCE_SCORE,
) -> list[Any]:
    """Keep only documents that have enough source-level evidence for the query."""
    semantic_terms = _semantic_query_terms(query_plan)
    if not semantic_terms:
        return documents

    filtered = []
    for doc in documents:
        relevance = evaluate_source_relevance(_document_to_source(doc), semantic_terms, min_score=min_score)
        if not relevance.is_relevant:
            continue
        metadata = dict(getattr(doc, "metadata", {}) or {})
        metadata["_source_relevance_reason"] = relevance.reason
        metadata["_source_matched_terms"] = relevance.matched_terms
        doc.metadata = metadata
        filtered.append(doc)
    return filtered


def evaluate_source_relevance(
    source: dict,
    semantic_terms: list[str],
    *,
    min_score: float = MIN_SOURCE_SCORE,
) -> SourceRelevance:
    best_score = _best_score([source])
    if source.get("score_type") == "vector" and best_score is not None and best_score < min_score:
        return SourceRelevance(
            is_relevant=False,
            reason="low_retrieval_score",
            matched_terms=[],
            best_score=best_score,
        )

    matched_terms = _matched_terms([source], semantic_terms)
    if not matched_terms:
        return SourceRelevance(
            is_relevant=False,
            reason="low_keyword_overlap",
            matched_terms=[],
            best_score=best_score,
        )

    if (
        _is_complex_query(semantic_terms)
        and len(matched_terms) < MIN_MATCHED_TERMS_FOR_COMPLEX_QUERY
        and not _has_strong_phrase_match(matched_terms)
    ):
        return SourceRelevance(
            is_relevant=False,
            reason="insufficient_feature_coverage",
            matched_terms=matched_terms,
            best_score=best_score,
        )

    return SourceRelevance(
        is_relevant=True,
        reason="matched_query_terms",
        matched_terms=matched_terms,
        best_score=best_score,
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
        _append_term(cleaned, seen, terms)
        for token in cleaned.split():
            if len(_normalize_text(token)) >= 2:
                _append_term(token, seen, terms)
    return terms


def _is_complex_query(terms: list[str]) -> bool:
    return len(terms) > MIN_MATCHED_TERMS_FOR_COMPLEX_QUERY


def _has_strong_phrase_match(terms: list[str]) -> bool:
    return any(len(_normalize_text(term)) >= MIN_STRONG_TERM_LENGTH for term in terms)


def _normalize_text(value: str) -> str:
    return "".join(str(value).lower().split())


def _append_term(term: str, seen: set[str], terms: list[str]) -> None:
    key = _normalize_text(term)
    if not term or key in seen:
        return
    seen.add(key)
    terms.append(term)


def _document_to_source(doc: Any) -> dict[str, Any]:
    metadata = getattr(doc, "metadata", {}) or {}
    return {
        "invention_title": metadata.get("invention_title", ""),
        "applicant_name": metadata.get("applicant_name", ""),
        "application_number": metadata.get("application_number", ""),
        "relevance_text": getattr(doc, "page_content", ""),
        "full_content": getattr(doc, "page_content", ""),
        "score": metadata.get("_retrieval_score"),
        "score_type": metadata.get("_retrieval_score_type", ""),
    }
