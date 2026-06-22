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
                <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">AI 특허 검색</h1>
                <p className="mt-0.5 text-xs font-medium text-gray-400">
                  {mode === "rag" ? "질문과 가까운 특허를 찾고 답변을 생성합니다." : "제품 설명과 특허 청구항을 비교합니다."}
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
              title="특허 검색"
              subtitle="RAG 검색과 답변 생성"
              onClick={() => switchMode("rag")}
            />
            <ModeButton
              active={mode === "claimlens"}
              icon="ri-scales-3-line"
              title="ClaimLens Agent"
              subtitle="청구항 비교와 검토 초안"
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

          {mode === "rag" && (streamedAnswer || streamedSources.length > 0) && (
            <div className="space-y-4 animate-fade-in">
              <AiAnswer answer={streamedAnswer} query={activeQuery} queryLogId={queryLogId} isStreaming={isStreaming} />
              <SearchResults sources={streamedSources} />
              <AutoIngestDebugPanel events={ragEvents} />
              <ResetButton
                onClick={() => {
                  setStreamedAnswer("");
                  setStreamedSources([]);
                  setQueryLogId(undefined);
                  setRagEvents([]);
                }}
              />
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
  const latestDecision = events.filter((event) => event.type === "supervisor_decision").at(-1);
  const autoIngest = getAutoIngestData(events);
  const summary = buildClaimLensSummary(events, candidates, chartRows);
  const steps = [
    ["input_analysis", "입력 분석"],
    ["patent_search", "후보 검색"],
    ["claim_loading", "청구항 로드"],
    ["feature_matching", "기능 매칭"],
    ["report_generation", "리포트"],
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 shadow-sm">
              <i className="ri-scales-3-line text-xs text-white" />
            </div>
            <span className="text-sm font-bold text-gray-900">ClaimLens Agent</span>
            {isLoading && (
              <span className="inline-flex items-center gap-1 rounded border border-teal-100 bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-600">
                <i className="ri-loader-4-line animate-spin" />
                실행 중
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isLoading && (
              <button
                onClick={onStop}
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] text-gray-500 transition-all hover:border-red-200 hover:text-red-600"
              >
                중단
              </button>
            )}
            <button
              onClick={onReset}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] text-gray-500 transition-all hover:border-teal-200 hover:text-teal-600"
            >
              새 검토
            </button>
          </div>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <p className="mb-4 text-[11px] text-gray-400">&ldquo;{query}&rdquo;</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            {steps.map(([id, label], index) => {
              const state = completed.has(id) ? "done" : started.has(id) ? "running" : "waiting";
              return (
                <div key={id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-gray-400">0{index + 1}</span>
                    <StepPill state={state} />
                  </div>
                  <p className="mt-2 text-xs font-bold text-gray-800">{label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile label="후보" value={summary.candidateCount} tone={summary.topScore < 0.45 ? "warn" : "ok"} />
        <SummaryTile label="최고 관련도" value={formatScore(summary.topScore)} tone={summary.topScore < 0.45 ? "warn" : "ok"} />
        <SummaryTile label="청구항 요소" value={summary.claimElementCount} tone={summary.claimElementCount === 0 ? "warn" : "neutral"} />
        <SummaryTile label="매칭" value={`${summary.matchedCount}/${summary.rowCount}`} tone={summary.matchedCount === 0 ? "warn" : "ok"} />
      </div>

      <SupervisorDecisionPanel decision={latestDecision} autoIngest={autoIngest} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <CandidatePanel candidates={candidates} />
          <ClaimChartPanel rows={chartRows} />
          <ReportPanel markdown={reportMarkdown} />
        </div>
        <div className="space-y-4">
          <SmallPanel title="제품 기능" count={features.length}>
            {features.length === 0 ? (
              <EmptyPanelText text="입력 분석 대기 중" />
            ) : (
              features.map((feature, index) => (
                <div key={index} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-[11px] font-semibold text-gray-400">Feature {index + 1}</p>
                  <p className="mt-1 text-sm leading-5 text-gray-800">{String(feature)}</p>
                </div>
              ))
            )}
          </SmallPanel>
          <AutoIngestDebugPanel events={events} />
          <EventLog events={events} />
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

function CandidatePanel({ candidates }: { candidates: unknown[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h3 className="text-sm font-bold text-gray-900">검색 후보</h3>
        <span className="rounded border border-gray-100 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
          {candidates.length}
        </span>
      </div>
      <div className="p-3">
        {candidates.length === 0 ? (
          <EmptyPanelText text="후보 검색 대기 중" />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {candidates.map((candidate, index) => <CandidateItem key={index} candidate={candidate} />)}
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
          <span className="font-mono text-[11px] text-teal-700">cutoff {formatScore(data.rerankMinScore)}</span>
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
          </div>
        );
      })}
    </SmallPanel>
  );
}

function ClaimChartPanel({ rows }: { rows: ClaimLensEvent[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h3 className="text-sm font-bold text-gray-900">청구항 대조표</h3>
        <span className="rounded border border-teal-100 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">
          {rows.length} rows
        </span>
      </div>
      <div className="space-y-2 p-3">
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
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold leading-6 text-gray-900">{String(data.claimElement ?? "-")}</p>
        <MatchBadge value={String(data.match ?? "unknown")} />
      </div>
      <p className="mt-2 text-xs leading-5 text-gray-600">
        {String(data.productFeature ?? "매칭된 제품 기능 없음")}
      </p>
      {typeof data.evidence === "string" && data.evidence.length > 0 && (
        <p className="mt-3 rounded-lg border border-teal-100 bg-white p-2 text-[11px] leading-5 text-teal-700">{data.evidence}</p>
      )}
      {typeof data.uncertainty === "string" && data.uncertainty.length > 0 && (
        <p className="mt-2 text-[11px] leading-5 text-amber-700">{data.uncertainty}</p>
      )}
    </div>
  );
}

function ReportPanel({ markdown }: { markdown: string }) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <h3 className="text-sm font-bold text-gray-900">기술 검토 초안</h3>
      </div>
      <div className="p-5">
        <p className="whitespace-pre-wrap text-sm leading-7 text-gray-700">{markdown || "리포트 생성 대기 중입니다."}</p>
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

function CandidateItem({ candidate }: { candidate: unknown }) {
  const data = asRecord(candidate);
  const patent = asRecord(data.patent);
  const score = typeof data.score === "number" ? data.score : undefined;
  const low = typeof score === "number" && score < 0.45;
  return (
    <div className={`rounded-lg border p-3 ${low ? "border-amber-100 bg-amber-50/60" : "border-gray-100 bg-gray-50"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-5 text-gray-900">{String(patent.title ?? "제목 없음")}</p>
        <span className={`font-mono text-[10px] ${low ? "text-amber-700" : "text-teal-700"}`}>{formatScore(score)}</span>
      </div>
      <p className="mt-1 font-mono text-[11px] text-gray-400">
        {String(patent.applicationNumber ?? "-")} · {String(data.matchedTextType ?? "-")}
      </p>
      {low && <p className="mt-2 text-[11px] font-medium text-amber-700">관련도가 낮아 자동 수집/재검색 대상입니다.</p>}
    </div>
  );
}

function MatchBadge({ value }: { value: string }) {
  const klass =
    value === "matched"
      ? "border-green-100 bg-green-50 text-green-700"
      : value === "partial"
        ? "border-amber-100 bg-amber-50 text-amber-700"
        : value === "not_found"
          ? "border-red-100 bg-red-50 text-red-700"
          : "border-gray-100 bg-gray-50 text-gray-500";
  return <span className={`shrink-0 rounded border px-2 py-1 text-[11px] font-semibold ${klass}`}>{value}</span>;
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
  return typeof value === "number" ? value.toFixed(3) : "-";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
