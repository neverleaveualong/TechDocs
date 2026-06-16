from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func

from app.config import settings
from app.core.claimlens.claim_parser import normalize_application_number, parse_claims
from app.core.claimlens.vector_search import ClaimLensVectorIndex, ClaimVectorDocument
from app.core.vectorstore import add_documents
from app.db.database import SessionLocal
from app.ingestion.document_loader import patents_to_documents
from app.ingestion.kipris_client import kipris_client
from app.ingestion.text_splitter import get_text_splitter
from app.models.auto_ingest import AutoIngestCache
from app.models.claimlens import ClaimLensClaim, ClaimLensClaimElement, ClaimLensPatent
from app.models.patent import PatentItem

logger = logging.getLogger(__name__)


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
        }


async def maybe_auto_ingest_for_rag(query: str) -> AutoIngestResult:
    if not settings.auto_ingest_enabled:
        return AutoIngestResult(status="disabled", mode="rag", message="자동 수집이 꺼져 있습니다.")

    cached = _cached_result(query, mode="rag")
    if cached:
        return cached

    allowed, message = _within_budget(expected_calls=2)
    if not allowed:
        result = AutoIngestResult(status="budget_exceeded", mode="rag", message=message)
        _record_result(query, result)
        return result

    try:
        patents, calls_used = await _search_sample_patents(
            query,
            max_patents=settings.auto_ingest_rag_max_patents,
        )
        if not patents:
            result = AutoIngestResult(
                status="no_data",
                mode="rag",
                kipris_calls_used=calls_used,
                message="KIPRIS에서 수집할 샘플 특허를 찾지 못했습니다.",
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
            message=f"샘플 특허 {len(patents)}건을 RAG 검색용으로 저장했습니다.",
        )
        _record_result(query, result)
        return result
    except Exception as exc:
        logger.exception("RAG auto ingest failed for query %s", query)
        result = AutoIngestResult(
            status="error",
            mode="rag",
            message=f"자동 수집 실패: {exc}",
        )
        _record_result(query, result)
        return result


async def maybe_auto_ingest_for_claimlens(query: str) -> AutoIngestResult:
    if not settings.auto_ingest_enabled or not settings.auto_ingest_claimlens_enabled:
        return AutoIngestResult(status="disabled", mode="claimlens", message="ClaimLens 자동 수집이 꺼져 있습니다.")

    cached = _cached_result(query, mode="claimlens")
    if cached:
        return cached

    expected_calls = 2 + settings.auto_ingest_claimlens_max_patents
    allowed, message = _within_budget(expected_calls=expected_calls)
    if not allowed:
        result = AutoIngestResult(status="budget_exceeded", mode="claimlens", message=message)
        _record_result(query, result)
        return result

    try:
        patents, calls_used = await _search_sample_patents(
            query,
            max_patents=settings.auto_ingest_claimlens_max_patents,
        )
        if not patents:
            result = AutoIngestResult(
                status="no_data",
                mode="claimlens",
                kipris_calls_used=calls_used,
                message="KIPRIS에서 침해 검색용 샘플 특허를 찾지 못했습니다.",
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
            message=f"샘플 특허 {claimlens_saved}건의 청구항을 ClaimLens에 저장했습니다.",
        )
        _record_result(query, result)
        return result
    except Exception as exc:
        logger.exception("ClaimLens auto ingest failed for query %s", query)
        result = AutoIngestResult(
            status="error",
            mode="claimlens",
            message=f"ClaimLens 자동 수집 실패: {exc}",
        )
        _record_result(query, result)
        return result


async def _search_sample_patents(query: str, max_patents: int) -> tuple[list[PatentItem], int]:
    calls_used = 0
    patents, _ = await kipris_client.search_patents(
        applicant=query,
        page=1,
        num_of_rows=max_patents,
    )
    calls_used += 1

    if not patents and settings.auto_ingest_fallback_applicant:
        fallback = settings.auto_ingest_fallback_applicant
        if _normalize_query(fallback) != _normalize_query(query):
            patents, _ = await kipris_client.search_patents(
                applicant=fallback,
                page=1,
                num_of_rows=max_patents,
            )
            calls_used += 1

    return patents[:max_patents], calls_used


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
            .filter(AutoIngestCache.status.in_(["success", "no_data", "no_claims"]))
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
    return datetime.now(UTC)
