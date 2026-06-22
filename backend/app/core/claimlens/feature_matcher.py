from __future__ import annotations

import re
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from app.core.claimlens.vector_search import (
    TEXT_TYPE_PATENT_ABSTRACT,
    ClaimSearchCandidate,
    ClaimSearchRecord,
)

MatchStatus = Literal["matched", "partial", "not_found", "uncertain"]

_TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣]+")
_CLAUSE_SPLIT_PATTERN = re.compile(r"[\n\r.;]|(?:\s및\s)|(?:\s또는\s)|(?:,\s*)")
_STOPWORDS = {
    "상기",
    "하는",
    "하여",
    "하고",
    "하며",
    "또는",
    "그리고",
    "위한",
    "이용",
    "포함",
    "수단",
    "모듈",
    "단계",
    "장치",
    "방법",
    "시스템",
    "적어도",
    "하나",
    "이상",
    "통하여",
    "기반",
}

_PATENT_DOMAIN_TERMS = {"특허", "청구항", "지식재산", "선행기술", "문헌"}
_SEARCH_TERMS = {"검색", "탐색", "조회"}
_ANALYSIS_TERMS = {"분석", "검토", "비교", "판단"}
_AI_TERMS = {"ai", "인공지능", "생성형", "자연어처리", "llm"}
_EVIDENCE_TERMS = {"근거", "출처", "인용", "레퍼런스"}


@dataclass(frozen=True)
class ClaimChartRow:
    application_number: str
    patent_title: str
    claim_number: int | None
    claim_element_order: int | None
    claim_element: str
    product_feature: str | None
    match_status: MatchStatus
    evidence: str | None
    uncertainty: str | None
    score: float


@dataclass(frozen=True)
class FeatureMatch:
    product_feature: str | None
    status: MatchStatus
    evidence: str | None
    uncertainty: str | None
    score: float


def extract_product_features(product_description: str, limit: int = 8) -> list[str]:
    clauses = [_clean_feature(clause) for clause in _CLAUSE_SPLIT_PATTERN.split(product_description)]
    features: list[str] = []
    seen: set[str] = set()
    for clause in clauses:
        if len(clause) < 4 or clause in seen:
            continue
        features.append(clause)
        seen.add(clause)
        if len(features) >= limit:
            break

    structured = _decompose_short_product_description(product_description, limit=limit)
    if structured and (len(features) <= 1 or len(_tokenize(product_description)) <= 10):
        return structured
    if features:
        return features[:limit]
    fallback = product_description.strip()
    return [fallback] if fallback else []


def build_claim_chart_rows(
    candidates: Sequence[ClaimSearchCandidate],
    product_features: Sequence[str],
    *,
    max_candidates: int = 3,
) -> list[ClaimChartRow]:
    rows: list[ClaimChartRow] = []
    for candidate in _dedupe_claim_candidates(candidates)[:max_candidates]:
        claim_elements = candidate.claim_elements
        if not claim_elements and candidate.matched_claim_element is not None:
            claim_elements = [candidate.matched_claim_element]
        if not claim_elements:
            continue

        for element in claim_elements:
            match = match_claim_element(element.element_text, product_features)
            rows.append(
                ClaimChartRow(
                    application_number=candidate.patent.application_number,
                    patent_title=candidate.patent.title,
                    claim_number=candidate.claim.claim_number if candidate.claim else None,
                    claim_element_order=element.element_order,
                    claim_element=element.element_text,
                    product_feature=match.product_feature,
                    match_status=match.status,
                    evidence=match.evidence,
                    uncertainty=match.uncertainty,
                    score=match.score,
                )
            )
    return validate_claim_chart_rows(rows)


def match_claim_element(
    claim_element: str,
    product_features: Sequence[str],
) -> FeatureMatch:
    element_tokens = _tokenize(claim_element)
    if len(element_tokens) < 2:
        return FeatureMatch(
            product_feature=None,
            status="uncertain",
            evidence=None,
            uncertainty="청구항 구성요소가 너무 짧아 안정적으로 비교하기 어렵습니다.",
            score=0.0,
        )

    best_feature: str | None = None
    best_score = 0.0
    best_overlap: set[str] = set()
    for feature in product_features:
        feature_tokens = _tokenize(feature)
        overlap = set(element_tokens) & set(feature_tokens)
        if not overlap:
            continue
        coverage = len(overlap) / max(1, len(set(element_tokens)))
        precision = len(overlap) / max(1, len(set(feature_tokens)))
        score = (coverage * 0.7) + (precision * 0.3)
        if score > best_score:
            best_score = score
            best_feature = feature
            best_overlap = overlap

    if best_feature is None:
        return FeatureMatch(
            product_feature=None,
            status="not_found",
            evidence=None,
            uncertainty="제품 설명에서 이 구성요소를 뒷받침하는 기능을 찾지 못했습니다.",
            score=0.0,
        )

    evidence = _build_evidence(best_feature, best_overlap)
    if best_score >= 0.55 and len(best_overlap) >= 2:
        return FeatureMatch(
            product_feature=best_feature,
            status="matched",
            evidence=evidence,
            uncertainty=None,
            score=best_score,
        )
    if best_score >= 0.2:
        return FeatureMatch(
            product_feature=best_feature,
            status="partial",
            evidence=evidence,
            uncertainty="일부 표현은 겹치지만 모든 조건을 확인하기에는 설명이 부족합니다.",
            score=best_score,
        )
    return FeatureMatch(
        product_feature=best_feature,
        status="uncertain",
        evidence=evidence,
        uncertainty="표현 겹침이 약해 기술적으로 같은 기능인지 판단하기 어렵습니다.",
        score=best_score,
    )


def validate_claim_chart_rows(rows: Sequence[ClaimChartRow]) -> list[ClaimChartRow]:
    validated: list[ClaimChartRow] = []
    for row in rows:
        if row.match_status in {"matched", "partial"} and not row.evidence:
            validated.append(
                ClaimChartRow(
                    **{
                        **row.__dict__,
                        "match_status": "uncertain",
                        "uncertainty": "근거 없는 일치 판단이어서 uncertain으로 낮췄습니다.",
                    }
                )
            )
            continue
        validated.append(row)
    return validated


def generate_claim_chart_report(rows: Sequence[ClaimChartRow]) -> str:
    if not rows:
        return (
            "## 기술 검토 초안\n\n"
            "관련 청구항 후보를 찾지 못했습니다. 검색어를 구체화하거나 ClaimLens 데이터 수집 범위를 "
            "넓힌 뒤 다시 분석해야 합니다."
        )

    counts = Counter(row.match_status for row in rows)
    first = rows[0]
    limitations = []
    if counts["matched"] == 0:
        limitations.append("- 명확한 matched 항목이 없어 기술적 일치 여부를 단정하기 어렵습니다.")
    if counts["not_found"] + counts["uncertain"] > counts["matched"] + counts["partial"]:
        limitations.append("- not_found/uncertain 항목이 많아 제품 설명을 더 구체화해야 합니다.")
    limitation_section = (
        "\n\n### 분석 한계\n\n" + "\n".join(limitations)
        if limitations
        else ""
    )
    return (
        "## 기술 검토 초안\n\n"
        f"후보 특허 `{first.application_number}`의 청구항 구성요소를 제품 설명과 비교했습니다.\n\n"
        f"- matched: {counts['matched']}\n"
        f"- partial: {counts['partial']}\n"
        f"- not_found: {counts['not_found']}\n"
        f"- uncertain: {counts['uncertain']}\n\n"
        "이 결과는 법률적 침해 판단이 아니라, 제품 설명과 청구항 구성요소 간의 기술적 비교 초안입니다."
        f"{limitation_section}"
    )


def claim_chart_row_to_event_data(row: ClaimChartRow) -> dict[str, object | None]:
    return {
        "applicationNumber": row.application_number,
        "patentTitle": row.patent_title,
        "claimNumber": row.claim_number,
        "claimElementOrder": row.claim_element_order,
        "claimElement": row.claim_element,
        "productFeature": row.product_feature,
        "match": row.match_status,
        "evidence": row.evidence,
        "uncertainty": row.uncertainty,
        "score": round(row.score, 4),
    }


def claim_candidate_to_dict(candidate: ClaimSearchCandidate) -> dict[str, object | None]:
    return {
        "vectorId": candidate.vector_id,
        "score": candidate.score,
        "claimComparisonReady": candidate.matched_text_type != TEXT_TYPE_PATENT_ABSTRACT and bool(candidate.claim_elements or candidate.matched_claim_element),
        "matchedTextType": candidate.matched_text_type,
        "matchedText": candidate.matched_text,
        "patent": {
            "id": candidate.patent.id,
            "applicationNumber": candidate.patent.application_number,
            "title": candidate.patent.title,
        },
        "claim": _claim_to_dict(candidate.claim),
        "claimElementCount": len(candidate.claim_elements),
    }


def _claim_to_dict(claim: ClaimSearchRecord | None) -> dict[str, object | None] | None:
    if claim is None:
        return None
    return {
        "id": claim.id,
        "claimNumber": claim.claim_number,
        "status": claim.status,
        "isIndependent": claim.is_independent,
        "parserConfidence": claim.parser_confidence,
        "parserStatus": claim.parser_status,
    }


def _dedupe_claim_candidates(candidates: Sequence[ClaimSearchCandidate]) -> list[ClaimSearchCandidate]:
    seen: set[tuple[int, int | None]] = set()
    deduped: list[ClaimSearchCandidate] = []
    for candidate in candidates:
        key = (candidate.patent.id, candidate.claim.id if candidate.claim else None)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(candidate)
    return deduped


def _candidate_without_claim_element_row(candidate: ClaimSearchCandidate) -> ClaimChartRow:
    return ClaimChartRow(
        application_number=candidate.patent.application_number,
        patent_title=candidate.patent.title,
        claim_number=candidate.claim.claim_number if candidate.claim else None,
        claim_element_order=None,
        claim_element=candidate.matched_text,
        product_feature=None,
        match_status="uncertain",
        evidence=None,
        uncertainty="검색 후보에 claim element 원문이 연결되지 않아 구성요소 단위 비교를 보류했습니다.",
        score=0.0,
    )


def _decompose_short_product_description(product_description: str, *, limit: int) -> list[str]:
    normalized = product_description.strip()
    if not normalized:
        return []
    text = normalized.lower()
    tokens = set(_tokenize(normalized))
    features: list[str] = []

    def has_any(terms: set[str]) -> bool:
        return bool(tokens & terms) or any(term in text for term in terms)

    def add(feature: str) -> None:
        if feature not in features and len(features) < limit:
            features.append(feature)

    if has_any(_PATENT_DOMAIN_TERMS):
        add("특허 데이터와 특허 문헌 정보를 수집하거나 저장한다")
        add("특허 청구항, 초록, 출원 정보 등 분석 대상 데이터를 관리한다")
    elif "문서" in tokens or "데이터" in tokens:
        add("문서 또는 데이터를 수집하거나 저장한다")

    if has_any(_SEARCH_TERMS):
        target = "특허 문헌" if has_any(_PATENT_DOMAIN_TERMS) else "문서"
        add(f"사용자의 기술 설명 또는 질의를 입력받아 관련 {target}을 검색한다")

    if has_any(_AI_TERMS):
        target = "특허 데이터" if has_any(_PATENT_DOMAIN_TERMS) else "문서 데이터"
        add(f"AI를 활용해 {target}의 의미와 관련성을 분석한다")

    if has_any(_ANALYSIS_TERMS):
        target = "특허 후보와 청구항" if has_any(_PATENT_DOMAIN_TERMS) else "검색 결과"
        add(f"{target}을 비교하고 분석 결과를 생성한다")

    if has_any(_EVIDENCE_TERMS):
        add("분석 결과의 근거와 출처를 함께 제공한다")

    if not features and len(_tokenize(normalized)) <= 10:
        add(normalized)
    return features


def _clean_feature(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip(" ,")


def _tokenize(text: str) -> list[str]:
    tokens = [token.lower() for token in _TOKEN_PATTERN.findall(text)]
    return [token for token in tokens if len(token) > 1 and token not in _STOPWORDS]


def _build_evidence(feature: str, overlap: set[str]) -> str:
    terms = ", ".join(sorted(overlap))
    return f"제품 기능 `{feature}`에서 겹치는 기술 표현을 확인했습니다: {terms}"
