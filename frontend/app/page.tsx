"use client";

import Link from "next/link";
import { useSearchDemo, demoScenarios } from "@/hooks/useSearchDemo";

const featureCards = [
  {
    title: "AI 특허 검색",
    desc: "자연어 질문 → 벡터 유사도 검색 → LLM이 관련 특허를 분석하고 답변을 생성합니다.",
    icon: "ri-robot-line",
    href: "/search",
    tag: "RAG + LLM",
  },
  {
    title: "데이터 수집",
    desc: "KIPRIS 공공 API에서 기업별 특허를 수집하고, 임베딩 후 Pinecone에 저장합니다.",
    icon: "ri-database-2-line",
    href: "/upload",
    tag: "KIPRIS API",
  },
  {
    title: "대시보드",
    desc: "수집된 벡터 현황, 기업별 특허 수, 기술 스택 구성을 한눈에 확인합니다.",
    icon: "ri-bar-chart-line",
    href: "/dashboard",
    tag: "통계 현황",
  },
];

const techTags = [
  { icon: "ri-openai-fill", label: "GPT-4o-mini" },
  { icon: "ri-database-2-line", label: "Pinecone" },
  { icon: "ri-code-line", label: "LangChain" },
  { icon: "ri-server-line", label: "FastAPI" },
  { icon: "ri-global-line", label: "KIPRIS" },
];

export default function HomePage() {
  const demo = useSearchDemo();

  return (
    <div className="w-full">
      {/* ── 히어로 ── */}
      <section className="relative overflow-hidden bg-brand-900">
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-teal/8 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-brand-700/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
            {/* 좌측 */}
            <div className="animate-slide-up pt-2">
              <div className="flex items-center gap-3 mb-5">
                <img src="/favicon.svg" alt="TechDocs" className="w-10 h-10 rounded-xl shadow-lg" />
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  <span className="text-teal">T</span>
                  <span className="text-white">ech</span>
                  <span className="text-teal">D</span>
                  <span className="text-white">ocs</span>
                </h1>
              </div>

              <h2 className="text-white text-lg sm:text-xl font-bold leading-snug mb-3">
                AI가 특허를 읽고,<br />
                <span className="text-teal">핵심만 요약</span>해드립니다.
              </h2>
              <p className="text-brand-200/80 text-sm leading-relaxed mb-6 max-w-md">
                KIPRIS 특허 데이터를 벡터 DB에 저장하고,
                자연어 질문만으로 관련 특허를 검색 · 분석합니다.
              </p>

              <div className="flex flex-wrap gap-3 mb-6">
                <Link
                  href="/search"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal text-brand-900 text-sm font-semibold rounded-lg hover:bg-teal-200 transition-colors shadow-md"
                >
                  <i className="ri-robot-line" />
                  AI 검색 시작
                </Link>
                <Link
                  href="/upload"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 text-white text-sm font-medium rounded-lg border border-white/15 hover:bg-white/20 transition-colors"
                >
                  <i className="ri-database-2-line" />
                  데이터 수집
                </Link>
              </div>

              <div className="flex flex-wrap gap-2">
                {techTags.map((t) => (
                  <span
                    key={t.label}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-teal-200/70 border border-teal/15 rounded-md bg-teal/5"
                  >
                    <i className={`${t.icon} text-teal/50`} />
                    {t.label}
                  </span>
                ))}
              </div>
            </div>

            {/* 우측 인터랙티브 데모 */}
            <div className="animate-slide-up-1 hidden lg:block">
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4 shadow-2xl h-[420px] overflow-hidden flex flex-col">
                {/* 브라우저 바 */}
                <div className="flex items-center gap-2 mb-3 shrink-0">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                    <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                    <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                  </div>
                  <div className="flex-1 h-5 bg-white/5 rounded-md flex items-center px-2">
                    <span className="text-[9px] text-white/20">techdocs.app/search</span>
                  </div>
                </div>

                {/* 검색바 */}
                <div className="relative mb-3 shrink-0">
                  <div className="flex items-center bg-white/10 border border-white/15 rounded-lg px-3 py-2">
                    <i className="ri-search-line text-teal/60 mr-2 text-sm" />
                    <span className="text-[13px] text-white/90 font-medium flex-1 truncate">
                      {demo.scenario.query.slice(0, demo.typedLen)}
                      {demo.phase === "typing" && (
                        <span className="inline-block w-0.5 h-3.5 bg-teal ml-0.5 align-middle" style={{ animation: "pulse 0.8s ease infinite" }} />
                      )}
                      {demo.phase === "idle" && (
                        <span className="text-white/30">검색어를 입력하세요...</span>
                      )}
                    </span>
                    {demo.phase !== "idle" && demo.typedLen > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-teal/80 text-white text-[10px] font-semibold rounded shrink-0">
                        검색
                      </span>
                    )}
                  </div>
                </div>

                {/* 콘텐츠 영역 */}
                <div className="flex-1 min-h-0">
                  {demo.phase === "searching" && (
                    <div className="space-y-2">
                      <div className="h-12 bg-white/5 rounded-lg animate-pulse" />
                      <div className="space-y-1.5">
                        <div className="h-9 bg-white/5 rounded-lg animate-pulse" />
                        <div className="h-9 bg-white/5 rounded-lg animate-pulse" />
                        <div className="h-9 bg-white/5 rounded-lg animate-pulse" />
                        <div className="h-9 bg-white/5 rounded-lg animate-pulse" />
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <div
                          className="w-3 h-3 rounded-full border-2 border-teal/30 border-t-teal shrink-0"
                          style={{ animation: "spin 0.8s linear infinite" }}
                        />
                        <span className="text-[10px] text-white/40">AI가 특허를 분석하고 있습니다...</span>
                      </div>
                    </div>
                  )}

                  {demo.phase === "result" && (
                    <div className="space-y-2">
                      {demo.visibleResults >= 1 && (
                        <div className="bg-teal/10 border border-teal/20 rounded-lg p-2.5 animate-fade-in">
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="w-4 h-4 bg-teal/80 rounded flex items-center justify-center">
                              <i className="ri-robot-line text-white text-[9px]" />
                            </div>
                            <span className="text-[10px] font-semibold text-teal-200">AI 답변</span>
                          </div>
                          <p className="text-[10px] text-white/70 leading-relaxed line-clamp-2">
                            {demo.scenario.answer}
                          </p>
                        </div>
                      )}

                      <div className="space-y-1">
                        {demo.scenario.results.map((r, i) =>
                          demo.visibleResults >= i + 2 ? (
                            <div
                              key={i}
                              className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 animate-fade-in"
                            >
                              <div className="min-w-0 flex-1 mr-2">
                                <p className="text-[10px] font-medium text-white/80 truncate">{r.title}</p>
                                <p className="text-[9px] text-white/40">{r.applicant}</p>
                              </div>
                              <span className="text-[9px] font-bold text-teal shrink-0 bg-teal/10 px-1.5 py-0.5 rounded">
                                {r.score}%
                              </span>
                            </div>
                          ) : null
                        )}
                      </div>
                    </div>
                  )}

                  {demo.phase === "idle" && (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center">
                        <i className="ri-robot-line text-2xl text-white/10 mb-2 block" />
                        <span className="text-[10px] text-white/20">AI 검색 결과가 여기에 표시됩니다</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 시나리오 인디케이터 */}
                <div className="flex justify-center gap-1.5 pt-2 shrink-0">
                  {demoScenarios.map((_, i) => (
                    <div
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        i === demoScenarios.indexOf(demo.scenario) ? "bg-teal" : "bg-white/15"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 주요 기능 ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <h2 className="text-[11px] font-bold text-teal-600 uppercase tracking-widest mb-5">
          주요 기능
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {featureCards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="group bg-white border border-gray-100 rounded-xl p-5 hover:border-teal-200 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center shrink-0 group-hover:bg-teal-100 transition-colors">
                  <i className={`${card.icon} text-lg text-teal-600`} />
                </div>
                <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100 uppercase tracking-wide">
                  {card.tag}
                </span>
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1.5">{card.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{card.desc}</p>
              <div className="mt-3 flex items-center gap-1 text-xs font-medium text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity">
                바로가기 <i className="ri-arrow-right-s-line" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── 푸터 ── */}
      <footer className="border-t border-gray-100 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="w-5 h-5 rounded" />
            <span className="text-xs font-semibold text-gray-500">
              <span className="text-teal-600">T</span>ech<span className="text-teal-600">D</span>ocs
            </span>
          </div>
          <p className="text-[10px] text-gray-400">
            Built with RAG · Pinecone · LangChain · OpenAI · KIPRIS
          </p>
        </div>
      </footer>
    </div>
  );
}
