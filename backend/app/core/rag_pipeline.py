from langchain.chains import RetrievalQA
from langchain_core.documents import Document

from app.core.llm import get_llm
from app.core.vectorstore import get_vectorstore
from app.core.hybrid_search import HybridSearch
from app.core.reranker import rerank
from app.core.prompts import SEARCH_PROMPT


class RAGPipeline:
    """RAG 파이프라인 — 벡터 검색 + Hybrid Search + Reranker + LLM 답변 생성"""

    def __init__(self):
        self.llm = get_llm()

    def search(
        self,
        query: str,
        top_k: int = 5,
        namespace: str = None,
        use_hybrid: bool = True,
        use_reranker: bool = False,
    ) -> dict:
        """RAG 검색: 질문 → 검색 → (선택) Rerank → LLM 답변 생성

        Args:
            query: 사용자 질문
            top_k: 최종 반환할 문서 수
            namespace: Pinecone namespace
            use_hybrid: True면 BM25+Vector Hybrid Search 사용
            use_reranker: True면 Reranker로 2차 정렬
        """
        if use_hybrid:
            source_documents = self._hybrid_search(
                query, top_k=top_k, namespace=namespace, use_reranker=use_reranker,
            )
        else:
            source_documents = self._vector_search(query, top_k=top_k, namespace=namespace)

        # LLM으로 답변 생성
        context_text = self._build_context(source_documents)
        prompt_value = SEARCH_PROMPT.invoke({"context": context_text, "question": query})
        answer = self.llm.invoke(prompt_value)

        # 출처 정리
        seen = set()
        sources = []
        for doc in source_documents:
            app_num = doc.metadata.get("application_number", "")
            if app_num in seen:
                continue
            seen.add(app_num)
            sources.append({
                "invention_title": doc.metadata.get("invention_title", ""),
                "applicant_name": doc.metadata.get("applicant_name", ""),
                "application_number": app_num,
                "application_date": doc.metadata.get("application_date", ""),
                "register_status": doc.metadata.get("register_status", ""),
                "relevance_text": doc.page_content[:200],
                "full_content": doc.page_content,
            })

        return {
            "answer": answer.content if hasattr(answer, "content") else str(answer),
            "sources": sources,
            "query": query,
        }

    def _build_context(self, docs: list[Document]) -> str:
        """문서에 메타데이터 헤더를 붙여 LLM에 전달할 context 생성

        프롬프트가 출원번호/발명명칭/출원인을 요구하므로,
        각 chunk 앞에 metadata를 명시적으로 포함시켜 할루시네이션 방지.
        """
        blocks = []
        for doc in docs:
            meta = doc.metadata
            header = (
                f"[특허 정보]\n"
                f"- 출원번호: {meta.get('application_number', '정보 없음')}\n"
                f"- 발명의 명칭: {meta.get('invention_title', '정보 없음')}\n"
                f"- 출원인: {meta.get('applicant_name', '정보 없음')}\n"
                f"- 출원일: {meta.get('application_date', '정보 없음')}\n"
                f"- 등록상태: {meta.get('register_status', '정보 없음')}"
            )
            blocks.append(f"{header}\n\n[문서 내용]\n{doc.page_content}")
        return "\n\n---\n\n".join(blocks)

    def _vector_search(self, query: str, top_k: int = 5, namespace: str = None) -> list[Document]:
        """기존 Vector-only 검색 (RetrievalQA 호환)"""
        vectorstore = get_vectorstore(namespace=namespace)
        retriever = vectorstore.as_retriever(
            search_kwargs={"k": top_k, "namespace": namespace}
        )
        return retriever.invoke(query)

    def _hybrid_search(
        self,
        query: str,
        top_k: int = 5,
        namespace: str = None,
        use_reranker: bool = False,
    ) -> list[Document]:
        """Hybrid Search (BM25 + Vector + RRF) + (선택) Reranker"""
        hs = HybridSearch(namespace=namespace)

        # Reranker를 쓰면 더 많은 후보를 가져와서 재정렬
        fetch_k = top_k * 4 if use_reranker else top_k
        results = hs.search(query, top_k=fetch_k)

        if use_reranker:
            results = rerank(query, results, top_k=top_k)

        # dict → Document 변환
        docs = []
        for item in results[:top_k]:
            doc = Document(
                page_content=item.get("page_content", ""),
                metadata=item.get("metadata", {}),
            )
            docs.append(doc)
        return docs

    def similarity_search(self, query: str, top_k: int = 5, namespace: str = None) -> list[dict]:
        """유사 문서만 검색 (LLM 답변 없이)"""
        vectorstore = get_vectorstore(namespace=namespace)
        results = vectorstore.similarity_search_with_score(query, k=top_k)

        return [
            {
                "content": doc.page_content,
                "metadata": doc.metadata,
                "score": float(score),
            }
            for doc, score in results
        ]


rag_pipeline = RAGPipeline()
