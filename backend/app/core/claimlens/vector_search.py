from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from pinecone import Pinecone
from sqlalchemy.orm import Session

from app.config import settings
from app.core.embeddings import get_embeddings
from app.models.claimlens import ClaimLensClaim, ClaimLensClaimElement, ClaimLensPatent

TEXT_TYPE_CLAIM_ELEMENT = "claim_element"
TEXT_TYPE_INDEPENDENT_CLAIM = "independent_claim"
TEXT_TYPE_PATENT_ABSTRACT = "patent_abstract"


@dataclass(frozen=True)
class VectorSearchResult:
    id: str
    score: float
    text: str
    metadata: dict[str, Any]


@dataclass(frozen=True)
class PatentSearchRecord:
    id: int
    application_number: str
    title: str
    abstract: str | None
    applicant_name: str | None
    register_status: str | None


@dataclass(frozen=True)
class ClaimSearchRecord:
    id: int
    claim_number: int
    raw_text: str
    normalized_text: str
    status: str
    is_independent: bool | None
    parser_confidence: float | None
    parser_status: str | None


@dataclass(frozen=True)
class ClaimElementSearchRecord:
    id: int
    element_order: int
    element_text: str
    source_span: str | None
    parser_confidence: float | None
    parser_status: str | None


@dataclass(frozen=True)
class ClaimSearchCandidate:
    vector_id: str
    score: float
    matched_text: str
    matched_text_type: str
    patent: PatentSearchRecord
    claim: ClaimSearchRecord | None
    matched_claim_element: ClaimElementSearchRecord | None
    claim_elements: list[ClaimElementSearchRecord]


class ClaimLensVectorIndex:
    def __init__(self) -> None:
        self.index_name = settings.claimlens_pinecone_index_name
        self.namespace = settings.claimlens_pinecone_namespace
        self._pinecone = Pinecone(api_key=settings.pinecone_api_key)
        self._index = self._pinecone.Index(self.index_name)

    def search(self, query: str, top_k: int = 10) -> list[VectorSearchResult]:
        embedding = get_embeddings().embed_query(query)
        response = self._index.query(
            vector=embedding,
            top_k=top_k,
            namespace=self.namespace,
            include_metadata=True,
        )
        results: list[VectorSearchResult] = []
        for match in _response_matches(response):
            metadata = dict(_match_metadata(match))
            text = str(metadata.pop("text", ""))
            results.append(
                VectorSearchResult(
                    id=str(_match_value(match, "id")),
                    score=float(_match_value(match, "score") or 0.0),
                    text=text,
                    metadata=metadata,
                )
            )
        return results


def search_claim_candidates(
    db: Session,
    query: str,
    *,
    top_k: int = 10,
    vector_index: ClaimLensVectorIndex | None = None,
) -> list[ClaimSearchCandidate]:
    index = vector_index or ClaimLensVectorIndex()
    return resolve_vector_search_results(db, index.search(query, top_k=top_k))


def resolve_vector_search_results(
    db: Session,
    results: Sequence[VectorSearchResult],
) -> list[ClaimSearchCandidate]:
    candidates: list[ClaimSearchCandidate] = []
    for result in results:
        candidate = _resolve_vector_search_result(db, result)
        if candidate is not None:
            candidates.append(candidate)
    return candidates


def _resolve_vector_search_result(
    db: Session,
    result: VectorSearchResult,
) -> ClaimSearchCandidate | None:
    metadata = result.metadata
    patent = _load_patent(db, metadata)
    claim = _load_claim(db, metadata)
    matched_element = _load_claim_element(db, metadata)

    if matched_element is not None and claim is None:
        claim = matched_element.claim
    if claim is not None and patent is None:
        patent = claim.patent
    if patent is None:
        return None

    claim_elements = _claim_element_records(claim.elements) if claim is not None else []
    return ClaimSearchCandidate(
        vector_id=result.id,
        score=result.score,
        matched_text=result.text,
        matched_text_type=str(metadata.get("text_type") or ""),
        patent=_patent_record(patent),
        claim=_claim_record(claim) if claim is not None else None,
        matched_claim_element=(
            _claim_element_record(matched_element) if matched_element is not None else None
        ),
        claim_elements=claim_elements,
    )


def _load_patent(db: Session, metadata: dict[str, Any]) -> ClaimLensPatent | None:
    patent_id = _metadata_int(metadata, "patent_id")
    if patent_id is not None:
        return db.get(ClaimLensPatent, patent_id)
    application_number = metadata.get("application_number")
    if application_number:
        return (
            db.query(ClaimLensPatent)
            .filter(ClaimLensPatent.application_number == str(application_number))
            .first()
        )
    return None


def _load_claim(db: Session, metadata: dict[str, Any]) -> ClaimLensClaim | None:
    claim_id = _metadata_int(metadata, "claim_id")
    return db.get(ClaimLensClaim, claim_id) if claim_id is not None else None


def _load_claim_element(db: Session, metadata: dict[str, Any]) -> ClaimLensClaimElement | None:
    claim_element_id = _metadata_int(metadata, "claim_element_id")
    return db.get(ClaimLensClaimElement, claim_element_id) if claim_element_id is not None else None


def _patent_record(patent: ClaimLensPatent) -> PatentSearchRecord:
    return PatentSearchRecord(
        id=patent.id,
        application_number=patent.application_number,
        title=patent.title,
        abstract=patent.abstract,
        applicant_name=patent.applicant_name,
        register_status=patent.register_status,
    )


def _claim_record(claim: ClaimLensClaim) -> ClaimSearchRecord:
    return ClaimSearchRecord(
        id=claim.id,
        claim_number=claim.claim_number,
        raw_text=claim.raw_text,
        normalized_text=claim.normalized_text,
        status=claim.status,
        is_independent=claim.is_independent,
        parser_confidence=claim.parser_confidence,
        parser_status=claim.parser_status,
    )


def _claim_element_records(
    elements: Sequence[ClaimLensClaimElement],
) -> list[ClaimElementSearchRecord]:
    return [
        _claim_element_record(element)
        for element in sorted(elements, key=lambda item: item.element_order)
    ]


def _claim_element_record(element: ClaimLensClaimElement) -> ClaimElementSearchRecord:
    return ClaimElementSearchRecord(
        id=element.id,
        element_order=element.element_order,
        element_text=element.element_text,
        source_span=element.source_span,
        parser_confidence=element.parser_confidence,
        parser_status=element.parser_status,
    )


def _metadata_int(metadata: dict[str, Any], key: str) -> int | None:
    value = metadata.get(key)
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _response_matches(response: Any) -> list[Any]:
    if isinstance(response, dict):
        return list(response.get("matches", []))
    return list(getattr(response, "matches", []))


def _match_metadata(match: Any) -> dict[str, Any]:
    if isinstance(match, dict):
        return dict(match.get("metadata", {}))
    return dict(getattr(match, "metadata", {}) or {})


def _match_value(match: Any, key: str) -> Any:
    if isinstance(match, dict):
        return match.get(key)
    return getattr(match, key, None)
