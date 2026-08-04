"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import AgentTimeline from "@/components/search/AgentTimeline";
import PatentDetailModal from "@/components/patent/PatentDetailModal";
import type { ClaimLensCandidate, ClaimLensEvent, ClaimLensEventType } from "@/types/claimlens";
import type { PatentSource, SearchStreamEvent } from "@/types/search";

function transformClaimLensEvents(events: ClaimLensEvent[]): SearchStreamEvent[] {
  const allowedTypes: ClaimLensEventType[] = [
    "step_started",
    "step_completed",
    "supervisor_decision",
    "auto_ingest_started",
    "auto_ingest_completed",
    "retry_search",
    "query_plan",
  ];

  const filteredEvents = events.filter((event) => allowedTypes.includes(event.type));

  return filteredEvents.map((event) => {
    const anyE = event as Record<string, any>;
    if (event.type === "step_started") {
      return {
        type: "agent_action",
        agent: String(anyE.step ?? "analyzer"),
        message: String(anyE.message ?? "특허 청구범위를 파싱 및 탐색 중입니다."),
      } as SearchStreamEvent;
    }
    if (event.type === "step_completed") {
      return {
        type: "agent_completed",
        agent: String(anyE.step ?? "analyzer"),
        reasoning: "해당 검토 단계를 완료했습니다.",
      } as SearchStreamEvent;
    }
    if (event.type === "supervisor_decision") {
      const data = anyE.data || {};
      return {
        type: "agent_decision",
        agent: "supervisor",
        decision: {
          next_action: String(data.action ?? "CONTINUE"),
          reasoning: String(anyE.message ?? data.reason ?? "특허 권리범위를 대조 중입니다."),
          parameters: data,
        }
      } as SearchStreamEvent;
    }
    if (event.type === "auto_ingest_started" || event.type === "retry_search") {
      return {
        type: event.type,
        message: String(anyE.message ?? "KIPRIS 특허 수집을 보강 중입니다."),
      } as SearchStreamEvent;
    }
    if (event.type === "auto_ingest_completed") {
      return {
        type: "auto_ingest_completed",
        data: anyE.data || {},
      } as SearchStreamEvent;
    }
    if (event.type === "query_plan") {
      return {
        type: "query_plan",
        data: anyE.data || {},
      } as SearchStreamEvent;
    }
    return {
      type: "agent_action",
      agent: "analyzer",
      message: String(anyE.message ?? `${event.type} 이벤트`),
    } as SearchStreamEvent;
  });
}

export function getToolResultArray<T>(events: ClaimLensEvent[], toolName: string, keyName: string): T[] {
  const matchingEvents = events.filter((e) => {
    const anyE = e as Record<string, any>;
    return e.type === "tool_result" && anyE.tool_name === toolName && anyE.result;
  });
  if (matchingEvents.length === 0) return [];
  const lastEvent = matchingEvents[matchingEvents.length - 1] as Record<string, any>;
  const resultObj = (lastEvent.result || {}) as Record<string, unknown>;
  const arr = resultObj[keyName];
  return Array.isArray(arr) ? (arr as T[]) : [];
}

interface ClaimLensResultProps {
  query: string;
  events: ClaimLensEvent[];
  isLoading: boolean;
  features: string[];
  candidates: ClaimLensCandidate[];
  chartRows: ClaimLensEvent[];
  reportMarkdown: string;
  onStop: () => void;
  onReset: () => void;
}

export default function ClaimLensResult({
  query,
  events,
  isLoading,
  features,
  candidates,
  chartRows,
  reportMarkdown,
  onStop,
  onReset,
}: ClaimLensResultProps) {
  const [selectedPatent, setSelectedPatent] = useState<PatentSource | null>(null);

  const transformedEvents = transformClaimLensEvents(events);
  const latestDecision = events.findLast((e) => e.type === "supervisor_decision");

  return (
    <div className="space-y-6">
      {/* 📌 특허 침해 분석 진행 상황 타임라인 */}
      <AgentTimeline events={transformedEvents} />

      {/* 품질 판정 안내 */}
      <QualityBanner decision={latestDecision} />

      {/* 📌 특허 침해 분석 보고서 & 불릿포인트 대조표 */}
      <div className="space-y-6">
        <ReportPanel markdown={reportMarkdown} query={query} />
        <ClaimChartPanel rows={chartRows} />
      </div>

      {/* 📌 핵심 구성요소 및 검토 후보 특허 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SmallPanel title="제품 핵심 기능 구성요소" count={features.length}>
          {features.length === 0 ? (
            <p className="text-xs text-gray-500 font-medium py-1">
              {isLoading
                ? "입력된 제품 기술 설명에서 핵심 구성요소를 추출하는 중입니다..."
                : "입력된 제품 설명에서 추출된 별도 핵심 기능 사양이 없습니다."}
            </p>
          ) : (
            <div className="space-y-2">
              {features.map((feature, index) => (
                <div key={index} className="flex items-start gap-2 text-xs text-gray-800 font-medium">
                  <span className="font-bold text-teal-700 select-none">•</span>
                  <span><strong className="text-gray-900 font-bold">구성요소 {index + 1}:</strong> {String(feature)}</span>
                </div>
              ))}
            </div>
          )}
        </SmallPanel>

        <CandidatePanel candidates={candidates} isLoading={isLoading} onOpenPatent={setSelectedPatent} />
      </div>

      {selectedPatent && (
        <PatentDetailModal patent={selectedPatent} onClose={() => setSelectedPatent(null)} />
      )}

      {/* 버튼 액션 */}
      <div className="flex justify-center gap-3 pt-2">
        {isLoading && (
          <button
            onClick={onStop}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100"
          >
            <i className="ri-stop-circle-line text-sm" />
            분석 중단
          </button>
        )}
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 transition hover:border-teal-200 hover:text-teal-700"
        >
          <i className="ri-refresh-line" />
          새 침해 분석
        </button>
      </div>
    </div>
  );
}

function QualityBanner({ decision }: { decision?: ClaimLensEvent }) {
  const data = ((decision as any)?.data as Record<string, unknown>) || {};
  const grade = String(data.qualityGrade ?? "");
  if (!grade) return null;

  const summary = String(data.confidenceSummary ?? "분석 신뢰도를 측정 중입니다.");
  const isGood = grade === "good";

  return (
    <div className={`rounded-xl border p-4 shadow-2xs ${isGood ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${isGood ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {isGood ? "✓" : "!"}
        </span>
        <div className="space-y-1">
          <h4 className={`text-xs font-bold ${isGood ? "text-emerald-900" : "text-amber-900"}`}>
            분석 신뢰도: {isGood ? "양호 (Good)" : "보강 필요 (Insufficient)"}
          </h4>
          <p className={`text-xs leading-relaxed ${isGood ? "text-emerald-800" : "text-amber-800"}`}>{summary}</p>
        </div>
      </div>
    </div>
  );
}

function ReportPanel({ markdown }: { markdown: string; query: string }) {
  if (!markdown) return null;

  // 1. 조잡한 대시 및 개발자 텍스트/거대 공백 전면 정제!
  const cleanedText = markdown
    .replace(/matched:\s*\d+/gi, "")
    .replace(/partial:\s*\d+/gi, "")
    .replace(/not_found:\s*\d+/gi, "")
    .replace(/uncertain:\s*\d+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 2. 대시(`- - - -`) 및 불릿 기호 중첩 파싱 100% 제거
  const bulletSentences = cleanedText
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim().replace(/^[-*•\s]+/g, "").replace(/\*\*/g, ""))
    .filter((s) => s.length > 5 && !s.startsWith("기술 검토 초안") && !s.startsWith("분석 한계"));

  return (
    <div className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700 border border-teal-100">
            <i className="ri-scales-3-line text-sm" />
          </div>
          <h3 className="text-sm font-bold text-gray-900">특허 침해 종합 분석 보고서</h3>
        </div>
        <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700 border border-teal-100">
          검토 보고서
        </span>
      </div>

      <div className="rounded-xl border border-teal-100 bg-teal-50/30 p-5 space-y-3">
        <h4 className="text-xs font-bold text-teal-900 uppercase tracking-wider">■ 침해 위험 분석 핵심 요약</h4>
        <div className="space-y-2 text-xs text-gray-800 font-medium">
          {bulletSentences.length > 0 ? (
            bulletSentences.map((sentence, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="font-bold text-teal-600 shrink-0 select-none">•</span>
                <span className="leading-relaxed text-gray-800">{sentence}</span>
              </div>
            ))
          ) : (
            <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
              <ReactMarkdown>{cleanedText}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClaimChartPanel({ rows }: { rows: ClaimLensEvent[] }) {
  const validRows = rows.filter((r) => {
    const data = ((r as any).data || {}) as Record<string, unknown>;
    const claimText = String(data.claim_text || data.element_text || "").trim();
    return claimText !== "" && claimText !== "-";
  });

  if (validRows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs space-y-4">
      <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
        <i className="ri-table-line text-teal-600" />
        제품 기능 vs 특허 청구항 불릿 대조표
      </h3>

      <div className="space-y-3">
        {validRows.map((rowEvent, idx) => {
          const row = ((rowEvent as any).data || {}) as Record<string, unknown>;
          const featureName = String(row.feature_name || row.feature_text || `기능 ${idx + 1}`);
          const claimText = String(row.claim_text || row.element_text || "-");
          const status = String(row.status || row.match_status || "검토 중");
          const isMatch = status.includes("매칭") || status.includes("침해") || status.includes("일치");

          return (
            <div key={idx} className="rounded-xl border border-gray-150 bg-gray-50/60 p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900">• 제품 기능 {idx + 1}: {featureName}</span>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                  isMatch ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}>
                  {isMatch ? "침해/매칭 주의" : "차이점 확인"}
                </span>
              </div>
              <p className="text-gray-600 pl-3 leading-relaxed border-l-2 border-gray-200">
                특허 청구항 대조: <span className="text-gray-800 font-medium">{claimText}</span>
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SmallPanel({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-2xs space-y-3">
      <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
        <h4 className="text-xs font-bold text-gray-900">• {title}</h4>
        {count !== undefined && count > 0 && <span className="text-xs font-bold text-teal-700">{count}개</span>}
      </div>
      {children}
    </div>
  );
}

function CandidatePanel({
  candidates,
  isLoading,
  onOpenPatent,
}: {
  candidates: ClaimLensCandidate[];
  isLoading: boolean;
  onOpenPatent: (patent: PatentSource) => void;
}) {
  if (candidates.length === 0) {
    return (
      <SmallPanel title="대조 검토 특허 목록" count={0}>
        <p className="text-xs text-gray-500 font-medium py-1">
          {isLoading ? "대조 특허 후보를 탐색하는 중입니다..." : "대조 검토 특허 목록이 없습니다."}
        </p>
      </SmallPanel>
    );
  }

  return (
    <SmallPanel title="대조 검토 특허 목록" count={candidates.length}>
      <div className="space-y-2">
        {candidates.map((cand, idx) => {
          const anyCand = cand as Record<string, any>;
          const title = String(anyCand.invention_title || anyCand.title || anyCand.application_number || "특허 명세서");
          const applicant = String(anyCand.applicant_name || anyCand.applicant || "출원인 정보 없음");
          const appNum = String(anyCand.application_number || "");

          return (
            <div key={idx} className="flex items-center justify-between rounded-lg bg-gray-50 p-2.5 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 truncate">• {title}</p>
                <p className="text-[11px] text-gray-500">{applicant}</p>
              </div>
              <button
                onClick={() =>
                  onOpenPatent({
                    application_number: appNum,
                    invention_title: title,
                    applicant_name: applicant,
                    application_date: "",
                    register_status: "등록",
                    relevance_text: "",
                  })
                }
                className="ml-2 rounded-md bg-white border border-gray-200 px-2 py-1 text-[11px] font-bold text-gray-700 hover:border-teal-200 hover:text-teal-700"
              >
                상세보기
              </button>
            </div>
          );
        })}
      </div>
    </SmallPanel>
  );
}

export function AutoIngestDebugPanel({ events }: { events: SearchStreamEvent[] }) {
  void events;
  return null;
}
