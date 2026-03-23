"use client";

import type { PatentSource } from "@/types/search";

interface PatentCardProps {
  patent: PatentSource;
}

export default function PatentCard({ patent }: PatentCardProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow bg-white">
      <h4 className="font-medium text-sm text-gray-900 line-clamp-2 mb-2">
        {patent.invention_title || "제목 없음"}
      </h4>
      <div className="space-y-1 text-xs text-gray-500">
        <p>출원인: {patent.applicant_name}</p>
        <p>출원번호: {patent.application_number}</p>
        {patent.application_date && (
          <p>출원일: {patent.application_date}</p>
        )}
      </div>
      {patent.relevance_text && (
        <p className="mt-2 text-xs text-gray-600 line-clamp-3">
          {patent.relevance_text}
        </p>
      )}
    </div>
  );
}
