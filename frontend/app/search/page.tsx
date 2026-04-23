"use client";

import { useState } from "react";

import LoadingSpinner from "@/components/common/LoadingSpinner";
import AiAnswer from "@/components/search/AiAnswer";
import SearchBar from "@/components/search/SearchBar";
import SearchResults from "@/components/search/SearchResults";
import { searchPatentsStream } from "@/lib/api";
import type { SearchResponse } from "@/types/search";

const quickQueries = [
  { label: "2차전지 열 관리", icon: "ri-battery-charge-line" },
  { label: "반도체 냉각 공정", icon: "ri-cpu-line" },
  { label: "ERP 클라우드", icon: "ri-cloud-line" },
  { label: "자율주행 센서", icon: "ri-car-line" },
  { label: "디스플레이 조명", icon: "ri-tv-line" },
];

function createEmptyResult(query: string): SearchResponse {
  return {
    answer: "",
    sources: [],
    query,
  };
}

export default function SearchPage() {
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setError(null);
    setResult(createEmptyResult(query));

    try {
      await searchPatentsStream(query, (event) => {
        setResult((prev) => {
          const current = prev ?? createEmptyResult(query);

          switch (event.type) {
            case "sources":
              return {
                ...current,
                query: event.query,
                sources: event.sources,
              };
            case "answer_delta":
              return {
                ...current,
                answer: current.answer + event.delta,
              };
            case "done":
              return {
                ...current,
                query: event.query,
                query_log_id: event.query_log_id,
              };
            default:
              return current;
          }
        });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "검색 중 오류가 발생했습니다.");
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-sm">
                  <i className="ri-robot-line text-white text-sm" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">AI 검색</h1>
              </div>
              <p className="text-sm text-gray-500 hidden sm:block pl-11">
                자연어로 질문하면 RAG 파이프라인이 관련 특허를 분석합니다.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs text-gray-400">
              <span className="px-2 py-1 bg-teal-50 text-teal-600 rounded-md font-medium border border-teal-100">
                RAG
              </span>
              <span className="px-2 py-1 bg-gray-50 text-gray-500 rounded-md font-medium border border-gray-100">
                GPT-4o-mini
              </span>
              <span className="px-2 py-1 bg-gray-50 text-gray-500 rounded-md font-medium border border-gray-100">
                Pinecone
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 sm:p-6">
          <SearchBar onSearch={handleSearch} isLoading={isLoading} />

          {!result && !isLoading && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
              <span className="text-[11px] text-gray-400 font-medium leading-7">추천 검색어</span>
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
          {isLoading && !result?.answer && <LoadingSpinner message="관련 특허를 검색하고 AI 답변을 생성 중입니다..." />}

          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <i className="ri-error-warning-line text-red-400 text-lg mt-0.5 shrink-0" />
              <div>
                <p className="font-medium mb-0.5">검색 오류</p>
                <p className="text-red-600">{error}</p>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-4 animate-fade-in">
              <AiAnswer
                answer={result.answer}
                query={result.query}
                queryLogId={result.query_log_id}
                isStreaming={isLoading}
              />
              <SearchResults sources={result.sources} />
              <div className="flex justify-center">
                <button
                  onClick={() => setResult(null)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:text-teal-600 hover:border-teal-200 transition-all"
                >
                  <i className="ri-refresh-line" />
                  다시 검색
                </button>
              </div>
            </div>
          )}
        </div>

        {!result && !isLoading && !error && (
          <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
              <div className="p-8 text-center">
                <div className="w-12 h-12 flex items-center justify-center mx-auto mb-4 bg-teal-50 rounded-xl">
                  <i className="ri-search-line text-xl text-teal-500" />
                </div>
                <h4 className="text-sm font-bold text-gray-900 mb-1">벡터 유사도 검색</h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Pinecone에서 코사인 유사도 기반으로 관련 특허 청크를 검색합니다.
                </p>
              </div>
              <div className="p-8 text-center">
                <div className="w-12 h-12 flex items-center justify-center mx-auto mb-4 bg-teal-50 rounded-xl">
                  <i className="ri-robot-line text-xl text-teal-500" />
                </div>
                <h4 className="text-sm font-bold text-gray-900 mb-1">AI 답변 생성</h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  GPT-4o-mini가 검색된 특허를 바탕으로 답변을 생성합니다.
                </p>
              </div>
              <div className="p-8 text-center">
                <div className="w-12 h-12 flex items-center justify-center mx-auto mb-4 bg-teal-50 rounded-xl">
                  <i className="ri-file-text-line text-xl text-teal-500" />
                </div>
                <h4 className="text-sm font-bold text-gray-900 mb-1">관련 특허 제공</h4>
                <p className="text-xs text-gray-500 leading-relaxed">
                  답변 근거가 되는 관련 특허와 출원 정보를 함께 제공합니다.
                </p>
              </div>
            </div>
            <div className="border-t border-gray-100 bg-gray-50/50 px-8 py-4 text-center">
              <p className="text-[11px] text-gray-400">
                <i className="ri-time-line mr-1" />
                검색 결과와 답변은 fetch streaming으로 순차 표시됩니다.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
