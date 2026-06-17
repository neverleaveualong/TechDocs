from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import ValidationError

from app.core.llm import get_llm
from app.ingestion.query_terms import build_kipris_search_attempts
from app.models.patent_query import PatentQueryPlan

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a patent search query planner for a Korean patent AI service.
Convert the user's natural-language technology idea into compact search data.

Rules:
- Return JSON only.
- Do not provide legal advice or infringement conclusions.
- Separate applicant/company names from technical keywords.
- kipris_queries must be short Korean patent-search phrases, preferably 2 to 4 terms.
- Use broad technical synonyms that can match patent titles or abstracts.
- ipc_candidates may contain 0 to 3 high-confidence IPC prefixes such as G06V, G06N, H04N.
- intent must be one of: rag_search, claim_analysis, mixed.
"""

USER_PROMPT_TEMPLATE = """User technology query:
{query}

Return this JSON shape:
{{
  "intent": "rag_search | claim_analysis | mixed",
  "summary": "short Korean technical summary",
  "technical_features": ["feature"],
  "search_keywords": ["keyword"],
  "synonyms": ["synonym"],
  "ipc_candidates": ["IPC"],
  "rag_query": "compact semantic search query",
  "kipris_queries": ["2-4 term patent search phrase"],
  "applicant_candidates": ["company/applicant only"]
}}
"""


def build_patent_query_plan(query: str, *, intent_hint: str | None = None) -> PatentQueryPlan:
    fallback = _fallback_plan(query, intent_hint=intent_hint)
    try:
        plan = _llm_plan(query)
        return _sanitize_plan(plan, query=query, fallback=fallback, intent_hint=intent_hint)
    except Exception:
        logger.exception("Patent query agent failed; using fallback plan")
        return fallback


def _llm_plan(query: str) -> PatentQueryPlan:
    response = get_llm().invoke(
        [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=USER_PROMPT_TEMPLATE.format(query=query)),
        ]
    )
    content = response.content if hasattr(response, "content") else str(response)
    payload = _parse_json_object(str(content))
    return PatentQueryPlan.model_validate(payload)


def _parse_json_object(content: str) -> dict[str, Any]:
    stripped = content.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("LLM response did not contain a JSON object")
    return json.loads(stripped[start : end + 1])


def _sanitize_plan(
    plan: PatentQueryPlan,
    *,
    query: str,
    fallback: PatentQueryPlan,
    intent_hint: str | None,
) -> PatentQueryPlan:
    data = plan.model_dump()
    if intent_hint in {"rag_search", "claim_analysis", "mixed"}:
        data["intent"] = intent_hint
    data["summary"] = _clean_text(data.get("summary") or fallback.summary or query, max_len=200)
    data["rag_query"] = _clean_text(data.get("rag_query") or fallback.rag_query or query, max_len=300)
    for key in [
        "technical_features",
        "search_keywords",
        "synonyms",
        "ipc_candidates",
        "kipris_queries",
        "applicant_candidates",
    ]:
        data[key] = _clean_list(data.get(key) or [], max_items=6, max_len=60)

    if not data["kipris_queries"]:
        data["kipris_queries"] = fallback.kipris_queries
    if not data["search_keywords"]:
        data["search_keywords"] = fallback.search_keywords
    if not data["technical_features"]:
        data["technical_features"] = fallback.technical_features
    if not data["applicant_candidates"]:
        data["applicant_candidates"] = fallback.applicant_candidates

    try:
        return PatentQueryPlan.model_validate(data)
    except ValidationError:
        return fallback


def _fallback_plan(query: str, *, intent_hint: str | None = None) -> PatentQueryPlan:
    attempts = build_kipris_search_attempts(query, max_attempts=6)
    kipris_queries = _dedupe([attempt.value for attempt in attempts if attempt.field != "applicant"])
    applicant_candidates = _dedupe([attempt.value for attempt in attempts if attempt.field == "applicant"])
    keywords = _dedupe(kipris_queries + [query[:60]])
    intent = intent_hint if intent_hint in {"rag_search", "claim_analysis", "mixed"} else "mixed"
    return PatentQueryPlan(
        intent=intent,
        summary=query[:120],
        technical_features=keywords[:4],
        search_keywords=keywords[:4],
        rag_query=" ".join(keywords[:2]) if keywords else query,
        kipris_queries=kipris_queries[:4],
        applicant_candidates=applicant_candidates[:3],
    )


def _clean_text(value: str, max_len: int) -> str:
    return " ".join(str(value).strip().split())[:max_len]


def _clean_list(values: list[Any], *, max_items: int, max_len: int) -> list[str]:
    return _dedupe([_clean_text(str(value), max_len=max_len) for value in values if str(value).strip()])[:max_items]


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        key = value.lower()
        if not value or key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result
