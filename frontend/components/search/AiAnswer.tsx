"use client";

import ReactMarkdown from "react-markdown";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { submitFeedback } from "@/lib/api";
import type { PatentSource } from "@/types/search";
import PatentDetailModal from "@/components/patent/PatentDetailModal";

interface AiAnswerProps {
  answer: string;
  query: string;
  queryLogId?: number;
  isStreaming?: boolean;
  sources?: PatentSource[];
}

function formatScore(score?: number | null) {
  if (typeof score !== "number") return null;
  const percentage = Math.min(Math.round((score / 0.03278) * 100), 100);
  return `${percentage}%`;
}

export default function AiAnswer({
  answer,
  query,
  queryLogId,
  isStreaming = false,
  sources = [],
}: AiAnswerProps) {
  const [voted, setVoted] = useState<"up" | "down" | null>(null);
  const [selectedPatent, setSelectedPatent] = useState<PatentSource | null>(null);

  const feedbackMutation = useMutation({
    mutationFn: ({ queryLogId, rating }: { queryLogId: number; rating: number }) =>
      submitFeedback(queryLogId, rating),
    onSuccess: (_, variables) => {
      setVoted(variables.rating > 0 ? "up" : "down");
    },
  });

  const handleFeedback = (rating: number) => {
    if (!queryLogId || voted) return;
    feedbackMutation.mutate({ queryLogId, rating });
  };

  const formattedAnswer = answer;
  const hasConclusion = formattedAnswer.includes("### 결론");
  const bodyText = hasConclusion ? formattedAnswer.split("### 결론")[0] : formattedAnswer;
  const conclusionText = hasConclusion ? formattedAnswer.split("### 결론")[1] : "";

  // 특허 리스트 파싱
  const patentRegex = /###\s*(?=\d+\.|\d+\s)/g;
  const sections = bodyText.split(patentRegex);
  
  const introText = sections[0] || "";
  const patentsData: { title: string; content: string }[] = [];
  
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;
    const lines = section.split("\n");
    const title = lines[0].trim();
    const content = lines.slice(1).join("\n").trim();
    patentsData.push({ title, content });
  }

  const getBulletSentences = (raw: string) => {
    if (!raw) return [];
    const cleanText = raw.replace(/###?\s*/g, "").replace(/\*\*/g, "").trim();
    return cleanText
      .split(/(?<=\.)\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);
  };

  const parsePatentContent = (title: string, rawContent: string) => {
    const result = {
      title,
      appNum: "",
      appDate: "",
      summary: "",
      similarity: "",
      isParsed: false
    };

    const hasAnyField = rawContent.includes("출원번호") || rawContent.includes("요약") || rawContent.includes("유사점");
    if (!hasAnyField) return result;

    const appNumMatch = rawContent.match(/-\s*\*\*출원번호\*\*:\s*([^\n]+)/);
    const appDateMatch = rawContent.match(/-\s*\*\*출원일\*\*:\s*([^\n]+)/);
    const summaryMatch = rawContent.match(/-\s*\*\*기술 요약\*\*:\s*([\s\S]+?)(?=-\s*\*\*질의와의 유사점\*\*|$)/);
    const similarityMatch = rawContent.match(/-\s*\*\*질의와의 유사점\*\*:\s*([\s\S]+)$/);

    result.appNum = appNumMatch ? appNumMatch[1].trim() : "-";
    result.appDate = appDateMatch ? appDateMatch[1].trim() : "-";

    if (summaryMatch) {
      result.summary = summaryMatch[1].trim();
    } else if (rawContent.includes("기술 요약")) {
      const parts = rawContent.split("**기술 요약**");
      result.summary = parts[1] ? parts[1].split("**질의와의 유사점**")[0].replace(/^:\s*/, "").trim() : "분석 중...";
    } else {
      result.summary = "분석 중...";
    }

    if (similarityMatch) {
      result.similarity = similarityMatch[1].trim();
    } else if (rawContent.includes("유사점")) {
      const parts = rawContent.split("**질의와의 유사점**");
      result.similarity = parts[1] ? parts[1].replace(/^:\s*/, "").trim() : "분석 중...";
    } else {
      result.similarity = "분석 중...";
    }

    result.summary = result.summary.replace(/^-\s*/, "").replace(/^\*?\s*/, "").trim();
    result.similarity = result.similarity.replace(/^-\s*/, "").replace(/^\*?\s*/, "").trim();

    result.isParsed = true;
    return result;
  };

  const introBullets = getBulletSentences(introText);
  const conclusionBullets = getBulletSentences(conclusionText);

  return (
    <>
      <div className="animate-fade-in bg-white border border-gray-200/80 rounded-2xl overflow-hidden shadow-xs transition hover:shadow-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-teal-50 border border-teal-100 rounded-xl flex items-center justify-center text-teal-700 font-bold">
              <i className="ri-article-line text-base" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 leading-tight">특허 분석 보고서</h3>
              <p className="text-[11px] text-gray-400 font-medium mt-0.5">질의 기반 특허 요약 및 연관성 대조 리포트</p>
            </div>
            {isStreaming && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 bg-teal-50 text-teal-700 rounded-full font-bold border border-teal-100 animate-pulse ml-2">
                <i className="ri-loader-4-line animate-spin text-[9px]" />
                분석 리포트 작성 중
              </span>
            )}
          </div>

          {sources.length > 0 && (
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700 border border-teal-100">
              인용 출처 {sources.length}건
            </span>
          )}
        </div>

        <div className="px-6 py-6 space-y-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100/80 border border-gray-200/70 rounded-lg text-xs font-bold text-gray-700">
            <i className="ri-search-line text-gray-500" />
            <span>질의 키워드: {query}</span>
          </div>

          {/* 📌 주요 분석 요약 (불릿포인트) */}
          {introBullets.length > 0 && (
            <div className="rounded-xl border border-teal-100 bg-teal-50/30 p-5 space-y-3">
              <h4 className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-1.5">
                ■ 주요 분석 요약
              </h4>
              <div className="space-y-2 text-xs text-gray-800 font-medium">
                {introBullets.map((bullet, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="font-bold text-teal-600 shrink-0 select-none">•</span>
                    <span className="leading-relaxed">{bullet}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 📌 연관 특허 리스트 (출처 정보 & 상세보기 버튼 통합!) */}
          {patentsData.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">■ 주요 연관 특허 리스트 ({patentsData.length}건)</h4>
              {patentsData.map((patent, idx) => {
                const parsedInfo = parsePatentContent(patent.title, patent.content);
                const matchedSource = sources.find(
                  (s) => s.application_number && parsedInfo.appNum && s.application_number.includes(parsedInfo.appNum.replace(/-/g, ""))
                ) || sources[idx];

                const scoreDisplay = formatScore(matchedSource?.score);

                return (
                  <div key={idx} className="bg-white border border-gray-200/80 rounded-xl p-5 shadow-2xs transition-all space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <span className="flex items-center justify-center w-5.5 h-5.5 rounded bg-gray-100 text-gray-700 font-bold text-xs shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <h4 className="text-sm sm:text-base font-bold text-gray-900 leading-snug">
                          {patent.title.replace(/^\d+\.\s*/, "")}
                        </h4>
                      </div>

                      {scoreDisplay && (
                        <span className="shrink-0 rounded-lg bg-teal-50 border border-teal-100 px-2.5 py-1 text-xs font-extrabold text-teal-800">
                          연관도 {scoreDisplay}
                        </span>
                      )}
                    </div>

                    <div className="space-y-2 text-xs pl-8">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-500 font-semibold border-b border-gray-100 pb-2">
                        <span>• 출원번호: <strong className="text-gray-800 font-mono">{parsedInfo.appNum !== "-" ? parsedInfo.appNum : matchedSource?.application_number || "-"}</strong></span>
                        <span>• 출원일자: <strong className="text-gray-800">{parsedInfo.appDate !== "-" ? parsedInfo.appDate : matchedSource?.application_date || "-"}</strong></span>
                        <span>• 출원인: <strong className="text-gray-800">{matchedSource?.applicant_name || "-"}</strong></span>
                      </div>

                      <div className="space-y-1 text-gray-700">
                        <p className="font-bold text-gray-900">• 기술 요약:</p>
                        <p className="pl-3 leading-relaxed text-gray-600 font-medium">{parsedInfo.summary}</p>
                      </div>

                      <div className="space-y-1 text-gray-700 pt-1">
                        <p className="font-bold text-teal-800">• 질의와의 연관성 & 권리 특징:</p>
                        <p className="pl-3 leading-relaxed text-teal-900 font-semibold">{parsedInfo.similarity}</p>
                      </div>

                      {/* 🎯 특허 원문 세부보기 버튼 카드 통합 */}
                      {matchedSource && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => setSelectedPatent(matchedSource)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-teal-700"
                          >
                            <i className="ri-file-text-line" />
                            <span>특허 명세서 원문 상세보기</span>
                            <i className="ri-arrow-right-s-line text-xs" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 📌 종합 결론 */}
          {conclusionBullets.length > 0 && (
            <div className="rounded-xl border border-teal-200/80 bg-teal-50/40 p-5 space-y-3">
              <h4 className="text-sm font-bold text-teal-900 flex items-center gap-1.5">
                ■ 검토 결론 및 시사점
              </h4>
              <div className="space-y-2 text-xs text-teal-950 font-semibold">
                {conclusionBullets.map((bullet, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="font-bold text-teal-600 shrink-0 select-none">•</span>
                    <span className="leading-relaxed">{bullet}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 피드백 */}
        {queryLogId && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center gap-3 bg-gray-50/40">
            <span className="text-[11px] text-gray-400">분석 보고서 결과가 유용한가요?</span>
            <button
              onClick={() => handleFeedback(1)}
              disabled={feedbackMutation.isPending || voted !== null}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                voted === "up"
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-emerald-50 hover:text-emerald-700"
              } disabled:opacity-50`}
            >
              <i className={voted === "up" ? "ri-thumb-up-fill" : "ri-thumb-up-line"} />
              유용함
            </button>
            <button
              onClick={() => handleFeedback(-1)}
              disabled={feedbackMutation.isPending || voted !== null}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                voted === "down"
                  ? "bg-red-100 text-red-800 border border-red-200"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-red-50 hover:text-red-700"
              } disabled:opacity-50`}
            >
              <i className={voted === "down" ? "ri-thumb-down-fill" : "ri-thumb-down-line"} />
              개선 필요
            </button>
          </div>
        )}
      </div>

      {/* 특허 상세 모달 */}
      {selectedPatent && (
        <PatentDetailModal patent={selectedPatent} onClose={() => setSelectedPatent(null)} />
      )}
    </>
  );
}
