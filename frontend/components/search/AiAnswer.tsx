"use client";

import ReactMarkdown from "react-markdown";
import { useState } from "react";
import { submitFeedback } from "@/lib/api";

interface AiAnswerProps {
  answer: string;
  query: string;
  queryLogId?: number;
  isStreaming?: boolean;
}

export default function AiAnswer({ answer, query, queryLogId, isStreaming = false }: AiAnswerProps) {
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

  const formattedAnswer = answer;

  return (
    <div className="animate-fade-in bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm transition hover:shadow-md">
      <div className="px-5 sm:px-6 py-4.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-sm">
            <i className="ri-robot-line text-white text-sm" />
          </div>
          <div>
            <span className="text-sm font-black text-gray-900 block leading-tight">AI 분석 결과</span>
            <span className="text-[10px] text-gray-400 font-semibold mt-0.5 block sm:hidden">RAG · GPT-4o-mini</span>
          </div>
          {isStreaming && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 bg-teal-50 text-teal-700 rounded-full font-bold border border-teal-100 animate-pulse ml-1.5">
              <i className="ri-loader-4-line animate-spin text-[9px]" />
              실시간 분석 중
            </span>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-[10px] px-2.5 py-1 bg-teal-50 text-teal-700 rounded-lg font-black border border-teal-100">RAG</span>
          <span className="text-[10px] px-2.5 py-1 bg-gray-50 text-gray-500 rounded-lg font-bold border border-gray-100 font-mono">GPT-4o-mini</span>
        </div>
      </div>

      <div className="px-5 sm:px-6 py-6 bg-slate-50/30">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100/80 border border-slate-200/60 rounded-lg text-xs font-extrabold text-slate-700 mb-5 select-none">
          <i className="ri-search-2-line text-slate-500" />
          <span>질의어: {query}</span>
        </div>
        
        <div className="prose prose-slate max-w-none text-slate-800 whitespace-pre-wrap leading-relaxed">
          <div className={isStreaming ? "after:content-['▋'] after:ml-0.5 after:animate-pulse after:text-teal-500" : ""}>
            <ReactMarkdown
              components={{
                h3({ node, children, ...props }) {
                  return (
                    <h3 className="text-[15px] sm:text-[16px] font-black text-slate-900 mt-7 mb-3.5 flex items-center border-l-4 border-teal-500 pl-3 leading-6" {...props}>
                      {children}
                    </h3>
                  );
                },
                ul({ node, children, ...props }) {
                  return (
                    <ul className="list-disc pl-5 my-4 space-y-2 text-slate-700 font-medium" {...props}>
                      {children}
                    </ul>
                  );
                },
                li({ node, children, ...props }) {
                  return (
                    <li className="text-slate-700 leading-relaxed text-[13.5px] sm:text-[14.5px]" {...props}>
                      {children}
                    </li>
                  );
                },
                p({ node, children, ...props }) {
                  return (
                    <p className="my-3 text-slate-700 leading-relaxed text-[13.5px] sm:text-[14.5px] font-medium" {...props}>
                      {children}
                    </p>
                  );
                },
                strong({ node, children, ...props }) {
                  return (
                    <strong className="font-extrabold text-slate-900 mr-1" {...props}>
                      {children}
                    </strong>
                  );
                }
              }}
            >
              {formattedAnswer || (isStreaming ? "" : "답변을 생성하고 있습니다...")}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      {/* Feedback buttons */}
      {queryLogId && (
        <div className="px-5 sm:px-6 py-3 border-t border-gray-100 flex items-center gap-3 bg-gray-50/50">
          <span className="text-[11px] text-gray-400">답변 결과가 도움이 되었나요?</span>
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
            도움됨
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
            도움 안 됨
          </button>
          {voted && (
            <span className="text-[10px] text-gray-400 ml-auto">의견을 주셔서 감사합니다!</span>
          )}
        </div>
      )}
    </div>
  );
}
