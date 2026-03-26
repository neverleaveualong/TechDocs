"use client";

import type { PatentSource } from "@/types/search";
import PatentCard from "@/components/patent/PatentCard";

interface SearchResultsProps {
  sources: PatentSource[];
}

export default function SearchResults({ sources }: SearchResultsProps) {
  if (sources.length === 0) return null;

  return (
    <div className="animate-fade-in-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <i className="ri-file-text-line text-gray-400" />
          <h3 className="text-sm font-bold text-gray-900">출처 특허</h3>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-teal-50 text-teal-700 border border-teal-100 rounded">
            {sources.length}건
          </span>
        </div>
      </div>
      <div className="p-3 space-y-2">
        {sources.map((source, idx) => (
          <PatentCard key={`${source.application_number}-${idx}`} patent={source} index={idx} />
        ))}
      </div>
    </div>
  );
}
