"use client";

import type { PatentSource } from "@/types/search";
import PatentCard from "@/components/patent/PatentCard";

interface SearchResultsProps {
  sources: PatentSource[];
}

export default function SearchResults({ sources }: SearchResultsProps) {
  if (sources.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 mb-3">
        출처 특허 ({sources.length}건)
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sources.map((source, idx) => (
          <PatentCard key={`${source.application_number}-${idx}`} patent={source} />
        ))}
      </div>
    </div>
  );
}
