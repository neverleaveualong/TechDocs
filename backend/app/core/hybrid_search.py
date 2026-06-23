"""Hybrid Search: BM25(키워드) + Vector(의미) + RRF 순위 병합"""

import logging
import re
import time
from typing import Optional

from rank_bm25 import BM25Okapi
from pinecone import Pinecone

from app.config import settings
from app.core.embeddings import get_embeddings

logger = logging.getLogger(__name__)

# Kiwi 싱글톤
_kiwi_instance = None

def _get_kiwi():
    # Render 무료 사양 서버 환경의 CPU 스로틀링, 스레드 데드락, 512MB RAM OOM(Killed) 크래시를
    # 100% 원천 차단하기 위해 Kiwi C++ 형태소 분석기 로딩을 비활성화하고 정규식 토큰화로 안전하게 우회합니다.
    return None

def _clean_korean_josa(word: str) -> str:
    # 한글 조사 목록 (긴 조사부터 순서대로 매칭하여 오인칭 방지)
    josa_list = [
        '으로써', '으로서', '으로부터', '조차도', '만으로', '에게서',
        '에서', '으로', '로써', '로서', '보다', '부터', '까지', '마저',
        '조차', '한테', '더러', '에게', '와', '과', '에', '의', '은', '는',
        '이', '가', '을', '를', '도', '만', '고', '랑'
    ]
    for josa in josa_list:
        if word.endswith(josa) and len(word) > len(josa) + 1:
            stemmed = word[:-len(josa)]
            if re.match(r'^[가-힣0-9a-zA-Z]+$', stemmed):
                return stemmed
    return word

def _tokenize_korean(text: str) -> list[str]:
    """한국어 조사 제거 형태소 원형 근사 + 영문 토큰화
    C++ Kiwi 모듈을 사용하지 않고 순수 파이썬 정규식 및 조사 필터링을 사용하여
    서버 락과 OOM 위험이 없으면서도 BM25 키워드 일치율을 비약적으로 끌어올립니다.
    """
    raw_tokens = re.findall(r'[가-힣0-9a-zA-Z]+', text.lower())
    tokens = []
    for token in raw_tokens:
        cleaned = _clean_korean_josa(token)
        tokens.append(cleaned)
        if cleaned != token:
            tokens.append(token)
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
        start_time = time.time()
        try:
            all_ids = []
            ns = self.namespace or ""
            # list() API가 무한 루프를 돌거나 지연되는 것을 방지하기 위해 최대 1000개 청크로 제한
            # 3.0초 이상 경과 시 즉시 조기 탈출
            for ids_chunk in self._index.list(namespace=ns):
                all_ids.extend(ids_chunk)
                if len(all_ids) >= 1000 or (time.time() - start_time) > 3.0:
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

            # 100개 단위 fetch 시 누적 5.0초 경과 시 즉시 루프 조기 탈출
            for i in range(0, len(all_ids), 100):
                if (time.time() - start_time) > 5.0:
                    logger.warning("BM25 인덱스 빌드 시간 초과(5초 경과)로 조기 중단합니다.")
                    break
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
