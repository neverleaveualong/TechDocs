"use client";

import { useState } from "react";
import type { PatentSource } from "@/types/search";
import PatentCard from "@/components/patent/PatentCard";
import PatentDetailModal from "@/components/patent/PatentDetailModal";

interface SearchResultsProps {
  sources: PatentSource[];
}

export default function SearchResults({ sources }: SearchResultsProps) {
  const [selectedPatent, setSelectedPatent] = useState<PatentSource | null>(null);

  if (sources.length === 0) return null;

  return (
    <>
      <div className="animate-fade-in-1 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-3 border-b border-gray-100 bg-[linear-gradient(135deg,#ffffff_0%,#f0fdfa_55%,#fff7ed_100%)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-teal-100 bg-white text-teal-700 shadow-sm">
              <i className="ri-file-search-line text-lg" />
            </span>
            <div>
              <h3 className="text-sm font-black text-gray-950">답변에 사용된 출처</h3>
              <p className="mt-0.5 text-[11px] font-medium text-gray-500">
                카드를 누르면 RAG에 사용된 특허 근거를 상세히 볼 수 있습니다.
              </p>
            </div>
          </div>
          <span className="w-fit rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-[11px] font-bold text-teal-700">
            {sources.length}건 사용
          </span>
        </div>
        <div className="space-y-2 bg-gray-50/70 p-2.5 sm:p-3">
          {sources.map((source, idx) => (
            <PatentCard
              key={`${source.application_number}-${idx}`}
              patent={source}
              index={idx}
              onOpen={setSelectedPatent}
            />
          ))}
        </div>
      </div>
      <PatentDetailModal patent={selectedPatent} onClose={() => setSelectedPatent(null)} />
    </>
  );
}
