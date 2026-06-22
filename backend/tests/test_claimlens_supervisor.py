from __future__ import annotations

import os
import unittest


def _ensure_test_env() -> None:
    defaults = {
        "OPENAI_API_KEY": "test-openai-key",
        "PINECONE_API_KEY": "test-pinecone-key",
        "KIPRIS_API_KEY": "test-kipris-key",
    }
    for key, value in defaults.items():
        os.environ.setdefault(key, value)


_ensure_test_env()

from app.api.claimlens import _evaluate_search_quality  # noqa: E402


def _candidate(score: float, application_number: str = "1020230046360") -> dict:
    return {
        "score": score,
        "patent": {
            "applicationNumber": application_number,
            "title": "CCTV영상분석방법 및 시스템",
        },
    }


class ClaimLensSupervisorTest(unittest.TestCase):
    def test_low_score_candidate_triggers_auto_ingest(self) -> None:
        decision = _evaluate_search_quality(
            {
                "patent_candidates": [_candidate(0.238)],
                "claim_elements": [{"elementText": "영상스트림을 수신하는 단계"}],
                "comparison_results": [{"match": "not_found"}],
            }
        )

        self.assertEqual(decision.verdict, "low_relevance")
        self.assertTrue(decision.should_auto_ingest)
        self.assertEqual(decision.action, "auto_ingest")

    def test_empty_candidates_trigger_auto_ingest(self) -> None:
        decision = _evaluate_search_quality(
            {
                "patent_candidates": [],
                "claim_elements": [],
                "comparison_results": [],
            }
        )

        self.assertEqual(decision.verdict, "insufficient")
        self.assertTrue(decision.should_auto_ingest)

    def test_strong_candidate_with_match_continues(self) -> None:
        decision = _evaluate_search_quality(
            {
                "patent_candidates": [_candidate(0.78, "1020240000001")],
                "claim_elements": [{"elementText": "문서를 검색하는 단계"}],
                "comparison_results": [{"match": "matched"}],
            }
        )

        self.assertEqual(decision.verdict, "accepted")
        self.assertFalse(decision.should_auto_ingest)
        self.assertEqual(decision.action, "continue")


if __name__ == "__main__":
    unittest.main()
