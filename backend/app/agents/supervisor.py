from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.agents.protocol import AgentAction, AgentMessage, SupervisorDecision

logger = logging.getLogger(__name__)

SUPERVISOR_PROMPT = """\
당신은 특허 검색 시스템의 Supervisor입니다.
각 단계의 결과를 검토하고 다음 행동을 결정하세요.

## 사용 가능한 행동
- SEARCH: 검색 실행. parameters에 strategy(hybrid/vector), top_k 포함.
- INGEST: KIPRIS에서 데이터 수집. 검색 결과 부족 시만.
- GENERATE: 충분한 근거가 있으므로 답변 생성.
- DONE: 모든 작업 완료.

## 판단 기준
- 검색 결과 0건 → INGEST
- 검색 결과 관련도 낮음 (best_score < 0.5 또는 matched_terms 0건) → INGEST
- 충분한 근거 (sources ≥ 1, 키워드 겹침 있음) → GENERATE
- INGEST 후에도 부족 → GENERATE (빈 결과로 "관련 특허 없음" 응답)
- INGEST는 최대 1회

## 현재 상태
{state}

## 이전 행동 히스토리
{history}

다음 행동을 JSON으로 응답하세요:
{{"action": "SEARCH|INGEST|GENERATE|DONE", "reasoning": "판단 이유", "parameters": {{}}}}
"""


class SupervisorAgent:
    """LLM으로 다음 행동을 판단하는 핵심 에이전트."""

    def __init__(self, llm):
        self.llm = llm
        self.max_iterations: int = 4
        self.iteration: int = 0
        self.history: list[AgentMessage] = []

    async def decide(self, state: dict[str, Any]) -> SupervisorDecision:
        """현재 상태를 LLM에 보여주고 다음 행동을 결정한다."""
        self.iteration += 1

        if self.iteration > self.max_iterations:
            logger.warning(
                "Max iterations (%d) reached, forcing GENERATE",
                self.max_iterations,
            )
            return SupervisorDecision(
                next_action=AgentAction.GENERATE,
                reasoning=f"최대 반복 횟수({self.max_iterations})에 도달하여 강제 생성",
            )

        prompt = SUPERVISOR_PROMPT.format(
            state=self._format_state(state),
            history=self._format_history(),
        )

        try:
            response = await self.llm.ainvoke(prompt)
            decision = self._parse_decision(response)
            logger.info(
                "Supervisor decision (iter %d): %s – %s",
                self.iteration,
                decision.next_action.value,
                decision.reasoning,
            )
            return decision
        except Exception as exc:
            logger.warning("LLM 판단 실패, fallback 사용: %s", exc)
            return self._fallback_decision(state)

    def record(self, message: AgentMessage) -> None:
        """히스토리에 에이전트 메시지를 추가한다."""
        self.history.append(message)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _format_state(self, state: dict[str, Any]) -> str:
        """state를 LLM이 이해할 수 있는 문자열로 변환한다."""
        lines: list[str] = []
        key_labels = {
            "query": "사용자 질문",
            "source_count": "검색된 문서 수",
            "best_score": "최고 관련도 점수",
            "matched_terms": "겹치는 키워드",
            "quality_reason": "품질 판정 이유",
            "ingest_done": "수집 완료 여부",
            "ingest_result": "수집 결과",
        }
        for key, label in key_labels.items():
            if key in state:
                value = state[key]
                if isinstance(value, list):
                    value = ", ".join(str(v) for v in value) if value else "(없음)"
                elif isinstance(value, dict):
                    value = json.dumps(value, ensure_ascii=False)
                lines.append(f"- {label}: {value}")
        return "\n".join(lines) if lines else "(상태 정보 없음)"

    def _format_history(self) -> str:
        """이전 에이전트 행동을 요약 문자열로 변환한다."""
        if not self.history:
            return "(없음)"
        summaries: list[str] = []
        for msg in self.history:
            summaries.append(f"[{msg.sender}] {msg.action.value}: {msg.reasoning}")
        return "\n".join(summaries)

    def _parse_decision(self, response) -> SupervisorDecision:
        """LLM 응답에서 JSON을 파싱하여 SupervisorDecision을 반환한다."""
        text = response.content if hasattr(response, "content") else str(response)

        # 코드블록(```json ... ```) 안의 JSON 추출
        code_block = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
        if code_block:
            text = code_block.group(1).strip()

        data = json.loads(text)

        action_str = data.get("action", "GENERATE").upper()
        try:
            action = AgentAction(action_str.lower())
        except ValueError:
            logger.warning("Unknown action '%s', defaulting to GENERATE", action_str)
            action = AgentAction.GENERATE

        return SupervisorDecision(
            next_action=action,
            reasoning=data.get("reasoning", ""),
            parameters=data.get("parameters", {}),
        )

    def _fallback_decision(self, state: dict[str, Any]) -> SupervisorDecision:
        """LLM 실패 시 규칙 기반 fallback 결정을 반환한다."""
        source_count = state.get("source_count", 0)
        quality_reason = state.get("quality_reason", "")
        ingest_done = state.get("ingest_done", False)

        needs_ingest_reasons = {"no_sources", "low_retrieval_score", "low_keyword_overlap"}

        if not ingest_done and (
            source_count == 0 or quality_reason in needs_ingest_reasons
        ):
            return SupervisorDecision(
                next_action=AgentAction.INGEST,
                reasoning=f"Fallback: source_count={source_count}, quality_reason={quality_reason} → INGEST",
            )

        return SupervisorDecision(
            next_action=AgentAction.GENERATE,
            reasoning=f"Fallback: source_count={source_count}, ingest_done={ingest_done} → GENERATE",
        )
