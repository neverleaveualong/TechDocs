from app.agents.protocol import AgentAction, AgentMessage
from app.ingestion.auto_ingest import maybe_auto_ingest_for_rag


class IngestAgent:
    """KIPRIS에서 데이터를 수집하는 에이전트."""

    async def execute(self, message: AgentMessage) -> AgentMessage:
        query = message.payload["query"]
        query_plan = message.payload.get("query_plan")

        result = await maybe_auto_ingest_for_rag(query, query_plan=query_plan)

        if result.should_retry_search:
            try:
                from app.core.hybrid_search import clear_bm25_cache
                clear_bm25_cache()
            except Exception as e:
                pass

        return AgentMessage(
            sender="ingest",
            action=AgentAction.INGEST,
            payload={
                "status": result.status,
                "patents_found": result.patents_found,
                "patents_saved": result.patents_saved,
                "rag_vectors_stored": result.rag_vectors_stored,
                "should_retry_search": result.should_retry_search,
                "event_data": result.to_event_data(),
            },
            reasoning=(
                f"KIPRIS에서 {result.patents_found}건 탐색, "
                f"{result.patents_saved}건 저장, "
                f"벡터 {result.rag_vectors_stored}건"
            ),
        )
