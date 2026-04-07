"use client";

import ReactMarkdown from "react-markdown";
import { useState } from "react";
import { submitFeedback } from "@/lib/api";

interface AiAnswerProps {
  answer: string;
  query: string;
  queryLogId?: number;
}

export default function AiAnswer({ answer, query, queryLogId }: AiAnswerProps) {
  const [voted, setVoted] = useState<"up" | "down" | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFeedback = async (rating: number, type: "up" | "down") => {
    if (!queryLogId || voted) return;
    setLoading(true);
    try {
      await submitFeedback(queryLogId, rating);
      setVoted(type);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center shadow-sm">
            <i className="ri-robot-line text-white text-xs" />
          </div>
          <span className="text-sm font-bold text-gray-900">AI Analysis</span>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 bg-teal-50 text-teal-600 rounded font-medium border border-teal-100">RAG</span>
          <span className="text-[10px] px-2 py-0.5 bg-gray-50 text-gray-500 rounded font-medium border border-gray-100">GPT-4o-mini</span>
        </div>
      </div>

      <div className="px-5 sm:px-6 py-5">
        <p className="text-[11px] text-gray-400 mb-3">
          &ldquo;{query}&rdquo;
        </p>
        <div className="prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-strong:text-gray-900 prose-li:marker:text-teal-500 leading-[1.9]">
          <ReactMarkdown>{answer}</ReactMarkdown>
        </div>
      </div>

      {/* Feedback buttons */}
      {queryLogId && (
        <div className="px-5 sm:px-6 py-3 border-t border-gray-100 flex items-center gap-3">
          <span className="text-[11px] text-gray-400">Was this helpful?</span>
          <button
            onClick={() => handleFeedback(1, "up")}
            disabled={loading || voted !== null}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
              voted === "up"
                ? "bg-green-100 text-green-700 border border-green-200"
                : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-green-50 hover:text-green-600"
            } disabled:opacity-50`}
          >
            <i className={voted === "up" ? "ri-thumb-up-fill" : "ri-thumb-up-line"} />
            Helpful
          </button>
          <button
            onClick={() => handleFeedback(-1, "down")}
            disabled={loading || voted !== null}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
              voted === "down"
                ? "bg-red-100 text-red-700 border border-red-200"
                : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-red-50 hover:text-red-600"
            } disabled:opacity-50`}
          >
            <i className={voted === "down" ? "ri-thumb-down-fill" : "ri-thumb-down-line"} />
            Not helpful
          </button>
          {voted && (
            <span className="text-[10px] text-gray-400 ml-auto">Thanks for your feedback!</span>
          )}
        </div>
      )}
    </div>
  );
}
