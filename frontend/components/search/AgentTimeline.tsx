// ============================================================
// 파일 역할: 검색과 ClaimLens Agent의 주요 진행 이벤트를 타임라인으로 표시한다.
//
// 작성자: 심우현
// 최종 수정일: 2026년 8월 11일
//
// 주요 책임:
// - 진행 이벤트 중복 제거와 최근 단계 요약
// - Agent별 작업 상태 표시
// - 기술 세부정보 펼침·접힘 제공
// ============================================================

"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { SearchStreamEvent } from "@/types/search";

const ipcCategoryMap: Record<string, string> = {
  H01M: "H01M (2차전지/배터리 기술)",
  G06N: "G06N (인공지능/신경망 기술)",
  G06F: "G06F (데이터 처리 시스템)",
  H04L: "H04L (디지털 정보 통신)",
  A61B: "A61B (의료 진단 기술)",
  B60L: "B60L (전기차 구동 제어)",
};

function getEventAgent(event: SearchStreamEvent): string | null {
  if (event.type === "agent_decision" || event.type === "agent_action" || event.type === "agent_completed") {
    return event.agent;
  }
  return null;
}

function getStringArray(data: Record<string, unknown>, primaryKey: string, legacyKey: string): string[] {
  const value = data[primaryKey] ?? data[legacyKey];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getEventDetails(event: SearchStreamEvent): Record<string, unknown> {
  switch (event.type) {
    case "query_plan":
    case "auto_ingest_completed":
    case "search_quality":
      return event.data;
    case "agent_decision":
      return event.decision;
    case "agent_completed":
      return event.payload ?? {};
    default:
      return {};
  }
}

export default function AgentTimeline({ events }: { events: SearchStreamEvent[] }) {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [showAllSteps, setShowAllSteps] = useState(false);

  const rawTimelineEvents = events.filter((e) =>
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

  // 같은 Agent의 연속 상태 이벤트는 사용자에게 중복 단계처럼 보이므로 하나만 표시한다.
  const timelineEvents = rawTimelineEvents.filter((event, index, arr) => {
    if (index === 0) return true;
    const previousEvent = arr[index - 1];

    if (event.type === previousEvent.type && getEventAgent(event) === getEventAgent(previousEvent)) return false;
    if (event.type === "agent_action" && previousEvent.type === "agent_action") return false;
    if (event.type === "agent_completed" && previousEvent.type === "agent_completed") return false;

    return true;
  });

  if (timelineEvents.length === 0) return null;

  const isAllDone = events.some((e) => e.type === "done");
  const hasError = events.some((e) => e.type === "error");

  const hasTooManySteps = timelineEvents.length > 3;
  const hiddenCount = hasTooManySteps ? timelineEvents.length - 3 : 0;

  const visibleEvents = showAllSteps || !hasTooManySteps
    ? timelineEvents
    : timelineEvents.slice(timelineEvents.length - 3);

  return (
    <div className="rounded-xl border border-gray-200/80 bg-white p-4.5 shadow-xs transition-all duration-300 space-y-3">
      <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6.5 w-6.5 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-100">
            <i className="ri-list-check-2 text-xs" />
          </div>
          <h4 className="text-xs font-bold text-gray-900">특허 분석 진행 상황</h4>
        </div>

        <div className="flex items-center gap-2">
          {hasError ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600 border border-red-150">
              오류 발생
            </span>
          ) : isAllDone ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-150">
              ✓ 분석 완료
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-150 animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-ping" />
              분석 진행 중
            </span>
          )}
        </div>
      </div>

      {hasTooManySteps && !showAllSteps && (
        <button
          onClick={() => setShowAllSteps(true)}
          className="w-full flex items-center justify-center gap-2 py-1 text-[11px] font-semibold text-gray-400 hover:text-teal-700 transition-colors border-y border-dashed border-gray-200 bg-gray-50/50 rounded-md"
        >
          <span>--- 이전 {hiddenCount}개 진행 단계 접혀있음 (클릭하여 펼치기) ---</span>
        </button>
      )}

      <div className="space-y-2.5">
        {visibleEvents.map((event, idx) => {
          const displayStepNumber = (showAllSteps || !hasTooManySteps)
            ? idx + 1
            : (timelineEvents.length - 3) + idx + 1;

          const isLast = idx === visibleEvents.length - 1;
          const isActive = isLast && !isAllDone && !hasError;

          if (event.type === "query_plan") {
            const data = event.data;
            const searchKeywords = getStringArray(data, "searchKeywords", "search_keywords");
            const ipcCandidates = getStringArray(data, "ipcCandidates", "ipc_candidates");

            return (
              <TimelineCard key={`${event.type}-${displayStepNumber}`} stepNumber={displayStepNumber} title="질문 파싱 & 키워드 수립" isActive={isActive}>
                <div className="space-y-1 text-xs text-gray-700">
                  {typeof data.summary === "string" && data.summary && (
                    <p className="font-semibold text-gray-900">• 분석 요약: <span className="font-medium text-gray-700">{data.summary}</span></p>
                  )}
                  {searchKeywords.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <span className="font-bold text-gray-500">• 추출 키워드:</span>
                      {searchKeywords.map((keyword) => (
                        <span key={keyword} className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-100">
                          #{keyword}
                        </span>
                      ))}
                    </div>
                  )}
                  {ipcCandidates.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <span className="font-bold text-gray-500">• 특허 분류:</span>
                      {ipcCandidates.map((ipc) => (
                        <span key={ipc} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 border border-gray-200">
                          {ipcCategoryMap[ipc] || ipc}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </TimelineCard>
            );
          }

          if (event.type === "agent_decision") {
            const nextAction = event.decision.next_action;
            const isIngest = String(nextAction).toLowerCase() === "ingest";
            const isSearch = String(nextAction).toLowerCase() === "search";

            return (
              <TimelineCard key={`${event.type}-${displayStepNumber}`} stepNumber={displayStepNumber} title="탐색 전략 결정" isActive={isActive}>
                <p className="text-xs text-gray-800 font-medium">
                  • 다음 작업: <strong className="text-teal-800">{isSearch ? "지식베이스 특허 탐색" : isIngest ? "실시간 KIPRIS 수집" : "답변 및 리포트 가공"}</strong>
                </p>
              </TimelineCard>
            );
          }

          if (event.type === "agent_action") {
            const isRetriever = event.agent === "retriever";

            return (
              <TimelineCard key={`${event.type}-${displayStepNumber}`} stepNumber={displayStepNumber} title={isRetriever ? "특허 문서 탐색" : "리포트 가공"} isActive={isActive}>
                <p className="text-xs text-gray-700 font-medium">
                  • {isRetriever ? "관련 특허 명세서를 대조 탐색 중입니다." : "검색 및 분석 결과를 정리하여 보고서를 작성 중입니다."}
                </p>
              </TimelineCard>
            );
          }

          if (event.type === "agent_completed") {
            const isRetriever = event.agent === "retriever";
            const payload = event.payload ?? {};
            const sourceCount = payload.source_count || payload.sources_count;

            return (
              <TimelineCard key={`${event.type}-${displayStepNumber}`} stepNumber={displayStepNumber} title={isRetriever ? "탐색 완료" : "리포트 작성 완료"} isCompleted>
                <p className="text-xs text-emerald-800 font-bold">
                  • {sourceCount !== undefined ? `가장 관련성이 높은 특허 ${String(sourceCount)}건 채택 완료` : "해당 검토 단계 완료"}
                </p>
              </TimelineCard>
            );
          }

          if (event.type === "auto_ingest_started" || event.type === "auto_ingest_completed") {
            const isDone = event.type === "auto_ingest_completed";
            const saved = event.type === "auto_ingest_completed" && typeof event.data.patents_saved === "number"
              ? event.data.patents_saved
              : 0;

            return (
              <TimelineCard key={`${event.type}-${displayStepNumber}`} stepNumber={displayStepNumber} title={isDone ? "KIPRIS 자동 수집 완료" : "KIPRIS 자동 수집 시작"} isActive={!isDone && isActive} isCompleted={isDone}>
                <p className="text-xs text-gray-700">
                  • {isDone ? `공공 API 연동 특허 ${saved}건 지식베이스 등록 완료` : "KIPRIS API 실시간 수집 실행 중..."}
                </p>
              </TimelineCard>
            );
          }

          return null;
        })}
      </div>

      {hasTooManySteps && showAllSteps && (
        <button
          onClick={() => setShowAllSteps(false)}
          className="w-full flex items-center justify-center gap-2 py-1 text-[11px] font-semibold text-gray-400 hover:text-teal-700 transition-colors border-y border-dashed border-gray-200 bg-gray-50/50 rounded-md"
        >
          <span>--- 최신 3개 단계만 접기 ---</span>
        </button>
      )}

      <div className="mt-2 border-t border-gray-100 pt-1.5 flex justify-end">
        <button
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
          className="text-[10px] font-semibold text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
        >
          <i className="ri-code-line text-xs" />
          {showTechnicalDetails ? "상세 알고리즘 정보 접기" : "상세 알고리즘 정보 보기"}
        </button>
      </div>

      {showTechnicalDetails && (
        <div className="mt-2 rounded-lg bg-gray-900 p-3 font-mono text-[10px] text-gray-300 space-y-1">
          {timelineEvents.map((e, i) => {
            return (
              <div key={i} className="truncate text-gray-400">
                <span className="text-teal-400">[{e.type}]</span> {JSON.stringify(getEventDetails(e))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimelineCard({
  stepNumber,
  title,
  children,
  isActive = false,
  isCompleted = false,
}: {
  stepNumber: number;
  title: string;
  children: ReactNode;
  isActive?: boolean;
  isCompleted?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-gray-200/80 p-3 transition-all space-y-1 ${
        isActive
          ? "bg-teal-50/40"
          : isCompleted
          ? "bg-white"
          : "bg-gray-50/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-4.5 w-4.5 items-center justify-center rounded bg-gray-100 text-[10px] font-black text-gray-700 border border-gray-200">
            {stepNumber}
          </span>
          <h5 className="text-xs font-bold text-gray-900">[{title}]</h5>
        </div>
        {isActive && (
          <span className="inline-flex items-center gap-1 rounded bg-teal-100 px-1.5 py-0.5 text-[9px] font-bold text-teal-800 border border-teal-200 animate-pulse">
            <span className="h-1 w-1 rounded-full bg-teal-600 animate-ping" />
            진행 중
          </span>
        )}
        {isCompleted && (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200">
            ✓ 완료
          </span>
        )}
      </div>
      <div className="pl-6">{children}</div>
    </div>
  );
}
