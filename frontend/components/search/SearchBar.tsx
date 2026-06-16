"use client";

import { useState } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onCancel?: () => void;
  isLoading: boolean;
  placeholder?: string;
  buttonLabel?: string;
  initialQuery?: string;
}

export default function SearchBar({
  onSearch,
  onCancel,
  isLoading,
  placeholder = "자연어로 특허를 검색하세요  (예: 2차전지 열 관리 기술)",
  buttonLabel = "검색",
  initialQuery = "",
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="relative">
        <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none" />
        <input
          id="search-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          disabled={isLoading}
          className="w-full pl-12 pr-28 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        <button
          type={isLoading && onCancel ? "button" : "submit"}
          onClick={(event) => {
            if (!isLoading || !onCancel) return;
            event.preventDefault();
            onCancel();
          }}
          disabled={!isLoading && !query.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold rounded-lg transition-all whitespace-nowrap bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-sm hover:from-teal-600 hover:to-teal-700 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <i className={onCancel ? "ri-stop-circle-line" : "ri-loader-4-line animate-spin"} />
              {onCancel ? buttonLabel : "분석 중..."}
            </>
          ) : (
            <>
              <i className="ri-search-line" />
              {buttonLabel}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
