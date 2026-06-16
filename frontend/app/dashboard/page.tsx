"use client";

import { useEffect, useState } from "react";

import { getStats } from "@/lib/api";
import type { Stats } from "@/types/stats";

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");
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

  const totalPatents = stats?.companies.reduce((sum, company) => sum + company.patent_count, 0) ?? 0;
  const totalCompanies = stats?.companies.length ?? 0;
  const ragVectors = stats?.namespaces.rag.vector_count ?? 0;
  const agentVectors = stats?.namespaces.agent.vector_count ?? 0;
  const claimlens = stats?.claimlens;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="mb-1 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 shadow-sm">
                  <i className="ri-bar-chart-line text-sm text-white" />
                </div>
                <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">데이터 검증 대시보드</h1>
              </div>
              <p className="hidden pl-11 text-sm text-gray-500 sm:block">
                RAG 검색과 ClaimLens 저장 상태를 함께 확인합니다.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {lastUpdated && (
                <span className="hidden text-[11px] text-gray-400 sm:block">마지막 조회: {lastUpdated}</span>
              )}
              <button
                onClick={() => {
                  setIsLoading(true);
                  fetchStats();
                }}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-teal-100 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-100 disabled:opacity-50"
              >
                <i className={`ri-refresh-line ${isLoading ? "animate-spin" : ""}`} />
                새로고침
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="space-y-5 px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
            <i className="ri-error-warning-line mt-0.5 shrink-0 text-lg text-red-400" />
            <div>
              <p className="mb-0.5 font-medium text-red-700">통계 조회 실패</p>
              <p className="text-xs text-red-600">{error}</p>
            </div>
          </div>
        )}

        {isLoading && !stats && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
              <i className="ri-loader-4-line animate-spin text-lg text-teal-500" />
              <div>
                <p className="text-sm font-medium text-gray-700">Pinecone과 PostgreSQL 통계를 불러오는 중입니다</p>
                <p className="mt-0.5 text-[11px] text-gray-400">RAG namespace와 ClaimLens 저장 상태를 함께 확인합니다.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-xl border border-gray-100 bg-white p-5">
                  <div className="mb-3 h-9 w-9 animate-pulse rounded-lg bg-gray-100" />
                  <div className="mb-2 h-8 w-20 animate-pulse rounded-lg bg-gray-100" />
                  <div className="h-4 w-16 animate-pulse rounded bg-gray-50" />
                </div>
              ))}
            </div>
          </div>
        )}

        {stats && (
          <>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              <MetricCard icon="ri-database-2-line" label="전체 벡터" value={stats.total_vectors} color="blue" />
              <MetricCard icon="ri-search-eye-line" label="RAG 벡터" value={ragVectors} color="teal" />
              <MetricCard icon="ri-file-list-3-line" label="ClaimLens 특허" value={claimlens?.patents ?? 0} color="amber" />
              <MetricCard icon="ri-shapes-line" label="ClaimLens 벡터" value={agentVectors} color="violet" />
            </section>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SubMetric label="청구항" value={claimlens?.claims ?? 0} description="저장된 청구항" />
              <SubMetric label="구성요소" value={claimlens?.claim_elements ?? 0} description="파싱된 claim element" />
              <SubMetric label="독립항" value={claimlens?.independent_claims ?? 0} description="독립 청구항" />
              <SubMetric label="청구항 보유 특허" value={claimlens?.patents_with_claims ?? 0} description="청구항 원문이 있는 특허" />
            </section>

            {stats.company_stats_sampled && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
                회사별 수집 현황은 응답 속도를 위해 RAG 벡터 최대 {stats.company_sample_limit.toLocaleString()}개를 샘플링해 집계했습니다.
              </div>
            )}

            {stats.companies.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                  <h3 className="text-sm font-bold text-gray-900">회사별 수집 현황</h3>
                  <span className="text-[10px] font-medium text-gray-400">
                    {totalCompanies}개사 · 특허 {totalPatents.toLocaleString()}건
                  </span>
                </div>

                <div className="hidden grid-cols-12 gap-4 border-b border-gray-100 bg-gray-50 px-5 py-2.5 text-[11px] font-semibold text-gray-500 sm:grid">
                  <div className="col-span-8">회사</div>
                  <div className="col-span-4 text-right">특허</div>
                </div>

                <div className="divide-y divide-gray-50">
                  {(showAll ? stats.companies : stats.companies.slice(0, 5)).map((company, i) => {
                    const maxPatents = stats.companies[0]?.patent_count || 1;
                    const pct = (company.patent_count / maxPatents) * 100;
                    return (
                      <div
                        key={company.applicant}
                        className="flex flex-col gap-1 px-5 py-3.5 transition-colors hover:bg-gray-50/50 sm:grid sm:grid-cols-12 sm:gap-4"
                      >
                        <div className="flex items-center gap-3 sm:col-span-8">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-600 text-[10px] font-bold text-white shadow-sm">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="text-[13px] font-semibold text-gray-900">{company.applicant}</span>
                            <div className="mt-1 hidden h-1.5 overflow-hidden rounded-full bg-gray-100 sm:block">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-teal-400 to-teal-500 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pl-9 text-xs text-gray-500 sm:hidden">
                          <span>
                            특허 <span className="font-semibold text-gray-700">{company.patent_count.toLocaleString()}</span>건
                          </span>
                        </div>

                        <div className="hidden items-center justify-end sm:col-span-4 sm:flex">
                          <span className="text-sm font-bold text-gray-900">{company.patent_count.toLocaleString()}</span>
                          <span className="ml-1 text-[10px] text-gray-400">건</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {stats.companies.length > 5 && (
                  <button
                    onClick={() => setShowAll(!showAll)}
                    className="flex w-full items-center justify-center gap-1 border-t border-gray-100 py-3 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-teal-600"
                  >
                    <i className={showAll ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} />
                    {showAll ? "접기" : `나머지 ${stats.companies.length - 5}개 더보기`}
                  </button>
                )}
              </div>
            )}

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-green-100 bg-green-50">
                  <i className="ri-server-line text-sm text-green-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">{stats.index_name}</div>
                  <div className="text-[11px] text-gray-400">Pinecone · OpenAI text-embedding-3-small</div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  color: "blue" | "teal" | "amber" | "violet";
}) {
  const colors = {
    blue: { bg: "from-blue-500 to-blue-600", text: "text-blue-700" },
    teal: { bg: "from-teal-500 to-teal-600", text: "text-teal-700" },
    amber: { bg: "from-amber-500 to-amber-600", text: "text-amber-700" },
    violet: { bg: "from-violet-500 to-violet-600", text: "text-violet-700" },
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${colors[color].bg} shadow-sm`}>
          <i className={`${icon} text-base text-white`} />
        </div>
      </div>
      <div className={`text-2xl font-extrabold leading-none tracking-tight sm:text-3xl ${colors[color].text}`}>
        {value.toLocaleString()}
      </div>
      <div className="mt-2 text-xs font-semibold text-gray-600">{label}</div>
    </div>
  );
}

function SubMetric({ label, value, description }: { label: string; value: number; description: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold text-gray-400">{label}</div>
      <div className="mt-2 text-2xl font-bold text-gray-900">{value.toLocaleString()}</div>
      <div className="mt-2 text-xs text-gray-500">{description}</div>
    </div>
  );
}
