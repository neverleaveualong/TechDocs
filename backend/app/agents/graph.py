from typing import Any, Dict
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from app.agents.protocol import RAGAgentState, AgentAction, AgentMessage, QueryPlanWrapper
from app.agents.supervisor import SupervisorAgent
from app.agents.retriever import RetrieverAgent
from app.agents.ingest import IngestAgent
from app.agents.generator import GeneratorAgent
from app.core.rag_pipeline import rag_pipeline

# 에이전트 인스턴스 초기화
supervisor_agent = SupervisorAgent(llm=rag_pipeline.llm)
retriever_agent = RetrieverAgent(pipeline=rag_pipeline)
ingest_agent = IngestAgent()
generator_agent = GeneratorAgent(pipeline=rag_pipeline)


async def supervisor_node(state: RAGAgentState) -> Dict[str, Any]:
    """현재 상태를 보고 다음 행동을 결정하는 노드"""
    # Mock LLM 테스트 대응을 위한 동적 바인딩 보장
    supervisor_agent.llm = rag_pipeline.llm
    supervisor_agent.history = state.get("history", [])

    # SupervisorAgent가 처리할 상태 취합
    state_to_decide = {
        "query": state["query"],
        "source_count": len(state.get("sources", [])),
        "best_score": state.get("best_score", 0.0),
        "matched_terms": state.get("matched_terms", []),
        "quality_reason": state.get("quality_reason", "no_sources"),
        "ingest_done": state.get("ingest_done", False),
        "ingest_result": state.get("ingest_result"),
    }

    # Supervisor 결정 실행
    decision = await supervisor_agent.decide(state_to_decide)

    # 결정 사항을 State에 업데이트
    return {
        "next_action": decision.next_action,
        "next_parameters": decision.parameters,
        # API SSE 스트리밍에 감지할 수 있도록 decision 내용 전달
        "_latest_decision": {
            "type": "agent_decision",
            "agent": "supervisor",
            "decision": {
                "next_action": decision.next_action.value,
                "reasoning": decision.reasoning,
                "parameters": decision.parameters,
            },
        },
    }


async def retriever_node(state: RAGAgentState) -> Dict[str, Any]:
    """검색 및 품질 평가 노드"""
    qp = state.get("query_plan")
    if isinstance(qp, dict):
        qp = QueryPlanWrapper(qp)

    msg = AgentMessage(
        sender="supervisor",
        action=AgentAction.SEARCH,
        payload={
            "query": state["query"],
            "strategy": state.get("next_parameters", {}).get("strategy", "hybrid"),
            "top_k": state.get("next_parameters", {}).get("top_k", 5),
            "query_plan": qp,
        },
    )
    result_msg = await retriever_agent.execute(msg)

    sources = result_msg.payload.get("sources", [])
    quality = result_msg.payload.get("quality")

    best_score = max([s.get("score", 0.0) for s in sources]) if sources else 0.0
    terms = set()
    for s in sources:
        for term in s.get("matched_terms", []):
            terms.add(term)

    history = list(state.get("history", []))
    history.append(result_msg)

    # 검색된 결과와 평가 정보를 State에 갱신
    return {
        "sources": sources,
        "best_score": best_score,
        "matched_terms": list(terms),
        "quality_reason": quality.get("reason", "unknown") if quality else "unknown",
        "history": history,
        # API SSE 스트리밍을 위한 완료 이벤트 전달
        "_latest_agent_event": {
            "type": "agent_completed",
            "agent": "retriever",
            "reasoning": result_msg.reasoning,
            "payload": {
                "source_count": len(sources),
                "best_score": best_score,
            },
        },
    }


async def ingest_node(state: RAGAgentState) -> Dict[str, Any]:
    """KIPRIS 데이터 수집 노드"""
    # 자동 수집이 비활성화되어 있는 경우 실행 스킵
    if not state.get("auto_ingest", True):
        return {
            "ingest_done": True,
            "ingest_result": {
                "patents_found": 0,
                "patents_saved": 0,
                "rag_vectors_stored": 0,
                "should_retry_search": False,
                "event_data": {"status": "skipped", "message": "자동 수집이 꺼져 있어 생략합니다."},
            },
            "_latest_agent_event": {
                "type": "auto_ingest_completed",
                "data": {"status": "skipped", "message": "자동 수집 비활성화로 생략"},
            },
        }

    qp = state.get("query_plan")
    if isinstance(qp, dict):
        qp = QueryPlanWrapper(qp)

    msg = AgentMessage(
        sender="supervisor",
        action=AgentAction.INGEST,
        payload={
            "query": state["query"],
            "query_plan": qp,
        },
    )
    result_msg = await ingest_agent.execute(msg)

    history = list(state.get("history", []))
    history.append(result_msg)

    return {
        "ingest_done": True,
        "ingest_result": {
            "patents_found": result_msg.payload.get("patents_found", 0),
            "patents_saved": result_msg.payload.get("patents_saved", 0),
            "rag_vectors_stored": result_msg.payload.get("rag_vectors_stored", 0),
            "should_retry_search": result_msg.payload.get("should_retry_search", False),
            "event_data": result_msg.payload.get("event_data"),
        },
        "history": history,
        # API SSE 스트리밍 수집 완료 이벤트
        "_latest_agent_event": {
            "type": "auto_ingest_completed",
            "data": result_msg.payload.get("event_data"),
        },
    }


async def generator_node(state: RAGAgentState) -> Dict[str, Any]:
    """답변 생성 및 citation 신뢰도 검증 노드"""
    msg = AgentMessage(
        sender="supervisor",
        action=AgentAction.GENERATE,
        payload={
            "query": state["query"],
            "sources": state.get("sources", []),
        },
    )
    result_msg = await generator_agent.execute(msg)

    history = list(state.get("history", []))
    history.append(result_msg)

    return {
        "answer": result_msg.payload.get("answer", ""),
        "sources": result_msg.payload.get("sources", []),
        "citation_valid": result_msg.payload.get("citation_valid", True),
        "history": history,
        "prompt_value": result_msg.payload.get("prompt_value"),
        # API SSE 스트리밍 답변 완료 이벤트
        "_latest_agent_event": {
            "type": "agent_completed",
            "agent": "generator",
            "reasoning": result_msg.reasoning,
            "payload": {
                "sources_count": len(result_msg.payload.get("sources", [])),
                "citation_valid": result_msg.payload.get("citation_valid", True),
            },
        },
    }


def route_next_node(state: RAGAgentState) -> str:
    """Supervisor의 판단에 따른 조건부 분기 엣지"""
    action = state.get("next_action")
    if action == AgentAction.SEARCH:
        return "retriever"
    elif action == AgentAction.INGEST:
        return "ingest"
    elif action == AgentAction.GENERATE:
        return "generator"
    else:
        return END


# 4. StateGraph 워크플로우 정의
workflow = StateGraph(RAGAgentState)

# 노드 추가
workflow.add_node("supervisor", supervisor_node)
workflow.add_node("retriever", retriever_node)
workflow.add_node("ingest", ingest_node)
workflow.add_node("generator", generator_node)

# 그래프 시작점 설정
workflow.set_entry_point("supervisor")

# 조건부 분기 엣지 연결
workflow.add_conditional_edges(
    "supervisor",
    route_next_node,
    {
        "retriever": "retriever",
        "ingest": "ingest",
        "generator": "generator",
        END: END,
    },
)

# 자율 순환 엣지 연결
workflow.add_edge("retriever", "supervisor")
workflow.add_edge("ingest", "supervisor")
workflow.add_edge("generator", END)

# 체크포인터 바인딩 및 컴파일
memory_saver = MemorySaver()
rag_agent_graph = workflow.compile(checkpointer=memory_saver)
