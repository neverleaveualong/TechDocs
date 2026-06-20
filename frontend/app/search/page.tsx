"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import SearchBar from "@/components/search/SearchBar";
import AiAnswer from "@/components/search/AiAnswer";
import SearchResults from "@/components/search/SearchResults";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { searchPatents, searchPatentsStream, streamClaimLensAnalysis } from "@/lib/api";
import type { ClaimLensEvent } from "@/types/claimlens";
import type { PatentSource, SearchStreamEvent } from "@/types/search";

type SearchMode = "rag" | "claimlens";

const ragQueries = [
  { label: "2차전지 열 관리", icon: "ri-battery-charge-line" },
  { label: "반도체 식각 공정", icon: "ri-cpu-line" },
  { label: "ERP 클라우드", icon: "ri-cloud-line" },
  { label: "자율주행 센서", icon: "ri-car-line" },
  { label: "디스플레이 패널", icon: "ri-tv-line" },
];

const claimLensQueries = [
  { label: "사내 문서 검색 추천 서비스", icon: "ri-file-search-line" },
  { label: "검색 이력 기반 개인화", icon: "ri-user-search-line" },
  { label: "키워드 추출 문서 분석", icon: "ri-key-2-line" },
];

export default function SearchPage() {
  const [mode, setMode] = useState<SearchMode>("rag");
  
  // RAG States
  const [streamedAnswer, setStreamedAnswer] = useState("");
  const [streamedSources, setStreamedSources] = useState<PatentSource[]>([]);
  const [queryLogId, setQueryLogId] = useState<number | undefined>(undefined);
  const [ragEvents, setRagEvents] = useState<SearchStreamEvent[]>([]);
  
  // ClaimLens States
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
    
    // Reset RAG results
    setStreamedAnswer("");
    setStreamedSources([]);
    setQueryLogId(undefined);
    setRagEvents([]);
    
    // Reset ClaimLens results
    setClaimLensEvents([]);

    try {
      if (mode === "rag") {
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          await searchPatentsStream(
            query,
            (event) => {
              if (!isCurrentRun()) return;
              setRagEvents((events) => [...events, event]);
              if (event.type === "sources") {
                setStreamedSources(event.sources);
                setIsLoading(false); // First meaningful chunk received
                setIsStreaming(true);
              } else if (event.type === "answer_delta") {
                setStreamedAnswer((prev) => prev + event.delta);
              } else if (event.type === "done") {
                setQueryLogId(event.query_log_id);
                setIsStreaming(false);
              }
            },
            5,
            { signal: controller.signal }
          );
        } catch (streamError) {
          if (!isCurrentRun()) return;
          if (streamError instanceof DOMException && streamError.name === "AbortError") {
            throw streamError;
          }

          setIsLoading(true);
          setIsStreaming(false);
          setStreamedAnswer("");
          setStreamedSources([]);
          setRagEvents([]);

          const fallbackResult = await searchPatents(query);
          if (!isCurrentRun()) return;
          setStreamedAnswer(fallbackResult.answer);
          setStreamedSources(fallbackResult.sources);
          setQueryLogId(fallbackResult.query_log_id);
        }
      } else {
        const controller = new AbortController();
        abortRef.current = controller;
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
        setError(mode === "rag" ? "검색이 중단되었습니다." : "침해 검토가 중단되었습니다.");
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
      <header className="bg-white border-b border-gray-200">
        <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-sm">
                <i className={mode === "rag" ? "ri-robot-line text-white text-sm" : "ri-scales-3-line text-white text-sm"} />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                AI 특허 검색
              </h1>
            </div>

            <p className="text-xs text-gray-400 font-medium sm:text-right">
              {mode === "rag"
                ? "궁금한 기술을 문장으로 입력하면 관련 특허를 찾아 요약합니다"
                : "제품 설명을 입력하면 비슷한 특허 청구항을 찾아 비교합니다"}
            </p>
          </div>
        </div>
      </header>


      <main className="px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 sm:p-6">
          <div className="mb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ModeButton
                active={mode === "rag"}
                icon="ri-search-line"
                title="특허 검색 (RAG Search)"
                subtitle="질문과 가까운 특허를 찾아 핵심을 요약합니다"
                onClick={() => switchMode("rag")}
              />
              <ModeButton
                active={mode === "claimlens"}
                icon="ri-scales-3-line"
                title="특허 침해 검색 (AI Agent)"
                subtitle="제품 설명과 특허 청구항이 얼마나 겹치는지 비교합니다"
                onClick={() => switchMode("claimlens")}
              />
            </div>
          </div>

          <SearchBar
            onSearch={handleSearch}
            onCancel={() => abortRef.current?.abort()}
            isLoading={isLoading || isStreaming}
            buttonLabel={
              mode === "rag"
                ? isLoading || isStreaming ? "중단" : "검색"
                : isLoading || isStreaming ? "중단" : "검토"
            }
            placeholder={
              mode === "rag"
                ? "찾고 싶은 기술을 문장으로 입력하세요  (예: 전기차 배터리 열을 식히는 기술)"
                : "비교할 제품이나 기능을 쉽게 설명해주세요  (예: 검색 기록을 보고 문서를 추천하는 서비스)"
            }
          />

          {!streamedAnswer && streamedSources.length === 0 && claimLensEvents.length === 0 && !isLoading && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
              <span className="text-[11px] text-gray-400 font-medium leading-7">
                {mode === "rag" ? "추천 검색어" : "검토 예시"}
              </span>
              {quickQueries.map((q) => (
                <button
                  key={q.label}
                  onClick={() => handleSearch(q.label)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-600 text-xs font-medium rounded-lg border border-gray-100 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-100 transition-all"
                >
                  <i className={`${q.icon} text-[11px]`} />
                  {q.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6">
          {isLoading && mode === "rag" && (
            <LoadingSpinner message="특허를 검색하는 중입니다..." />
          )}

          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <i className="ri-error-warning-line text-red-400 text-lg mt-0.5 shrink-0" />
              <div>
                <p className="font-medium mb-0.5">{mode === "rag" ? "검색 오류" : "침해 검토 오류"}</p>
                <p className="text-red-600">{error}</p>
              </div>
            </div>
          )}

          {mode === "rag" && (streamedAnswer || streamedSources.length > 0) && (
            <div className="space-y-4 animate-fade-in">
              <AiAnswer 
                answer={streamedAnswer} 
                query={activeQuery} 
                queryLogId={queryLogId}
                isStreaming={isStreaming}
              />
              <SearchResults sources={streamedSources} />
              <AutoIngestDebugPanel events={ragEvents} />
              <ResetButton onClick={() => {
                setStreamedAnswer("");
                setStreamedSources([]);
                setQueryLogId(undefined);
                setRagEvents([]);
              }} />
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
  const completed = new Set(events.filter((event) => event.type === "step_completed").map((event) => event.step));
  const started = new Set(events.filter((event) => event.type === "step_started").map((event) => event.step));
  const steps = [
    ["input_analysis", "입력 분석"],
    ["patent_search", "후보 검색"],
    ["claim_loading", "청구항 로드"],
    ["feature_matching", "기능 매칭"],
    ["report_generation", "리포트"],
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center shadow-sm">
              <i className="ri-scales-3-line text-white text-xs" />
            </div>
            <span className="text-sm font-bold text-gray-900">ClaimLens Agent</span>
            {isLoading && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-teal-50 text-teal-600 rounded font-medium border border-teal-100">
                <i className="ri-loader-4-line animate-spin" />
                SSE
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isLoading && (
              <button
                onClick={onStop}
                className="text-[11px] px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 transition-all"
              >
                중단
              </button>
            )}
            <button
              onClick={onReset}
              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-teal-600 hover:border-teal-200 transition-all"
            >
              새 검토
            </button>
          </div>
        </div>
        <div className="px-5 sm:px-6 py-5">
          <p className="text-[11px] text-gray-400 mb-4">&ldquo;{query}&rdquo;</p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            {steps.map(([id, label], index) => {
              const state = completed.has(id) ? "done" : started.has(id) ? "running" : "waiting";
              return (
                <div key={id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 font-semibold">0{index + 1}</span>
                    <StepPill state={state} />
                  </div>
                  <p className="mt-2 text-xs font-bold text-gray-800">{label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
        <div className="space-y-4">
          <ClaimChartPanel rows={chartRows} />
          <ReportPanel markdown={reportMarkdown} />
        </div>
        <div className="space-y-4">
          <SmallPanel title="제품 기능" count={features.length}>
            {features.length === 0 ? (
              <EmptyPanelText text="입력 분석 대기 중" />
            ) : (
              features.map((feature, index) => (
                <div key={index} className="p-3 bg-gray-50 border border-gray-100 rounded-lg">
                  <p className="text-[11px] text-gray-400 font-semibold">Feature {index + 1}</p>
                  <p className="text-sm text-gray-800 mt-1 leading-5">{String(feature)}</p>
                </div>
              ))
            )}
          </SmallPanel>
          <SmallPanel title="검색 후보" count={candidates.length}>
            {candidates.length === 0 ? (
              <EmptyPanelText text="후보 검색 대기 중" />
            ) : (
              candidates.map((candidate, index) => <CandidateItem key={index} candidate={candidate} />)
            )}
          </SmallPanel>
          <AutoIngestDebugPanel events={events} />
          <SmallPanel title="SSE 이벤트" count={events.length}>
            <div className="max-h-72 overflow-auto space-y-2">
              {events.map((event, index) => (
                <div key={index} className="p-2 bg-gray-50 border border-gray-100 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-gray-400">#{index + 1}</span>
                    <span className="text-[11px] font-semibold text-gray-700">{event.type}</span>
                    {event.step && <span className="text-[11px] text-teal-600">{event.step}</span>}
                  </div>
                </div>
              ))}
            </div>
          </SmallPanel>
        </div>
      </div>
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
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${klass}`}>{label}</span>;
}

function AutoIngestDebugPanel({ events }: { events: Array<ClaimLensEvent | SearchStreamEvent> }) {
  const data = getAutoIngestData(events);
  const quality = getSearchQualityData(events);
  const candidates = Array.isArray(data.rerankCandidates) ? data.rerankCandidates : [];
  const matchedTerms = Array.isArray(quality.matchedTerms) ? quality.matchedTerms : [];
  const hasQuality = typeof quality.reason === "string" && quality.reason.length > 0;
  if (!data.status && candidates.length === 0 && !hasQuality) {
    return null;
  }

  return (
    <SmallPanel title="검색 품질 / 자동 수집" count={candidates.length}>
      {hasQuality && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-gray-800">{String(quality.reason)}</span>
            <span className="font-mono text-[11px] text-gray-500">
              best {formatScore(quality.bestScore)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500 border border-gray-100">
              sources {String(quality.sourceCount ?? 0)}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-bold border ${
                quality.shouldAutoIngest === true
                  ? "bg-amber-50 text-amber-700 border-amber-100"
                  : "bg-teal-50 text-teal-700 border-teal-100"
              }`}
            >
              {quality.shouldAutoIngest === true ? "auto ingest needed" : "enough sources"}
            </span>
          </div>
          {matchedTerms.length > 0 && (
            <p className="mt-2 text-[11px] leading-5 text-gray-500">
              matched: {matchedTerms.slice(0, 6).map(String).join(", ")}
            </p>
          )}
        </div>
      )}
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-gray-800">{String(data.status ?? "-")}</span>
          <span className="font-mono text-[11px] text-teal-700">
            cutoff {formatScore(data.rerankMinScore)}
          </span>
        </div>
        {typeof data.message === "string" && data.message.length > 0 && (
          <p className="mt-2 text-[11px] leading-5 text-gray-500">{data.message}</p>
        )}
      </div>
      {candidates.slice(0, 5).map((candidate, index) => {
        const item = asRecord(candidate);
        const selected = item.selected === true;
        return (
          <div
            key={`${String(item.applicationNumber ?? index)}-${index}`}
            className={`rounded-lg border p-3 ${
              selected ? "border-teal-100 bg-teal-50/70" : "border-gray-100 bg-gray-50"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold leading-5 text-gray-900">
                {String(item.title ?? "제목 없음")}
              </p>
              <span className={`font-mono text-[11px] ${selected ? "text-teal-700" : "text-gray-500"}`}>
                {formatScore(item.score)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-gray-400">
                {String(item.applicationNumber ?? "-")}
              </span>
              <span className={`text-[10px] font-bold ${selected ? "text-teal-700" : "text-gray-400"}`}>
                {selected ? "selected" : "filtered"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {typeof item.selectionReason === "string" && (
                <span className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500 border border-gray-100">
                  {item.selectionReason}
                </span>
              )}
              {typeof item.coverageCount === "number" && (
                <span className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500 border border-gray-100">
                  coverage {String(item.coverageCount)}
                </span>
              )}
            </div>
            {Array.isArray(item.matchedTerms) && item.matchedTerms.length > 0 && (
              <p className="mt-2 text-[11px] leading-5 text-gray-500">
                matched: {item.matchedTerms.slice(0, 5).map(String).join(", ")}
              </p>
            )}
          </div>
        );
      })}
    </SmallPanel>
  );
}

function ClaimChartPanel({ rows }: { rows: ClaimLensEvent[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">청구항 대조표</h3>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-teal-50 text-teal-700 border border-teal-100 rounded">
          {rows.length} rows
        </span>
      </div>
      <div className="p-3 space-y-2">
        {rows.length === 0 ? (
          <EmptyPanelText text="매칭 결과 대기 중" />
        ) : (
          rows.map((row, index) => <ClaimChartRow key={index} event={row} />)
        )}
      </div>
    </div>
  );
}

function ClaimChartRow({ event }: { event: ClaimLensEvent }) {
  const data = asRecord(event.data);
  return (
    <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900 leading-6">
          {String(data.claimElement ?? "-")}
        </p>
        <MatchBadge value={String(data.match ?? "unknown")} />
      </div>
      <p className="mt-2 text-xs text-gray-600 leading-5">
        {String(data.productFeature ?? "매칭된 제품 기능 없음")}
      </p>
      {typeof data.evidence === "string" && data.evidence.length > 0 && (
        <p className="mt-3 p-2 bg-white border border-teal-100 rounded-lg text-[11px] text-teal-700 leading-5">
          {data.evidence}
        </p>
      )}
      {typeof data.uncertainty === "string" && data.uncertainty.length > 0 && (
        <p className="mt-2 text-[11px] text-amber-700 leading-5">{data.uncertainty}</p>
      )}
    </div>
  );
}

function ReportPanel({ markdown }: { markdown: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900">기술 검토 초안</h3>
      </div>
      <div className="p-5">
        <p className="whitespace-pre-wrap text-sm text-gray-700 leading-7">
          {markdown || "리포트 생성 대기 중입니다."}
        </p>
      </div>
    </div>
  );
}

function SmallPanel({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-gray-50 text-gray-500 border border-gray-100 rounded">
          {count}
        </span>
      </div>
      <div className="p-3 space-y-2">{children}</div>
    </div>
  );
}

function CandidateItem({ candidate }: { candidate: unknown }) {
  const data = asRecord(candidate);
  const patent = asRecord(data.patent);
  const score = typeof data.score === "number" ? data.score.toFixed(3) : "-";
  return (
    <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 leading-5">
          {String(patent.title ?? "제목 없음")}
        </p>
        <span className="font-mono text-[10px] text-teal-700">{score}</span>
      </div>
      <p className="mt-1 font-mono text-[11px] text-gray-400">
        {String(patent.applicationNumber ?? "-")} · {String(data.matchedTextType ?? "-")}
      </p>
    </div>
  );
}

function MatchBadge({ value }: { value: string }) {
  const klass =
    value === "matched"
      ? "bg-green-50 text-green-700 border-green-100"
      : value === "partial"
        ? "bg-amber-50 text-amber-700 border-amber-100"
        : value === "not_found"
          ? "bg-red-50 text-red-700 border-red-100"
          : "bg-gray-50 text-gray-500 border-gray-100";
  return <span className={`shrink-0 px-2 py-1 rounded border text-[11px] font-semibold ${klass}`}>{value}</span>;
}

function EmptyPanelText({ text }: { text: string }) {
  return (
    <div className="p-6 text-center bg-gray-50 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400">
      {text}
    </div>
  );
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-center">
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:text-teal-600 hover:border-teal-200 transition-all"
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
          ["ri-search-line", "비슷한 특허 찾기", "입력한 질문과 의미가 가까운 특허 문서를 먼저 찾아냅니다"],
          ["ri-robot-line", "쉬운 말로 요약", "찾은 특허 내용을 바탕으로 핵심만 정리해 답변합니다"],
          ["ri-file-text-line", "근거 함께 확인", "답변에 사용된 특허 제목과 출원 정보를 같이 보여줍니다"],
        ]
      : [
          ["ri-search-eye-line", "관련 특허 후보 찾기", "제품 설명과 비슷한 내용을 가진 특허 청구항을 찾아냅니다"],
          ["ri-node-tree", "겹치는 부분 비교", "제품 기능과 특허의 핵심 요소가 어디까지 비슷한지 나눠서 봅니다"],
          ["ri-file-list-3-line", "검토 초안 만들기", "비교 결과를 표와 설명 형태로 정리해 검토 초안을 보여줍니다"],
        ];

  return (
    <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
        {items.map(([icon, title, description]) => (
          <div key={title} className="p-8 text-center">
            <div className="w-12 h-12 flex items-center justify-center mx-auto mb-4 bg-teal-50 rounded-xl">
              <i className={`${icon} text-xl text-teal-500`} />
            </div>
            <h4 className="text-sm font-bold text-gray-900 mb-1">{title}</h4>
            <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100 bg-gray-50/50 px-8 py-4 text-center">
        <p className="text-[11px] text-gray-400">
          <i className="ri-time-line mr-1" />
          {mode === "rag" ? "특허 검색과 요약에는 보통 10~30초가 걸립니다" : "침해 검색은 후보 특허를 찾고 비교표를 만드는 데 보통 10~30초가 걸립니다"}
        </p>
      </div>
    </div>
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

function getSearchQualityData(events: Array<ClaimLensEvent | SearchStreamEvent>): Record<string, unknown> {
  const event = events.findLast((item) => item.type === "search_quality");
  if (!event || !("data" in event)) {
    return {};
  }
  return asRecord(event.data);
}

function formatScore(value: unknown) {
  return typeof value === "number" ? value.toFixed(3) : "-";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
