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

  // 1단계: [출처: XXXXXXX] 또는 [출처: XX-XXXX-XXXXXXX] 형식을 찾아서 `[출처: XXXXXXX]` 백틱 인라인 코드로 변환
  let formatted = answer.replace(/\[출처:\s*([a-zA-Z0-9-]+)\]/g, "`[출처: $1]`");
  // 2단계: 괄호나 '출처:' 텍스트 없이 단독으로 노출된 13자리 특허/실용신안 출원번호를 감지하여 강제 배지화 (단, 정보 항목인 '출원번호:' 접두사 뒤는 제외)
  formatted = formatted.replace(/(?<!출원번호\s*:\s*)\b(10\d{11}|20\d{11}|10-\d{4}-\d{7}|20-\d{4}-\d{7})\b/g, "`[출처: $1]`");
  const formattedAnswer = formatted;

  return (
    <div className="animate-fade-in bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center shadow-sm">
            <i className="ri-robot-line text-white text-xs" />
          </div>
          <span className="text-sm font-bold text-gray-900">AI 분석 결과</span>
          {isStreaming && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-teal-50 text-teal-600 rounded font-medium border border-teal-100 animate-pulse">
              <i className="ri-loader-4-line animate-spin text-[9px]" />
              답변 생성 중
            </span>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 bg-teal-50 text-teal-600 rounded font-medium border border-teal-100">RAG</span>
          <span className="text-[10px] px-2 py-0.5 bg-gray-50 text-gray-500 rounded font-medium border border-gray-100 font-mono">GPT-4o-mini</span>
        </div>
      </div>

      <div className="px-5 sm:px-6 py-5 bg-slate-55/20">
        <p className="text-[11px] text-gray-400 mb-4 border-l-2 border-gray-200 pl-2">
          검색 기술 질의: &ldquo;{query}&rdquo;
        </p>
        <div className="prose prose-slate max-w-none text-slate-800 text-[13.5px] sm:text-[14.5px] leading-8 prose-p:my-4 prose-headings:mt-6 prose-headings:mb-3 prose-headings:text-slate-900 prose-headings:font-black prose-li:my-1.5 prose-strong:font-black whitespace-pre-wrap">
          <div className={isStreaming ? "after:content-['▋'] after:ml-0.5 after:animate-pulse after:text-teal-500" : ""}>
            <ReactMarkdown
              components={{
                code({ node, className, children, ...props }) {
                  const content = String(children);
                  const isCitation = content.startsWith("[출처:");
                  
                  if (isCitation) {
                    const patentNum = content.replace("[출처:", "").replace("]", "").trim();
                    return (
                      <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-150 px-2.5 py-0.5 text-[11px] font-bold text-teal-700 mx-0.5 select-all hover:bg-teal-100 hover:border-teal-300 transition-colors shadow-sm cursor-help" title="클릭 시 특허 번호 드래그 복사 가능">
                        <i className="ri-file-list-3-line text-[10px] text-teal-600" />
                        {patentNum}
                      </span>
                    );
                  }
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
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
