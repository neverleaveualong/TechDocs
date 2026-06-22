import unittest

from app.ingestion.auto_ingest import AutoIngestResult


class SearchApiFlowTest(unittest.IsolatedAsyncioTestCase):
    async def test_sync_search_uses_original_user_query_for_retrieval(self) -> None:
        import app.api.search as search_api

        captured_queries: list[str] = []
        original_build_plan = search_api.build_patent_query_plan
        original_prepare = search_api.rag_pipeline.prepare_search
        original_save = search_api._save_query_log
        original_llm = search_api.rag_pipeline.llm

        class Body:
            query = "원문 질의"
            top_k = 5
            use_hybrid = True
            use_reranker = False
            auto_ingest = False

        class Plan:
            search_keywords = ["원문"]
            technical_features = ["원문"]
            synonyms = []
            kipris_queries = ["다른 검색어"]
            ipc_candidates = []
            rag_query = "LLM이 바꾼 검색어"

        class LLM:
            def __init__(self):
                self.calls = 0

            async def ainvoke(self, prompt_value):
                self.calls += 1
                class Response:
                    pass
                res = Response()
                if self.calls == 1:
                    res.content = '{"action": "SEARCH", "reasoning": "검색 실행", "parameters": {"strategy": "hybrid", "top_k": 5}}'
                else:
                    res.content = '{"action": "GENERATE", "reasoning": "답변 생성"}'
                return res

            def invoke(self, prompt_value):
                class Response:
                    content = "answer"
                return Response()

        def fake_prepare(query, top_k=5, namespace=None, use_hybrid=True, use_reranker=False, document_filter=None):
            captured_queries.append(query)
            return {"sources": [], "prompt_value": "prompt"}

        try:
            search_api.build_patent_query_plan = lambda query, intent_hint=None: Plan()
            search_api.rag_pipeline.prepare_search = fake_prepare
            search_api._save_query_log = lambda *args, **kwargs: 1
            search_api.rag_pipeline.llm = LLM()

            await search_api.search.__wrapped__(object(), Body())
        finally:
            search_api.build_patent_query_plan = original_build_plan
            search_api.rag_pipeline.prepare_search = original_prepare
            search_api._save_query_log = original_save
            search_api.rag_pipeline.llm = original_llm

        self.assertEqual(captured_queries, ["원문 질의"])


class AutoIngestResultTest(unittest.TestCase):
    def test_cached_rag_vectors_trigger_retry_search(self) -> None:
        result = AutoIngestResult(
            status="cached",
            mode="rag",
            rag_vectors_stored=3,
        )

        self.assertTrue(result.should_retry_search)

    def test_cached_without_vectors_does_not_trigger_retry_search(self) -> None:
        result = AutoIngestResult(status="cached", mode="rag")

        self.assertFalse(result.should_retry_search)


if __name__ == "__main__":
    unittest.main()
