"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import SearchBar from "@/components/search/SearchBar";
import AiAnswer from "@/components/search/AiAnswer";
import SearchResults from "@/components/search/SearchResults";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import AgentTimeline from "@/components/search/AgentTimeline";
import { searchPatents, searchPatentsStream, streamClaimLensAnalysis } from "@/lib/api";
import type { ClaimLensEvent, ClaimLensEventType } from "@/types/claimlens";
import type { PatentSource, SearchStreamEvent } from "@/types/search";
import ReactMarkdown from "react-markdown";
import PatentDetailModal from "@/components/patent/PatentDetailModal";

type SearchMode = "rag" | "claimlens";
type Tone = "ok" | "warn" | "neutral";

const ragQueries = [
  { label: "2차전지 열 관리", icon: "ri-battery-charge-line" },
  { label: "반도체 세정 공정", icon: "ri-cpu-line" },
  { label: "ERP 클라우드", icon: "ri-cloud-line" },
  { label: "자율주행 센서", icon: "ri-car-line" },
  { label: "디스플레이 패널", icon: "ri-tv-line" },
];

const claimLensQueries = [
  { label: "사내 문서를 검색하고 답변 근거와 출처를 함께 제공하는 AI 문서 검색 시스템 특허", icon: "ri-file-search-line" },
  { label: "전기차 배터리 셀 전압과 온도 이력을 분석해 잔존 수명을 예측하는 배터리 진단 시스템", icon: "ri-battery-2-charge-line" },
  { label: "드론 열화상 이미지로 송전선 이상 발열을 탐지하고 정비 우선순위를 제공하는 설비 점검 시스템", icon: "ri-radar-line" },
];

export default function SearchPage() {
  const [mode, setMode] = useState<SearchMode>("rag");
  const [streamedAnswer, setStreamedAnswer] = useState("");
  const [streamedSources, setStreamedSources] = useState<PatentSource[]>([]);
  const [queryLogId, setQueryLogId] = useState<number | undefined>(undefined);
  const [ragEvents, setRagEvents] = useState<SearchStreamEvent[]>([]);
  const [claimLensEvents, setClaimLensEvents] = useState<ClaimLensEvent[]>([]);
  const [activeQuery, setActiveQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const searchRunRef = useRef(0);

  const handleSearch = async (query: string) => {
    abortRef.current?.abort();
    const runId = searchRunRef.current + 1;
    searchRunRef.current = runId;
    const isCurrentRun = () => searchRunRef.current === runId;

    setActiveQuery(query);
    setIsLoading(true);
    setIsStreaming(false);
    setError(null);
    setStreamedAnswer("");
    setStreamedSources([]);
    setQueryLogId(undefined);
    setRagEvents([]);
    setClaimLensEvents([]);

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      if (mode === "rag") {
        try {
          await searchPatentsStream(
            query,
            (event) => {
              if (!isCurrentRun()) return;
              setRagEvents((events) => [...events, event]);
              if (event.type === "sources") {
                setStreamedSources(event.sources);
                setIsLoading(false);
                setIsStreaming(true);
              } else if (event.type === "answer_delta") {
                setStreamedAnswer((prev) => prev + event.delta);
              } else if (event.type === "done") {
                setQueryLogId(event.query_log_id);
                setIsStreaming(false);
              }
            },
            5,
            { signal: controller.signal },
          );
        } catch (streamError) {
          if (!isCurrentRun()) return;
          if (streamError instanceof DOMException && streamError.name === "AbortError") {
            throw streamError;
          }
          const fallbackResult = await searchPatents(query);
          if (!isCurrentRun()) return;
          setStreamedAnswer(fallbackResult.answer);
          setStreamedSources(fallbackResult.sources);
          setQueryLogId(fallbackResult.query_log_id);
        }
      } else {
        await streamClaimLensAnalysis(
          query,
          (event) => {
            if (!isCurrentRun()) return;
            setClaimLensEvents((events) => [...events, event]);
          },
          { topK: 5, signal: controller.signal },
        );
      }
    } catch (err) {
      if (!isCurrentRun()) return;
      if (err instanceof DOMException && err.name === "AbortError") {
        setError(mode === "rag" ? "검색이 중단되었습니다." : "ClaimLens 검토가 중단되었습니다.");
      } else {
        setError(err instanceof Error ? err.message : "검색 중 오류가 발생했습니다.");
      }
    } finally {
      if (isCurrentRun()) {
        setIsLoading(false);
        setIsStreaming(false);
        abortRef.current = null;
      }
    }
  };

  const switchMode = (nextMode: SearchMode) => {
    abortRef.current?.abort();
    searchRunRef.current += 1;
    setMode(nextMode);
    setError(null);
    setStreamedAnswer("");
    setStreamedSources([]);
    setQueryLogId(undefined);
    setRagEvents([]);
    setClaimLensEvents([]);
    setActiveQuery("");
    setIsLoading(false);
    setIsStreaming(false);
  };

  const quickQueries = mode === "rag" ? ragQueries : claimLensQueries;
  const report = claimLensEvents.findLast((event) => event.type === "final_report");
  const chartRows = claimLensEvents.filter((event) => event.type === "claim_chart_row");
  const features = getToolResultArray(claimLensEvents, "extract_product_features", "features");
  const candidates = getToolResultArray(claimLensEvents, "search_claim_candidates", "candidates");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 shadow-sm">
                <i className={mode === "rag" ? "ri-robot-line text-sm text-white" : "ri-scales-3-line text-sm text-white"} />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
                  {mode === "rag" ? "특허 검색 (RAG)" : "특허 침해 분석 (AI AGENT)"}
                </h1>
                <p className="mt-0.5 text-xs font-medium text-gray-400">
                  {mode === "rag" ? "자연어 질문으로 관련 특허를 찾고 핵심 내용을 요약합니다." : "제품 기술 설명과 특허 청구범위를 대조하여 침해 위험을 분석합니다."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ModeButton
              active={mode === "rag"}
              icon="ri-search-line"
              title="특허 검색 (RAG)"
              subtitle="자연어 질문 기반 특허 검색 및 요약"
              onClick={() => switchMode("rag")}
            />
            <ModeButton
              active={mode === "claimlens"}
              icon="ri-scales-3-line"
              title="특허 침해 분석 (AI AGENT)"
              subtitle="제품 기술과 특허 청구범위 대조 분석"
              onClick={() => switchMode("claimlens")}
            />
          </div>

          <SearchBar
            onSearch={handleSearch}
            onCancel={() => abortRef.current?.abort()}
            isLoading={isLoading || isStreaming}
            buttonLabel={isLoading || isStreaming ? "중단" : "검색"}
            placeholder={
              mode === "rag"
                ? "찾고 싶은 기술을 문장으로 입력하세요. 예: 전기차 배터리 열 관리 기술"
                : "비교할 제품이나 기능을 구체적으로 입력하세요."
            }
          />

          {!streamedAnswer && streamedSources.length === 0 && claimLensEvents.length === 0 && !isLoading && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
              <span className="text-[11px] font-medium leading-7 text-gray-400">
                {mode === "rag" ? "추천 검색어" : "검토 예시"}
              </span>
              {quickQueries.map((q) => (
                <button
                  key={q.label}
                  onClick={() => handleSearch(q.label)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 transition-all hover:border-teal-100 hover:bg-teal-50 hover:text-teal-700"
                >
                  <i className={`${q.icon} text-[11px]`} />
                  {q.label}
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="mt-6">
          {isLoading && mode === "rag" && <LoadingSpinner message="특허를 검색하는 중입니다..." />}

          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <i className="ri-error-warning-line mt-0.5 shrink-0 text-lg text-red-400" />
              <div>
                <p className="mb-0.5 font-medium">{mode === "rag" ? "검색 오류" : "ClaimLens 오류"}</p>
                <p className="text-red-600">{error}</p>
              </div>
            </div>
          )}

          {mode === "rag" && (streamedAnswer || streamedSources.length > 0 || ragEvents.length > 0) && (
            <div className="space-y-4 animate-fade-in">
              <AgentTimeline events={ragEvents} />
              {(streamedAnswer || streamedSources.length > 0) && (
                <>
                  <AiAnswer answer={streamedAnswer} query={activeQuery} queryLogId={queryLogId} isStreaming={isStreaming} />
                  <SearchResults sources={streamedSources} />
                </>
              )}
              <AutoIngestDebugPanel events={ragEvents} />
              {(streamedAnswer || streamedSources.length > 0) && (
                <ResetButton
                  onClick={() => {
                    setStreamedAnswer("");
                    setStreamedSources([]);
                    setQueryLogId(undefined);
                    setRagEvents([]);
                  }}
                />
              )}
            </div>
          )}

          {mode === "claimlens" && (claimLensEvents.length > 0 || isLoading) && (
            <ClaimLensResult
              query={activeQuery}
              events={claimLensEvents}
              isLoading={isLoading}
              features={features}
              candidates={candidates}
              chartRows={chartRows}
              reportMarkdown={String(report?.data?.markdown ?? "")}
              onStop={() => abortRef.current?.abort()}
              onReset={() => {
                setClaimLensEvents([]);
                setError(null);
              }}
            />
          )}
        </div>

        {!streamedAnswer && streamedSources.length === 0 && claimLensEvents.length === 0 && !isLoading && !error && (
          <EmptyState mode={mode} />
        )}
      </main>
    </div>
  );
}

function ModeButton({
  active,
  icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  icon: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-xl border p-4 text-left transition-all duration-150 ${
        active
          ? "border-teal-300 bg-teal-50 text-teal-900 shadow-sm ring-2 ring-teal-100"
          : "border-gray-200 bg-gray-50 text-gray-600 hover:border-teal-200 hover:bg-white hover:text-gray-900"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          active ? "bg-teal-600 text-white" : "bg-white text-gray-400 group-hover:text-teal-600"
        }`}
      >
        <i className={`${icon} text-lg`} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{title}</span>
        <span className={`block text-[11px] font-semibold ${active ? "text-teal-700" : "text-gray-400"}`}>
          {subtitle}
        </span>
      </span>
      {active && <i className="ri-check-line ml-auto text-lg text-teal-600" />}
    </button>
  );
}

function transformClaimLensEvents(events: ClaimLensEvent[]): SearchStreamEvent[] {
  // 사용자에게 필요한 핵심 진행 단계만 타임라인에 노출하고, 상세 디버그성 이벤트나 반복되는 로우 데이터(claim_chart_row, tool_result 등)는 필터링합니다.
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
    if (event.type === "step_started") {
      return {
        type: "agent_action",
        agent: String(event.step ?? "analyzer"),
        message: String(event.message ?? "작업을 시작합니다."),
      } as SearchStreamEvent;
    }
    if (event.type === "step_completed") {
      return {
        type: "agent_completed",
        agent: String(event.step ?? "analyzer"),
        reasoning: "해당 단계를 성공적으로 완료했습니다.",
      } as SearchStreamEvent;
    }
    if (event.type === "supervisor_decision") {
      const data = event.data || {};
      return {
        type: "agent_decision",
        agent: "supervisor",
        decision: {
          next_action: String(data.action ?? "CONTINUE"),
          reasoning: String(event.message ?? data.reason ?? "검색 품질을 분석하고 다음 단계를 진단합니다."),
          parameters: data,
        }
      } as SearchStreamEvent;
    }
    if (event.type === "auto_ingest_started" || event.type === "retry_search") {
      return {
        type: event.type,
        message: String(event.message ?? "KIPRIS 데이터를 보강 중입니다."),
      } as SearchStreamEvent;
    }
    if (event.type === "auto_ingest_completed") {
      return {
        type: "auto_ingest_completed",
        data: event.data || {},
      } as SearchStreamEvent;
    }
    if (event.type === "query_plan") {
      return {
        type: "query_plan",
        data: event.data || {},
      } as SearchStreamEvent;
    }
    return {
      type: "agent_action",
      agent: "analyzer",
      message: String(event.message ?? `${event.type} 이벤트`),
    } as SearchStreamEvent;
  });
}

function AgentProgressTimeline({ events }: { events: ClaimLensEvent[] }) {
  const progressList: { label: string; status: "done" | "active" }[] = [];
  const completedSteps = new Set(events.filter((e) => e.type === "step_completed").map((e) => e.step));
  const startedSteps = new Set(events.filter((e) => e.type === "step_started").map((e) => e.step));

  // 1단계: 입력 분석
  if (startedSteps.has("input_analysis")) {
    progressList.push({
      label: "제품 기술 설명 분석 및 핵심 기능 요소 추출",
      status: completedSteps.has("input_analysis") ? "done" : "active",
    });
  }

  // 2단계: 후보 검색
  if (startedSteps.has("patent_search")) {
    progressList.push({
      label: "관련 특허 데이터베이스 탐색 및 대조 후보 선정",
      status: completedSteps.has("patent_search") ? "done" : "active",
    });
  }

  // 3단계: KIPRIS 보강 수집 감지
  const autoIngestStarted = events.some((e) => e.type === "auto_ingest_started");
  const autoIngestCompleted = events.some((e) => e.type === "auto_ingest_completed");
  if (autoIngestStarted) {
    progressList.push({
      label: "특허 데이터베이스 실시간 보강 수집 중 (KIPRIS API 연동)",
      status: autoIngestCompleted ? "done" : "active",
    });
  }

  // 4단계: 청구항 로딩
  if (startedSteps.has("claim_loading")) {
    progressList.push({
      label: "후보 특허의 청구 범위(독립 청구항) 파싱 및 로드",
      status: completedSteps.has("claim_loading") ? "done" : "active",
    });
  }

  // 5단계: 기능 매칭
  if (startedSteps.has("feature_matching")) {
    progressList.push({
      label: "제품 기능 구성요소와 청구항 침해 범위 비교 분석",
      status: completedSteps.has("feature_matching") ? "done" : "active",
    });
  }

  // 6단계: 리포트 생성
  if (startedSteps.has("report_generation")) {
    progressList.push({
      label: "종합 침해 가능성 진단 및 기술 검토 보고서 작성",
      status: completedSteps.has("report_generation") ? "done" : "active",
    });
  }

  if (progressList.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
        <i className="ri-loader-4-line animate-spin text-teal-600" />
        <span>AI AGENT 초기 분석 설계 수립 중...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {progressList.map((item, index) => (
        <div key={index} className="flex items-center gap-3 text-sm animate-fade-in">
          {item.status === "done" ? (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600">
              <i className="ri-checkbox-circle-fill text-base" />
            </div>
          ) : (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 animate-pulse">
              <i className="ri-loader-4-line animate-spin text-sm" />
            </div>
          )}
          <span className={item.status === "done" ? "font-medium text-gray-400 line-through decoration-gray-200" : "font-bold text-gray-800"}>
            {item.label}
            {item.status === "active" && "..."}
          </span>
        </div>
      ))}
    </div>
  );
}

function ClaimLensResult({
  query,
  events,
  isLoading,
  features,
  candidates,
  chartRows,
  reportMarkdown,
  onStop,
  onReset,
}: {
  query: string;
  events: ClaimLensEvent[];
  isLoading: boolean;
  features: unknown[];
  candidates: unknown[];
  chartRows: ClaimLensEvent[];
  reportMarkdown: string;
  onStop: () => void;
  onReset: () => void;
}) {
  // 1. 분석 진행 중(isLoading)일 때 보여줄 로딩 상태 뷰
  if (isLoading) {
    return (
      <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm animate-fade-in max-w-4xl mx-auto">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 shadow-sm animate-pulse">
              <i className="ri-scales-3-line text-xs text-white" />
            </div>
            <span className="text-sm font-bold text-gray-900">AI AGENT가 침해 분석을 수행 중입니다</span>
          </div>
          <button
            onClick={onStop}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition-all hover:bg-red-100"
          >
            중단
          </button>
        </div>

        <div className="py-2">
          <p className="text-xs font-semibold text-gray-400">분석 대상 기술 설명</p>
          <p className="mt-1.5 text-sm font-bold text-gray-800 leading-6">&ldquo;{query}&rdquo;</p>
        </div>

        <div className="border-t border-gray-50 pt-5">
          <AgentProgressTimeline events={events} />
        </div>
      </div>
    );
  }

  // 2. 분석 완료 후 보여줄 결과 상세 뷰
  const [selectedPatent, setSelectedPatent] = useState<any | null>(null);
  const latestDecision = events.filter((event) => event.type === "supervisor_decision").at(-1);
  const autoIngest = getAutoIngestData(events);
  const summary = buildClaimLensSummary(events, candidates, chartRows);

  // 구성요소 완비의 원칙(All Elements Rule) 기반 침해 위험도 진단
  const isHighRisk = summary.rowCount > 0 && summary.matchedCount === summary.rowCount;
  const isMediumRisk = summary.rowCount > 0 && (summary.matchedCount > 0 || events.some(e => asRecord(e.data).match === "partial"));
  const isLowRisk = summary.rowCount > 0 && summary.matchedCount === 0;

  const riskTitle = isHighRisk 
    ? "특허 침해 위험도 높음 (High Risk)" 
    : isMediumRisk 
      ? "특허 침해 위험도 보통 (Caution)" 
      : "특허 침해 위험도 매우 낮음 (Low Risk)";
  const riskDesc = isHighRisk
    ? "분석 대상 특허 청구항의 모든 구성요소가 제품 기능 설명에 포함되어 있어 특허 권리범위 침해 가능성이 매우 높습니다."
    : isMediumRisk
      ? "특허 청구항의 일부 구성요소가 제품 기능과 부분 일치하거나 연관되어 있어 추가적인 세부 검토가 필요합니다."
      : "특허 청구항의 필수 구성요소 중 제품 기능과 부합하는 항목이 없으므로 특허 침해(구성요소 완비 법칙) 가능성이 매우 희박합니다.";

  const riskColor = isHighRisk
    ? "border-red-200 bg-red-50 text-red-900"
    : isMediumRisk
      ? "border-amber-200 bg-amber-50/70 text-amber-900"
      : "border-green-200 bg-green-50 text-green-900";

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 shadow-sm">
              <i className="ri-scales-3-line text-xs text-white" />
            </div>
            <span className="text-sm font-bold text-gray-900">AI AGENT 분석 완료</span>
          </div>
          <button
            onClick={onReset}
            className="rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-1.5 text-xs font-bold text-teal-700 transition-all hover:bg-teal-100"
          >
            새 검토 시작
          </button>
        </div>
      </section>

      {/* 2. 종합 침해 위험도 진단 결과 배너 */}
      <section className={`rounded-xl border p-5 shadow-sm ${riskColor}`}>
        <div className="flex items-start gap-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isHighRisk ? "bg-red-100 text-red-600" : isMediumRisk ? "bg-amber-100 text-amber-600" : "bg-green-100 text-green-600"
          }`}>
            <i className={isHighRisk ? "ri-error-warning-fill text-xl" : isMediumRisk ? "ri-alert-fill text-xl" : "ri-checkbox-circle-fill text-xl"} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-extrabold">{riskTitle}</h2>
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                isHighRisk ? "bg-red-200 text-red-900" : isMediumRisk ? "bg-amber-200 text-amber-900" : "bg-green-200 text-green-900"
              }`}>
                매칭률 {summary.rowCount > 0 ? Math.round((summary.matchedCount / summary.rowCount) * 100) : 0}%
              </span>
            </div>
            <p className="mt-2 text-xs sm:text-sm leading-6 opacity-90">{riskDesc}</p>
            <p className="text-[11px] opacity-75 mt-1.5 font-medium">
              (총 {summary.claimElementCount}개 청구항 구성요소 중 제품 기능과 매칭되는 항목: {summary.matchedCount}개)
            </p>
          </div>
        </div>
      </section>

      {/* 에이전트 상세 타임라인 (특허 검색과 동일한 최소화/열기 토글 지원) */}
      <AgentTimeline events={transformClaimLensEvents(events)} />

      {/* 3. 분석 신뢰도 요약 배너 */}
      <QualityBanner decision={latestDecision} />

      {/* 4. 세로형 선형 흐름 (검토 보고서 -> 상세 대조표 순) */}
      <div className="space-y-6">
        <ReportPanel markdown={reportMarkdown} />
        <ClaimChartPanel rows={chartRows} />
      </div>

      {/* 5. 보조적인 분석 근거 데이터 영역 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SmallPanel title="제품 핵심 기능 구성요소" count={features.length}>
          <div className="mb-2 text-[10px] text-gray-500 font-medium leading-5">
            💡 AI 에이전트가 침해 분석을 위해 제품 설명에서 자동으로 정제한 핵심 기능 사양 목록입니다.
          </div>
          {features.length === 0 ? (
            <EmptyPanelText text="제품 기능 분석 데이터 없음" />
          ) : (
            features.map((feature, index) => (
              <div key={index} className="rounded-lg border border-gray-150 bg-gray-50/50 p-3 animate-fade-in">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                  <span className="text-[10px] font-bold text-gray-500">구성요소 {index + 1}</span>
                </div>
                <p className="mt-1.5 text-xs sm:text-sm font-medium leading-6 text-gray-700">{String(feature)}</p>
              </div>
            ))
          )}
        </SmallPanel>
        <CandidatePanel candidates={candidates} onOpenPatent={setSelectedPatent} />
      </div>

      {/* 특허 원문 상세보기 모달 */}
      {selectedPatent && (
        <PatentDetailModal patent={selectedPatent} onClose={() => setSelectedPatent(null)} />
      )}

      {/* 6. 에이전트 의사결정 상세 디버그 로그 (기본 접힘) */}
      <details className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-gray-900 hover:bg-gray-50 select-none flex items-center justify-between">
          <span>에이전트 판단 및 수집 상세 디버그 로그</span>
          <i className="ri-arrow-down-s-line text-gray-400" />
        </summary>
        <div className="border-t border-gray-100 p-5 space-y-4 bg-gray-50/50">
          <SupervisorDecisionPanel decision={latestDecision} autoIngest={autoIngest} />
          <AutoIngestDebugPanel events={events} />
          <EventLog events={events} />
        </div>
      </details>
    </div>
  );
}

function StepPill({ state }: { state: "done" | "running" | "waiting" }) {
  const label = state === "done" ? "완료" : state === "running" ? "진행" : "대기";
  const klass =
    state === "done"
      ? "bg-teal-50 text-teal-700"
      : state === "running"
        ? "bg-amber-50 text-amber-700"
        : "bg-gray-100 text-gray-400";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${klass}`}>{label}</span>;
}

function SummaryTile({ label, value, tone }: { label: string; value: ReactNode; tone: Tone }) {
  const klass =
    tone === "ok"
      ? "border-teal-100 bg-teal-50 text-teal-800"
      : tone === "warn"
        ? "border-amber-100 bg-amber-50 text-amber-800"
        : "border-gray-100 bg-white text-gray-800";
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${klass}`}>
      <p className="text-[11px] font-semibold opacity-70">{label}</p>
      <p className="mt-1 text-xl font-extrabold tracking-tight">{value}</p>
    </div>
  );
}

function QualityBanner({ decision }: { decision?: ClaimLensEvent }) {
  const data = asRecord(decision?.data);
  const grade = String(data.qualityGrade ?? "");
  if (!grade) return null;

  const summary = String(data.confidenceSummary ?? "분석 품질을 평가하는 중입니다.");
  const fields = Array.isArray(data.recommendedInputFields) ? data.recommendedInputFields.map(String) : [];
  const isGood = grade === "good";
  const isInsufficient = grade === "insufficient";

  if (isGood) {
    return (
      <section className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 shadow-sm animate-fade-in">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
            <i className="ri-shield-check-fill text-lg" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-extrabold text-teal-900">분석 신뢰도 양호</h4>
              <span className="rounded bg-teal-200/50 px-1.5 py-0.5 text-[9px] font-bold text-teal-800">
                신뢰 등급: Good
              </span>
            </div>
            <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-teal-800 opacity-90">{summary}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm animate-fade-in space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shadow-sm">
          <i className="ri-error-warning-fill text-xl" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-extrabold text-amber-900">제품 설명 보강 추천</h4>
            <span className="rounded bg-amber-250/60 px-2 py-0.5 text-[9px] font-bold text-amber-900 tracking-wide">
              신뢰도 등급: Insufficient (보강 필요)
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm leading-relaxed text-amber-800 font-medium">{summary}</p>
        </div>
      </div>

      {fields.length > 0 && (
        <div className="border-t border-amber-100 pt-3">
          <p className="text-[11px] font-bold text-amber-900 flex items-center gap-1 mb-2.5">
            <i className="ri-edit-box-line text-sm" />
            아래의 상세 사양을 제품 설명에 보완해 주시면 정밀한 분석이 가능합니다:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {fields.map((field) => (
              <div
                key={field}
                className="flex items-center gap-2 rounded-lg border border-amber-200/60 bg-amber-50/30 px-3 py-2 text-xs font-bold text-amber-800 transition-all hover:bg-amber-50"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-150 text-[9px] font-extrabold text-amber-800">
                  +
                </span>
                <span className="truncate">{field}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SupervisorDecisionPanel({
  decision,
  autoIngest,
}: {
  decision?: ClaimLensEvent;
  autoIngest: Record<string, unknown>;
}) {
  const data = asRecord(decision?.data);
  const shouldAutoIngest = data.shouldAutoIngest === true;
  const verdict = String(data.verdict ?? "대기 중");
  const action = String(data.action ?? "-");
  const reason = String(data.reason ?? "검색 품질 판정을 기다리는 중입니다.");
  const autoStatus = String(autoIngest.status ?? "");

  return (
    <section className={`rounded-xl border p-4 shadow-sm ${shouldAutoIngest ? "border-amber-200 bg-amber-50" : "border-teal-100 bg-white"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold text-gray-500">Supervisor Decision</p>
          <h2 className="mt-1 text-base font-extrabold text-gray-900">
            {shouldAutoIngest ? "검색 품질이 낮아 자동 수집을 시도합니다" : "검색 후보를 사용해 분석을 계속합니다"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">{reason}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge label={verdict} tone={shouldAutoIngest ? "warn" : "ok"} />
          <Badge label={action} tone="neutral" />
          {autoStatus ? <Badge label={`ingest: ${autoStatus}`} tone={autoStatus === "success" ? "ok" : "warn"} /> : null}
        </div>
      </div>
    </section>
  );
}

function CandidatePanel({ candidates, onOpenPatent }: { candidates: unknown[]; onOpenPatent: (patent: any) => void }) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h3 className="text-sm font-bold text-gray-900">대조 대상 특허 후보</h3>
        <span className="rounded border border-gray-100 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
          {candidates.length}
        </span>
      </div>
      <div className="p-3">
        {candidates.length === 0 ? (
          <EmptyPanelText text="후보 검색 대기 중" />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {candidates.map((candidate, index) => (
              <CandidateItem key={index} candidate={candidate} onOpenPatent={onOpenPatent} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AutoIngestDebugPanel({ events }: { events: Array<ClaimLensEvent | SearchStreamEvent> }) {
  const data = getAutoIngestData(events);
  const candidates = Array.isArray(data.rerankCandidates) ? data.rerankCandidates : [];
  if (!data.status && candidates.length === 0) {
    return null;
  }

  return (
    <SmallPanel title="자동 수집 결과" count={candidates.length}>
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-gray-800">{String(data.status ?? "-")}</span>
          <span className="font-mono text-[11px] text-gray-500">기준 {formatScore(data.rerankMinScore)}</span>
        </div>
        {typeof data.message === "string" && data.message.length > 0 && (
          <p className="mt-2 text-[11px] leading-5 text-gray-500">{data.message}</p>
        )}
      </div>
      {candidates.slice(0, 5).map((candidate, index) => {
        const item = asRecord(candidate);
        const selected = item.selected === true;
        const thresholdPassed = item.thresholdPassed === true;
        const fallbackPassed = item.fallbackPassed === true;
        const reason = String(item.selectionReason ?? "-");
        return (
          <div
            key={`${String(item.applicationNumber ?? index)}-${index}`}
            className={`rounded-lg border p-3 ${selected ? "border-teal-100 bg-teal-50/70" : "border-gray-100 bg-gray-50"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold leading-5 text-gray-900">{String(item.title ?? "제목 없음")}</p>
              <span className={`font-mono text-[11px] ${selected ? "text-teal-700" : "text-gray-500"}`}>{formatScore(item.score)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-gray-400">{String(item.applicationNumber ?? "-")}</span>
              <span className={`text-[10px] font-bold ${selected ? "text-teal-700" : "text-gray-400"}`}>
                {selected ? "selected" : "filtered"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge label={reason} tone={fallbackPassed ? "warn" : thresholdPassed ? "ok" : "neutral"} />
              {thresholdPassed ? <Badge label="기준 통과" tone="ok" /> : null}
              {fallbackPassed ? <Badge label="fallback 저장" tone="warn" /> : null}
            </div>
          </div>
        );
      })}
    </SmallPanel>
  );
}

function ClaimChartPanel({ rows }: { rows: ClaimLensEvent[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 bg-gray-50/30">
        <div>
          <h3 className="text-sm font-bold text-gray-900">청구항 구성요소 대조표</h3>
          <p className="text-[10px] text-gray-400 font-medium mt-0.5">
            ⚖️ 특허 침해 판단의 '구성요소 완비 법칙'에 따라 특허 청구범위 항목과 제품 기능을 1:1 대조합니다.
          </p>
        </div>
        <span className="rounded border border-teal-100 bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">
          대조 항목 {rows.length}개
        </span>
      </div>
      <div className="space-y-3 p-4">
        {rows.length === 0 ? (
          <EmptyPanelText text="매칭 결과 대기 중" />
        ) : (
          rows.map((row, index) => <ClaimChartRow key={index} event={row} />)
        )}
      </div>
    </section>
  );
}

function ClaimChartRow({ event }: { event: ClaimLensEvent }) {
  const data = asRecord(event.data);
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:border-teal-100 hover:shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2.5 flex-1 min-w-0">
          <div>
            <span className="inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">
              특허 청구항 구성요소
            </span>
            <p className="mt-1.5 text-xs sm:text-sm font-bold leading-6 text-gray-800 break-words">
              {String(data.claimElement ?? "-")}
            </p>
          </div>
          <div className="pt-2 border-t border-dashed border-gray-100">
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
              제품 기능 대응 여부
            </span>
            <p className="mt-1.5 text-xs sm:text-sm leading-6 text-gray-650 break-words font-medium">
              {String(data.productFeature ?? "해당 청구항 구성요소에 직접 대응하는 기능이 제품 사양서에 명시되지 않았습니다.")}
            </p>
          </div>
        </div>
        <div className="shrink-0 pt-1">
          <MatchBadge value={String(data.match ?? "unknown")} />
        </div>
      </div>

      {typeof data.evidence === "string" && data.evidence.length > 0 && (
        <div className="mt-3 rounded-lg border border-teal-100 bg-teal-50/30 p-3 text-[11px] leading-5 text-teal-800 font-medium">
          <strong className="block text-[10px] text-teal-700 font-bold mb-0.5">🔍 매칭 근거 및 증거</strong>
          {data.evidence}
        </div>
      )}
      {typeof data.uncertainty === "string" && data.uncertainty.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50/30 p-3 text-[11px] leading-5 text-amber-850 font-medium">
          <strong className="block text-[10px] text-amber-700 font-bold mb-0.5">⚠️ 분석 불확실성 / 보완 필요사항</strong>
          {data.uncertainty}
        </div>
      )}
    </div>
  );
}

function ReportPanel({ markdown }: { markdown: string }) {
  // 중복되는 "기술 검토 초안" 첫 타이틀 줄 제거
  const cleanedMarkdown = markdown
    ? markdown.replace(/^#+\s*기술\s*검토\s*초안\s*(\n+|$)/i, "")
    : "";

  return (
    <section className="overflow-hidden rounded-xl border border-teal-150 bg-gradient-to-br from-teal-50/10 to-white shadow-sm flex flex-col h-full transition-all hover:border-teal-250 hover:shadow-md">
      <div className="border-b border-teal-50 px-5 py-4 bg-teal-50/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-teal-100 text-teal-700">
            <i className="ri-file-list-3-line text-sm" />
          </div>
          <h3 className="text-sm font-bold text-gray-900">종합 기술 검토 보고서</h3>
        </div>
        <span className="rounded bg-teal-100/60 px-2 py-0.5 text-[9px] font-bold text-teal-800 tracking-wider">
          AI AGENT DRAFT
        </span>
      </div>
      <div className="p-6 flex-1 prose prose-sm prose-teal max-w-none text-gray-800 leading-relaxed">
        {cleanedMarkdown ? (
          <ReactMarkdown
            components={{
              h2: ({ node, ...props }) => (
                <h2 className="text-sm sm:text-base font-extrabold text-gray-950 mt-5 mb-3 pb-1 border-b border-gray-150 flex items-center gap-1.5" {...props}>
                  <span className="h-3.5 w-1 bg-teal-500 rounded" />
                  {props.children}
                </h2>
              ),
              h3: ({ node, ...props }) => (
                <h3 className="text-xs sm:text-sm font-extrabold text-gray-850 mt-4 mb-2 pl-2 border-l-2 border-teal-400 flex items-center gap-1" {...props} />
              ),
              ul: ({ node, ...props }) => <ul className="list-none pl-1 my-3 space-y-2" {...props} />,
              li: ({ node, ...props }) => (
                <li className="text-xs sm:text-sm text-gray-650 leading-relaxed flex items-start gap-2" {...props}>
                  <i className="ri-check-line text-teal-600 mt-0.5 text-xs shrink-0" />
                  <span>{props.children}</span>
                </li>
              ),
              p: ({ node, ...props }) => <p className="my-2.5 text-xs sm:text-sm text-gray-650 leading-relaxed" {...props} />,
            }}
          >
            {cleanedMarkdown}
          </ReactMarkdown>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <i className="ri-loader-4-line animate-spin text-2xl text-teal-500 mb-2" />
            <p className="text-gray-400 text-sm">종합 기술 검토 보고서를 작성하는 중입니다...</p>
          </div>
        )}
      </div>
    </section>
  );
}

function SmallPanel({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <span className="rounded border border-gray-100 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">{count}</span>
      </div>
      <div className="space-y-2 p-3">{children}</div>
    </section>
  );
}

function CandidateItem({
  candidate,
  onOpenPatent,
}: {
  candidate: unknown;
  onOpenPatent: (patent: any) => void;
}) {
  const data = asRecord(candidate);
  const patent = asRecord(data.patent);
  const score = typeof data.score === "number" ? data.score : undefined;
  const low = typeof score === "number" && score < 0.45;
  const ready = data.claimComparisonReady === true;
  return (
    <div className={`flex flex-col justify-between rounded-lg border p-3 ${low ? "border-amber-100 bg-amber-50/60" : "border-gray-100 bg-gray-50"}`}>
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs sm:text-sm font-bold leading-5 text-gray-900 line-clamp-2">{String(patent.title ?? "제목 없음")}</p>
          <span className={`font-mono text-[10px] shrink-0 font-bold ${low ? "text-amber-700" : "text-teal-700"}`}>{formatScore(score)}</span>
        </div>
        <p className="mt-1 font-mono text-[10px] text-gray-400">
          {String(patent.applicationNumber ?? "-")} · {String(data.matchedTextType ?? "-")}
        </p>
        <div className="mt-2">
          <Badge label={ready ? "claim 비교 가능" : "후보 요약 전용"} tone={ready ? "ok" : "neutral"} />
        </div>
        {low && <p className="mt-2 text-[10px] font-medium text-amber-700 leading-4">관련도가 낮아 자동 수집/재검색 대상입니다.</p>}
      </div>
      <div className="mt-3 pt-2 border-t border-gray-200/50 flex justify-end">
        <button
          type="button"
          onClick={() => onOpenPatent({
            invention_title: String(patent.title ?? "제목 없음"),
            applicant_name: String(patent.applicant_name ?? "-"),
            application_number: String(patent.application_number ?? "-"),
            application_date: String(patent.application_date ?? "-"),
            register_status: String(patent.register_status ?? "-"),
            relevance_text: String(patent.abstract ?? "-"),
            full_content: String(patent.abstract ?? "-"),
          })}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-teal-700 hover:text-teal-900 transition-colors"
        >
          <i className="ri-file-text-line" />
          특허 원문보기
        </button>
      </div>
    </div>
  );
}

function MatchBadge({ value }: { value: string }) {
  let label = value;
  let klass = "border-gray-100 bg-gray-50 text-gray-500";

  if (value === "matched") {
    label = "구성요소 일치 (매칭)";
    klass = "border-red-200 bg-red-50 text-red-700 font-extrabold";
  } else if (value === "partial") {
    label = "일부 대응 (확인 필요)";
    klass = "border-amber-200 bg-amber-50 text-amber-700 font-bold";
  } else if (value === "not_found") {
    label = "불일치 (미검출)";
    klass = "border-green-200 bg-green-50 text-green-700 font-bold";
  } else if (value === "uncertain") {
    label = "분석 불가 (보류)";
    klass = "border-gray-250 bg-gray-100 text-gray-650";
  }

  return <span className={`shrink-0 rounded border px-2 py-1 text-[11px] font-semibold ${klass}`}>{label}</span>;
}

function Badge({ label, tone }: { label: string; tone: Tone }) {
  const klass =
    tone === "ok"
      ? "border-teal-100 bg-teal-50 text-teal-700"
      : tone === "warn"
        ? "border-amber-100 bg-amber-50 text-amber-700"
        : "border-gray-100 bg-gray-50 text-gray-500";
  return <span className={`rounded border px-2 py-1 text-[11px] font-semibold ${klass}`}>{label}</span>;
}

function EmptyPanelText({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-xs text-gray-400">
      {text}
    </div>
  );
}

function EventLog({ events }: { events: ClaimLensEvent[] }) {
  return (
    <details className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-gray-900">
        상세 이벤트 로그 <span className="ml-1 text-[10px] font-semibold text-gray-400">{events.length}</span>
      </summary>
      <div className="max-h-72 space-y-2 overflow-auto border-t border-gray-100 p-3">
        {events.map((event, index) => (
          <div key={index} className="rounded-lg border border-gray-100 bg-gray-50 p-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-gray-400">#{index + 1}</span>
              <span className="text-[11px] font-semibold text-gray-700">{event.type}</span>
              {event.step && <span className="text-[11px] text-teal-600">{event.step}</span>}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-center">
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-500 transition-all hover:border-teal-200 hover:text-teal-600"
      >
        <i className="ri-refresh-line" />
        새 검색
      </button>
    </div>
  );
}

function EmptyState({ mode }: { mode: SearchMode }) {
  const items =
    mode === "rag"
      ? [
          ["ri-search-line", "관련 특허 찾기", "질문과 가까운 특허 문서를 먼저 찾습니다."],
          ["ri-robot-line", "쉬운 말로 요약", "찾은 특허 내용을 바탕으로 답변을 생성합니다."],
          ["ri-file-text-line", "근거 확인", "답변에 사용한 특허 제목과 출원 정보를 함께 보여줍니다."],
        ]
      : [
          ["ri-search-eye-line", "후보 청구항 검색", "제품 설명과 가까운 특허 청구항을 찾습니다."],
          ["ri-node-tree", "구성요소 비교", "제품 기능과 청구항 요소를 행 단위로 비교합니다."],
          ["ri-file-list-3-line", "검토 초안 생성", "매칭 결과를 기술 검토 초안으로 정리합니다."],
        ];

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="grid grid-cols-1 divide-y divide-gray-100 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        {items.map(([icon, title, description]) => (
          <div key={title} className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50">
              <i className={`${icon} text-xl text-teal-500`} />
            </div>
            <h4 className="mb-1 text-sm font-bold text-gray-900">{title}</h4>
            <p className="text-xs leading-relaxed text-gray-500">{description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function getToolResultArray(events: ClaimLensEvent[], tool: string, key: string) {
  const data = events.findLast((event) => event.tool === tool && event.type === "tool_result")?.data;
  const value = asRecord(data)[key];
  return Array.isArray(value) ? value : [];
}

function getAutoIngestData(events: Array<ClaimLensEvent | SearchStreamEvent>): Record<string, unknown> {
  const event = events.findLast((item) => item.type === "auto_ingest_completed");
  if (!event || !("data" in event)) {
    return {};
  }
  return asRecord(event.data);
}

function buildClaimLensSummary(events: ClaimLensEvent[], candidates: unknown[], chartRows: ClaimLensEvent[]) {
  const latestDecision = asRecord(events.filter((event) => event.type === "supervisor_decision").at(-1)?.data);
  const topScoreFromDecision = latestDecision.topScore;
  const claimElementCount = latestDecision.claimElementCount;
  const matchedCount = chartRows.filter((event) => asRecord(event.data).match === "matched").length;
  const topScore =
    typeof topScoreFromDecision === "number"
      ? topScoreFromDecision
      : Math.max(
          0,
          ...candidates.map((candidate) => {
            const score = asRecord(candidate).score;
            return typeof score === "number" ? score : 0;
          }),
        );

  return {
    candidateCount: candidates.length,
    topScore,
    claimElementCount: typeof claimElementCount === "number" ? claimElementCount : chartRows.length,
    rowCount: chartRows.length,
    matchedCount,
  };
}

function formatScore(value: unknown) {
  if (typeof value !== "number") return "-";
  const percentage = Math.min(Math.round((value / 0.03278) * 100), 100);
  return `${percentage}%`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
