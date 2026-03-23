from langchain.chains import RetrievalQA

from app.core.llm import get_llm
from app.core.vectorstore import get_vectorstore
from app.core.prompts import SEARCH_PROMPT


class RAGPipeline:
    """RAG 파이프라인 — 벡터 검색 + LLM 답변 생성"""

    def __init__(self):
        self.vectorstore = get_vectorstore()
        self.llm = get_llm()

    def search(self, query: str, top_k: int = 5) -> dict:
        """RAG 검색: 질문 → 유사 문서 검색 → LLM 답변 생성"""
        retriever = self.vectorstore.as_retriever(
            search_kwargs={"k": top_k}
        )

        qa_chain = RetrievalQA.from_chain_type(
            llm=self.llm,
            chain_type="stuff",
            retriever=retriever,
            return_source_documents=True,
            chain_type_kwargs={"prompt": SEARCH_PROMPT},
        )

        result = qa_chain.invoke({"query": query})

        sources = []
        for doc in result.get("source_documents", []):
            sources.append({
                "invention_title": doc.metadata.get("invention_title", ""),
                "applicant_name": doc.metadata.get("applicant_name", ""),
                "application_number": doc.metadata.get("application_number", ""),
                "application_date": doc.metadata.get("application_date", ""),
                "relevance_text": doc.page_content[:200],
            })

        return {
            "answer": result["result"],
            "sources": sources,
            "query": query,
        }

    def similarity_search(self, query: str, top_k: int = 5) -> list[dict]:
        """유사 문서만 검색 (LLM 답변 없이)"""
        results = self.vectorstore.similarity_search_with_score(query, k=top_k)

        return [
            {
                "content": doc.page_content,
                "metadata": doc.metadata,
                "score": float(score),
            }
            for doc, score in results
        ]


rag_pipeline = RAGPipeline()
