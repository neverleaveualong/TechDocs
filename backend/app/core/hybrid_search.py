"""Hybrid Search: BM25(키워드) + Vector(의미) + RRF 순위 병합"""

import logging
import re
from typing import Optional

from rank_bm25 import BM25Okapi
from pinecone import Pinecone

from app.config import settings
from app.core.embeddings import get_embeddings

logger = logging.getLogger(__name__)

# Kiwi 싱글톤
_kiwi_instance = None

def _get_kiwi():
    global _kiwi_instance
    if _kiwi_instance is None:
        try:
            from kiwipiepy import Kiwi
            _kiwi_instance = Kiwi(num_workers=1)
            logger.info("Kiwi 형태소 분석기 로드 완료 (num_workers=1)")
        except ImportError:
            logger.warning("kiwipiepy 미설치. pip install kiwipiepy 필요.")
            return None
        except Exception as e:
            logger.warning("Kiwi 형태소 분석기 초기화 실패, Fallback 처리: %s", e)
            return None
    return _kiwi_instance

def _tokenize_korean(text: str) -> list[str]:
    """한국어 형태소 분석 (Kiwi) + 영문 토큰화
    Kiwi로 명사/동사어간/영문/숫자를 추출하여 BM25 정확도 향상.
    예: "반도체소자" → ["반도체", "소자"]
    """
    kiwi = _get_kiwi()
    if kiwi is None:
        return re.findall(r'[가-힣]+|[a-zA-Z0-9]+', text.lower())
    
    tokens = []
    try:
        result = kiwi.analyze(text)
        for sentence_result in result:
            for morph in sentence_result[0]:
                if morph.tag in ('NNG', 'NNP', 'VV', 'SL', 'SN'):
                    tokens.append(morph.form.lower())
    except Exception:
        tokens = re.findall(r'[가-힣]+|[a-zA-Z0-9]+', text.lower())
    return tokens


# 전역 BM25 캐시 (메모리 누수 방지 및 다중 테넌시 네임스페이스 지원)
_bm25_cache = {}

def clear_bm25_cache(namespace: Optional[str] = None):
    ns = namespace or ""
    global _bm25_cache
    if ns in _bm25_cache:
        del _bm25_cache[ns]
        logger.info("BM25 캐시 클리어 완료 (namespace: %s)", ns)
    else:
        _bm25_cache.clear()
        logger.info("전체 BM25 캐시 클리어 완료")


class HybridSearch:
    """BM25 + Vector Hybrid Search with RRF (Reciprocal Rank Fusion)"""

    def __init__(self, namespace: Optional[str] = None):
        self.namespace = namespace or ""
        self._embeddings = get_embeddings()
        pc = Pinecone(api_key=settings.pinecone_api_key)
        self._index = pc.Index(settings.pinecone_index_name)
        
        # 캐싱된 인덱스가 존재하면 메모리에서 즉시 획득
        cache_data = _bm25_cache.get(self.namespace, {})
        self._bm25_corpus = cache_data.get("corpus", [])
        self._bm25_metadata = cache_data.get("metadata", [])
        self._bm25 = cache_data.get("bm25", None)

    def _build_bm25_index(self):
        """Pinecone에서 문서를 가져와 BM25 인덱스 구축"""
        # 이미 인덱스가 캐싱되어 있으면 추가 fetch 및 빌드를 스킵
        if self._bm25 is not None:
            return

        logger.info("BM25 인덱스 구축 중...")
        try:
            all_ids = []
            ns = self.namespace or ""
            # list() API가 무한 루프를 돌거나 지연되는 것을 방지하기 위해 최대 1000개 청크로 제한
            for ids_chunk in self._index.list(namespace=ns):
                all_ids.extend(ids_chunk)
                if len(all_ids) >= 1000:
                    break

            if not all_ids:
                logger.warning("Pinecone에 문서가 없어 빈 BM25 코퍼스로 구축합니다.")
                self._bm25_corpus = []
                self._bm25_metadata = []
                self._bm25 = BM25Okapi([["빈문서"]])
                _bm25_cache[self.namespace] = {
                    "corpus": self._bm25_corpus,
                    "metadata": self._bm25_metadata,
                    "bm25": self._bm25
                }
                return

            self._bm25_corpus = []
            self._bm25_metadata = []

            for i in range(0, len(all_ids), 100):
                batch = all_ids[i:i+100]
                fetched = self._index.fetch(ids=batch, namespace=ns)
                for vec_id, vec in fetched.get("vectors", {}).items():
                    meta = vec.get("metadata", {})
                    text = meta.get("page_content", "") or meta.get("text", "")
                    if text:
                        self._bm25_corpus.append(text)
                        self._bm25_metadata.append(meta)

            if not self._bm25_corpus:
                self._bm25 = BM25Okapi([["빈문서"]])
                _bm25_cache[self.namespace] = {
                    "corpus": self._bm25_corpus,
                    "metadata": self._bm25_metadata,
                    "bm25": self._bm25
                }
                return

            tokenized = [_tokenize_korean(doc) for doc in self._bm25_corpus]
            self._bm25 = BM25Okapi(tokenized)
            
            # 빌드 완료 후 메모리에 캐싱
            _bm25_cache[self.namespace] = {
                "corpus": self._bm25_corpus,
                "metadata": self._bm25_metadata,
                "bm25": self._bm25
            }
            logger.info("BM25 인덱스 구축 완료 및 캐싱: %d개 문서", len(self._bm25_corpus))
        except Exception as e:
            logger.exception("BM25 인덱스 빌드 실패, Vector Only 모드로 우회합니다: %s", e)
            self._bm25 = BM25Okapi([["에러"]])

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
            try:
                bm25_results = self._bm25_search(query, top_k=bm25_top_k)
                for rank, doc in enumerate(bm25_results):
                    doc["rank"] = rank + 1
            except Exception as e:
                logger.error("BM25 검색 실패, RAG 키워드 검색 제외 및 Vector 검색으로 우회: %s", e)
                bm25_results = []

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
