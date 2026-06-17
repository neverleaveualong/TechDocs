from __future__ import annotations

import math
from dataclasses import dataclass

from app.core.embeddings import get_embeddings
from app.models.patent import PatentItem
from app.models.patent_query import PatentQueryPlan


@dataclass(frozen=True)
class RerankedPatent:
    patent: PatentItem
    score: float


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
        RerankedPatent(
            patent=patent,
            score=_cosine_similarity(query_vector, patent_vector),
        )
        for patent, patent_vector in zip(patents, patent_vectors, strict=True)
    ]
    return [
        item
        for item in sorted(ranked, key=lambda item: item.score, reverse=True)
        if item.score >= min_score
    ][:top_k]


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


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if not left_norm or not right_norm:
        return 0.0
    return dot / (left_norm * right_norm)
