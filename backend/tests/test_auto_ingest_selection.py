import unittest

from app.ingestion.auto_ingest import _build_search_attempts, _select_auto_ingest_patents, _selection_reason
from app.ingestion.patent_reranker import RerankedPatent
from app.models.patent import PatentItem
from app.models.patent_query import PatentQueryPlan


def _ranked(title: str, score: float, matched_terms: list[str]) -> RerankedPatent:
    return RerankedPatent(
        patent=PatentItem(
            application_number=title,
            invention_title=title,
            applicant_name="test",
        ),
        score=score,
        matched_terms=matched_terms,
    )


class AutoIngestSelectionTest(unittest.TestCase):
    def test_selects_coverage_candidate_below_strict_cutoff(self) -> None:
        items = [
            _ranked("battery thermal management", 0.53, ["배터리", "열관리"]),
            _ranked("irrelevant camera", 0.54, []),
        ]

        selected = _select_auto_ingest_patents(items, max_patents=3, min_score=0.56)

        self.assertEqual([item.patent.invention_title for item in selected], ["battery thermal management"])
        self.assertEqual(_selection_reason(selected[0], 0.56), "coverage_fallback")

    def test_filters_low_score_candidate_with_no_coverage(self) -> None:
        items = [
            _ranked("irrelevant camera", 0.51, []),
        ]

        selected = _select_auto_ingest_patents(items, max_patents=3, min_score=0.56)

        self.assertEqual(selected, [])

    def test_prefers_diverse_coverage_signatures_before_filling(self) -> None:
        items = [
            _ranked("battery thermal 1", 0.54, ["배터리", "열관리"]),
            _ranked("battery thermal 2", 0.53, ["배터리", "열관리"]),
            _ranked("hydrogen drone", 0.52, ["수소", "드론"]),
        ]

        selected = _select_auto_ingest_patents(items, max_patents=2, min_score=0.56)

        self.assertEqual(
            [item.patent.invention_title for item in selected],
            ["battery thermal 1", "hydrogen drone"],
        )

    def test_does_not_fill_with_duplicate_coverage_when_diverse_candidate_exists(self) -> None:
        items = [
            _ranked("fuel cell 1", 0.55, ["수소", "연료전지"]),
            _ranked("fuel cell 2", 0.54, ["수소", "연료전지"]),
            _ranked("fuel cell 3", 0.53, ["수소", "연료전지"]),
        ]

        selected = _select_auto_ingest_patents(items, max_patents=3, min_score=0.56)

        self.assertEqual([item.patent.invention_title for item in selected], ["fuel cell 1"])

    def test_builds_kipris_attempts_with_word_after_title_priority(self) -> None:
        plan = PatentQueryPlan(
            intent="rag_search",
            kipris_queries=["수소 드론", "배터리 열관리", "비행 안정성"],
            rag_query="수소 드론 배터리 열관리 비행 안정성",
        )

        attempts = _build_search_attempts("query", plan)

        self.assertEqual(
            [(attempt.field, attempt.value) for attempt in attempts],
            [
                ("keyword", "수소 드론"),
                ("keyword", "배터리 열관리"),
                ("keyword", "비행 안정성"),
                ("invention_title", "수소 드론"),
            ],
        )


if __name__ == "__main__":
    unittest.main()
