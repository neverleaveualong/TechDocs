"use client";

import { useState } from "react";
import Header from "@/components/common/Header";
import SearchBar from "@/components/search/SearchBar";
import AiAnswer from "@/components/search/AiAnswer";
import SearchResults from "@/components/search/SearchResults";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { searchPatents } from "@/lib/api";
import type { SearchResponse } from "@/types/search";

export default function SearchPage() {
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await searchPatents(query);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "검색 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            특허 AI 검색
          </h1>
          <p className="text-gray-500">
            자연어로 질문하면 관련 특허를 찾아 AI가 분석해드립니다
          </p>
        </div>

        <SearchBar onSearch={handleSearch} isLoading={isLoading} />

        <div className="mt-8 space-y-6">
          {isLoading && <LoadingSpinner message="특허를 검색하고 AI가 분석 중입니다..." />}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          {result && (
            <>
              <AiAnswer answer={result.answer} query={result.query} />
              <SearchResults sources={result.sources} />
            </>
          )}
        </div>
      </main>
    </>
  );
}
