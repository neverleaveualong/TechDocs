"use client";

import type { PatentSource } from "@/types/search";

interface PatentCardProps {
  patent: PatentSource;
  index?: number;
  onOpen?: (patent: PatentSource) => void;
}

function statusBadge(status: string) {
  if (!status) return null;
  const isRegistered = status === "등록";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
        isRegistered
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-gray-200 bg-gray-50 text-gray-500"
      }`}
    >
      {status}
    </span>
  );
}

function formatScore(score?: number | null) {
  if (typeof score !== "number") return null;
  return score.toFixed(3);
}

export default function PatentCard({ patent, index, onOpen }: PatentCardProps) {
  const date = patent.application_date
    ? `${patent.application_date.slice(0, 4)}.${patent.application_date.slice(4, 6)}.${patent.application_date.slice(6, 8)}`
    : null;
  const score = formatScore(patent.score);
  const matchedTerms = Array.isArray(patent.matched_terms) ? patent.matched_terms.slice(0, 5) : [];

  return (
    <button
      type="button"
      onClick={() => onOpen?.(patent)}
      className="group relative flex w-full gap-4 overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-[0_18px_50px_rgba(15,118,110,0.14)] focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2"
    >
      <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-teal-400 via-blue-500 to-amber-400 opacity-80" />
      {typeof index === "number" && (
        <div className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-[12px] font-black text-gray-500 transition-colors group-hover:border-teal-200 group-hover:bg-teal-50 group-hover:text-teal-700">
          {index + 1}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              {statusBadge(patent.register_status)}
              {score && (
                <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                  관련도 {score}
                </span>
              )}
              {patent.score_type && (
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  {patent.score_type}
                </span>
              )}
            </div>
            <h4 className="line-clamp-2 text-[14px] font-bold leading-5 text-gray-950 transition-colors group-hover:text-teal-800">
              {patent.invention_title || "제목 없음"}
            </h4>
          </div>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-400 transition-all group-hover:border-teal-200 group-hover:bg-teal-50 group-hover:text-teal-700">
            <i className="ri-arrow-right-up-line text-sm" />
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
          <span className="flex min-w-0 items-center gap-1.5">
            <i className="ri-building-4-line text-[12px] text-gray-400" />
            <span className="truncate font-semibold text-gray-700">{patent.applicant_name || "-"}</span>
          </span>
          <span className="flex items-center gap-1.5 font-mono text-gray-500">
            <i className="ri-hashtag text-[12px] text-gray-400" />
            {patent.application_number}
          </span>
          {date && (
            <span className="flex items-center gap-1.5 text-gray-500">
              <i className="ri-calendar-line text-[12px] text-gray-400" />
              {date}
            </span>
          )}
        </div>

        {patent.relevance_text && (
          <p className="mt-3 line-clamp-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-[11px] leading-5 text-gray-600">
            {patent.relevance_text}
          </p>
        )}

        {matchedTerms.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {matchedTerms.map((term) => (
              <span
                key={term}
                className="rounded-full border border-teal-100 bg-teal-50 px-2 py-1 text-[10px] font-semibold text-teal-700"
              >
                {term}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
