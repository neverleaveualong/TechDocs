import json
import unittest

from app.models.search import SearchRequest
from app.services.search_stream_service import SearchStreamService


class _QueryPlan:
    def to_event_data(self) -> dict:
        return {"rag_query": "검색 질의"}


class _Chunk:
    content = "답변 일부"


async def _empty_graph(*args, **kwargs):
    if False:
        yield {}


class SearchStreamServiceTest(unittest.IsolatedAsyncioTestCase):
    async def test_completes_empty_search_with_answer_and_query_log(self) -> None:
        saved_logs: list[dict] = []

        class RagPipeline:
            def prepare_empty_search(self, query):
                return {"prompt_value": "empty-search-prompt"}

        class Generator:
            async def stream_answer(self, prompt_value):
                yield _Chunk()

        class Graph:
            def astream(self, initial_state, config, stream_mode):
                return _empty_graph()

        service = SearchStreamService(
            query_plan_builder=lambda query, intent_hint: _QueryPlan(),
            rag_agent_graph=Graph(),
            rag_pipeline=RagPipeline(),
            generator_agent=Generator(),
            save_query_log=lambda **kwargs: saved_logs.append(kwargs) or 7,
            clock=lambda: 100.0,
        )

        events = [
            chunk async for chunk in service.stream(SearchRequest(query="빈 검색"))
        ]
        event_types = [
            json.loads(chunk.decode("utf-8"))["type"]
            for chunk in events
        ]

        self.assertEqual(event_types, ["query_plan", "sources", "answer_delta", "done"])
        self.assertEqual(saved_logs[0]["answer"], "답변 일부")
        self.assertEqual(saved_logs[0]["sources"], [])

    async def test_emits_public_error_event_when_stream_fails(self) -> None:
        class FailingGraph:
            def astream(self, initial_state, config, stream_mode):
                raise RuntimeError("private upstream failure")

        service = SearchStreamService(
            query_plan_builder=lambda query, intent_hint: _QueryPlan(),
            rag_agent_graph=FailingGraph(),
            rag_pipeline=None,
            generator_agent=None,
            save_query_log=lambda **kwargs: 1,
            clock=lambda: 100.0,
        )

        events = [
            chunk async for chunk in service.stream(SearchRequest(query="실패 검색"))
        ]
        decoded = b"".join(events).decode("utf-8")

        self.assertIn('"type": "error"', decoded)
        self.assertIn('"detail": "search failed"', decoded)
        self.assertNotIn("private upstream failure", decoded)


if __name__ == "__main__":
    unittest.main()
