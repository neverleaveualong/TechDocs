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

function MetaRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 text-xs leading-5">
      <span className="font-bold text-gray-400">{label}</span>
      <span className={`break-words font-semibold text-gray-800 ${mono ? "font-mono" : ""}`}>
        {value || "-"}
      </span>
    </div>
  );
}

export default function PatentCard({ patent, index, onOpen }: PatentCardProps) {
  const matchedTerms = Array.isArray(patent.matched_terms) ? patent.matched_terms.slice(0, 8) : [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:border-teal-200 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="flex items-start gap-2.5">
        {typeof index === "number" && (
          <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-[11px] font-black text-gray-500">
            {index + 1}
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-0.5">
          <MetaRow label="특허명" value={patent.invention_title || "제목 없음"} />
          <MetaRow label="출원날짜" value={formatDate(patent.application_date)} />
          <MetaRow label="출원인명" value={patent.applicant_name} />
          <MetaRow label="출원번호" value={patent.application_number} mono />
        </div>

        <div className="shrink-0 rounded-xl border border-blue-200 bg-blue-50/80 px-3 py-1.5 text-center shadow-sm">
          <p className="font-mono text-xl font-black leading-none text-blue-900">{formatScore(patent.score)}</p>
          <p className="mt-0.5 text-[10px] font-extrabold text-blue-700 tracking-wide">매칭 유사도</p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1 border-t border-gray-100 pt-2">
        <span className="rounded-full border border-teal-100 bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">
          관련도 기준 통과
        </span>
        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold text-gray-600">
          키워드 매칭 {matchedTerms.length}개
        </span>
        {patent.register_status && (
          <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            {patent.register_status}
          </span>
        )}
      </div>

      {matchedTerms.length > 0 && (
        <div className="mt-2.5">
          <p className="mb-1 text-[10px] font-bold text-gray-400">매칭 키워드</p>
          <div className="flex flex-wrap gap-1">
            {matchedTerms.map((term) => (
              <span
                key={term}
                className="rounded-full border border-teal-100 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-teal-700"
              >
                {term}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onOpen?.(patent)}
        className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-gray-950 px-3 py-2 text-xs font-black text-white transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
      >
        <i className="ri-file-search-line" />
        특허내용 보기
      </button>
    </div>
  );
}
