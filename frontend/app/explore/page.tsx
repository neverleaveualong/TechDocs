"use client";

import { useState } from "react";
import Header from "@/components/common/Header";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { similaritySearch } from "@/lib/api";
import type { SimilarityResult } from "@/types/search";

export default function ExplorePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SimilarityResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    try {
      const data = await similaritySearch(query.trim());
      setResults(data.results);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">특허 탐색</h1>
        <p className="text-gray-500 mb-6">키워드로 유사한 특허를 탐색합니다 (AI 답변 없이 유사도 검색만)</p>

        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="기술 키워드 입력 (예: 반도체 식각)"
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            탐색
          </button>
        </form>

        {isLoading && <LoadingSpinner message="유사 특허 검색 중..." />}

        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((item, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-white">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-medium text-sm text-gray-900">
                    {item.metadata.invention_title || "제목 없음"}
                  </h3>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    유사도 {(item.score * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  {item.metadata.applicant_name} · {item.metadata.application_number}
                </p>
                <p className="text-xs text-gray-600 line-clamp-2">{item.content}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
