from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func

from app.config import settings
from app.core.claimlens.claim_parser import normalize_application_number, parse_claims
from app.core.claimlens.vector_search import ClaimLensVectorIndex, ClaimVectorDocument
from app.core.vectorstore import add_documents
from app.db.database import SessionLocal
from app.ingestion.document_loader import patents_to_documents
from app.ingestion.kipris_client import kipris_client
from app.ingestion.patent_reranker import rerank_patents
from app.ingestion.query_terms import KiprisSearchAttempt, build_kipris_search_attempts
from app.ingestion.text_splitter import get_text_splitter
from app.models.auto_ingest import AutoIngestCache
from app.models.claimlens import ClaimLensClaim, ClaimLensClaimElement, ClaimLensPatent
from app.models.patent_query import PatentQueryPlan
from app.models.patent import PatentItem

logger = logging.getLogger(__name__)

MIN_DIVERSE_SELECTION_SCORE = 0.48
MIN_COVERAGE_TERMS_FOR_SELECTION = 2


@dataclass
class RerankEventItem:
    application_number: str
    title: str
    applicant_name: str
    score: float
    selected: bool
    matched_terms: list[str]
    selection_reason: str

    def to_event_data(self) -> dict:
        return {
            "applicationNumber": self.application_number,
            "title": self.title,
            "applicantName": self.applicant_name,
            "score": round(self.score, 4),
            "selected": self.selected,
            "matchedTerms": self.matched_terms,
            "coverageCount": len(self.matched_terms),
            "selectionReason": self.selection_reason,
        }


@dataclass
class PatentSelectionResult:
    patents: list[PatentItem]
    calls_used: int
    rerank_candidates: list[RerankEventItem]
    min_score: float


@dataclass
class AutoIngestResult:
    status: str
    mode: str
    kipris_calls_used: int = 0
    patents_found: int = 0
    patents_saved: int = 0
    rag_vectors_stored: int = 0
    claimlens_patents_saved: int = 0
    agent_vectors_stored: int = 0
    message: str = ""
    rerank_candidates: list[RerankEventItem] | None = None
    rerank_min_score: float | None = None

    @property
    def should_retry_search(self) -> bool:
        return self.status == "success" and (
            self.rag_vectors_stored > 0
            or self.claimlens_patents_saved > 0
            or self.agent_vectors_stored > 0
        )

    def to_event_data(self) -> dict:
        return {
            "status": self.status,
            "mode": self.mode,
            "kiprisCallsUsed": self.kipris_calls_used,
            "patentsFound": self.patents_found,
            "patentsSaved": self.patents_saved,
            "ragVectorsStored": self.rag_vectors_stored,
            "claimlensPatentsSaved": self.claimlens_patents_saved,
            "agentVectorsStored": self.agent_vectors_stored,
            "message": self.message,
            "rerankMinScore": self.rerank_min_score,
            "rerankCandidates": [
                candidate.to_event_data()
                for candidate in self.rerank_candidates or []
            ],
        }


async def maybe_auto_ingest_for_rag(
    query: str,
    query_plan: PatentQueryPlan | None = None,
) -> AutoIngestResult:
    if not settings.auto_ingest_enabled:
        return AutoIngestResult(status="disabled", mode="rag", message="자동 수집이 꺼져 있습니다.")

    cached = _cached_result(query, mode="rag")
    if cached:
        return cached

    expected_calls = settings.auto_ingest_search_attempts + (1 if settings.auto_ingest_fallback_applicant else 0)
    allowed, message = _within_budget(expected_calls=expected_calls)
    if not allowed:
        result = AutoIngestResult(status="budget_exceeded", mode="rag", message=message)
        _record_result(query, result)
        return result

    try:
        selection = await _search_sample_patents(
            query,
            max_patents=settings.auto_ingest_rag_max_patents,
            query_plan=query_plan,
            min_rerank_score=settings.auto_ingest_rag_rerank_min_score,
        )
        patents = selection.patents
        calls_used = selection.calls_used
        if not patents:
            result = AutoIngestResult(
                status="low_relevance" if query_plan else "no_data",
                mode="rag",
                kipris_calls_used=calls_used,
                rerank_candidates=selection.rerank_candidates,
                rerank_min_score=selection.min_score,
                message=(
                    "KIPRIS 후보는 있었지만 사용자 질의와 충분히 유사한 특허를 찾지 못했습니다."
                    if query_plan
                    else "KIPRIS에서 수집할 샘플 특허를 찾지 못했습니다."
                ),
            )
            _record_result(query, result)
            return result

        docs = patents_to_documents(patents)
        chunks = get_text_splitter().split_documents(docs)
        chunk_limit = settings.auto_ingest_rag_max_patents * settings.auto_ingest_rag_max_chunks_per_patent
        limited_chunks = chunks[:chunk_limit]
        vectors_stored = add_documents(limited_chunks, namespace=settings.rag_namespace) if limited_chunks else 0

        result = AutoIngestResult(
            status="success",
            mode="rag",
            kipris_calls_used=calls_used,
            patents_found=len(patents),
            patents_saved=len(patents),
            rag_vectors_stored=vectors_stored,
            rerank_candidates=selection.rerank_candidates,
            rerank_min_score=selection.min_score,
            message=f"샘플 특허 {len(patents)}건을 RAG 검색용으로 저장했습니다.",
        )
        _record_result(query, result)
        return result
    except Exception as exc:
        logger.exception("RAG auto ingest failed for query %s", query)
        result = AutoIngestResult(
            status="error",
            mode="rag",
            message=f"자동 수집 실패: {_format_exception(exc)}",
        )
        _record_result(query, result)
        return result


async def maybe_auto_ingest_for_claimlens(
    query: str,
    query_plan: PatentQueryPlan | None = None,
) -> AutoIngestResult:
    if not settings.auto_ingest_enabled or not settings.auto_ingest_claimlens_enabled:
        return AutoIngestResult(status="disabled", mode="claimlens", message="ClaimLens 자동 수집이 꺼져 있습니다.")

    cached = _cached_result(query, mode="claimlens")
    if cached:
        return cached

    expected_calls = (
        settings.auto_ingest_search_attempts
        + (1 if settings.auto_ingest_fallback_applicant else 0)
        + settings.auto_ingest_claimlens_max_patents
    )
    allowed, message = _within_budget(expected_calls=expected_calls)
    if not allowed:
        result = AutoIngestResult(status="budget_exceeded", mode="claimlens", message=message)
        _record_result(query, result)
        return result

    try:
        selection = await _search_sample_patents(
            query,
            max_patents=settings.auto_ingest_claimlens_max_patents,
            query_plan=query_plan,
            min_rerank_score=settings.auto_ingest_claimlens_rerank_min_score,
        )
        patents = selection.patents
        calls_used = selection.calls_used
        if not patents:
            result = AutoIngestResult(
                status="low_relevance" if query_plan else "no_data",
                mode="claimlens",
                kipris_calls_used=calls_used,
                rerank_candidates=selection.rerank_candidates,
                rerank_min_score=selection.min_score,
                message=(
                    "KIPRIS 후보는 있었지만 침해 검색에 사용할 만큼 유사한 특허를 찾지 못했습니다."
                    if query_plan
                    else "KIPRIS에서 침해 검색용 샘플 특허를 찾지 못했습니다."
                ),
            )
            _record_result(query, result)
            return result

        claimlens_saved, agent_vectors, claim_calls = await _save_claimlens_patents(patents)
        result = AutoIngestResult(
            status="success" if claimlens_saved > 0 else "no_claims",
            mode="claimlens",
            kipris_calls_used=calls_used + claim_calls,
            patents_found=len(patents),
            patents_saved=len(patents),
            claimlens_patents_saved=claimlens_saved,
            agent_vectors_stored=agent_vectors,
            rerank_candidates=selection.rerank_candidates,
            rerank_min_score=selection.min_score,
            message=f"샘플 특허 {claimlens_saved}건의 청구항을 ClaimLens에 저장했습니다.",
        )
        _record_result(query, result)
        return result
    except Exception as exc:
        logger.exception("ClaimLens auto ingest failed for query %s", query)
        result = AutoIngestResult(
            status="error",
            mode="claimlens",
            message=f"ClaimLens 자동 수집 실패: {_format_exception(exc)}",
        )
        _record_result(query, result)
        return result


async def _search_sample_patents(
    query: str,
    max_patents: int,
    query_plan: PatentQueryPlan | None = None,
    min_rerank_score: float = 0.0,
) -> PatentSelectionResult:
    calls_used = 0
    patents_by_number: dict[str, PatentItem] = {}
    attempts = _build_search_attempts(query, query_plan)
    strict_applicant = bool(query_plan and query_plan.applicant_candidates)
    candidate_limit = _candidate_limit(max_patents, query_plan)
    deferred_attempts: list[KiprisSearchAttempt] = []
    min_attempts_before_break = _min_attempts_before_break(query_plan)

    for attempt_index, attempt in enumerate(attempts, start=1):
        if strict_applicant and not attempt.applicant and patents_by_number:
            deferred_attempts.append(attempt)
            continue
        kwargs = attempt.to_kipris_kwargs()
        num_rows = candidate_limit
        if attempt.applicant and attempt.field != "applicant":
            kwargs.pop("applicant", None)
            num_rows = max(candidate_limit, 10)
        patents, _ = await kipris_client.search_patents(
            **kwargs,
            page=1,
            num_of_rows=num_rows,
        )
        calls_used += 1
        patents = _filter_by_applicant(patents, attempt.applicant)
        for patent in patents:
            key = patent.application_number or patent.invention_title
            if key and key not in patents_by_number:
                patents_by_number[key] = patent
        if len(patents_by_number) >= candidate_limit and attempt_index >= min_attempts_before_break:
            break

    if not patents_by_number and settings.auto_ingest_fallback_applicant:
        fallback = settings.auto_ingest_fallback_applicant
        if _normalize_query(fallback) != _normalize_query(query):
            patents, _ = await kipris_client.search_patents(
                applicant=fallback,
                page=1,
                num_of_rows=max_patents,
            )
            calls_used += 1
            for patent in patents:
                key = patent.application_number or patent.invention_title
                if key and key not in patents_by_number:
                    patents_by_number[key] = patent

    candidates = list(patents_by_number.values())
    if query_plan is None:
        return PatentSelectionResult(
            patents=candidates[:max_patents],
            calls_used=calls_used,
            rerank_candidates=[],
            min_score=min_rerank_score,
        )
    ranked_all = rerank_patents(
        query_plan,
        candidates,
        top_k=_candidate_limit(max_patents, query_plan),
        min_score=0.0,
    )
    ranked = _select_auto_ingest_patents(
        ranked_all,
        max_patents=max_patents,
        min_score=min_rerank_score,
    )
    if not ranked and deferred_attempts:
        fallback_candidates, fallback_calls = await _collect_from_attempts(
            deferred_attempts,
            max_patents=max_patents,
            candidate_limit=candidate_limit,
        )
        calls_used += fallback_calls
        ranked_all = rerank_patents(
            query_plan,
            fallback_candidates,
            top_k=_candidate_limit(max_patents, query_plan),
            min_score=0.0,
        )
        ranked = _select_auto_ingest_patents(
            ranked_all,
            max_patents=max_patents,
            min_score=min_rerank_score,
        )
    selected_numbers = {item.patent.application_number for item in ranked}
    selected_signatures = {_coverage_signature(item) for item in ranked}
    return PatentSelectionResult(
        patents=[item.patent for item in ranked],
        calls_used=calls_used,
        rerank_candidates=[
            RerankEventItem(
                application_number=item.patent.application_number,
                title=item.patent.invention_title,
                applicant_name=item.patent.applicant_name,
                score=item.score,
                selected=item.patent.application_number in selected_numbers,
                matched_terms=item.matched_terms,
                selection_reason=_selection_reason(
                    item,
                    min_rerank_score,
                    selected=item.patent.application_number in selected_numbers,
                    selected_signatures=selected_signatures,
                ),
            )
            for item in ranked_all[:10]
        ],
        min_score=min_rerank_score,
    )


def _select_auto_ingest_patents(
    ranked_items,
    *,
    max_patents: int,
    min_score: float,
):
    eligible = [
        item
        for item in ranked_items
        if _is_auto_ingest_candidate(item, min_score)
    ]
    selected = []
    seen_signatures = set()
    for item in eligible:
        signature = _coverage_signature(item)
        if signature in seen_signatures:
            continue
        selected.append(item)
        seen_signatures.add(signature)
        if len(selected) >= max_patents:
            return selected
    if selected:
        return selected

    for item in eligible:
        if item in selected:
            continue
        selected.append(item)
        if len(selected) >= max_patents:
            break
    return selected


def _is_auto_ingest_candidate(item, min_score: float) -> bool:
    if item.score >= min_score:
        return True
    return (
        item.score >= MIN_DIVERSE_SELECTION_SCORE
        and item.coverage_count >= MIN_COVERAGE_TERMS_FOR_SELECTION
    )


def _coverage_signature(item) -> tuple[str, ...]:
    atomic_terms = [term for term in item.matched_terms if " " not in term.strip()]
    terms = sorted(atomic_terms or item.matched_terms)[:4] if item.matched_terms else ["score_only"]
    return tuple(_normalize_query(term) for term in terms)


def _selection_reason(
    item,
    min_score: float,
    *,
    selected: bool = False,
    selected_signatures: set[tuple[str, ...]] | None = None,
) -> str:
    if item.score >= min_score:
        return "score_cutoff"
    if _is_auto_ingest_candidate(item, min_score):
        if not selected and selected_signatures and _coverage_signature(item) in selected_signatures:
            return "duplicate_coverage"
        return "coverage_fallback"
    if item.coverage_count == 0:
        return "no_feature_coverage"
    if item.score < MIN_DIVERSE_SELECTION_SCORE:
        return "score_below_floor"
    return "coverage_below_threshold"


async def _collect_from_attempts(
    attempts: list[KiprisSearchAttempt],
    *,
    max_patents: int,
    candidate_limit: int,
) -> tuple[list[PatentItem], int]:
    calls_used = 0
    patents_by_number: dict[str, PatentItem] = {}
    for attempt in attempts:
        patents, _ = await kipris_client.search_patents(
            **attempt.to_kipris_kwargs(),
            page=1,
            num_of_rows=candidate_limit,
        )
        calls_used += 1
        for patent in patents:
            key = patent.application_number or patent.invention_title
            if key and key not in patents_by_number:
                patents_by_number[key] = patent
        if len(patents_by_number) >= candidate_limit:
            break
    return list(patents_by_number.values())[: max(max_patents, candidate_limit)], calls_used


def _candidate_limit(max_patents: int, query_plan: PatentQueryPlan | None) -> int:
    if query_plan is None:
        return max_patents
    return max(max_patents * 5, 10)


def _min_attempts_before_break(query_plan: PatentQueryPlan | None) -> int:
    if query_plan is None:
        return 1
    return max(1, min(len(query_plan.kipris_queries), settings.auto_ingest_search_attempts))


def _filter_by_applicant(patents: list[PatentItem], applicant: str | None) -> list[PatentItem]:
    if not applicant:
        return patents
    normalized_applicant = _normalize_query(applicant)
    return [
        patent
        for patent in patents
        if normalized_applicant in _normalize_query(patent.applicant_name)
    ]


def _build_search_attempts(query: str, query_plan: PatentQueryPlan | None):
    if query_plan is None:
        return build_kipris_search_attempts(
            query,
            max_attempts=settings.auto_ingest_search_attempts,
        )

    attempts = []
    applicants = query_plan.applicant_candidates[:3]
    keywords = query_plan.kipris_queries[: settings.auto_ingest_search_attempts]
    for applicant in applicants:
        for keyword in keywords:
            attempts.append(("keyword", keyword, applicant))
            attempts.append(("invention_title", keyword, applicant))
            attempts.append(("abstract", keyword, applicant))
    for keyword in query_plan.kipris_queries[: settings.auto_ingest_search_attempts]:
        attempts.append(("keyword", keyword, None))
    for keyword in query_plan.kipris_queries[: settings.auto_ingest_search_attempts]:
        attempts.append(("invention_title", keyword, None))
    for keyword in query_plan.kipris_queries[: settings.auto_ingest_search_attempts]:
        attempts.append(("abstract", keyword, None))
    for keyword in query_plan.search_keywords[:2]:
        attempts.append(("invention_title", keyword, None))
    for applicant in applicants:
        attempts.append(("applicant", applicant, None))

    fallback_attempts = build_kipris_search_attempts(
        query_plan.rag_query or query,
        max_attempts=settings.auto_ingest_search_attempts,
    )
    for attempt in fallback_attempts:
        attempts.append((attempt.field, attempt.value, attempt.applicant))

    deduped = []
    seen = set()
    for field, value, applicant in attempts:
        key = (field, value.lower(), (applicant or "").lower())
        if not value or key in seen:
            continue
        seen.add(key)
        deduped.append(KiprisSearchAttempt(field, value, applicant=applicant))
    return deduped[: settings.auto_ingest_search_attempts]


async def _save_claimlens_patents(patents: list[PatentItem]) -> tuple[int, int, int]:
    saved_count = 0
    agent_vector_count = 0
    claim_calls = 0
    vector_index = ClaimLensVectorIndex()

    with SessionLocal() as db:
        for patent_item in patents[: settings.auto_ingest_claimlens_max_patents]:
            app_num = normalize_application_number(patent_item.application_number)
            if not app_num:
                continue

            raw_claims = await kipris_client.get_claims(app_num)
            claim_calls += 1
            parsed_claims = parse_claims(raw_claims)[: settings.auto_ingest_claimlens_max_claims_per_patent]
            if not parsed_claims:
                continue

            patent = (
                db.query(ClaimLensPatent)
                .filter(ClaimLensPatent.application_number == app_num)
                .first()
            )
            if not patent:
                patent = ClaimLensPatent(
                    application_number=app_num,
                    title=patent_item.invention_title,
                    abstract=patent_item.abstract,
                    applicant_name=patent_item.applicant_name,
                    register_status=patent_item.register_status,
                )
                db.add(patent)
                db.flush()
            else:
                patent.title = patent_item.invention_title
                patent.abstract = patent_item.abstract
                patent.applicant_name = patent_item.applicant_name
                patent.register_status = patent_item.register_status
                db.flush()

            vector_index.delete_patent_documents(patent.id)
            existing_claims = (
                db.query(ClaimLensClaim)
                .filter(ClaimLensClaim.patent_id == patent.id)
                .all()
            )
            for existing_claim in existing_claims:
                db.query(ClaimLensClaimElement).filter(
                    ClaimLensClaimElement.claim_id == existing_claim.id
                ).delete()
            db.query(ClaimLensClaim).filter(ClaimLensClaim.patent_id == patent.id).delete()
            db.flush()

            agent_docs: list[ClaimVectorDocument] = []
            if patent.abstract:
                agent_docs.append(
                    ClaimVectorDocument(
                        id=f"patent:{patent.id}:abstract",
                        text=patent.abstract,
                        metadata={
                            "text_type": "patent_abstract",
                            "patent_id": patent.id,
                            "application_number": patent.application_number,
                            "title": patent.title,
                        },
                    )
                )

            for parsed in parsed_claims:
                db_claim = ClaimLensClaim(
                    patent_id=patent.id,
                    claim_number=parsed.claim_number,
                    raw_text=parsed.raw_text,
                    normalized_text=parsed.normalized_text,
                    status=parsed.status,
                    is_independent=parsed.is_independent,
                    parser_confidence=parsed.parser_confidence,
                    parser_status=parsed.parser_status,
                )
                db.add(db_claim)
                db.flush()

                if db_claim.status == "active" and db_claim.is_independent:
                    agent_docs.append(
                        ClaimVectorDocument(
                            id=f"claim:{db_claim.id}",
                            text=db_claim.normalized_text,
                            metadata={
                                "text_type": "independent_claim",
                                "patent_id": patent.id,
                                "claim_id": db_claim.id,
                                "application_number": patent.application_number,
                                "title": patent.title,
                                "claim_number": db_claim.claim_number,
                            },
                        )
                    )

                for index, elem in enumerate(
                    parsed.elements[: settings.auto_ingest_claimlens_max_elements_per_claim],
                    start=1,
                ):
                    db_elem = ClaimLensClaimElement(
                        claim_id=db_claim.id,
                        element_order=index,
                        element_text=elem.text,
                        source_span=elem.source_span,
                        parser_confidence=elem.parser_confidence,
                        parser_status=elem.parser_status,
                    )
                    db.add(db_elem)
                    db.flush()

                    if db_claim.status == "active":
                        agent_docs.append(
                            ClaimVectorDocument(
                                id=f"claim_element:{db_elem.id}",
                                text=db_elem.element_text,
                                metadata={
                                    "text_type": "claim_element",
                                    "patent_id": patent.id,
                                    "claim_id": db_claim.id,
                                    "claim_element_id": db_elem.id,
                                    "application_number": patent.application_number,
                                    "title": patent.title,
                                    "claim_number": db_claim.claim_number,
                                    "element_order": db_elem.element_order,
                                },
                            )
                        )

            if agent_docs:
                agent_vector_count += vector_index.upsert_documents(agent_docs)
            saved_count += 1
            db.commit()

    return saved_count, agent_vector_count, claim_calls


def _cached_result(query: str, mode: str) -> AutoIngestResult | None:
    cutoff = _now() - timedelta(days=settings.auto_ingest_cache_ttl_days)
    with SessionLocal() as db:
        row = (
            db.query(AutoIngestCache)
            .filter(AutoIngestCache.query_hash == _query_hash(query, mode))
            .filter(AutoIngestCache.last_ingested_at >= cutoff)
            .filter(AutoIngestCache.status.in_(["success", "no_data", "no_claims", "low_relevance"]))
            .order_by(AutoIngestCache.last_ingested_at.desc())
            .first()
        )
        if not row:
            return None
        return AutoIngestResult(
            status="cached",
            mode=mode,
            kipris_calls_used=0,
            patents_found=row.patents_found,
            patents_saved=row.patents_saved,
            rag_vectors_stored=row.rag_vectors_stored,
            claimlens_patents_saved=row.claimlens_patents_saved,
            agent_vectors_stored=row.agent_vectors_stored,
            message="최근 같은 검색어로 자동 수집한 기록이 있어 KIPRIS를 다시 호출하지 않았습니다.",
        )


def _within_budget(expected_calls: int = 1) -> tuple[bool, str]:
    now = _now()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    with SessionLocal() as db:
        daily_calls = _sum_calls_since(db, day_start)
        monthly_calls = _sum_calls_since(db, month_start)

    if daily_calls + expected_calls > settings.auto_ingest_max_daily_calls:
        return False, "오늘 자동 수집 KIPRIS 호출 한도에 도달했습니다."
    if monthly_calls + expected_calls > settings.auto_ingest_max_monthly_calls:
        return False, "이번 달 자동 수집 KIPRIS 호출 한도에 도달했습니다."
    return True, ""


def _sum_calls_since(db, since: datetime) -> int:
    return int(
        db.query(func.coalesce(func.sum(AutoIngestCache.kipris_calls_used), 0))
        .filter(AutoIngestCache.last_ingested_at >= since)
        .scalar()
        or 0
    )


def _record_result(query: str, result: AutoIngestResult) -> None:
    now = _now()
    try:
        with SessionLocal() as db:
            db.add(
                AutoIngestCache(
                    query_hash=_query_hash(query, result.mode),
                    normalized_query=_normalize_query(query),
                    mode=result.mode,
                    status=result.status,
                    kipris_calls_used=result.kipris_calls_used,
                    patents_found=result.patents_found,
                    patents_saved=result.patents_saved,
                    rag_vectors_stored=result.rag_vectors_stored,
                    claimlens_patents_saved=result.claimlens_patents_saved,
                    agent_vectors_stored=result.agent_vectors_stored,
                    error_message=result.message if result.status == "error" else None,
                    created_at=now,
                    last_ingested_at=now,
                )
            )
            db.commit()
    except Exception:
        logger.exception("Failed to record auto ingest cache for %s", query)


def _query_hash(query: str, mode: str) -> str:
    normalized = f"{mode}:{_normalize_query(query)}"
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _normalize_query(query: str) -> str:
    return " ".join(query.strip().lower().split())[:500]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _format_exception(exc: Exception) -> str:
    message = str(exc)
    if message:
        return f"{type(exc).__name__}: {message}"
    return f"{type(exc).__name__}: {exc!r}"
