import unittest

from app.core.search_quality import evaluate_search_quality
from app.models.patent_query import PatentQueryPlan


class SearchQualityTest(unittest.TestCase):
    def test_triggers_auto_ingest_when_sources_do_not_match_query_terms(self) -> None:
        plan = PatentQueryPlan(
            intent="rag_search",
            search_keywords=["수소 연료전지 드론", "배터리 열관리", "비행 안정성"],
            technical_features=["수소 연료전지", "드론", "열관리"],
            rag_query="수소 연료전지 드론 열관리 비행 안정성",
            kipris_queries=["수소 연료전지 드론", "배터리 열관리"],
        )
        cctv_sources = [
            {
                "invention_title": "지능형 감시 카메라 및 이를 이용한 지능형 영상 감시 시스템",
                "relevance_text": "감시 카메라가 동적 객체를 인식하고 이상 상황을 판단한다.",
                "score": 0.82,
            }
        ]

        quality = evaluate_search_quality(cctv_sources, plan)

        self.assertTrue(quality.should_auto_ingest)
        self.assertEqual(quality.reason, "low_keyword_overlap")

    def test_keeps_relevant_sources_when_query_terms_match(self) -> None:
        plan = PatentQueryPlan(
            intent="rag_search",
            search_keywords=["AI CCTV", "행동 분석", "위험 감지"],
            technical_features=["AI CCTV", "행동 분석"],
            synonyms=["감시 카메라"],
            rag_query="AI CCTV 행동 분석 위험 감지",
            kipris_queries=["AI CCTV", "행동 분석"],
        )
        cctv_sources = [
            {
                "invention_title": "지능형 감시 카메라 및 이를 이용한 지능형 영상 감시 시스템",
                "relevance_text": "영상 데이터를 기초로 동적 객체를 인식하고 이상 상황 발생 여부를 판단한다.",
                "score": 0.82,
            }
        ]

        quality = evaluate_search_quality(cctv_sources, plan)

        self.assertFalse(quality.should_auto_ingest)
        self.assertEqual(quality.reason, "enough_sources")
        self.assertIn("감시 카메라", quality.matched_terms)

    def test_triggers_auto_ingest_when_score_is_low(self) -> None:
        plan = PatentQueryPlan(
            intent="rag_search",
            search_keywords=["감시 카메라"],
            rag_query="감시 카메라",
        )
        sources = [
            {
                "invention_title": "지능형 감시 카메라",
                "relevance_text": "감시 카메라 영상 분석",
                "score": 0.2,
                "score_type": "vector",
            }
        ]

        quality = evaluate_search_quality(sources, plan, min_score=0.55)

        self.assertTrue(quality.should_auto_ingest)
        self.assertEqual(quality.reason, "low_retrieval_score")


    def test_triggers_auto_ingest_when_only_broad_ipc_matches(self) -> None:
        plan = PatentQueryPlan(
            intent="rag_search",
            search_keywords=[
                "\uc218\uc18c \uc5f0\ub8cc\uc804\uc9c0",
                "\ub4dc\ub860",
                "\ubc30\ud130\ub9ac \uc5f4\uad00\ub9ac",
                "\ube44\ud589 \uc548\uc815\uc131",
            ],
            technical_features=[
                "\uc218\uc18c \uc5f0\ub8cc\uc804\uc9c0",
                "\ub4dc\ub860",
                "\uc5f4\uad00\ub9ac",
            ],
            ipc_candidates=["G06N", "G06V"],
            rag_query="\uc218\uc18c \uc5f0\ub8cc\uc804\uc9c0 \ub4dc\ub860 \ubc30\ud130\ub9ac \uc5f4\uad00\ub9ac",
            kipris_queries=[
                "\uc218\uc18c \uc5f0\ub8cc\uc804\uc9c0 \ub4dc\ub860",
                "\ubc30\ud130\ub9ac \uc5f4\uad00\ub9ac",
            ],
        )
        cctv_sources = [
            {
                "invention_title": "\uc9c0\ub2a5\ud615 \uac10\uc2dc \uce74\uba54\ub77c",
                "relevance_text": "IPC \ubd84\ub958: G06N 20/00|G06V 10/70\n\uc601\uc0c1 \ub370\uc774\ud130\ub85c \ub3d9\uc801 \uac1d\uccb4\ub97c \uc778\uc2dd\ud55c\ub2e4.",
                "score": 0.032,
                "score_type": "rrf",
            }
        ]

        quality = evaluate_search_quality(cctv_sources, plan)

        self.assertTrue(quality.should_auto_ingest)
        self.assertEqual(quality.reason, "low_keyword_overlap")
        self.assertEqual(quality.matched_terms, [])

    def test_triggers_auto_ingest_when_complex_query_has_one_weak_match(self) -> None:
        plan = PatentQueryPlan(
            intent="rag_search",
            search_keywords=[
                "\uc218\uc18c \uc5f0\ub8cc\uc804\uc9c0",
                "\ub4dc\ub860",
                "\ubc30\ud130\ub9ac \uc5f4\uad00\ub9ac",
                "\ube44\ud589 \uc548\uc815\uc131",
            ],
            synonyms=["\uc5f0\ub8cc\uc804\uc9c0"],
            rag_query="\uc218\uc18c \uc5f0\ub8cc\uc804\uc9c0 \ub4dc\ub860 \ubc30\ud130\ub9ac \uc5f4\uad00\ub9ac",
            kipris_queries=[
                "\uc218\uc18c \uc5f0\ub8cc\uc804\uc9c0 \ub4dc\ub860",
                "\ubc30\ud130\ub9ac \uc5f4\uad00\ub9ac",
            ],
        )
        weak_sources = [
            {
                "invention_title": "\uc5f0\ub8cc\uc804\uc9c0\uc758 \uc751\ucd95\uc218 \ubc30\ucd9c \uc81c\uc5b4\uc2dc\uc2a4\ud15c",
                "relevance_text": "\uc5f0\ub8cc\uc804\uc9c0 \uc2dc\uc2a4\ud15c\uc758 \uc751\ucd95\uc218\ub97c \ubc30\ucd9c\ud55c\ub2e4.",
                "score": 0.032,
                "score_type": "rrf",
            }
        ]

        quality = evaluate_search_quality(weak_sources, plan)

        self.assertTrue(quality.should_auto_ingest)
        self.assertEqual(quality.reason, "low_keyword_overlap")
        self.assertEqual(quality.matched_terms, ["\uc5f0\ub8cc\uc804\uc9c0"])


if __name__ == "__main__":
    unittest.main()
