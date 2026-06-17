from __future__ import annotations

import re
from dataclasses import dataclass


_TOKEN_RE = re.compile(r"[A-Za-z0-9가-힣+#.\-]{2,}")

_KNOWN_APPLICANTS = {
    "삼성전자",
    "삼성디스플레이",
    "삼성SDI",
    "엘지전자",
    "LG전자",
    "LG에너지솔루션",
    "엘지에너지솔루션",
    "SK하이닉스",
    "에스케이하이닉스",
    "현대자동차",
    "기아",
    "네이버",
    "카카오",
}

_APPLICANT_MARKERS = (
    "주식회사",
    "(주)",
    "㈜",
    "inc",
    "corp",
    "corporation",
    "co.",
    "ltd",
    "limited",
)

_STOPWORDS = {
    "관련",
    "사내",
    "기반",
    "사용자",
    "서비스",
    "시스템",
    "방법",
    "장치",
    "기술",
    "아이디어",
    "제품",
    "내용",
    "대한",
    "통해",
    "위한",
    "있는",
    "없는",
    "하는",
    "하고",
    "하면",
    "하여",
    "에서",
    "으로",
    "처럼",
    "그리고",
    "또는",
    "및",
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
}

_TECH_HINTS = {
    "ai",
    "ml",
    "llm",
    "rag",
    "api",
    "검색",
    "추천",
    "분석",
    "예측",
    "검출",
    "추출",
    "분류",
    "생성",
    "인식",
    "학습",
    "처리",
    "제어",
    "관리",
    "업로드",
    "저장",
    "전송",
    "압축",
    "암호",
    "인증",
    "센서",
    "배터리",
    "전지",
    "반도체",
    "디스플레이",
    "문서",
    "벡터",
    "임베딩",
    "냉각",
    "열관리",
    "자율주행",
    "클라우드",
    "데이터",
}


@dataclass(frozen=True)
class KiprisSearchAttempt:
    field: str
    value: str
    applicant: str | None = None

    def to_kipris_kwargs(self) -> dict[str, str]:
        kwargs = {"applicant": self.applicant} if self.applicant else {}
        if self.field == "applicant":
            return {"applicant": self.value}
        if self.field == "invention_title":
            return {**kwargs, "invention_title": self.value}
        if self.field == "abstract":
            return {**kwargs, "abstract": self.value}
        return {**kwargs, "keyword": self.value}


def build_kipris_search_attempts(query: str, max_attempts: int = 4) -> list[KiprisSearchAttempt]:
    normalized = _normalize_space(query)
    if not normalized:
        return []

    attempts: list[KiprisSearchAttempt] = []

    for applicant in _KNOWN_APPLICANTS:
        if applicant in normalized:
            attempts.append(KiprisSearchAttempt("applicant", applicant))

    if _looks_like_applicant(normalized):
        attempts.append(KiprisSearchAttempt("applicant", normalized))

    for keyword in _technical_keywords(normalized):
        attempts.append(KiprisSearchAttempt("invention_title", keyword))
        attempts.append(KiprisSearchAttempt("abstract", keyword))

    if not attempts:
        attempts.append(KiprisSearchAttempt("invention_title", normalized[:80]))

    return _dedupe_attempts(attempts)[:max_attempts]


def _looks_like_applicant(query: str) -> bool:
    lower = query.lower()
    if query in _KNOWN_APPLICANTS:
        return True
    if any(marker in lower for marker in _APPLICANT_MARKERS):
        return True
    return len(query) <= 20 and " " not in query and query.endswith(("전자", "자동차", "하이닉스"))


def _technical_keywords(query: str) -> list[str]:
    tokens = [
        _strip_korean_suffix(token)
        for token in _TOKEN_RE.findall(query)
    ]
    tokens = [
        token
        for token in tokens
        if len(token) >= 2 and token.lower() not in _STOPWORDS
        and token not in _KNOWN_APPLICANTS
    ]
    if not tokens:
        return []

    scored_candidates: list[tuple[str, int]] = []
    for size in (3, 2):
        for idx in range(0, max(0, len(tokens) - size + 1)):
            phrase_tokens = tokens[idx : idx + size]
            phrase = " ".join(phrase_tokens)
            if _has_tech_signal(phrase_tokens):
                scored_candidates.append((phrase, _score_phrase(phrase_tokens)))

    scored_candidates.extend((token, _score_token(token)) for token in set(tokens))
    candidates = [
        value
        for value, _ in sorted(scored_candidates, key=lambda item: item[1], reverse=True)
    ]
    return _dedupe_values(candidates)[:4]


def _has_tech_signal(tokens: list[str]) -> bool:
    return any(_score_token(token) > 1 for token in tokens)


def _score_token(token: str) -> int:
    lower = token.lower()
    score = 1
    for hint in _TECH_HINTS:
        if hint in lower:
            score += 2
    if re.search(r"[A-Za-z]", token):
        score += 1
    if len(token) >= 4:
        score += 1
    return score


def _score_phrase(tokens: list[str]) -> int:
    score = sum(_score_token(token) for token in tokens)
    if len(set(token.lower() for token in tokens)) < len(tokens):
        score -= 3
    return score


def _strip_korean_suffix(token: str) -> str:
    return re.sub(r"(을|를|이|가|은|는|에|의|로|으로|와|과|도|만|부터|까지|하면|하고|하는|하여)$", "", token)


def _normalize_space(value: str) -> str:
    return " ".join(value.strip().split())


def _dedupe_attempts(attempts: list[KiprisSearchAttempt]) -> list[KiprisSearchAttempt]:
    seen: set[tuple[str, str]] = set()
    result: list[KiprisSearchAttempt] = []
    for attempt in attempts:
        key = (attempt.field, attempt.value.lower())
        if key in seen:
            continue
        seen.add(key)
        result.append(attempt)
    return result


def _dedupe_values(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = _normalize_space(value)
        key = normalized.lower()
        if not normalized or key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result
