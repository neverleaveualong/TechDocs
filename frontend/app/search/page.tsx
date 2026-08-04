"use client";

import { useState } from "react";
import SearchBar from "@/components/search/SearchBar";
import AiAnswer from "@/components/search/AiAnswer";
import SearchResults from "@/components/search/SearchResults";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import PageHeader from "@/components/common/PageHeader";
import StatusAlert from "@/components/common/StatusAlert";
import AgentTimeline from "@/components/search/AgentTimeline";
import ClaimLensResult, { AutoIngestDebugPanel, getToolResultArray } from "@/components/search/ClaimLensResult";
import type { ClaimLensCandidate } from "@/types/claimlens";
import { useClaimLensStream } from "@/hooks/useClaimLensStream";
import { useSearchAutoScroll } from "@/hooks/useSearchAutoScroll";
import { useSearchStream } from "@/hooks/useSearchStream";

type SearchMode = "rag" | "claimlens";

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
  const [activeQuery, setActiveQuery] = useState("");
  const ragStream = useSearchStream();
  const claimLensStream = useClaimLensStream();

  const streamedAnswer = ragStream.answer;
  const streamedSources = ragStream.sources;
  const queryLogId = ragStream.queryLogId;
  const ragEvents = ragStream.events;
  const claimLensEvents = claimLensStream.events;
  const isLoading = mode === "rag" ? ragStream.isLoading : claimLensStream.isLoading;
  const isStreaming = mode === "rag" && ragStream.isStreaming;
  const error = mode === "rag" ? ragStream.error : claimLensStream.error;

  const hasReport = claimLensEvents.some((event) => event.type === "final_report");
  const { timelineRef, resultRef } = useSearchAutoScroll({
    eventCount: ragEvents.length + claimLensEvents.length,
    isLoading,
    hasResult: Boolean(streamedAnswer || streamedSources.length > 0 || hasReport),
    isStreaming,
    streamedAnswer,
  });

  const handleSearch = (query: string) => {
    setActiveQuery(query);
    if (mode === "rag") {
      ragStream.start(query);
    } else {
      claimLensStream.start(query);
    }
  };

  const switchMode = (nextMode: SearchMode) => {
    ragStream.reset();
    claimLensStream.reset();
    setMode(nextMode);
    setActiveQuery("");
  };

  const quickQueries = mode === "rag" ? ragQueries : claimLensQueries;
  const report = claimLensEvents.findLast((event) => event.type === "final_report");
  const chartRows = claimLensEvents.filter((event) => event.type === "claim_chart_row");
  const features = getToolResultArray(claimLensEvents, "extract_product_features", "features");
  const candidates = getToolResultArray<ClaimLensCandidate>(claimLensEvents, "search_claim_candidates", "candidates");

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        icon={mode === "rag" ? "ri-robot-line" : "ri-scales-3-line"}
        title={mode === "rag" ? "특허 검색 (RAG)" : "특허 침해 분석 (AI AGENT)"}
        description={
          mode === "rag"
            ? "자연어 질문으로 관련 특허를 찾고 핵심 내용을 요약합니다."
            : "제품 기술 설명과 특허 청구범위를 대조하여 침해 위험을 분석합니다."
        }
      />

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
            onCancel={() => (mode === "rag" ? ragStream.cancel() : claimLensStream.cancel())}
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
            <StatusAlert title={mode === "rag" ? "검색 오류" : "ClaimLens 오류"}>
              {error}
            </StatusAlert>
          )}

          {mode === "rag" && (streamedAnswer || streamedSources.length > 0 || ragEvents.length > 0) && (
            <div className="space-y-4 animate-fade-in">
              <AgentTimeline events={ragEvents} />
              <div ref={timelineRef} className="h-6" />
              {(streamedAnswer || streamedSources.length > 0) && (
                <div className="space-y-4">
                  <div ref={resultRef}>
                    <AiAnswer answer={streamedAnswer} query={activeQuery} queryLogId={queryLogId} isStreaming={isStreaming} />
                  </div>
                  <SearchResults sources={streamedSources} />
                </div>
              )}
              <AutoIngestDebugPanel events={ragEvents} />
              {(streamedAnswer || streamedSources.length > 0) && (
                <ResetButton
                  onClick={() => {
                    ragStream.reset();
                  }}
                />
              )}
            </div>
          )}

          {mode === "claimlens" && (claimLensEvents.length > 0 || isLoading) && (
            <div>
              {!isLoading && <div ref={resultRef} />}
              <ClaimLensResult
                query={activeQuery}
                events={claimLensEvents}
                isLoading={isLoading}
                features={features}
                candidates={candidates}
                chartRows={chartRows}
                reportMarkdown={String(report?.data?.markdown ?? "")}
                onStop={claimLensStream.cancel}
                onReset={() => {
                  claimLensStream.reset();
                }}
              />
              <div ref={timelineRef} className="h-6" />
            </div>
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
