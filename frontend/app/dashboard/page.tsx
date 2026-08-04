"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import PageHeader from "@/components/common/PageHeader";
import StatusAlert from "@/components/common/StatusAlert";
import { getStats } from "@/lib/api";
import type { Stats } from "@/types/stats";

export default function DashboardPage() {
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [showEngineeringDetails, setShowEngineeringDetails] = useState(false);

  const {
    data: stats,
    error,
    isLoading,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useQuery<Stats, Error>({
    queryKey: ["stats"],
    queryFn: getStats,
  });

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("ko-KR")
    : "";
  const errorMessage = error?.message ?? "통계 조회 실패";

  const companies = stats?.companies ?? [];
  const computedTotalPatents = companies.reduce((sum: number, c: { patent_count?: number }) => sum + (c.patent_count || 0), 0);
  const totalPatents = (stats?.summary?.total_patents !== undefined && stats?.summary?.total_patents > 0)
    ? stats.summary.total_patents
    : computedTotalPatents;
  const analyzedPatents = stats?.summary?.analyzed_patents ?? 0;
  const analysisRate = stats?.summary?.analysis_rate ?? (totalPatents > 0 ? Math.round((analyzedPatents / totalPatents) * 1000) / 10 : 0);
  const autoIngest = stats?.auto_ingest;
  const engineering = stats?.engineering_details;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <PageHeader
        icon="ri-dashboard-3-line"
        title="수집 데이터 & AI 분석 대시보드"
        description="수집된 특허 인프라 가공 상태와 AI 분석 준비율을 한눈에 확인합니다."
        actions={
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 shadow-2xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              시스템 정상 가동 중
            </span>
            {stats?.embedding_model && (
              <span className="hidden items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-medium text-gray-600 sm:inline-flex shadow-2xs">
                {stats.index_name} ({stats.embedding_model})
              </span>
            )}
            {lastUpdated && (
              <span className="hidden text-[11px] text-gray-400 md:block">
                마지막 조회: {lastUpdated}
              </span>
            )}
            <button
              onClick={() => void refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50/80 px-3 py-1.5 text-xs font-semibold text-teal-700 transition-all hover:bg-teal-100 disabled:opacity-50"
            >
              <i className={`ri-refresh-line ${isFetching ? "animate-spin" : ""}`} />
              새로고침
            </button>
          </div>
        }
      />

      <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <StatusAlert title="통계 조회 실패">{errorMessage}</StatusAlert>
        )}

        {isLoading && !stats && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-xs">
              <i className="ri-loader-4-line animate-spin text-xl text-teal-500" />
              <div>
                <p className="text-sm font-semibold text-gray-800">시스템 데이터 운용 현황을 불러오는 중입니다</p>
                <p className="mt-0.5 text-xs text-gray-400">데이터베이스 집계 지표를 실시간 조회합니다.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-xl border border-gray-100 bg-white p-5 shadow-xs" />
              ))}
            </div>
          </div>
        )}

        {stats && (
          <>
            {/* 📌 핵심 비즈니스 지표 (Stakeholder Core Metrics) */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                icon="ri-file-copy-2-line"
                label="총 수집 보유 특허"
                value={`${totalPatents.toLocaleString()} 건`}
                subtext="PostgreSQL 데이터베이스 저장 기준"
                color="teal"
              />

              <div className="flex flex-col justify-between rounded-xl border border-gray-200/80 bg-white p-5 shadow-xs transition-all hover:border-gray-300">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500">AI 특허 분석 완료율</span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                    <i className="ri-brain-line text-lg" />
                  </div>
                </div>
                <div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold tracking-tight text-gray-900">{analysisRate}%</span>
                    <span className="text-xs font-semibold text-gray-500">
                      ({analyzedPatents.toLocaleString()} / {totalPatents.toLocaleString()} 건)
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500"
                      style={{ width: `${Math.min(analysisRate, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <MetricCard
                icon="ri-cloud-windy-line"
                label="자동 수집 연동 상태"
                value={autoIngest?.enabled ? "정상 가동 중" : "비활성화"}
                subtext={`오늘 KIPRIS API ${autoIngest?.daily_kipris_calls ?? 0}회 호출 (한도 ${autoIngest?.daily_limit.toLocaleString()}회)`}
                color={autoIngest?.enabled ? "emerald" : "amber"}
              />
            </section>

            {/* 📊 주요 수집 출원인(기업) 현황 */}
            {companies.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-xs">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-gray-50/50">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">주요 수집 출원 기업 (Top {companies.length})</h3>
                    <p className="mt-0.5 text-xs text-gray-500">수집된 특허 데이터의 기업별 비중 현황입니다.</p>
                  </div>
                  <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 border border-teal-100">
                    총 {companies.length}개 주요 기업
                  </span>
                </div>

                <div className="divide-y divide-gray-100">
                  {(showAllCompanies ? companies : companies.slice(0, 5)).map((company, i) => {
                    const maxPatents = companies[0]?.patent_count || 1;
                    const pct = (company.patent_count / maxPatents) * 100;
                    return (
                      <div
                        key={company.applicant}
                        className="flex flex-col gap-2 px-6 py-4 transition-colors hover:bg-gray-50/60 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-center gap-3.5 flex-1 min-w-0">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-gray-900 truncate">{company.applicant}</span>
                              <span className="text-xs font-bold text-teal-700 sm:hidden">
                                {company.patent_count.toLocaleString()} 건
                              </span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                              <div
                                className="h-full rounded-full bg-teal-500 transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="hidden sm:flex items-center justify-end pl-6">
                          <span className="text-sm font-extrabold text-gray-900">{company.patent_count.toLocaleString()}</span>
                          <span className="ml-1 text-xs text-gray-500 font-medium">건</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {companies.length > 5 && (
                  <button
                    onClick={() => setShowAllCompanies(!showAllCompanies)}
                    className="flex w-full items-center justify-center gap-1.5 border-t border-gray-100 py-3 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 hover:text-teal-600"
                  >
                    <i className={showAllCompanies ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} />
                    {showAllCompanies ? "접기" : `전체 ${companies.length}개 기업 더보기`}
                  </button>
                )}
              </div>
            )}

            {/* 🛠️ 엔지니어링 세부 정보 (Developer Deep Dive Toggle) */}
            <div className="pt-2">
              <button
                onClick={() => setShowEngineeringDetails(!showEngineeringDetails)}
                className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
              >
                <i className={`ri-code-s-slash-line ${showEngineeringDetails ? "text-teal-600" : ""}`} />
                <span>{showEngineeringDetails ? "엔지니어링 상세 지표 접기" : "🛠️ 엔지니어링 상세 지표 보기 (개발자 전용)"}</span>
                <i className={showEngineeringDetails ? "ri-chevron-up-line" : "ri-chevron-down-line"} />
              </button>

              {showEngineeringDetails && (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-900 p-5 text-gray-100 space-y-4 shadow-sm animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Engineering Deep Dive Metrics</span>
                    <span className="text-[11px] font-mono text-emerald-400">Pinecone Index: {stats.index_name}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs font-mono">
                    <div className="rounded-lg bg-gray-800/80 p-3">
                      <div className="text-gray-400 text-[11px]">Total Vectors</div>
                      <div className="mt-1 text-lg font-bold text-white">{engineering?.total_vectors.toLocaleString() ?? 0}</div>
                    </div>
                    <div className="rounded-lg bg-gray-800/80 p-3">
                      <div className="text-gray-400 text-[11px]">RAG Chunks Namespace</div>
                      <div className="mt-1 text-lg font-bold text-teal-400">{engineering?.rag_vectors.toLocaleString() ?? 0}</div>
                    </div>
                    <div className="rounded-lg bg-gray-800/80 p-3">
                      <div className="text-gray-400 text-[11px]">Agent Claim Namespace</div>
                      <div className="mt-1 text-lg font-bold text-violet-400">{engineering?.agent_vectors.toLocaleString() ?? 0}</div>
                    </div>
                    <div className="rounded-lg bg-gray-800/80 p-3">
                      <div className="text-gray-400 text-[11px]">Total Claim Elements</div>
                      <div className="mt-1 text-lg font-bold text-amber-400">{stats.summary?.claim_elements?.toLocaleString() ?? 0}</div>
                    </div>
                  </div>
                </div>
              )}
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
  subtext,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  subtext: string;
  color: "teal" | "emerald" | "amber";
}) {
  const colorMap = {
    teal: "text-teal-600 bg-teal-50",
    emerald: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-600 bg-amber-50",
  };

  return (
    <div className="flex flex-col justify-between rounded-xl border border-gray-200/80 bg-white p-5 shadow-xs transition-all hover:border-gray-300">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-500">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colorMap[color]}`}>
          <i className={`${icon} text-lg`} />
        </div>
      </div>
      <div>
        <div className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900">{value}</div>
        <div className="mt-2 text-xs font-medium text-gray-400">{subtext}</div>
      </div>
    </div>
  );
}
