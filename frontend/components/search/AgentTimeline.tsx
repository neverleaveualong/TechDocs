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

  // 전체 작업 완료 여부 확인
  const isAllDone = events.some((e) => e.type === "done");
  const hasError = events.some((e) => e.type === "error");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-md">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-teal-50 text-teal-600">
            <i className="ri-route-line text-sm" />
          </div>
          <h4 className="text-sm font-bold text-gray-900">Multi-Agent 오케스트레이션</h4>
        </div>
        <div className="flex items-center gap-1.5">
          {hasError ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 border border-red-100">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              오류 발생
            </span>
          ) : isAllDone ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 border border-green-100 animate-fade-in">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              모든 작업 완료
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-600 border border-teal-100 animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-ping" />
              에이전트 분석 중
            </span>
          )}
        </div>
      </div>

      <div className="relative border-l-2 border-gray-100 pl-4 ml-3.5 space-y-6">
        {timelineEvents.map((event, idx) => {
          const isLast = idx === timelineEvents.length - 1;
          const isActiveNode = isLast && !isAllDone && !hasError;

          let icon = "ri-checkbox-blank-circle-line";
          let iconColor = "text-gray-400 bg-gray-50 border-gray-200";
          let title = "";
          let agentBadge = "";
          let renderingDetails = null;

          if (event.type === "query_plan") {
            icon = "ri-compass-3-line";
            iconColor = "text-teal-600 bg-teal-50 border-teal-100";
            title = "검색 계획 수립 완료";
            agentBadge = "Query Analyzer";
            
            const data = event.data || {};
            const searchKeywords = (data.searchKeywords || data.search_keywords || []) as string[];
            const ipcCandidates = (data.ipcCandidates || data.ipc_candidates || []) as string[];
            const kiprisQueries = (data.kiprisQueries || data.kipris_queries || []) as string[];

            renderingDetails = (
              <div className="mt-2 space-y-1.5">
                <p className="text-xs text-gray-500 leading-relaxed font-medium">
                  분석 요약: <span className="text-gray-700">{String(data.summary || "")}</span>
                </p>
                {searchKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-[10px] text-gray-400 font-medium shrink-0">분석 키워드:</span>
                    {searchKeywords.map((kw, i) => (
                      <span key={i} className="rounded bg-teal-50/70 border border-teal-100/50 px-1.5 py-0.5 text-[9px] font-medium text-teal-700">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
                {ipcCandidates.length > 0 && (
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-[10px] text-gray-400 font-medium shrink-0">추천 IPC 분류:</span>
                    {ipcCandidates.map((ipc, i) => (
                      <span key={i} className="rounded bg-gray-100 border border-gray-200/50 px-1.5 py-0.5 text-[9px] font-mono font-medium text-gray-600">
                        {ipc}
                      </span>
                    ))}
                  </div>
                )}
                {kiprisQueries.length > 0 && (
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-[10px] text-gray-400 font-medium shrink-0">KIPRIS 조회 쿼리:</span>
                    {kiprisQueries.slice(0, 3).map((kq, i) => (
                      <span key={i} className="rounded bg-blue-50 border border-blue-100/50 px-1.5 py-0.5 text-[9px] font-medium text-blue-700">
                        {kq}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          } else if (event.type === "agent_decision") {
            icon = "ri-brain-line";
            iconColor = "text-indigo-600 bg-indigo-50 border-indigo-100";
            
            const nextAction = event.decision?.next_action || "";
            const isIngest = nextAction.toLowerCase() === "ingest";
            const isSearch = nextAction.toLowerCase() === "search";
            const isGenerate = nextAction.toLowerCase() === "generate";
            
            title = "다음 액션 결정";
            agentBadge = "Supervisor";

            const actionBadgeColor = isSearch
              ? "bg-teal-50 text-teal-700 border-teal-200"
              : isIngest
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : isGenerate
              ? "bg-rose-50 text-rose-700 border-rose-200"
              : "bg-gray-50 text-gray-700 border-gray-200";

            renderingDetails = (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400 font-medium">행동 지침:</span>
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${actionBadgeColor}`}>
                    {nextAction}
                  </span>
                  {event.decision?.parameters?.strategy && (
                    <span className="rounded bg-gray-50 border border-gray-150 px-1.5 py-0.5 text-[9px] font-medium text-gray-500 font-mono">
                      {String(event.decision.parameters.strategy)} (k={String(event.decision.parameters.top_k || 5)})
                    </span>
                  )}
                </div>
                {event.decision?.reasoning && (
                  <div className="relative pl-3 border-l-2 border-indigo-200/50">
                    <p className="text-xs text-gray-500 italic leading-relaxed whitespace-pre-line">
                      "{event.decision.reasoning}"
                    </p>
                  </div>
                )}
              </div>
            );
          } else if (event.type === "agent_action") {
            const agent = event.agent || "";
            icon = agent === "retriever" ? "ri-search-2-line" : agent === "generator" ? "ri-magic-line" : "ri-play-line";
            iconColor =
              agent === "retriever"
                ? "text-teal-600 bg-teal-50 border-teal-100"
                : "text-rose-600 bg-rose-50 border-rose-100";
            title = `${agent.charAt(0).toUpperCase() + agent.slice(1)} 작업 개시`;
            agentBadge = agent.charAt(0).toUpperCase() + agent.slice(1);
            renderingDetails = (
              <p className="mt-1 text-xs text-gray-600 font-medium leading-relaxed">
                {event.message || ""}
              </p>
            );
          } else if (event.type === "agent_completed") {
            const agent = event.agent || "";
            icon = "ri-checkbox-circle-line";
            iconColor = "text-green-600 bg-green-50 border-green-100";
            title = `${agent.charAt(0).toUpperCase() + agent.slice(1)} 작업 완료`;
            agentBadge = agent.charAt(0).toUpperCase() + agent.slice(1);
            
            const sourceCount = event.payload?.source_count || event.payload?.sources_count;
            const citationValid = event.payload?.citation_valid;

            renderingDetails = (
              <div className="mt-1 space-y-1">
                <p className="text-xs text-gray-500 leading-relaxed">
                  {event.reasoning || ""}
                </p>
                {sourceCount !== undefined && (
                  <div className="flex gap-2 text-[10px] font-semibold text-gray-400 mt-1">
                    <span>수집 특허: <strong className="text-gray-600">{String(sourceCount)}건</strong></span>
                    {citationValid !== undefined && (
                      <span>
                        출처 검증: 
                        <strong className={citationValid ? "text-green-600 ml-1" : "text-amber-600 ml-1"}>
                          {citationValid ? "통과 (신뢰)" : "미달 (할루시네이션 주의)"}
                        </strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          } else if (event.type === "auto_ingest_started") {
            icon = "ri-download-cloud-2-line";
            iconColor = "text-amber-600 bg-amber-50 border-amber-100";
            title = "특허 자동 수집 시작";
            agentBadge = "Ingest Agent";
            renderingDetails = (
              <p className="mt-1 text-xs text-gray-600 font-medium leading-relaxed">
                {event.message || ""}
              </p>
            );
          } else if (event.type === "auto_ingest_completed") {
            icon = "ri-checkbox-circle-line";
            iconColor = "text-green-600 bg-green-50 border-green-100";
            title = "특허 자동 수집 완료";
            agentBadge = "Ingest Agent";
            const saved = event.data?.patents_saved || 0;
            renderingDetails = (
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                KIPRIS 수집 완료. RAG 인덱싱 및 로컬 DB 저장: <strong className="text-gray-700">{saved}건</strong>
              </p>
            );
          } else if (event.type === "retry_search") {
            icon = "ri-refresh-line";
            iconColor = "text-blue-600 bg-blue-50 border-blue-100";
            title = "특허 재검색 시도";
            agentBadge = "Retriever";
            renderingDetails = (
              <p className="mt-1 text-xs text-gray-600 font-medium leading-relaxed">
                {event.message || ""}
              </p>
            );
          } else if (event.type === "search_quality") {
            icon = "ri-pulse-line";
            iconColor = "text-purple-600 bg-purple-50 border-purple-100";
            title = "검색 품질 평가";
            agentBadge = "Retriever";
            
            const bestScore = typeof event.data?.best_score === "number" ? event.data.best_score : undefined;
            const qualityReason = String(event.data?.reason || "unknown");
            const isLowScore = bestScore !== undefined && bestScore < 0.05;

            renderingDetails = (
              <div className="mt-1.5 flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-400 font-medium">품질 판정:</span>
                <span className={`rounded border px-1.5 py-0.2 text-[9px] font-bold ${
                  isLowScore ? "bg-red-50 text-red-700 border-red-150" : "bg-purple-50 text-purple-700 border-purple-150"
                }`}>
                  {qualityReason}
                </span>
                {bestScore !== undefined && (
                  <span className="font-mono text-[10px] text-gray-500">
                    최고 관련도 점수: <strong className="text-gray-700">{bestScore.toFixed(4)}</strong>
                  </span>
                )}
              </div>
            );
          }

          return (
            <div
              key={idx}
              className="relative group transition-all"
              data-agent-step={event.type}
              data-agent-name={agentBadge || "unknown"}
              data-agent-active={isActiveNode ? "true" : "false"}
              data-agent-status={isActiveNode ? "running" : "completed"}
            >
              {/* 왼쪽 타임라인 노드 아이콘 */}
              <div
                className={`absolute -left-[29px] top-1 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-transform group-hover:scale-110 ${iconColor} ${
                  isActiveNode ? "animate-pulse ring-2 ring-teal-100 ring-offset-1" : ""
                }`}
              >
                <i className={`${icon} text-[13px] ${isActiveNode && event.type === "agent_action" ? "animate-spin" : ""}`} />
              </div>

              {/* 타임라인 바디 */}
              <div className="pl-3.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-gray-800 tracking-tight">{title}</span>
                  {agentBadge && (
                    <span className="rounded bg-gray-50 px-1.5 py-0.5 text-[8.5px] font-bold text-gray-500 border border-gray-200/60 tracking-wider uppercase">
                      {agentBadge}
                    </span>
                  )}
                  {isActiveNode && (
                    <span className="inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 text-[8px] font-bold text-teal-600 border border-teal-150 animate-pulse">
                      <span className="h-1 w-1 rounded-full bg-teal-500" />
                      실행 중
                    </span>
                  )}
                </div>
                {renderingDetails}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
