"""Hybrid Search: BM25(키워드) + Vector(의미) + RRF 순위 병합"""

import logging
from typing import Optional

from rank_bm25 import BM25Okapi
from pinecone import Pinecone

from app.config import settings
from app.core.embeddings import get_embeddings

logger = logging.getLogger(__name__)


def _ tokenize_korean(text: str) -> list[str]:
    """한국어 + 영문 혼합 텍스트 토큰화 (간이 버전)
    
    정규식 기반으로 공백/구두점 분리. 
    프로덕션에서는 Kiwi/Konlpy 등 형태소 분석기 권장.
    """
    import re
    # 영문 소문자화 + 숫자 유지 + 한국어 음절 유지
    tokens = re.findall(r'[가-힣]+|[a-zA-Z0-9]+', text.lower())
    return tokens


class HybridSearch:
    """BM25 + Vector Hybrid Search with RRF (Reciprocal Rank Fusion)"""

    def __init__(self, namespace: Optional[str] = None):
        self.namespace = namespace
        self._embeddings = get_embeddings()
        pc = Pinecone(api_key=settings.pinecone_api_key)
        self._index = pc.Index(settings.pinecone_index_name)
        self._bm25_corpus: list[str] = []
        self._bm25_metadata: list[dict] = []
        self._bm25: Optional[BM25Okapi] = None

    def _build_bm25_index(self):
        """Pinecone에서 문서를 가져와 BM25 인덱스 구축"""
        logger.info("BM25 인덱스 구축 중...")
        all_ids = []
        ns = self.namespace or ""
        for ids_chunk in self._index.list(namespace=ns):
            all_ids.extend(ids_chunk)

        self._bm25_corpus = []
        self._bm25_metadata = []

        for i in range(0, len(all_ids), 100):
            batch = all_ids[i:i+100]
            fetched = self._index.fetch(ids=batch, namespace=ns)
            for vec_id, vec in fetched.get("vectors", {}).items():
                text = ""
                # page_content가 메타데이터에 있을 수 있음
                meta = vec.get("metadata", {})
                text = meta.get("page_content", "") or meta.get("text", "")
                if text:
                    self._bm25_corpus.append(text)
                    self._bm25_metadata.append(meta)

        tokenized = [_tokenize_korean(doc) for doc in self._bm25_corpus]
        self._bm25 = BM25Okapi(tokenized)
        logger.info(f"BM25 인덱스 구축 완료: {len(self._bm25_corpus)}개 문서")

    def _vector_search(self, query: str, top_k: int = 20) -> list[dict]:
        """Vector (의미) 검색"""
        query_embedding = self._embeddings.embed_query(query)
        ns = self.namespace or ""
        results = self._index.query(
            vector=query_embedding,
            top_k=top_k,
            namespace=ns,
            include_metadata=True,
        )

        docs = []
        for match in results.get("matches", []):
            meta = match.get("metadata", {})
            docs.append({
                "page_content": meta.get("page_content", "") or meta.get("text", ""),
                "metadata": meta,
                "score": match.get("score", 0),
                "rank": 0,  # will be set
            })
        return docs

    def _bm25_search(self, query: str, top_k: int = 20) -> list[dict]:
        """BM25 (키워드) 검색"""
        if self._bm25 is None:
            self._build_bm25_index()

        tokenized_query = _tokenize_korean(query)
        scores = self._bm25.get_scores(tokenized_query)

        # 상위 top_k개 인덱스
        top_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:top_k]

        docs = []
        for idx in top_indices:
            if scores[idx] <= 0:
                continue
            docs.append({
                "page_content": self._bm25_corpus[idx],
                "metadata": self._bm25_metadata[idx],
                "score": float(scores[idx]),
                "rank": 0,
            })
        return docs

    def search(
        self,
        query: str,
        top_k: int = 5,
        vector_top_k: int = 20,
        bm25_top_k: int = 20,
        rrf_k: int = 60,
        use_bm25: bool = True,
        use_vector: bool = True,
    ) -> list[dict]:
        """Hybrid Search with RRF

        Args:
            query: 검색 쿼리
            top_k: 최종 반환할 문서 수
            vector_top_k: Vector 검색에서 가져올 후보 수
            bm25_top_k: BM25 검색에서 가져올 후보 수
            rrf_k: RRF 상수 (작을수록 상위 순위 가중치 큼, 논문 기본값 60)
            use_bm25: BM25 검색 사용 여부
            use_vector: Vector 검색 사용 여부

        Returns:
            RRF로 병합된 상위 top_k개 문서 (page_content, metadata, score 포함)
        """
        vector_results = []
        bm25_results = []

        if use_vector:
            vector_results = self._vector_search(query, top_k=vector_top_k)
            for rank, doc in enumerate(vector_results):
                doc["rank"] = rank + 1

        if use_bm25:
            bm25_results = self._bm25_search(query, top_k=bm25_top_k)
            for rank, doc in enumerate(bm25_results):
                doc["rank"] = rank + 1

        # RRF 점수 계산
        # score_rrf = sum(1 / (k + rank)) for each list the doc appears in
        doc_scores: dict[str, dict] = {}  # key: unique identifier

        for doc in vector_results + bm25_results:
            app_num = doc["metadata"].get("application_number", "")
            # page_content 해시 + application_number로 고유 키 생성
            content_key = f"{app_num}:{hash(doc['page_content'][:200])}"
            
            if content_key not in doc_scores:
                doc_scores[content_key] = {
                    "page_content": doc["page_content"],
                    "metadata": doc["metadata"],
                    "rrf_score": 0,
                    "vector_rank": None,
                    "bm25_rank": None,
                }

        # Vector RRF 점수
        for doc in vector_results:
            app_num = doc["metadata"].get("application_number", "")
            content_key = f"{app_num}:{hash(doc['page_content'][:200])}"
            doc_scores[content_key]["rrf_score"] += 1.0 / (rrf_k + doc["rank"])
            doc_scores[content_key]["vector_rank"] = doc["rank"]

        # BM25 RRF 점수
        for doc in bm25_results:
            app_num = doc["metadata"].get("application_number", "")
            content_key = f"{app_num}:{hash(doc['page_content'][:200])}"
            doc_scores[content_key]["rrf_score"] += 1.0 / (rrf_k + doc["rank"])
            doc_scores[content_key]["bm25_rank"] = doc["rank"]

        # RRF 점수순 정렬
        sorted_docs = sorted(
            doc_scores.values(),
            key=lambda x: x["rrf_score"],
            reverse=True,
        )

        return sorted_docs[:top_k]
