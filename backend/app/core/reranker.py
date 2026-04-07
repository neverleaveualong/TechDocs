"""Reranker — 검색 후보군 2차 정렬 (Flashrank 기반)"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Flashrank는 선택적 의존성
_reranker = None


def get_reranker():
    """Flashrank Reranker 싱글톤"""
    global _reranker
    if _reranker is None:
        try:
            from flashrank import Ranker, RerankRequest
            _reranker = Ranker(model_name="ms-marco-MiniLM-L-12-v2", cache_dir="/tmp/flashrank")
            logger.info("Flashrank Reranker 로드 완료 (ms-marco-MiniLM-L-12-v2)")
        except ImportError:
            logger.warning("flashrank 미설치. pip install flashrank 필요.")
            return None
        except Exception as e:
            logger.warning(f"Reranker 로드 실패: {e}")
            return None
    return _reranker


def rerank(
    query: str,
    documents: list[dict],
    top_k: int = 5,
) -> list[dict]:
    """검색 결과를 Reranker로 2차 정렬

    Args:
        query: 사용자 질문
        documents: Hybrid Search 결과 (page_content, metadata 포함)
        top_k: 반환할 상위 문서 수

    Returns:
        재정렬된 상위 top_k개 문서
    """
    ranker = get_reranker()
    if ranker is None or len(documents) == 0:
        # Reranker 미사용 시 그대로 반환
        return documents[:top_k]

    try:
        from flashrank import RerankRequest

        passages = [
            {"id": i, "text": doc["page_content"], "meta": doc.get("metadata", {})}
            for i, doc in enumerate(documents)
        ]

        rerank_request = RerankRequest(query=query, passages=passages)
        results = ranker.rerank(rerank_request)

        reranked = []
        for item in results[:top_k]:
            idx = item["id"]
            original = documents[idx]
            reranked.append({
                **original,
                "rerank_score": item.get("score", 0),
            })

        return reranked

    except Exception as e:
        logger.warning(f"Rerank 실패, 원본 순서 유지: {e}")
        return documents[:top_k]
