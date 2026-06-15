from __future__ import annotations

import html
import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass


CLAIM_NUMBER_RE = re.compile(r"^\s*(\d+)\s*\.")
TAG_RE = re.compile(r"<[^>]+>")
DEPENDENCY_PATTERNS = (
    re.compile(r"제\s*(\d+)\s*항"),
    re.compile(r"청구항\s*(\d+)"),
    re.compile(r"claim\s+(\d+)", re.IGNORECASE),
)
CLAIM_ELEMENT_SPLIT_RE = re.compile(
    r";|；|(?<=단계),|(?<=수단),|(?<=모듈),|(?<=부),|(?<=포함하는),"
)
CLAUSE_BOUNDARY_RE = re.compile(
    r"(?<=포함하되),|(?<=포함하고),|(?<=포함하며),|(?<=제어하고),|"
    r"(?<=획득하고),|(?<=전처리하고),|(?<=학습하고),|(?<=생성하고),|"
    r"(?<=검색하고),|(?<=선택하고),|(?<=수행하고),|(?<=구축하여),|"
    r"(?<=받아)"
)
LEADING_CONNECTOR_RE = re.compile(
    r"^및상기\s+|^(?:및\s*,?\s*)?상기\s+|^및\s*,?\s*|^(?:이|가|를)\s*포함(?:되고|하고),?\s*"
)
MAX_ELEMENTS_PER_CLAIM = 24
MAX_RULE_ELEMENT_LENGTH = 250
RULE_SPLIT_CONFIDENCE = 0.75
RULE_SINGLE_ELEMENT_CONFIDENCE = 0.55
RULE_UNSPLIT_CONFIDENCE = 0.5
RULE_LONG_ELEMENT_CONFIDENCE = 0.6
LLM_VALIDATED_CONFIDENCE = 0.85
CONFIDENT_RULE_SPLIT_THRESHOLD = 0.8
PARSER_METHOD_RULE_BASED = "rule_based"
PARSER_METHOD_LLM_ASSISTED = "llm_assisted"
PARSER_METHOD_FALLBACK = "fallback"
PARSER_STATUS_PARSED = "parsed"
PARSER_STATUS_UNCERTAIN = "uncertain"
PARSER_STATUS_SKIPPED = "skipped"
PARSER_STATUS_FAILED = "failed"


@dataclass(frozen=True)
class ParsedClaimElement:
    text: str
    source_span: str
    parser_confidence: float
    parser_method: str
    parser_status: str


@dataclass(frozen=True)
class ParsedClaim:
    claim_number: int
    raw_text: str
    normalized_text: str
    status: str
    is_independent: bool | None
    dependency_claim_numbers: list[int]
    elements: list[ParsedClaimElement]
    parser_confidence: float
    parser_method: str
    parser_status: str


LLMElementParser = Callable[[str], Iterable[str | ParsedClaimElement]]


def normalize_application_number(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def normalize_claim_text(raw_text: str) -> str:
    without_tags = TAG_RE.sub(" ", raw_text)
    unescaped = html.unescape(without_tags)
    return re.sub(r"\s+", " ", unescaped).strip()


def extract_claim_number(normalized_text: str) -> int | None:
    match = CLAIM_NUMBER_RE.match(normalized_text)
    if not match:
        return None
    return int(match.group(1))


def extract_dependency_claim_numbers(claim_body: str) -> list[int]:
    numbers: set[int] = set()
    for pattern in DEPENDENCY_PATTERNS:
        for match in pattern.finditer(claim_body):
            numbers.add(int(match.group(1)))
    return sorted(numbers)


def split_claim_elements(claim_body: str) -> list[ParsedClaimElement]:
    compact = re.sub(r"\s+", " ", claim_body).strip()
    if not compact:
        return []

    raw_parts = CLAIM_ELEMENT_SPLIT_RE.split(compact)
    parts = _refine_claim_element_parts(raw_parts)
    if not parts:
        return [
            ParsedClaimElement(
                text=compact,
                source_span=compact,
                parser_confidence=RULE_UNSPLIT_CONFIDENCE,
                parser_method=PARSER_METHOD_FALLBACK,
                parser_status=PARSER_STATUS_UNCERTAIN,
            )
        ]

    confidence = RULE_SPLIT_CONFIDENCE if len(parts) > 1 else RULE_SINGLE_ELEMENT_CONFIDENCE
    method = PARSER_METHOD_RULE_BASED if len(parts) > 1 else PARSER_METHOD_FALLBACK
    status = PARSER_STATUS_PARSED if len(parts) > 1 else PARSER_STATUS_UNCERTAIN
    return [
        ParsedClaimElement(
            text=_clean_element_text(part),
            source_span=part,
            parser_confidence=_element_confidence(part, confidence),
            parser_method=method,
            parser_status=_element_status(part, status),
        )
        for part in parts[:MAX_ELEMENTS_PER_CLAIM]
    ]


def _refine_claim_element_parts(raw_parts: Iterable[str]) -> list[str]:
    parts: list[str] = []
    for raw_part in raw_parts:
        part = raw_part.strip(" ,")
        if len(part) < 4:
            continue
        parts.extend(_split_long_part(part))
    return [part for part in parts if len(_clean_element_text(part)) >= 4]


def _split_long_part(part: str) -> list[str]:
    if len(part) <= MAX_RULE_ELEMENT_LENGTH and "포함하되" not in part:
        return [part]

    refined = [candidate.strip(" ,") for candidate in CLAUSE_BOUNDARY_RE.split(part)]
    return [candidate for candidate in refined if len(candidate) >= 4] or [part]


def _clean_element_text(part: str) -> str:
    text = re.sub(r"\s+", " ", part).strip(" ,")
    previous = None
    while previous != text:
        previous = text
        text = LEADING_CONNECTOR_RE.sub("", text).strip(" ,")
    return text


def _element_confidence(part: str, base_confidence: float) -> float:
    if len(part) > MAX_RULE_ELEMENT_LENGTH:
        return min(base_confidence, RULE_LONG_ELEMENT_CONFIDENCE)
    return base_confidence


def _element_status(part: str, base_status: str) -> str:
    if len(part) > MAX_RULE_ELEMENT_LENGTH:
        return PARSER_STATUS_UNCERTAIN
    return base_status


def parse_claims(raw_claims: Iterable[str]) -> list[ParsedClaim]:
    parsed_claims: list[ParsedClaim] = []
    for raw_claim in raw_claims:
        parsed_claim = parse_claim(raw_claim)
        if parsed_claim is not None:
            parsed_claims.append(parsed_claim)
    return parsed_claims


def select_independent_claims(
    parsed_claims: Iterable[ParsedClaim],
    max_claims: int = 3,
) -> list[ParsedClaim]:
    candidates = [
        claim
        for claim in parsed_claims
        if claim.status == "active" and claim.is_independent is True
    ]
    return sorted(candidates, key=lambda claim: claim.claim_number)[:max_claims]


def parse_claim(
    raw_claim: str,
    *,
    llm_parser: LLMElementParser | None = None,
) -> ParsedClaim | None:
    raw_text = raw_claim.strip()
    normalized_text = normalize_claim_text(raw_text)
    claim_number = extract_claim_number(normalized_text)
    if claim_number is None:
        return None

    claim_body = CLAIM_NUMBER_RE.sub("", normalized_text, count=1).strip()
    status = "deleted" if claim_body == "삭제" else "active"
    dependencies = extract_dependency_claim_numbers(claim_body)
    is_independent = None if status == "deleted" else len(dependencies) == 0
    elements = _parse_elements(claim_body, status, llm_parser)
    parser_confidence = _claim_confidence(status, elements)
    parser_method = _claim_parser_method(status, elements)
    parser_status = _claim_parser_status(status, elements)

    return ParsedClaim(
        claim_number=claim_number,
        raw_text=raw_text,
        normalized_text=normalized_text,
        status=status,
        is_independent=is_independent,
        dependency_claim_numbers=dependencies,
        elements=elements,
        parser_confidence=parser_confidence,
        parser_method=parser_method,
        parser_status=parser_status,
    )


def _parse_elements(
    claim_body: str,
    status: str,
    llm_parser: LLMElementParser | None,
) -> list[ParsedClaimElement]:
    if status != "active":
        return []

    rule_elements = split_claim_elements(claim_body)
    if _has_confident_rule_split(rule_elements):
        return rule_elements

    if llm_parser is None:
        return rule_elements

    llm_elements = _validated_llm_elements(claim_body, llm_parser(claim_body))
    return llm_elements or rule_elements


def _has_confident_rule_split(elements: list[ParsedClaimElement]) -> bool:
    return (
        len(elements) > 1
        and min(element.parser_confidence for element in elements)
        >= CONFIDENT_RULE_SPLIT_THRESHOLD
    )


def _validated_llm_elements(
    claim_body: str,
    candidate_elements: Iterable[str | ParsedClaimElement],
) -> list[ParsedClaimElement]:
    elements: list[ParsedClaimElement] = []
    for candidate in candidate_elements:
        if isinstance(candidate, ParsedClaimElement):
            text = candidate.text.strip()
            source_span = candidate.source_span.strip()
        else:
            text = str(candidate).strip()
            source_span = text

        if len(text) < 4 or not source_span or source_span not in claim_body:
            continue

        elements.append(
            ParsedClaimElement(
                text=text,
                source_span=source_span,
                parser_confidence=LLM_VALIDATED_CONFIDENCE,
                parser_method=PARSER_METHOD_LLM_ASSISTED,
                parser_status=PARSER_STATUS_PARSED,
            )
        )
        if len(elements) >= MAX_ELEMENTS_PER_CLAIM:
            break

    return elements


def _claim_confidence(status: str, elements: list[ParsedClaimElement]) -> float:
    if status == "deleted":
        return 0.95
    if not elements:
        return 0.0
    return min(element.parser_confidence for element in elements)


def _claim_parser_method(status: str, elements: list[ParsedClaimElement]) -> str:
    if status == "deleted":
        return PARSER_METHOD_RULE_BASED
    if not elements:
        return PARSER_METHOD_FALLBACK

    methods = {element.parser_method for element in elements}
    if len(methods) == 1:
        return methods.pop()
    return "mixed"


def _claim_parser_status(status: str, elements: list[ParsedClaimElement]) -> str:
    if status == "deleted":
        return PARSER_STATUS_SKIPPED
    if not elements:
        return PARSER_STATUS_FAILED
    if any(element.parser_status == PARSER_STATUS_UNCERTAIN for element in elements):
        return PARSER_STATUS_UNCERTAIN
    return PARSER_STATUS_PARSED
