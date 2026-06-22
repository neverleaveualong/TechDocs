"use client";

import type { SearchStreamEvent } from "@/types/search";

export default function AgentTimeline({ events }: { events: SearchStreamEvent[] }) {
  // 타임라인에 표시할 이벤트만 필터링
  const timelineEvents = events.filter((e) =>
    [
      "query_plan",
      "agent_decision",
      "agent_action",
      "agent_completed",
      "auto_ingest_started",
      "auto_ingest_completed",
      "retry_search",
      "search_quality",
    ].includes(e.type)
  );

  if (timelineEvents.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-teal-50 text-teal-600">
          <i className="ri-route-line text-sm" />
        </div>
        <h4 className="text-sm font-bold text-gray-900">Multi-Agent 오케스트레이션</h4>
      </div>

      <div className="relative border-l border-gray-200 pl-4 ml-3 space-y-5">
        {timelineEvents.map((event, idx) => {
          let icon = "ri-checkbox-blank-circle-line";
          let iconColor = "text-gray-400 bg-gray-50 border-gray-200";
          let title = "";
          let content = "";
          let agentBadge = "";

          if (event.type === "query_plan") {
            icon = "ri-compass-3-line";
            iconColor = "text-teal-600 bg-teal-50 border-teal-100";
            title = "검색 계획 수립 완료";
            agentBadge = "Query Analyzer";
            const keywords = Array.isArray(event.data?.search_keywords)
              ? event.data.search_keywords.join(", ")
              : "";
            content = `키워드 분석: ${keywords || "분석 완료"}`;
          } else if (event.type === "agent_decision") {
            icon = "ri-brain-line";
            iconColor = "text-indigo-600 bg-indigo-50 border-indigo-100";
            title = `다음 액션 결정: ${event.decision?.next_action}`;
            agentBadge = "Supervisor";
            content = event.decision?.reasoning || "";
          } else if (event.type === "agent_action") {
            const agent = event.agent || "";
            icon = agent === "retriever" ? "ri-search-2-line" : agent === "generator" ? "ri-magic-line" : "ri-play-line";
            iconColor =
              agent === "retriever"
                ? "text-teal-600 bg-teal-50 border-teal-100"
                : "text-rose-600 bg-rose-50 border-rose-100";
            title = `${agent.charAt(0).toUpperCase() + agent.slice(1)} 작업 개시`;
            agentBadge = agent.charAt(0).toUpperCase() + agent.slice(1);
            content = event.message || "";
          } else if (event.type === "agent_completed") {
            const agent = event.agent || "";
            icon = "ri-checkbox-circle-line";
            iconColor = "text-green-600 bg-green-50 border-green-100";
            title = `${agent.charAt(0).toUpperCase() + agent.slice(1)} 작업 완료`;
            agentBadge = agent.charAt(0).toUpperCase() + agent.slice(1);
            content = event.reasoning || "";
          } else if (event.type === "auto_ingest_started") {
            icon = "ri-download-cloud-2-line";
            iconColor = "text-amber-600 bg-amber-50 border-amber-100";
            title = "특허 자동 수집 시작";
            agentBadge = "Ingest Agent";
            content = event.message || "";
          } else if (event.type === "auto_ingest_completed") {
            icon = "ri-checkbox-circle-line";
            iconColor = "text-green-600 bg-green-50 border-green-100";
            title = "특허 자동 수집 완료";
            agentBadge = "Ingest Agent";
            const saved = event.data?.patents_saved || 0;
            content = `KIPRIS 수집 완료. 신규 저장된 특허: ${saved}건`;
          } else if (event.type === "retry_search") {
            icon = "ri-refresh-line";
            iconColor = "text-blue-600 bg-blue-50 border-blue-100";
            title = "특허 재검색 시도";
            agentBadge = "Retriever";
            content = event.message || "";
          } else if (event.type === "search_quality") {
            icon = "ri-pulse-line";
            iconColor = "text-purple-600 bg-purple-50 border-purple-100";
            title = "검색 품질 평가";
            agentBadge = "Retriever";
            const bestScore = typeof event.data?.best_score === "number" ? event.data.best_score : undefined;
            content = `품질 상태: ${event.data?.reason || "양호"}` + (bestScore !== undefined ? ` (최고점수: ${bestScore.toFixed(3)})` : "");
          }

          return (
            <div key={idx} className="relative group transition-all">
              {/* 왼쪽 타임라인 노드 아이콘 */}
              <div
                className={`absolute -left-[28px] top-1.5 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-transform group-hover:scale-110 ${iconColor}`}
              >
                <i className={`${icon} text-[13px]`} />
              </div>

              {/* 타임라인 바디 */}
              <div className="pl-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-gray-800">{title}</span>
                  {agentBadge && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold text-gray-500 border border-gray-200">
                      {agentBadge}
                    </span>
                  )}
                </div>
                {content && (
                  <p className="mt-1 text-xs text-gray-500 leading-relaxed whitespace-pre-line">
                    {content}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
