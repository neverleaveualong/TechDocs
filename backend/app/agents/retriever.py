import asyncio

from app.agents.protocol import AgentAction, AgentMessage
from app.config import settings
from app.core.rag_pipeline import RAGPipeline
from app.core.search_quality import evaluate_search_quality, filter_relevant_documents


class RetrieverAgent:
    """검색을 실행하고 품질을 평가하는 에이전트."""

    def __init__(self, pipeline: RAGPipeline, namespace: str = None):
        self.pipeline = pipeline
        self.namespace = namespace or settings.rag_namespace

    async def execute(self, message: AgentMessage) -> AgentMessage:
        query = message.payload["query"]
        strategy = message.payload.get("strategy", "hybrid")
        top_k = message.payload.get("top_k", 5)
        query_plan = message.payload.get("query_plan")

        use_hybrid = strategy in ("hybrid", "hybrid_rerank")
        use_reranker = strategy == "hybrid_rerank"

        document_filter = None
        if query_plan:
            document_filter = lambda docs: filter_relevant_documents(docs, query_plan)

        try:
            prepared = await asyncio.wait_for(
                asyncio.to_thread(
                    self.pipeline.prepare_search,
                    query=query,
                    top_k=top_k,
                    namespace=self.namespace,
                    use_hybrid=use_hybrid,
                    use_reranker=use_reranker,
                    document_filter=document_filter,
                ),
                timeout=8,
            )
        except asyncio.TimeoutError:
            if not use_hybrid:
                raise
            strategy = "vector_fallback"
            prepared = await asyncio.wait_for(
                asyncio.to_thread(
                    self.pipeline.prepare_search,
                    query=query,
                    top_k=top_k,
                    namespace=self.namespace,
                    use_hybrid=False,
                    use_reranker=False,
                    document_filter=document_filter,
                ),
                timeout=12,
            )

        quality = None
        if query_plan:
            quality = evaluate_search_quality(prepared["sources"], query_plan)

        return AgentMessage(
            sender="retriever",
            action=AgentAction.SEARCH,
            payload={
                "sources": prepared["sources"],
                "prompt_value": prepared["prompt_value"],
                "source_count": len(prepared["sources"]),
                "quality": quality.to_event_data() if quality else None,
                "strategy_used": strategy,
            },
            reasoning=f"{strategy}으로 {len(prepared['sources'])}건 검색"
            + (f", 품질: {quality.reason}" if quality else ""),
        )
