"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import SearchBar from "@/components/search/SearchBar";
import AiAnswer from "@/components/search/AiAnswer";
import SearchResults from "@/components/search/SearchResults";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { searchPatents, streamClaimLensAnalysis } from "@/lib/api";
import type { ClaimLensEvent } from "@/types/claimlens";
import type { SearchResponse } from "@/types/search";

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
  const [ragResult, setRagResult] = useState<SearchResponse | null>(null);
  const [claimLensEvents, setClaimLensEvents] = useState<ClaimLensEvent[]>([]);
  const [activeQuery, setActiveQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleSearch = async (query: string) => {
    setActiveQuery(query);
    setIsLoading(true);
    setError(null);
    setRagResult(null);
    setClaimLensEvents([]);
    abortRef.current?.abort();

    try {
      if (mode === "rag") {
        const data = await searchPatents(query);
        setRagResult(data);
      } else {
        const controller = new AbortController();
        abortRef.current = controller;
        await streamClaimLensAnalysis(
          query,
          (event) => setClaimLensEvents((events) => [...events, event]),
          { topK: 5, signal: controller.signal },
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("침해 검토가 중단되었습니다.");
      } else {
        setError(err instanceof Error ? err.message : "검색 중 오류가 발생했습니다.");
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const switchMode = (nextMode: SearchMode) => {
    abortRef.current?.abort();
    setMode(nextMode);
    setError(null);
    setRagResult(null);
    setClaimLensEvents([]);
    setActiveQuery("");
    setIsLoading(false);
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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-sm">
                  <i className={mode === "rag" ? "ri-robot-line text-white text-sm" : "ri-scales-3-line text-white text-sm"} />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                  AI 검색
                </h1>
              </div>
              <p className="text-sm text-gray-500 hidden sm:block pl-11">
                {mode === "rag"
                  ? "자연어로 질문하면 RAG 파이프라인이 관련 특허를 분석합니다"
                  : "제품 설명과 특허 청구항을 비교해 claim chart 초안을 생성합니다"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ModeButton active={mode === "rag"} onClick={() => switchMode("rag")}>
                RAG 검색
              </ModeButton>
              <ModeButton active={mode === "claimlens"} onClick={() => switchMode("claimlens")}>
                침해 검토
              </ModeButton>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 sm:p-6">
          <SearchBar
            onSearch={handleSearch}
            isLoading={isLoading}
            buttonLabel={mode === "rag" ? "검색" : "검토"}
            placeholder={
              mode === "rag"
                ? "자연어로 특허를 검색하세요  (예: 2차전지 열 관리 기술)"
                : "제품/기술 설명을 입력하세요  (예: 검색 이력 기반 문서 추천 서비스)"
            }
          />

          {!ragResult && claimLensEvents.length === 0 && !isLoading && (
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
            <LoadingSpinner message="특허를 검색하고 AI가 분석 중입니다..." />
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

          {mode === "rag" && ragResult && (
            <div className="space-y-4 animate-fade-in">
              <AiAnswer answer={ragResult.answer} query={ragResult.query} queryLogId={ragResult.query_log_id} />
              <SearchResults sources={ragResult.sources} />
              <ResetButton onClick={() => setRagResult(null)} />
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

        {!ragResult && claimLensEvents.length === 0 && !isLoading && !error && (
          <EmptyState mode={mode} />
        )}
      </main>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
        active
          ? "bg-teal-50 text-teal-700 border-teal-200"
          : "bg-gray-50 text-gray-500 border-gray-100 hover:bg-teal-50 hover:text-teal-700"
      }`}
    >
      {children}
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
          ["ri-search-line", "벡터 유사도 검색", "Pinecone에서 코사인 유사도 기반으로 관련 특허 청크를 검색합니다"],
          ["ri-robot-line", "AI 답변 생성", "GPT-4o-mini가 검색된 특허를 분석하고 종합적인 답변을 생성합니다"],
          ["ri-file-text-line", "출처 특허 제공", "답변의 근거가 된 특허 원문과 출원 정보를 함께 제공합니다"],
        ]
      : [
          ["ri-search-eye-line", "Claim 후보 검색", "제품 설명을 임베딩해 관련 청구항과 claim element 후보를 찾습니다"],
          ["ri-node-tree", "구성요소 매칭", "제품 기능과 청구항 구성요소를 matched, partial, not_found, uncertain으로 비교합니다"],
          ["ri-stream-line", "SSE 진행 표시", "분석 단계와 claim chart row를 실시간 이벤트로 보여줍니다"],
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
          {mode === "rag" ? "RAG 파이프라인 처리에 약 10~30초가 소요됩니다" : "침해 검토는 ClaimLens 데이터셋과 Pinecone 인덱스가 필요합니다"}
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
