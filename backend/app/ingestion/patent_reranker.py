from __future__ import annotations

import math
from dataclasses import dataclass, field

from app.core.embeddings import get_embeddings
from app.models.patent import PatentItem
from app.models.patent_query import PatentQueryPlan

_STRONG_PATENT_TERMS = ("특허", "청구항", "지식재산", "선행기술", "문헌", "특허분석")
_MEDIUM_PATENT_TERMS = ("검색", "분석", "AI", "인공지능", "자연어처리", "데이터")
_GENERIC_SEARCH_TERMS = ("사내 정보", "상품 검색", "입찰", "추천", "전자상거래")


@dataclass(frozen=True)
class RerankedPatent:
    patent: PatentItem
    score: float
    matched_terms: list[str] = field(default_factory=list)

    @property
    def coverage_count(self) -> int:
        return len(self.matched_terms)


def rerank_patents(
    query_plan: PatentQueryPlan | None,
    patents: list[PatentItem],
    *,
    top_k: int,
    min_score: float = 0.0,
) -> list[RerankedPatent]:
    if not patents:
        return []
    if query_plan is None:
        return [RerankedPatent(patent=patent, score=0.0) for patent in patents[:top_k]]

    query_text = _query_text(query_plan)
    patent_texts = [_patent_text(patent) for patent in patents]
    embeddings = get_embeddings()
    query_vector = embeddings.embed_query(query_text)
    patent_vectors = embeddings.embed_documents(patent_texts)

    ranked = [
        _reranked_patent(query_plan, patent, _cosine_similarity(query_vector, patent_vector))
        for patent, patent_vector in zip(patents, patent_vectors, strict=True)
    ]
    return [
        item
        for item in sorted(ranked, key=lambda item: item.score, reverse=True)
        if item.score >= min_score
    ][:top_k]


def _reranked_patent(
    query_plan: PatentQueryPlan,
    patent: PatentItem,
    vector_score: float,
) -> RerankedPatent:
    matched_terms = _matched_query_terms(query_plan, patent)
    score = vector_score + _domain_score_adjustment(query_plan, patent, matched_terms)
    return RerankedPatent(
        patent=patent,
        score=max(0.0, min(1.0, score)),
        matched_terms=matched_terms,
    )


def _domain_score_adjustment(
    query_plan: PatentQueryPlan,
    patent: PatentItem,
    matched_terms: list[str],
) -> float:
    query_text = _normalize_text(_query_text(query_plan))
    patent_text = _normalize_text(_patent_text(patent))
    matched_text = _normalize_text(" ".join(matched_terms))
    patent_query = any(_normalize_text(term) in query_text for term in _STRONG_PATENT_TERMS)
    strong_hits = sum(1 for term in _STRONG_PATENT_TERMS if _normalize_text(term) in patent_text)
    medium_hits = sum(1 for term in _MEDIUM_PATENT_TERMS if _normalize_text(term) in patent_text)

    adjustment = min(0.14, strong_hits * 0.04)
    adjustment += min(0.06, medium_hits * 0.012)
    if patent_query and strong_hits == 0:
        adjustment -= 0.09
    if patent_query and any(_normalize_text(term) in patent_text for term in _GENERIC_SEARCH_TERMS):
        adjustment -= 0.04
    if patent_query and any(_normalize_text(term) in matched_text for term in _STRONG_PATENT_TERMS):
        adjustment += 0.03
    return adjustment


def _query_text(query_plan: PatentQueryPlan) -> str:
    parts = [
        query_plan.summary,
        query_plan.rag_query,
        " ".join(query_plan.technical_features),
        " ".join(query_plan.search_keywords),
        " ".join(query_plan.synonyms),
        " ".join(query_plan.ipc_candidates),
    ]
    return "\n".join(part for part in parts if part.strip())


def _patent_text(patent: PatentItem) -> str:
    return "\n".join(
        part
        for part in [
            f"발명의 명칭: {patent.invention_title}",
            f"초록: {patent.abstract}",
            f"IPC: {patent.ipc_number}",
            f"출원인: {patent.applicant_name}",
        ]
        if part.strip()
    )


def _matched_query_terms(query_plan: PatentQueryPlan, patent: PatentItem) -> list[str]:
    patent_text = _normalize_text(_patent_text(patent))
    matched = []
    for term in _coverage_terms(query_plan):
        if _normalize_text(term) in patent_text:
            matched.append(term)
    return matched[:12]


def _coverage_terms(query_plan: PatentQueryPlan) -> list[str]:
    raw_terms = (
        query_plan.technical_features
        + query_plan.search_keywords
        + query_plan.synonyms
        + query_plan.kipris_queries
    )
    terms = []
    for raw_term in raw_terms:
        cleaned = " ".join(str(raw_term).strip().split())
        if cleaned:
            terms.append(cleaned)
            terms.extend(cleaned.split())
    return _dedupe_terms(terms)


def _dedupe_terms(terms: list[str]) -> list[str]:
    seen = set()
    result = []
    for term in terms:
        key = _normalize_text(term)
        if len(key) < 2 or key in seen or key in {"기술", "개선", "시스템", "방법", "관리"}:
            continue
        seen.add(key)
        result.append(term)
    return result


def _normalize_text(value: str) -> str:
    return "".join(str(value).lower().split())


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if not left_norm or not right_norm:
        return 0.0
    return dot / (left_norm * right_norm)
