from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from pinecone import Pinecone
from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

from app.api.errors import raise_internal_error
from app.config import settings
from app.db.database import get_db
from app.models.auto_ingest import AutoIngestCache
from app.models.claimlens import ClaimLensClaim, ClaimLensClaimElement, ClaimLensPatent

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/")
async def get_stats(db: Session = Depends(get_db)):
    """Return fast, stakeholder-friendly data statistics and system health."""
    try:
        # 1. DB-based Accurate Patent & Analysis Stats (Fast <10ms query)
        total_patents = db.query(func.count(ClaimLensPatent.id)).scalar() or 0
        patents_with_claims = (
            db.query(func.count(distinct(ClaimLensClaim.patent_id))).scalar() or 0
        )
        total_claims = db.query(func.count(ClaimLensClaim.id)).scalar() or 0
        independent_claims = (
            db.query(func.count(ClaimLensClaim.id))
            .filter(ClaimLensClaim.is_independent.is_(True))
            .scalar()
            or 0
        )
        claim_elements = db.query(func.count(ClaimLensClaimElement.id)).scalar() or 0

        # Calculate AI analysis completion percentage
        analysis_rate = (
            round((patents_with_claims / total_patents) * 100, 1) if total_patents > 0 else 0.0
        )

        # 2. Company Breakdown directly from DB (Accurate & Fast)
        company_query = (
            db.query(
                ClaimLensPatent.applicant_name.label("applicant"),
                func.count(ClaimLensPatent.id).label("patent_count"),
            )
            .group_by(ClaimLensPatent.applicant_name)
            .order_by(func.count(ClaimLensPatent.id).desc())
            .limit(10)
            .all()
        )

        companies = [
            {
                "applicant": row.applicant or "미지정 출원인",
                "patent_count": int(row.patent_count),
            }
            for row in company_query
        ]

        # 3. Auto-ingest KIPRIS status
        auto_ingest_stats = _auto_ingest_stats(db)

        # 4. Optional Pinecone High-level Stats (Fast summary without looping index.fetch)
        pinecone_summary = {"total_vectors": 0, "rag_vectors": 0, "agent_vectors": 0}
        try:
            pc = Pinecone(api_key=settings.pinecone_api_key)
            index = pc.Index(settings.pinecone_index_name)
            index_stats = index.describe_index_stats()
            namespaces = index_stats.get("namespaces", {})
            pinecone_summary = {
                "total_vectors": int(index_stats.get("total_vector_count", 0) or 0),
                "rag_vectors": int(namespaces.get(settings.rag_namespace, {}).get("vector_count", 0) or 0),
                "agent_vectors": int(namespaces.get(settings.agent_namespace, {}).get("vector_count", 0) or 0),
            }
        except Exception as p_err:
            logger.warning(f"Pinecone describe_index_stats skipped: {p_err}")

        return {
            "index_name": settings.pinecone_index_name,
            "embedding_model": "OpenAI text-embedding-3-small (1536d)",
            # Stakeholder Core Metrics
            "summary": {
                "total_patents": int(total_patents),
                "analyzed_patents": int(patents_with_claims),
                "analysis_rate": float(analysis_rate),
                "total_claims": int(total_claims),
                "independent_claims": int(independent_claims),
                "claim_elements": int(claim_elements),
            },
            "companies": companies,
            "auto_ingest": auto_ingest_stats,
            # Developer Deep Dive Metrics
            "engineering_details": pinecone_summary,
        }
    except Exception as exc:
        raise_internal_error(logger, exc, "통계 조회 실패")


def _auto_ingest_stats(db: Session) -> dict[str, int | bool]:
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

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


def _sum_auto_ingest_calls(db: Session, since: datetime) -> int:
    return int(
        db.query(func.coalesce(func.sum(AutoIngestCache.kipris_calls_used), 0))
        .filter(AutoIngestCache.last_ingested_at >= since)
        .scalar()
        or 0
    )

