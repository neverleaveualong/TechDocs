"use client";

import { useState, useEffect } from "react";
import { getStats } from "@/lib/api";

interface CompanyStats {
  applicant: string;
  patent_count: number;
  vector_count: number;
}

interface Stats {
  total_vectors: number;
  dimension: number;
  index_name: string;
  companies: CompanyStats[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [showAll, setShowAll] = useState(false);

  const fetchStats = async () => {
    try {
      const data = await getStats();
      setStats(data);
      setError(null);
      setLastUpdated(new Date().toLocaleTimeString("ko-KR"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "통계 조회 실패");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const totalPatents = stats?.companies.reduce((sum, c) => sum + c.patent_count, 0) ?? 0;
  const totalCompanies = stats?.companies.length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 페이지 헤더 */}
      <header className="bg-white border-b border-gray-200">
        <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-sm">
                  <i className="ri-bar-chart-line text-white text-sm" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">대시보드</h1>
              </div>
              <p className="text-sm text-gray-500 hidden sm:block pl-11">
                Pinecone 벡터 DB 실시간 현황
              </p>
            </div>
            <div className="flex items-center gap-3">
              {lastUpdated && (
                <span className="text-[11px] text-gray-400 hidden sm:block">
                  마지막 조회: {lastUpdated}
                </span>
              )}
              <button
                onClick={() => { setIsLoading(true); fetchStats(); }}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-100 rounded-lg hover:bg-teal-100 disabled:opacity-50 transition-colors"
              >
                <i className={`ri-refresh-line ${isLoading ? "animate-spin" : ""}`} />
                새로고침
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-5">
        {/* 에러 */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm">
            <i className="ri-error-warning-line text-red-400 text-lg mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-red-700 mb-0.5">통계 조회 실패</p>
              <p className="text-red-600 text-xs">{error}</p>
              <p className="text-red-500 text-[11px] mt-1">백엔드 서버가 실행 중인지 확인하세요 (http://localhost:8000)</p>
            </div>
          </div>
        )}

        {/* 로딩 스켈레톤 */}
        {isLoading && !stats && (
          <div className="space-y-5">
            {/* 안내 메시지 */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl">
              <i className="ri-loader-4-line animate-spin text-teal-500 text-lg" />
              <div>
                <p className="text-sm font-medium text-gray-700">Pinecone에서 데이터를 가져오고 있습니다</p>
                <p className="text-[11px] text-gray-400 mt-0.5">벡터 메타데이터를 조회하여 회사별 통계를 집계 중입니다</p>
              </div>
            </div>

            {/* 카드 스켈레톤 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-xl p-5">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 animate-pulse mb-3" />
                  <div className="h-8 w-20 bg-gray-100 rounded-lg animate-pulse mb-2" />
                  <div className="h-4 w-16 bg-gray-50 rounded animate-pulse" />
                </div>
              ))}
            </div>

            {/* 테이블 스켈레톤 */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
              </div>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50">
                  <div className="w-6 h-6 rounded-full bg-gray-100 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
                    <div className="h-1.5 bg-gray-50 rounded-full animate-pulse" />
                  </div>
                  <div className="h-4 w-16 bg-gray-50 rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        )}

        {stats && (
          <>
            {/* 통계 카드 4개 */}
            <div className="animate-fade-in grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                    <i className="ri-file-text-line text-white text-base" />
                  </div>
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" title="실시간" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-blue-700 leading-none">
                  {totalPatents.toLocaleString()}
                </div>
                <div className="text-xs font-semibold text-gray-600 mt-2">수집된 특허</div>
              </div>

              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-sm">
                    <i className="ri-building-line text-white text-base" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-amber-700 leading-none">
                  {totalCompanies}
                </div>
                <div className="text-xs font-semibold text-gray-600 mt-2">수집 기업</div>
              </div>
            </div>

            {/* 회사별 수집 현황 */}
            {stats.companies.length > 0 && (
              <div className="animate-fade-in-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900">회사별 수집 현황</h3>
                  <span className="text-[10px] font-medium text-gray-400">
                    {totalCompanies}개사 · 특허 {totalPatents.toLocaleString()}건
                  </span>
                </div>

                <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-500">
                  <div className="col-span-8">기업명</div>
                  <div className="col-span-4 text-right">특허 건수</div>
                </div>

                <div className="divide-y divide-gray-50">
                  {(showAll ? stats.companies : stats.companies.slice(0, 5)).map((company, i) => {
                    const maxPatents = stats.companies[0]?.patent_count || 1;
                    const pct = (company.patent_count / maxPatents) * 100;
                    return (
                      <div
                        key={company.applicant}
                        className="flex flex-col sm:grid sm:grid-cols-12 gap-1 sm:gap-4 px-5 py-3.5 hover:bg-gray-50/50 transition-colors"
                      >
                        <div className="sm:col-span-8 flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span className="text-[13px] font-semibold text-gray-900">{company.applicant}</span>
                            <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
                              <div
                                className="h-full bg-gradient-to-r from-teal-400 to-teal-500 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="sm:hidden flex items-center gap-3 pl-9 text-xs text-gray-500">
                          <span>특허 <span className="font-semibold text-gray-700">{company.patent_count.toLocaleString()}</span>건</span>
                        </div>

                        <div className="hidden sm:flex col-span-4 items-center justify-end">
                          <span className="text-sm font-bold text-gray-900">{company.patent_count.toLocaleString()}</span>
                          <span className="text-[10px] text-gray-400 ml-1">건</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {stats.companies.length > 5 && (
                  <button
                    onClick={() => setShowAll(!showAll)}
                    className="w-full py-3 text-xs font-medium text-gray-500 hover:text-teal-600 hover:bg-gray-50 border-t border-gray-100 transition-colors flex items-center justify-center gap-1"
                  >
                    <i className={showAll ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} />
                    {showAll ? "접기" : `나머지 ${stats.companies.length - 5}개 더보기`}
                  </button>
                )}
              </div>
            )}

            {/* 벡터 0일 때 */}
            {stats.total_vectors === 0 && (
              <div className="animate-fade-in-1 bg-white border border-gray-200 rounded-xl p-10 text-center">
                <i className="ri-inbox-line text-4xl text-gray-300 mb-3 block" />
                <p className="text-sm font-medium text-gray-600">아직 수집된 데이터가 없습니다</p>
                <p className="text-xs text-gray-400 mt-1">데이터 수집 페이지에서 특허를 수집해보세요</p>
              </div>
            )}

            {/* 인덱스 정보 */}
            <div className="animate-fade-in-2 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-50 border border-green-100 flex items-center justify-center">
                  <i className="ri-server-line text-green-600 text-sm" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">{stats.index_name}</div>
                  <div className="text-[11px] text-gray-400">
                    Pinecone 인덱스 · OpenAI text-embedding-3-small
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
