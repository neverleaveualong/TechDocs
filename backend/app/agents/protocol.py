from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, TypedDict


class AgentAction(str, Enum):
    ANALYZE = "analyze"
    SEARCH = "search"
    INGEST = "ingest"
    GENERATE = "generate"
    DONE = "done"


@dataclass
class AgentMessage:
    sender: str
    action: AgentAction
    payload: dict[str, Any] = field(default_factory=dict)
    reasoning: str = ""


@dataclass
class SupervisorDecision:
    next_action: AgentAction
    reasoning: str
    parameters: dict[str, Any] = field(default_factory=dict)


class QueryPlanWrapper:
    """LangGraph State에 저장된 dict 형태의 query_plan을 원래 객체(dot-notation)처럼 사용하도록 감싸는 래퍼"""
    def __init__(self, data: dict):
        self._data = data or {}

    def __getattr__(self, name: str) -> Any:
        if name in self._data:
            return self._data[name]
        
        # camelCase -> snake_case 변환 및 매핑 지원
        import re
        snake_name = re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()
        if snake_name in self._data:
            return self._data[snake_name]
        
        # 기본값 반환 (필드 부재 시 에러 대신 빈 리스트/문자열)
        if name in ("technical_features", "search_keywords", "synonyms", "ipc_candidates", "kipris_queries", "applicant_candidates"):
            return []
        return ""

    def to_event_data(self) -> dict:
        return {
            "intent": self.intent,
            "summary": self.summary,
            "technicalFeatures": self.technical_features,
            "searchKeywords": self.search_keywords,
            "synonyms": self.synonyms,
            "ipcCandidates": self.ipc_candidates,
            "ragQuery": self.rag_query,
            "kiprisQueries": self.kipris_queries,
            "applicantCandidates": self.applicant_candidates,
        }


# LangGraph State 정의
class RAGAgentState(TypedDict, total=False):
    query: str                                # 최초 사용자 질문
    query_plan: Any                           # 검색 계획 (PatentQueryPlan)
    top_k: int                                # Search result limit
    use_hybrid: bool                          # Whether hybrid retrieval is requested
    auto_ingest: bool                         # 자동 수집 활성화 여부
    sources: list[dict]                       # 검색된 소스 특허 목록
    best_score: float                         # 최고 관련도 점수
    matched_terms: list[str]                  # 매칭된 키워드 목록
    quality_reason: str                       # 품질 판정 이유
    ingest_done: bool                         # 자동 수집 완료 여부
    ingest_result: dict | None                # KIPRIS 수집 결과 수치
    answer: str                               # 최종 생성 답변
    citation_valid: bool                      # 답변 내 출처 신뢰도 검증 결과
    history: list[AgentMessage]               # 에이전트 대화 히스토리 기록
    next_action: AgentAction                  # Supervisor가 결정한 다음 행동
    next_parameters: dict[str, Any]           # 다음 행동 시 필요한 파라미터 (strategy, top_k 등)
    _latest_decision: dict                    # Supervisor 최신 결정 이벤트 (SSE 스트리밍용)
    _latest_agent_event: dict                 # 에이전트 완료 최신 이벤트 (SSE 스트리밍용)
    prompt_value: Any                         # LLM 답변 생성을 위한 최종 프롬프트 값


