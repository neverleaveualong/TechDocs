from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pinecone import Pinecone
from datetime import datetime, timezone

from sqlalchemy import distinct, func

from app.config import settings
from app.db.database import SessionLocal
from app.models.auto_ingest import AutoIngestCache
from app.models.claimlens import ClaimLensClaim, ClaimLensClaimElement, ClaimLensPatent

router = APIRouter()

COMPANY_SAMPLE_LIMIT = 500


@router.get("/")
async def get_stats():
    """Return Pinecone namespace stats and ClaimLens persistence stats."""
    try:
        pc = Pinecone(api_key=settings.pinecone_api_key)
        index = pc.Index(settings.pinecone_index_name)
        index_stats = index.describe_index_stats()

        namespaces = index_stats.get("namespaces", {})
        rag_namespace = _pick_namespace_stats(namespaces, settings.rag_namespace)
        agent_namespace = _pick_namespace_stats(namespaces, settings.agent_namespace)
        default_namespace = _pick_namespace_stats(namespaces, "")

        company_namespace = settings.rag_namespace if rag_namespace["vector_count"] > 0 else ""
        company_sample_limit = COMPANY_SAMPLE_LIMIT if company_namespace else 0
        companies = _company_breakdown(index, company_namespace, limit=company_sample_limit)
        claimlens_stats = _claimlens_db_stats()
        auto_ingest_stats = _auto_ingest_stats()

        return {
            "index_name": settings.pinecone_index_name,
            "dimension": index_stats.get("dimension", 0),
            "total_vectors": index_stats.get("total_vector_count", 0),
            "company_namespace": company_namespace,
            "company_sample_limit": company_sample_limit,
            "company_stats_sampled": rag_namespace["vector_count"] > company_sample_limit > 0,
            "namespaces": {
                "rag": rag_namespace,
                "agent": agent_namespace,
                "default": default_namespace,
            },
            "companies": companies,
            "claimlens": claimlens_stats,
            "auto_ingest": auto_ingest_stats,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"통계 조회 실패: {exc}") from exc


def _pick_namespace_stats(namespaces: dict[str, dict], namespace: str) -> dict[str, int | str]:
    stats = namespaces.get(namespace, {})
    return {
        "namespace": namespace,
        "vector_count": int(stats.get("vector_count", 0) or 0),
    }


def _company_breakdown(index: Any, namespace: str, limit: int) -> list[dict[str, int | str]]:
    if not namespace or limit <= 0:
        return []

    companies: dict[str, dict[str, object]] = {}
    all_ids = _list_namespace_ids(index, namespace, limit=limit)

    for i in range(0, len(all_ids), 100):
        batch_ids = all_ids[i : i + 100]
        fetched = index.fetch(ids=batch_ids, namespace=namespace)
        for vec in fetched.get("vectors", {}).values():
            meta = vec.get("metadata", {}) or {}
            applicant = str(meta.get("applicant_name") or "회사 정보 없음")
            app_num = str(meta.get("application_number") or "")

            if applicant not in companies:
                companies[applicant] = {
                    "applicant": applicant,
                    "patents": set(),
                    "vectors": 0,
                }
            companies[applicant]["vectors"] = int(companies[applicant]["vectors"]) + 1
            if app_num:
                companies[applicant]["patents"].add(app_num)  # type: ignore[union-attr]

    company_list = [
        {
            "applicant": item["applicant"],
            "patent_count": len(item["patents"]),  # type: ignore[arg-type]
            "vector_count": int(item["vectors"]),
        }
        for item in companies.values()
    ]
    company_list.sort(key=lambda item: item["vector_count"], reverse=True)
    return company_list


def _list_namespace_ids(index: Any, namespace: str, limit: int) -> list[str]:
    ids: list[str] = []
    for ids_chunk in index.list(namespace=namespace):
        for vector_id in ids_chunk:
            ids.append(vector_id)
            if len(ids) >= limit:
                return ids
    return ids


def _claimlens_db_stats() -> dict[str, int]:
    with SessionLocal() as db:
        patents_count = db.query(func.count(ClaimLensPatent.id)).scalar() or 0
        claims_count = db.query(func.count(ClaimLensClaim.id)).scalar() or 0
        active_claims_count = (
            db.query(func.count(ClaimLensClaim.id))
            .filter(ClaimLensClaim.status == "active")
            .scalar()
            or 0
        )
        independent_claims_count = (
            db.query(func.count(ClaimLensClaim.id))
            .filter(ClaimLensClaim.is_independent.is_(True))
            .scalar()
            or 0
        )
        claim_elements_count = db.query(func.count(ClaimLensClaimElement.id)).scalar() or 0
        patents_with_claims_count = (
            db.query(func.count(distinct(ClaimLensClaim.patent_id))).scalar() or 0
        )

    return {
        "patents": int(patents_count),
        "claims": int(claims_count),
        "active_claims": int(active_claims_count),
        "independent_claims": int(independent_claims_count),
        "claim_elements": int(claim_elements_count),
        "patents_with_claims": int(patents_with_claims_count),
    }


def _auto_ingest_stats() -> dict[str, int | bool]:
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    with SessionLocal() as db:
        daily_calls = _sum_auto_ingest_calls(db, day_start)
        monthly_calls = _sum_auto_ingest_calls(db, month_start)
        total_runs = db.query(func.count(AutoIngestCache.id)).scalar() or 0

    return {
        "enabled": settings.auto_ingest_enabled,
        "daily_kipris_calls": daily_calls,
        "monthly_kipris_calls": monthly_calls,
        "daily_limit": settings.auto_ingest_max_daily_calls,
        "monthly_limit": settings.auto_ingest_max_monthly_calls,
        "cache_ttl_days": settings.auto_ingest_cache_ttl_days,
        "total_runs": int(total_runs),
    }


def _sum_auto_ingest_calls(db, since: datetime) -> int:
    return int(
        db.query(func.coalesce(func.sum(AutoIngestCache.kipris_calls_used), 0))
        .filter(AutoIngestCache.last_ingested_at >= since)
        .scalar()
        or 0
    )
