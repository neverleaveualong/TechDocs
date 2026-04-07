"""
RAGAS 평가용 테스트 데이터셋 — Golden Set (수동 검수)
카테고리: simple(단순검색), comparative(비교/분석), technical(기술용어), negative(부정테스트)

실제 특허 데이터 기반으로 작성. Pinecone에 저장된 문서 내용과 일치해야 함.
"""

from dataclasses import dataclass
from typing import Literal


@dataclass
class GoldenItem:
    """Golden Set 개별 항목"""
    question: str
    ground_truth: str
    category: Literal["simple", "comparative", "technical", "negative"]


# ── Golden Set: 수동 검수된 15개 질문-정답 쌍 ──────────────────────────

GOLDEN_SET: list[GoldenItem] = [
    # ── 단순 검색 (5개) ──────────────────────────────
    GoldenItem(
        question="삼성전자의 2차전지 관련 특허는 어떤 것들이 있나요?",
        ground_truth="삼성전자는 리튬 이차전지, 전고체 배터리, 양극 활물질 등의 특허를 출원했습니다. 대표적으로 리튬 이차전지의 양극 활물질 제조방법, 전고체 전해질 조성물 등이 있습니다.",
        category="simple",
    ),
    GoldenItem(
        question="LG에너지솔루션의 배터리 안전 관련 특허를 알려주세요.",
        ground_truth="LG에너지솔루션은 배터리 안전 장치, 과충전 방지, 열폭주 억제 등의 특허를 보유하고 있습니다. 구체적으로 이차전지의 안전 장치 및 열 관리 시스템 관련 출원이 있습니다.",
        category="simple",
    ),
    GoldenItem(
        question="SK온의 리튬인산철(LFP) 배터리 특허가 있나요?",
        ground_truth="SK온은 LFP 양극 활물질 및 이를 포함하는 리튬 이차전지 관련 특허를 출원한 바 있습니다.",
        category="simple",
    ),
    GoldenItem(
        question="고체 전해질 관련 특허 중 삼성SDI 출원은 어떤 게 있나요?",
        ground_truth="삼성SDI는 전고체 전해질, 황화물계 고체 전해질, 이를 적용한 전고체 전지 관련 특허를 다수 출원했습니다. 구체적으로 황화물계 고체 전해질의 제조방법 및 이를 포함하는 전고체 전지 등이 있습니다.",
        category="simple",
    ),
    GoldenItem(
        question="양극 활물질 코팅 기술 관련 특허를 찾아주세요.",
        ground_truth="양극 활물질 코팅 기술로는 알루미나 코팅, 지르코니아 코팅, 붕소 코팅 등의 특허가 있습니다. 주로 코팅층이 양극 활물질의 구조 안정성과 수명 향상을 도모하는 기술입니다.",
        category="simple",
    ),

    # ── 비교/분석 (5개) ──────────────────────────────
    GoldenItem(
        question="LG에너지솔루션과 삼성SDI의 전고체 배터리 기술 방향이 어떻게 다른가요?",
        ground_truth="LG에너지솔루션은 주로 산화물계 전고체 전해질에 집중하는 반면, 삼성SDI는 황화물계 전고체 전해질을 중점적으로 연구합니다. 각각 장단점이 있으며, 이온 전도도와 공기 안정성 측면에서 차이가 있습니다.",
        category="comparative",
    ),
    GoldenItem(
        question="리튬인산철(LFP)과 니켈망간코발트(NMC) 배터리 특허의 기술적 차이는 무엇인가요?",
        ground_truth="LFP는 안전성과 수명이 우수하고 코발트를 사용하지 않아 원가 절감이 가능하지만 에너지 밀도가 상대적으로 낮습니다. NMC는 높은 에너지 밀도를 제공하지만 코발트 의존도와 열 안정성 측면에서 보완이 필요합니다.",
        category="comparative",
    ),
    GoldenItem(
        question="국내 3사(삼성SDI, LG에너지솔루션, SK온)의 분리막 기술 특허 차이점은?",
        ground_truth="삼성SDI는 세라믹 코팅 분리막, LG에너지솔루션은 PE 기반 다층 분리막, SK온은 고강도 분리막 기술에 강점이 있습니다. 각사 모두 열수축률 저감과 내열성 향상에 초점을 맞추고 있습니다.",
        category="comparative",
    ),
    GoldenItem(
        question="2019년과 2023년의 2차전지 특허 트렌드 변화가 어떻게 되나요?",
        ground_truth="2019년에는 주로 리튬이온전지의 성능 개선 관련 특허가 많았으나, 2023년에는 전고체 배터리, 실리콘 음극, 배터리 재활용 등 차세대 기술 특허가 크게 증가했습니다.",
        category="comparative",
    ),
    GoldenItem(
        question="음극재 기술에서 실리콘과 흑연 기반 특허의 장단점 비교를 알려주세요.",
        ground_truth="실리콘 음극은 흑연 대비 약 10배 높은 이론 용량을 가지지만, 충방전 시 부피 팽창이 큰 단점이 있습니다. 흑연은 안정성이 뛰어나지만 용량 한계가 있습니다. 최근 특허들은 실리콘-흑연 복합 음극으로 단점을 보완하는 방향입니다.",
        category="comparative",
    ),

    # ── 기술 용어 (3개) ──────────────────────────────
    GoldenItem(
        question="전고체 전해질이란 무엇인가요?",
        ground_truth="전고체 전해질은 기존 리튬이온전지의 액체 전해질을 고체로 대체한 것입니다. 황화물계, 산화물계, 고분자계 등이 있으며, 누액 위험이 없고 에너지 밀도를 높일 수 있는 차세대 배터리 핵심 소재입니다.",
        category="technical",
    ),
    GoldenItem(
        question="NCM811 양극재란 무엇인가요?",
        ground_truth="NCM811은 니켈 80%, 코발트 10%, 망간 10%의 조성비를 가진 삼원계 양극 활물질입니다. 니켈 비율이 높아 에너지 밀도가 우수하지만, 구조 안정성과 열 안정성 확보가 기술적 과제입니다.",
        category="technical",
    ),
    GoldenItem(
        question="배터리 열관리 시스템(BMS) 특허의 핵심 기술은 무엇인가요?",
        ground_truth="BMS 핵심 기술로는 셀 전압/온도 모니터링, SOC(충전상태) 추정, 셀 밸런싱, 열폭주 사전 감지 등이 있습니다. 특허는 주로 정확한 상태 추정 알고리즘과 안전 진단 방법에 관한 것들이 많습니다.",
        category="technical",
    ),

    # ── 부정 테스트 (2개) ──────────────────────────────
    GoldenItem(
        question="오늘 강원도 날씨 어때요?",
        ground_truth="해당 질문은 특허 문서와 관련이 없습니다. 특허 검색 시스템에서는 관련 정보를 찾지 못해야 정상입니다.",
        category="negative",
    ),
    GoldenItem(
        question="맛있는 라면 끓이는 법 알려주세요.",
        ground_truth="해당 질문은 특허 문서와 관련이 없습니다. 특허 검색 시스템에서는 관련 정보를 찾지 못해야 정상입니다.",
        category="negative",
    ),
]


def get_golden_set() -> list[GoldenItem]:
    """Golden Set 반환"""
    return GOLDEN_SET


def get_golden_set_by_category(category: str) -> list[GoldenItem]:
    """특정 카테고리만 필터링"""
    return [item for item in GOLDEN_SET if item.category == category]


def get_golden_set_as_dicts() -> list[dict]:
    """RAGAS 입력 형식(dict)으로 변환"""
    return [
        {
            "question": item.question,
            "ground_truth": item.ground_truth,
            "category": item.category,
        }
        for item in GOLDEN_SET
    ]
