import unittest

from app.ingestion.auto_ingest import AutoIngestResult
from app.models.claimlens_api import ClaimLensAnalysisRequest
from app.services.claimlens_service import ClaimLensAnalysisService


class _QueryPlan:
    rag_query = "특허 분석 검색"

    def to_event_data(self) -> dict:
        return {"ragQuery": self.rag_query}


class _Decision:
    should_auto_ingest = False
    message = "분석을 계속합니다. 조치: continue"

    def to_event_data(self) -> dict:
        return {"verdict": "accepted"}


class ClaimLensAnalysisServiceTest(unittest.IsolatedAsyncioTestCase):
    async def test_preserves_analysis_event_flow(self) -> None:
        request = ClaimLensAnalysisRequest(
            product_description="특허 데이터를 검색하고 분석하는 AI 서비스입니다.",
            technical_domain="AI",
            top_k=3,
        )
        state = {
            "patent_candidates": [{"score": 0.8}],
            "product_features": ["검색"],
            "claim_elements": [{"elementText": "검색 단계"}],
            "comparison_results": [{"match": "matched"}],
            "final_report": "검토 보고서",
        }

        service = ClaimLensAnalysisService(
            query_plan_builder=lambda query, intent_hint: _QueryPlan(),
            workflow_runner=lambda current_request, query: state,
            quality_evaluator=lambda current_state: _Decision(),
            candidate_event_builder=lambda current_state: type(
                "CandidateEvent",
                (),
                {"type": "tool_result"},
            )(),
            auto_ingest=None,
            sse_encoder=lambda event: event.type,
        )

        events = [event async for event in service.stream(request)]

        self.assertEqual(events[0], "step_started")
        self.assertIn("query_plan", events)
        self.assertIn("supervisor_decision", events)
        self.assertIn("claim_chart_row", events)
        self.assertIn("final_report", events)
        self.assertEqual(events[-1], "step_completed")

    async def test_retries_after_successful_auto_ingest(self) -> None:
        request = ClaimLensAnalysisRequest(
            product_description="특허 데이터를 검색하고 분석하는 AI 서비스입니다.",
            technical_domain="AI",
            top_k=3,
        )
        workflow_calls: list[str] = []
        decisions = iter([_RetryDecision(), _Decision()])
        states = iter(
            [
                {"patent_candidates": [{"score": 0.2}]},
                {
                    "patent_candidates": [{"score": 0.9}],
                    "product_features": [],
                    "claim_elements": [],
                    "comparison_results": [],
                    "final_report": "재검색 보고서",
                },
            ]
        )

        async def auto_ingest(product_description, query_plan):
            return AutoIngestResult(
                status="success",
                mode="claimlens",
                claimlens_patents_saved=1,
            )

        service = ClaimLensAnalysisService(
            query_plan_builder=lambda query, intent_hint: _QueryPlan(),
            workflow_runner=lambda current_request, query: (
                workflow_calls.append(query) or next(states)
            ),
            quality_evaluator=lambda current_state: next(decisions),
            candidate_event_builder=lambda current_state: type(
                "CandidateEvent",
                (),
                {"type": "tool_result"},
            )(),
            auto_ingest=auto_ingest,
            sse_encoder=lambda event: event,
        )

        events = [event async for event in service.stream(request)]
        event_types = [event.type for event in events]

        self.assertEqual(workflow_calls, ["특허 분석 검색", "특허 분석 검색"])
        self.assertEqual(event_types.count("supervisor_decision"), 2)
        self.assertIn("auto_ingest_started", event_types)
        self.assertIn("auto_ingest_completed", event_types)
        self.assertIn("retry_search", event_types)
        self.assertEqual(event_types[-1], "step_completed")


class _RetryDecision(_Decision):
    should_auto_ingest = True
    message = "후보가 부족해 자동 수집을 실행합니다."


if __name__ == "__main__":
    unittest.main()
