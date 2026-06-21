"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import SearchBar from "@/components/search/SearchBar";
import AiAnswer from "@/components/search/AiAnswer";
import SearchResults from "@/components/search/SearchResults";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import PatentDetailModal from "@/components/patent/PatentDetailModal";
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
  const hasRagActivity = mode === "rag" && Boolean(activeQuery) && (isLoading || isStreaming || ragEvents.length > 0 || streamedAnswer || streamedSources.length > 0);
  const hasClaimLensActivity = mode === "claimlens" && Boolean(activeQuery) && (isLoading || claimLensEvents.length > 0);

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

          {!streamedAnswer && streamedSources.length === 0 && claimLensEvents.length === 0 && !isLoading && !hasRagActivity && !hasClaimLensActivity && (
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
          {isLoading && mode === "rag" && ragEvents.length === 0 && (
            <LoadingSpinner message="특허 후보를 찾는 중입니다..." />
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

          {mode === "rag" && hasRagActivity && (
            <div className="space-y-4 animate-fade-in">
              {!streamedAnswer && streamedSources.length === 0 && ragEvents.length > 0 && (
                <SearchProgressPanel events={ragEvents} />
              )}
              {(streamedAnswer || streamedSources.length > 0 || isStreaming) && (
                <AiAnswer 
                  answer={streamedAnswer} 
                  query={activeQuery} 
                  queryLogId={queryLogId}
                  isStreaming={isStreaming}
                />
              )}
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

        {!hasRagActivity && !hasClaimLensActivity && !error && (
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

function SearchProgressPanel({ events }: { events: SearchStreamEvent[] }) {
  const latestType = events.at(-1)?.type;
  const message =
    latestType === "auto_ingest_started"
      ? "기존 데이터가 부족해 KIPRIS에서 관련 특허를 보강하고 있습니다."
      : latestType === "auto_ingest_completed"
        ? "새로 찾은 특허를 저장하고 다시 검색하고 있습니다."
        : latestType === "retry_search"
          ? "보강된 특허 데이터로 답변 근거를 다시 고르는 중입니다."
          : "질문을 분석하고 관련 특허 후보를 찾는 중입니다.";

  return (
    <div className="rounded-3xl border border-teal-100 bg-[linear-gradient(135deg,#f8fafc_0%,#f0fdfa_55%,#fff7ed_100%)] p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-teal-100 bg-white text-teal-700 shadow-sm">
          <i className="ri-loader-4-line animate-spin text-lg" />
        </span>
        <div>
          <p className="text-sm font-black text-gray-950">검색 결과를 준비하고 있습니다</p>
          <p className="mt-1 text-xs font-medium leading-5 text-gray-600">{message}</p>
        </div>
      </div>
    </div>
  );
}

function AutoIngestDebugPanel({ events }: { events: Array<ClaimLensEvent | SearchStreamEvent> }) {
  const [selectedPatent, setSelectedPatent] = useState<PatentSource | null>(null);
  const data = getAutoIngestData(events);
  const quality = getSearchQualityData(events);
  const candidates = Array.isArray(data.rerankCandidates) ? data.rerankCandidates : [];
  const selectedCandidates = candidates.filter((candidate) => asRecord(candidate).selected === true);
  const filteredCandidates = candidates.filter((candidate) => asRecord(candidate).selected !== true);
  const matchedTerms = Array.isArray(quality.matchedTerms) ? quality.matchedTerms : [];
  const hasQuality = typeof quality.reason === "string" && quality.reason.length > 0;
  const sourceCount = getLatestSourceCount(events);
  const hasIngestResult = typeof data.status === "string" && data.status.length > 0;
  if (!data.status && candidates.length === 0 && !hasQuality) {
    return null;
  }

  return (
    <SmallPanel title="검색 품질과 자동 수집" count={candidates.length}>
      {hasIngestResult && (
        <div className="overflow-hidden rounded-2xl border border-teal-100 bg-[linear-gradient(135deg,#f0fdfa_0%,#eff6ff_55%,#fff7ed_100%)] p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-black text-gray-950">
                <i className="ri-database-2-line text-teal-700" />
                {getAutoIngestStatusLabel(data.status)}
              </p>
              <p className="mt-1 text-[12px] font-medium leading-5 text-gray-700">
                {getAutoIngestSummary(data, candidates.length, selectedCandidates.length, sourceCount)}
              </p>
            </div>
            {typeof data.rerankMinScore === "number" && (
              <span className="shrink-0 rounded-full border border-teal-200 bg-white/90 px-3 py-1 text-[10px] font-bold text-teal-700 shadow-sm">
                저장 기준 {formatScore(data.rerankMinScore)}
              </span>
            )}
          </div>
          {typeof data.message === "string" && data.message.length > 0 && (
            <p className="mt-3 rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-[11px] font-medium leading-5 text-gray-600">
              {data.message}
            </p>
          )}
        </div>
      )}
      {hasQuality && (
        <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-gray-800">검색 상태: {getSearchQualityLabel(quality.reason)}</span>
            <span className="font-mono text-[11px] text-gray-500">
              최고 관련도 {formatScore(quality.bestScore)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500 border border-gray-100">
              근거 후보 {String(quality.sourceCount ?? 0)}건
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-bold border ${
                quality.shouldAutoIngest === true
                  ? "bg-amber-50 text-amber-700 border-amber-100"
                  : "bg-teal-50 text-teal-700 border-teal-100"
              }`}
            >
              {getQualityActionLabel(quality.shouldAutoIngest, data.status)}
            </span>
          </div>
          {matchedTerms.length > 0 && (
            <p className="mt-2 text-[11px] leading-5 text-gray-500">
              매칭 키워드: {matchedTerms.slice(0, 6).map(String).join(", ")}
            </p>
          )}
        </div>
      )}
      <div className="space-y-3">
        {selectedCandidates.length > 0 && (
          <CandidateGroup
            title="이번에 Pinecone에 저장된 특허"
            candidates={selectedCandidates}
            tone="selected"
            onOpen={setSelectedPatent}
          />
        )}
        {filteredCandidates.length > 0 && (
          <CandidateGroup
            title="후보였지만 저장하지 않은 특허"
            candidates={filteredCandidates.slice(0, 5)}
            tone="filtered"
            onOpen={setSelectedPatent}
          />
        )}
      </div>
      <PatentDetailModal patent={selectedPatent} onClose={() => setSelectedPatent(null)} />
    </SmallPanel>
  );
}

function CandidateGroup({
  title,
  candidates,
  tone,
  onOpen,
}: {
  title: string;
  candidates: unknown[];
  tone: "selected" | "filtered";
  onOpen: (patent: PatentSource) => void;
}) {
  const selected = tone === "selected";
  return (
    <div
      className={`space-y-2 rounded-3xl border p-3 ${
        selected
          ? "border-teal-200 bg-teal-50/50 shadow-[0_14px_40px_rgba(15,118,110,0.10)]"
          : "border-amber-200 bg-amber-50/50 shadow-[0_14px_40px_rgba(180,83,9,0.08)]"
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <p className={`flex items-center gap-1.5 text-xs font-black ${selected ? "text-teal-900" : "text-amber-900"}`}>
          <i className={selected ? "ri-checkbox-circle-line text-teal-600" : "ri-filter-3-line text-amber-600"} />
          {title}
        </p>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${selected ? "bg-teal-100 text-teal-800" : "bg-amber-100 text-amber-800"}`}>
          {candidates.length}건
        </span>
      </div>
      {candidates.map((candidate, index) => {
        const item = asRecord(candidate);
        return (
          <CandidateSummaryCard
            key={`${String(item.applicationNumber ?? index)}-${index}`}
            item={item}
            tone={tone}
            onOpen={onOpen}
          />
        );
      })}
    </div>
  );
}

function CandidateSummaryCard({
  item,
  tone,
  onOpen,
}: {
  item: Record<string, unknown>;
  tone: "selected" | "filtered";
  onOpen: (patent: PatentSource) => void;
}) {
  const selected = tone === "selected";
  const patent = candidateToPatentSource(item);
  const matchedTerms = Array.isArray(item.matchedTerms) ? item.matchedTerms.slice(0, 8).map(String) : [];
  return (
    <div
      className={`group w-full rounded-2xl border p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
        selected
          ? "border-teal-200 bg-white hover:border-teal-300 hover:shadow-[0_16px_42px_rgba(15,118,110,0.16)] focus:ring-teal-400"
          : "border-amber-200 bg-white/85 hover:border-amber-300 hover:shadow-[0_16px_42px_rgba(180,83,9,0.14)] focus:ring-amber-400"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <CandidateMetaRow label="특허명" value={String(item.title ?? "제목 없음")} />
          <CandidateMetaRow label="출원날짜" value={formatCandidateDate(item.applicationDate)} />
          <CandidateMetaRow label="출원인명" value={String(item.applicantName ?? "-")} />
          <CandidateMetaRow label="출원번호" value={String(item.applicationNumber ?? "-")} mono />
        </div>
        <div className={`shrink-0 rounded-2xl border px-4 py-2.5 text-center shadow-sm ${selected ? "border-teal-200 bg-teal-50/80" : "border-amber-200 bg-amber-50/80"}`}>
          <p className={`font-mono text-2xl font-black leading-none ${selected ? "text-teal-900" : "text-amber-900"}`}>
            {formatScore(item.score)}
          </p>
          <p className={`mt-1 text-[11px] font-extrabold tracking-wide ${selected ? "text-teal-700" : "text-amber-700"}`}>
            관련도
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${selected ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"}`}>
          {selected ? "저장됨" : "제외됨"}
        </span>
        {typeof item.selectionReason === "string" && (
          <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-bold text-gray-600">
            {getSelectionReasonLabel(item.selectionReason)}
          </span>
        )}
        {typeof item.coverageCount === "number" && (
          <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-bold text-gray-600">
            키워드 매칭 {String(item.coverageCount)}개
          </span>
        )}
      </div>
      {matchedTerms.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-bold text-gray-400">매칭 키워드</p>
          <div className="flex flex-wrap gap-1.5">
            {matchedTerms.map((term) => (
              <span key={term} className="rounded-full border border-teal-100 bg-white px-2 py-1 text-[11px] font-semibold text-teal-700">
                {term}
              </span>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => onOpen(patent)}
        className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black text-white transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          selected ? "bg-teal-700 hover:bg-teal-800 focus:ring-teal-400" : "bg-amber-700 hover:bg-amber-800 focus:ring-amber-400"
        }`}
      >
        <i className="ri-eye-line" />
        특허 내용 보기
      </button>
    </div>
  );
}

function CandidateMetaRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 text-xs leading-5">
      <span className="font-bold text-gray-400">{label}</span>
      <span className={`break-words font-semibold text-gray-800 ${mono ? "font-mono" : ""}`}>
        {value || "-"}
      </span>
    </div>
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

function getLatestSourceCount(events: Array<ClaimLensEvent | SearchStreamEvent>) {
  const event = events.findLast((item) => item.type === "sources");
  return event && "sources" in event && Array.isArray(event.sources) ? event.sources.length : null;
}

function getAutoIngestStatusLabel(status: unknown) {
  switch (status) {
    case "success":
      return "자동 수집 완료";
    case "cached":
      return "캐시된 자동 수집 결과 사용";
    case "low_relevance":
      return "관련 후보 부족";
    case "no_data":
      return "수집할 후보 없음";
    case "budget_exceeded":
      return "자동 수집 한도 도달";
    case "disabled":
      return "자동 수집 비활성화";
    case "error":
      return "자동 수집 실패";
    default:
      return `자동 수집 상태: ${String(status ?? "-")}`;
  }
}

function getAutoIngestSummary(
  data: Record<string, unknown>,
  candidateCount: number,
  selectedCount: number,
  sourceCount: number | null,
) {
  const savedCount = data.patentsSaved ?? data.claimlensPatentsSaved ?? selectedCount;
  const sourceSummary = sourceCount !== null ? ` 답변 근거로는 ${sourceCount}건을 사용했습니다.` : "";

  if (data.status === "budget_exceeded") {
    return "오늘 자동 수집 한도에 도달해 KIPRIS에서 새 특허를 가져오지 못했습니다. 더 구체적인 키워드로 다시 검색하거나 한도 초기화 후 재시도할 수 있습니다.";
  }

  if (data.status === "disabled") {
    return "자동 수집이 꺼져 있어 저장된 특허 데이터 안에서만 검색했습니다.";
  }

  if (data.status === "low_relevance") {
    return "KIPRIS 후보는 찾았지만 질문과 충분히 맞는 특허가 없어 Pinecone에 저장하지 않았습니다.";
  }

  if (data.status === "no_data") {
    return "KIPRIS에서 이 질문에 맞는 후보 특허를 찾지 못했습니다.";
  }

  if (data.status === "error") {
    return "자동 수집 중 오류가 발생해 새 특허를 저장하지 못했습니다.";
  }

  if (data.status === "cached") {
    return `최근 같은 검색어의 자동 수집 기록을 재사용했습니다.${sourceSummary}`;
  }

  if (candidateCount > 0) {
    return `KIPRIS 후보 ${candidateCount}건 중 ${String(savedCount)}건을 Pinecone에 저장했습니다.${sourceSummary}`;
  }

  return `Pinecone에 저장된 특허 ${String(savedCount)}건을 확인했습니다.${sourceSummary}`;
}

function getQualityActionLabel(shouldAutoIngest: unknown, ingestStatus: unknown) {
  if (ingestStatus === "budget_exceeded") return "한도 때문에 보강 불가";
  if (ingestStatus === "disabled") return "저장 데이터만 검색";
  if (ingestStatus === "low_relevance") return "저장할 후보 없음";
  if (ingestStatus === "no_data") return "후보 없음";
  if (shouldAutoIngest === true) return "추가 수집 필요";
  return "근거 충분";
}

function getSearchQualityLabel(reason: unknown) {
  switch (reason) {
    case "no_sources":
      return "저장된 근거가 부족해 추가 검색이 필요합니다";
    case "low_retrieval_score":
      return "가장 가까운 특허의 관련도가 낮습니다";
    case "no_query_term_overlap":
      return "질문 키워드와 맞는 특허가 부족합니다";
    case "weak_complex_query_match":
      return "복합 질문을 뒷받침할 근거가 부족합니다";
    case "enough_sources":
      return "답변에 사용할 근거를 찾았습니다";
    default:
      return String(reason ?? "검색 상태 확인 중");
  }
}

function getSelectionReasonLabel(reason: unknown) {
  switch (reason) {
    case "score_cutoff":
      return "관련도 기준 통과";
    case "coverage_fallback":
      return "핵심 키워드가 충분히 겹침";
    case "duplicate_coverage":
      return "이미 비슷한 특허가 저장됨";
    case "no_feature_coverage":
      return "질문 키워드와 겹치지 않음";
    case "score_below_floor":
      return "관련도가 낮음";
    case "coverage_below_threshold":
      return "키워드 매칭이 부족함";
    default:
      return String(reason ?? "검토 결과 없음");
  }
}

function candidateToPatentSource(item: Record<string, unknown>): PatentSource {
  const matchedTerms = Array.isArray(item.matchedTerms) ? item.matchedTerms.map(String) : [];
  const abstract = typeof item.abstract === "string" ? item.abstract : "";
  const title = String(item.title ?? "");
  const applicantName = String(item.applicantName ?? "");
  const applicationNumber = String(item.applicationNumber ?? "");
  const ipcNumber = String(item.ipcNumber ?? "");
  const applicationDate = String(item.applicationDate ?? "");
  const registerStatus = String(item.registerStatus ?? "");
  const selectionReason = getSelectionReasonLabel(item.selectionReason);

  return {
    invention_title: title,
    applicant_name: applicantName,
    application_number: applicationNumber,
    application_date: applicationDate,
    register_status: registerStatus,
    ipc_number: ipcNumber,
    score: typeof item.score === "number" ? item.score : null,
    score_type: "rerank",
    relevance_reason: selectionReason,
    matched_terms: matchedTerms,
    relevance_text: abstract,
    full_content: [
      `발명의 명칭: ${title}`,
      `출원번호: ${applicationNumber}`,
      `출원인: ${applicantName}`,
      `IPC: ${ipcNumber}`,
      `출원일: ${applicationDate}`,
      `등록상태: ${registerStatus}`,
      "",
      `초록: ${abstract || "초록 정보가 없습니다."}`,
    ].join("\n"),
  };
}

function formatCandidateDate(value: unknown) {
  const text = String(value ?? "");
  if (!text || text.length < 8) return text || "-";
  return `${text.slice(0, 4)}.${text.slice(4, 6)}.${text.slice(6, 8)}`;
}

function formatScore(value: unknown) {
  return typeof value === "number" ? value.toFixed(3) : "-";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
