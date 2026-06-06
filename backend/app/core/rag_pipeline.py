from langchain_core.documents import Document

from app.core.hybrid_search import HybridSearch
from app.core.llm import get_llm
from app.core.prompts import SEARCH_PROMPT
from app.core.reranker import rerank
from app.core.vectorstore import get_vectorstore


class RAGPipeline:
    """RAG pipeline with optional hybrid search and streaming answer support."""

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
        prepared = self.prepare_search(
            query=query,
            top_k=top_k,
            namespace=namespace,
            use_hybrid=use_hybrid,
            use_reranker=use_reranker,
        )
        answer = self.llm.invoke(prepared["prompt_value"])

        return {
            "answer": answer.content if hasattr(answer, "content") else str(answer),
            "sources": prepared["sources"],
            "query": query,
        }

    def prepare_search(
        self,
        query: str,
        top_k: int = 5,
        namespace: str = None,
        use_hybrid: bool = True,
        use_reranker: bool = False,
    ) -> dict:
        """Retrieve supporting documents once so sync and streaming flows can share them."""
        if use_hybrid:
            source_documents = self._hybrid_search(
                query,
                top_k=top_k,
                namespace=namespace,
                use_reranker=use_reranker,
            )
        else:
            source_documents = self._vector_search(query, top_k=top_k, namespace=namespace)

        context_text = self._build_context(source_documents)
        prompt_value = SEARCH_PROMPT.invoke({"context": context_text, "question": query})

        return {
            "prompt_value": prompt_value,
            "sources": self._build_sources(source_documents),
            "query": query,
        }

    async def stream_answer(self, prompt_value):
        """Yield answer chunks from the chat model for fetch streaming."""
        async for chunk in self.llm.astream(prompt_value):
            yield chunk

    def _build_context(self, docs: list[Document]) -> str:
        """Attach patent metadata headers before passing chunks to the LLM."""
        blocks = []
        for doc in docs:
            meta = doc.metadata
            header = (
                f"[특허 정보]\n"
                f"- 출원번호: {meta.get('application_number', '정보 없음')}\n"
                f"- 발명의 명칭: {meta.get('invention_title', '정보 없음')}\n"
                f"- 출원인: {meta.get('applicant_name', '정보 없음')}\n"
                f"- IPC 분류: {meta.get('ipc_number', '정보 없음')}\n"
                f"- 출원일: {meta.get('application_date', '정보 없음')}\n"
                f"- 등록상태: {meta.get('register_status', '정보 없음')}"
            )
            blocks.append(f"{header}\n\n[문서 내용]\n{doc.page_content}")
        return "\n\n---\n\n".join(blocks)

    def _build_sources(self, source_documents: list[Document]) -> list[dict]:
        seen = set()
        sources = []
        for doc in source_documents:
            app_num = doc.metadata.get("application_number", "")
            if app_num in seen:
                continue
            seen.add(app_num)
            sources.append(
                {
                    "invention_title": doc.metadata.get("invention_title", ""),
                    "applicant_name": doc.metadata.get("applicant_name", ""),
                    "application_number": app_num,
                    "application_date": doc.metadata.get("application_date", ""),
                    "register_status": doc.metadata.get("register_status", ""),
                    "relevance_text": doc.page_content[:200],
                    "full_content": doc.page_content,
                }
            )
        return sources

    def _vector_search(self, query: str, top_k: int = 5, namespace: str = None) -> list[Document]:
        """Vector-only retrieval."""
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
        """Hybrid search with optional reranking."""
        hs = HybridSearch(namespace=namespace)

        fetch_k = top_k * 4 if use_reranker else top_k
        results = hs.search(query, top_k=fetch_k)

        if use_reranker:
            results = rerank(query, results, top_k=top_k)

        docs = []
        for item in results[:top_k]:
            doc = Document(
                page_content=item.get("page_content", ""),
                metadata=item.get("metadata", {}),
            )
            docs.append(doc)
        return docs

    def similarity_search(self, query: str, top_k: int = 5, namespace: str = None) -> list[dict]:
        """Search similar documents without generation."""
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
