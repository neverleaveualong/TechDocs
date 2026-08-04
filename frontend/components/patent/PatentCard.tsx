"use client";

import type { PatentSource } from "@/types/search";

interface PatentCardProps {
  patent: PatentSource;
  index?: number;
  onOpen?: (patent: PatentSource) => void;
}

function formatDate(value: string) {
  if (!value || value.length < 8) return value || "-";
  return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
}

function formatScore(score?: number | null) {
  if (typeof score !== "number") return "-";
  const percentage = Math.min(Math.round((score / 0.03278) * 100), 100);
  return `${percentage}%`;
}

export default function PatentCard({ patent, index, onOpen }: PatentCardProps) {
  const matchedTerms = Array.isArray(patent.matched_terms) ? patent.matched_terms.slice(0, 5) : [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs transition hover:border-teal-200 hover:shadow-xs space-y-3">
      <div className="flex items-start gap-3">
        {typeof index === "number" && (
          <div className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-xs font-bold text-gray-600">
            {index + 1}
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-1 text-xs">
          <h4 className="text-sm font-bold text-gray-900 leading-snug">
            {patent.invention_title || "특허 명세서"}
          </h4>
          <div className="space-y-0.5 text-gray-500 font-medium">
            <p>• 출원인: <span className="font-semibold text-gray-800">{patent.applicant_name || "-"}</span></p>
            <p>• 출원번호: <span className="font-mono font-semibold text-gray-800">{patent.application_number || "-"}</span></p>
            <p>• 출원일자: <span className="font-semibold text-gray-800">{formatDate(patent.application_date)}</span></p>
          </div>
        </div>

        <div className="shrink-0 rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-center">
          <p className="font-mono text-lg font-black leading-none text-teal-800">{formatScore(patent.score)}</p>
          <p className="mt-0.5 text-[10px] font-bold text-teal-700">연관성</p>
        </div>
      </div>

      {matchedTerms.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-100 text-xs">
          <span className="text-[11px] font-bold text-gray-400">• 주요 키워드:</span>
          {matchedTerms.map((term) => (
            <span
              key={term}
              className="rounded-md border border-teal-100 bg-teal-50/50 px-2 py-0.5 text-[10px] font-semibold text-teal-700"
            >
              #{term}
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onOpen?.(patent)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-gray-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-teal-700"
      >
        <i className="ri-file-text-line" />
        특허 명세서 세부 보기
      </button>
    </div>
  );
}
