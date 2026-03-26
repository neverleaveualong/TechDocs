"use client";

import ReactMarkdown from "react-markdown";

interface AiAnswerProps {
  answer: string;
  query: string;
}

export default function AiAnswer({ answer, query }: AiAnswerProps) {
  return (
    <div className="animate-fade-in bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center shadow-sm">
            <i className="ri-robot-line text-white text-xs" />
          </div>
          <span className="text-sm font-bold text-gray-900">AI 분석 결과</span>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 bg-teal-50 text-teal-600 rounded font-medium border border-teal-100">RAG</span>
          <span className="text-[10px] px-2 py-0.5 bg-gray-50 text-gray-500 rounded font-medium border border-gray-100">GPT-4o-mini</span>
        </div>
      </div>

      <div className="px-5 sm:px-6 py-5">
        <p className="text-[11px] text-gray-400 mb-3">
          &ldquo;{query}&rdquo; 에 대한 분석
        </p>
        <div className="prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-strong:text-gray-900 prose-li:marker:text-teal-500 leading-[1.9]">
          <ReactMarkdown>{answer}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
