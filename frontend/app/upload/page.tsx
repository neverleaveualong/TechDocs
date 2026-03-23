"use client";

import { useState } from "react";
import Header from "@/components/common/Header";
import { ingestPatents } from "@/lib/api";

export default function UploadPage() {
  const [applicant, setApplicant] = useState("");
  const [pages, setPages] = useState(3);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ patents_collected: number; vectors_stored: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicant.trim()) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await ingestPatents(applicant.trim(), pages);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "데이터 수집 실패");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">데이터 수집</h1>
        <p className="text-gray-500 mb-6">
          KIPRIS에서 특허 데이터를 수집하여 벡터DB에 저장합니다
        </p>

        <form onSubmit={handleIngest} className="space-y-4 bg-white border border-gray-200 rounded-lg p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">출원인 (회사명)</label>
            <input
              type="text"
              value={applicant}
              onChange={(e) => setApplicant(e.target.value)}
              placeholder="예: 삼성전자"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">페이지 수 (1페이지 = ~20건)</label>
            <input
              type="number"
              value={pages}
              onChange={(e) => setPages(Number(e.target.value))}
              min={1}
              max={10}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !applicant.trim()}
            className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {isLoading ? "수집 중..." : "데이터 수집 시작"}
          </button>
        </form>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 text-sm">
            수집 완료: 특허 {result.patents_collected}건 → 벡터 {result.vectors_stored}건 저장
          </div>
        )}
      </main>
    </>
  );
}
