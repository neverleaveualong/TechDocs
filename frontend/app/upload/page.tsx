"use client";

import { useState } from "react";
import { ingestPatents } from "@/lib/api";

const presetCompanies = [
  { name: "삼성전자", tag: "반도체" },
  { name: "에스케이하이닉스", tag: "메모리" },
  { name: "현대자동차", tag: "모빌리티" },
  { name: "더존비즈온", tag: "ERP" },
  { name: "엘지에너지솔루션", tag: "배터리" },
];

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
    <div className="min-h-screen bg-gray-50">
      {/* 페이지 헤더 */}
      <header className="bg-white border-b border-gray-200">
        <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-sm">
              <i className="ri-download-cloud-2-line text-white text-sm" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">데이터 수집</h1>
          </div>
          <p className="text-sm text-gray-500 hidden sm:block pl-11">
            KIPRIS 공공 API에서 특허를 수집하여 Pinecone 벡터 DB에 저장합니다
          </p>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div className="space-y-5">
          {/* 수집 폼 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 sm:p-8">
            <form onSubmit={handleIngest} className="space-y-6">
              {/* 출원인 입력 */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  출원인 (회사명)
                </label>
                <input
                  type="text"
                  value={applicant}
                  onChange={(e) => setApplicant(e.target.value)}
                  placeholder="KIPRIS에 등록된 공식 법인명을 입력하세요"
                  className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-50 transition-all"
                />
                <div className="flex flex-wrap gap-2 mt-3">
                  {presetCompanies.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => setApplicant(c.name)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
                        applicant === c.name
                          ? "bg-teal-50 text-teal-700 border-teal-200 font-semibold"
                          : "bg-gray-50 text-gray-500 border-gray-100 hover:bg-teal-50 hover:text-teal-600 hover:border-teal-100"
                      }`}
                    >
                      {c.name}
                      <span className="text-[10px] text-gray-400">· {c.tag}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 페이지 수 + 예상 수집량 + 안내 — 3열 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    페이지 수
                  </label>
                  <input
                    type="number"
                    value={pages}
                    onChange={(e) => setPages(Number(e.target.value))}
                    min={1}
                    max={10}
                    className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-50 transition-all"
                  />
                  <p className="text-[11px] text-gray-400 mt-1.5">1페이지 ≈ 특허 20건</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    예상 수집량
                  </label>
                  <div className="px-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium text-gray-700">
                    약 {pages * 20}건
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">벡터 청크 약 {pages * 20 * 3}~{pages * 20 * 5}개</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    예상 소요시간
                  </label>
                  <div className="px-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium text-gray-700">
                    약 {pages <= 3 ? "30초~1분" : pages <= 6 ? "1~3분" : "3~5분"}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">네트워크 상태에 따라 다를 수 있음</p>
                </div>
              </div>

              {/* 수집 버튼 */}
              <button
                type="submit"
                disabled={isLoading || !applicant.trim()}
                className="w-full py-3.5 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500 to-teal-600 text-white text-sm font-semibold rounded-xl hover:from-teal-600 hover:to-teal-700 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {isLoading ? (
                  <>
                    <i className="ri-loader-4-line animate-spin" />
                    수집 중... KIPRIS에서 데이터를 가져오고 있습니다
                  </>
                ) : (
                  <>
                    <i className="ri-download-cloud-2-line" />
                    수집 시작
                  </>
                )}
              </button>
            </form>
          </div>

          {/* 에러 */}
          {error && (
            <div className="animate-fade-in flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <i className="ri-error-warning-line text-red-400 text-lg mt-0.5 shrink-0" />
              <div>
                <p className="font-medium mb-0.5">수집 실패</p>
                <p className="text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* 수집 결과 */}
          {result && (
            <div className="animate-fade-in bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-teal-500 to-teal-600">
                <div className="flex items-center gap-2 text-white">
                  <i className="ri-checkbox-circle-fill text-lg" />
                  <span className="text-sm font-semibold">수집 완료</span>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-5">
                  <div className="bg-gray-50 rounded-xl p-6 text-center border border-gray-100">
                    <i className="ri-file-text-line text-2xl text-gray-400 mb-2 block" />
                    <div className="text-4xl font-extrabold text-gray-900 tracking-tight">
                      {result.patents_collected}
                    </div>
                    <div className="text-xs text-gray-500 font-medium mt-1">특허 수집</div>
                  </div>
                  <div className="bg-teal-50 rounded-xl p-6 text-center border border-teal-100">
                    <i className="ri-database-2-line text-2xl text-teal-400 mb-2 block" />
                    <div className="text-4xl font-extrabold text-teal-700 tracking-tight">
                      {result.vectors_stored}
                    </div>
                    <div className="text-xs text-gray-500 font-medium mt-1">벡터 저장</div>
                  </div>
                </div>
                <p className="text-xs text-gray-400 text-center mt-4">
                  수집된 특허는 AI 검색에서 바로 활용할 수 있습니다
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
