# ============================================================
# 파일 역할: ClaimLens 기능 추출과 API payload 변환의 회귀 동작을 검증한다.
#
# 작성자: 심우현
# 최종 수정일: 2026년 8월 11일
#
# 주요 책임:
# - 제품 기능 분해 결과 검증
# - 초록 전용 후보의 차트 제외 검증
# - 후보 특허 payload 계약 검증
# ============================================================

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

from app.core.claimlens.feature_matcher import (  # noqa: E402
    build_claim_chart_rows,
    claim_candidate_to_dict,
    extract_product_features,
)
from app.core.claimlens.vector_search import (  # noqa: E402
    TEXT_TYPE_PATENT_ABSTRACT,
    ClaimSearchCandidate,
    PatentSearchRecord,
)


class ClaimLensFeatureMatcherTest(unittest.TestCase):
    def test_decomposes_short_patent_ai_service_description(self) -> None:
        features = extract_product_features("특허 데이터를 AI를 활용하여 검색해주고 분석해주는 서비스")

        self.assertGreaterEqual(len(features), 4)
        self.assertTrue(any("특허 데이터" in feature for feature in features))
        self.assertTrue(any("검색" in feature for feature in features))
        self.assertTrue(any("AI" in feature for feature in features))
        self.assertTrue(any("분석" in feature for feature in features))

    def test_abstract_only_candidate_is_excluded_from_claim_chart(self) -> None:
        candidate = ClaimSearchCandidate(
            vector_id="patent:1:abstract",
            score=0.4,
            matched_text="특허 분석 시스템 초록",
            matched_text_type=TEXT_TYPE_PATENT_ABSTRACT,
            patent=PatentSearchRecord(
                id=1,
                application_number="1020240000001",
                title="특허 분석 시스템",
                abstract="특허 분석 시스템 초록",
                applicant_name=None,
                register_status=None,
            ),
            claim=None,
            matched_claim_element=None,
            claim_elements=[],
        )

        rows = build_claim_chart_rows([candidate], ["특허 데이터를 분석한다"])

        self.assertEqual(rows, [])

    def test_candidate_payload_includes_nested_patent_summary(self) -> None:
        candidate = ClaimSearchCandidate(
            vector_id="patent:1:claim:1",
            score=0.82,
            matched_text="센서 데이터를 분석하는 단계",
            matched_text_type="independent_claim",
            patent=PatentSearchRecord(
                id=1,
                application_number="1020240000001",
                title="센서 데이터 분석 장치",
                abstract="센서 데이터를 이용한 분석 장치",
                applicant_name="테크독스",
                register_status="등록",
            ),
            claim=None,
            matched_claim_element=None,
            claim_elements=[],
        )

        payload = claim_candidate_to_dict(candidate)

        self.assertEqual(payload["vectorId"], "patent:1:claim:1")
        self.assertEqual(
            payload["patent"],
            {
                "id": 1,
                "applicationNumber": "1020240000001",
                "title": "센서 데이터 분석 장치",
                "applicantName": "테크독스",
                "registerStatus": "등록",
                "abstract": "센서 데이터를 이용한 분석 장치",
            },
        )


if __name__ == "__main__":
    unittest.main()
