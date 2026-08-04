"use client";

import { demoScenarios, useSearchDemo } from "@/hooks/useSearchDemo";

export default function HomeSearchDemo() {
  const demo = useSearchDemo();

  return (
    <div className="hidden animate-slide-up-1 lg:block" aria-label="특허 검색 동작 예시">
      <div className="flex h-[420px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-sm">
        <div className="mb-3 flex shrink-0 items-center gap-2">
          <div className="flex gap-1.5" aria-hidden="true">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-2.5 w-2.5 rounded-full bg-white/20" />
            ))}
          </div>
          <div className="flex h-5 flex-1 items-center rounded-md bg-white/5 px-2">
            <span className="text-[9px] text-white/20">techdocs.app/search</span>
          </div>
        </div>

        <div className="relative mb-3 shrink-0">
          <div className="flex items-center rounded-lg border border-white/15 bg-white/10 px-3 py-2">
            <i className="ri-search-line mr-2 text-sm text-teal/60" aria-hidden="true" />
            <span className="flex-1 truncate text-[13px] font-medium text-white/90">
              {demo.scenario.query.slice(0, demo.typedLen)}
              {demo.phase === "typing" && <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-teal align-middle" />}
              {demo.phase === "idle" && <span className="text-white/30">검색어를 입력하세요...</span>}
            </span>
            {demo.phase !== "idle" && demo.typedLen > 0 && (
              <span className="ml-2 shrink-0 rounded bg-teal/80 px-2 py-0.5 text-[10px] font-semibold text-white">검색</span>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1" aria-live="polite">
          {demo.phase === "searching" && (
            <div className="space-y-2">
              <div className="h-12 animate-pulse rounded-lg bg-white/5" />
              <div className="space-y-1.5">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="h-9 animate-pulse rounded-lg bg-white/5" />
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <div className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-teal/30 border-t-teal" />
                <span className="text-[10px] text-white/40">AI가 특허를 분석하고 있습니다...</span>
              </div>
            </div>
          )}

          {demo.phase === "result" && (
            <div className="space-y-2">
              {demo.visibleResults >= 1 && (
                <div className="animate-fade-in rounded-lg border border-teal/20 bg-teal/10 p-2.5">
                  <div className="mb-1 flex items-center gap-1.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded bg-teal/80">
                      <i className="ri-robot-line text-[9px] text-white" aria-hidden="true" />
                    </div>
                    <span className="text-[10px] font-semibold text-teal-200">AI 답변</span>
                  </div>
                  <p className="line-clamp-2 text-[10px] leading-relaxed text-white/70">{demo.scenario.answer}</p>
                </div>
              )}
              <div className="space-y-1">
                {demo.scenario.results.map((result, index) =>
                  demo.visibleResults >= index + 2 ? (
                    <div key={result.title} className="animate-fade-in flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
                      <div className="mr-2 min-w-0 flex-1">
                        <p className="truncate text-[10px] font-medium text-white/80">{result.title}</p>
                        <p className="text-[9px] text-white/40">{result.applicant}</p>
                      </div>
                      <span className="shrink-0 rounded bg-teal/10 px-1.5 py-0.5 text-[9px] font-bold text-teal">{result.score}%</span>
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          )}

          {demo.phase === "idle" && (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <i className="ri-robot-line mb-2 block text-2xl text-white/10" aria-hidden="true" />
                <span className="text-[10px] text-white/20">AI 검색 결과가 여기에 표시됩니다</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-center gap-1.5 pt-2" aria-hidden="true">
          {demoScenarios.map((scenario, index) => (
            <div key={scenario.query} className={`h-1.5 w-1.5 rounded-full transition-colors ${index === demoScenarios.indexOf(demo.scenario) ? "bg-teal" : "bg-white/15"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
