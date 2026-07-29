"""
============================================================
작성자   : 심우현
수정일자 : 2026-07-29
기능요약 : 검색 요청 이력의 영속화
수정내용 : QueryLog 생성과 저장 책임을 검색 API에서 분리
변경이유 : API 계층의 직접적인 DB 접근을 줄여 테스트 가능성과 책임 경계를 개선
주의사항 : 기존 저장 실패 시 검색 응답을 중단하지 않는 동작을 유지
============================================================
"""

import logging

from app.db.database import SessionLocal
from app.models.feedback import QueryLog

logger = logging.getLogger(__name__)


def save_query_log(
    query: str,
    answer: str,
    sources: list[dict],
    use_hybrid: bool,
    elapsed_ms: int,
) -> int | None:
    try:
        with SessionLocal() as db:
            log_entry = QueryLog(
                query=query,
                answer=answer,
                sources=sources,
                search_mode="hybrid" if use_hybrid else "vector",
                response_time_ms=elapsed_ms,
            )
            db.add(log_entry)
            db.commit()
            return log_entry.id
    except Exception:
        logger.exception("Failed to save query log")
        return None
