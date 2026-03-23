"use client";

interface AiAnswerProps {
  answer: string;
  query: string;
}

export default function AiAnswer({ answer, query }: AiAnswerProps) {
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-blue-600 font-semibold text-sm">AI 답변</span>
        <span className="text-gray-400 text-xs">· &quot;{query}&quot;</span>
      </div>
      <div className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
        {answer}
      </div>
    </div>
  );
}
