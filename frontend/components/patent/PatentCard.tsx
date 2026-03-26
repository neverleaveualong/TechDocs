"use client";

import type { PatentSource } from "@/types/search";

interface PatentCardProps {
  patent: PatentSource;
  index?: number;
}

export default function PatentCard({ patent, index }: PatentCardProps) {
  const date = patent.application_date
    ? `${patent.application_date.slice(0, 4)}.${patent.application_date.slice(4, 6)}.${patent.application_date.slice(6, 8)}`
    : null;

  return (
    <div className="group flex gap-4 p-4 rounded-xl border border-gray-100 bg-white hover:border-teal-200 hover:shadow-sm transition-all duration-200">
      {/* 순번 */}
      {typeof index === "number" && (
        <div className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 text-[11px] font-bold text-gray-400 group-hover:bg-teal-50 group-hover:text-teal-600 group-hover:border-teal-100 transition-colors">
          {index + 1}
        </div>
      )}

      {/* 내용 */}
      <div className="flex-1 min-w-0">
        <h4 className="text-[13px] font-semibold text-gray-900 leading-snug line-clamp-1 group-hover:text-teal-800 transition-colors">
          {patent.invention_title || "제목 없음"}
        </h4>

        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
          <span className="flex items-center gap-1">
            <i className="ri-building-line text-[10px]" />
            <span className="text-gray-600 font-medium">{patent.applicant_name || "-"}</span>
          </span>
          <span>{patent.application_number}</span>
          {date && <span>{date}</span>}
        </div>

        {patent.relevance_text && (
          <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2 mt-2">
            {patent.relevance_text}
          </p>
        )}
      </div>
    </div>
  );
}
