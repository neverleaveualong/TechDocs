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
  const hasConclusion = formattedAnswer.includes("### 결론");
  const bodyText = hasConclusion ? formattedAnswer.split("### 결론")[0] : formattedAnswer;
  const conclusionText = hasConclusion ? formattedAnswer.split("### 결론")[1] : "";

  // 특허 리스트 파싱 및 개별 카드 데이터 추출
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

  // 특허 상세 구조 파싱 정규식 함수
  const parsePatentContent = (title: string, rawContent: string) => {
    const result = {
      title,
      appNum: "",
      appDate: "",
      summary: "",
      similarity: "",
      isParsed: false
    };

    // 출원번호나 요약/유사점 키워드 중 하나라도 보이기 시작하면 카드로 즉시 파싱
    const hasAnyField = rawContent.includes("출원번호") || rawContent.includes("요약") || rawContent.includes("유사점");
    if (!hasAnyField) {
      return result;
    }

    const appNumMatch = rawContent.match(/-\s*\*\*출원번호\*\*:\s*([^\n]+)/);
    const appDateMatch = rawContent.match(/-\s*\*\*출원일\*\*:\s*([^\n]+)/);
    const summaryMatch = rawContent.match(/-\s*\*\*기술 요약\*\*:\s*([\s\S]+?)(?=-\s*\*\*질의와의 유사점\*\*|$)/);
    const similarityMatch = rawContent.match(/-\s*\*\*질의와의 유사점\*\*:\s*([\s\S]+)$/);

    result.appNum = appNumMatch ? appNumMatch[1].trim() : "분석 중...";
    result.appDate = appDateMatch ? appDateMatch[1].trim() : "분석 중...";

    // 기술요약 스트리밍 중 부분 매칭 개선
    if (summaryMatch) {
      result.summary = summaryMatch[1].trim();
    } else if (rawContent.includes("기술 요약")) {
      const parts = rawContent.split("**기술 요약**");
      if (parts[1]) {
        // 뒤에 유사점 타이틀이 생성되기 전까지의 본문을 긁어옴
        result.summary = parts[1].split("**질의와의 유사점**")[0].replace(/^:\s*/, "").replace(/^-*\s*/, "").trim();
      } else {
        result.summary = "요약 작성 중...";
      }
    } else {
      result.summary = "분석 중...";
    }

    // 유사점 스트리밍 중 부분 매칭 개선
    if (similarityMatch) {
      result.similarity = similarityMatch[1].trim();
    } else if (rawContent.includes("유사점")) {
      const parts = rawContent.split("**질의와의 유사점**");
      if (parts[1]) {
        result.similarity = parts[1].replace(/^:\s*/, "").replace(/^-*\s*/, "").trim();
      } else {
        result.similarity = "대조 분석 중...";
      }
    } else {
      result.similarity = "대조 분석 중...";
    }

    // 마크다운 불릿 등 불필요한 기호 최종 정제
    result.summary = result.summary.replace(/^-\s*/, "").replace(/^\*?\s*/, "").trim();
    result.similarity = result.similarity.replace(/^-\s*/, "").replace(/^\*?\s*/, "").trim();

    result.isParsed = true;
    return result;
  };

  return (
    <div className="animate-fade-in bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm transition hover:shadow-md">
      <div className="px-5 sm:px-6 py-4.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center shadow-sm text-slate-650">
            <i className="ri-article-line text-base" />
          </div>
          <div>
            <span className="text-sm font-black text-gray-900 block leading-tight">AI 분석 결과</span>
            <span className="text-[10px] text-gray-400 font-semibold mt-0.5 block sm:hidden">RAG · GPT-4o-mini</span>
          </div>
          {isStreaming && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full font-bold border border-slate-200 animate-pulse ml-1.5">
              <i className="ri-loader-4-line animate-spin text-[9px]" />
              실시간 분석 중
            </span>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-[10px] px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg font-black border border-slate-200">RAG</span>
          <span className="text-[10px] px-2.5 py-1 bg-gray-50 text-gray-500 rounded-lg font-bold border border-gray-100 font-mono">GPT-4o-mini</span>
        </div>
      </div>

      <div className="px-5 sm:px-6 py-6 bg-slate-50/30">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100/80 border border-slate-200/60 rounded-lg text-xs font-extrabold text-slate-700 mb-4 select-none">
          <i className="ri-search-2-line text-slate-500" />
          <span>질의어: {query}</span>
        </div>

        {/* 도입부 검색 브리핑 요약 */}
        {introText && (
          <div className="prose prose-slate max-w-none text-slate-800 whitespace-pre-wrap leading-relaxed mb-4">
            <ReactMarkdown
              components={{
                p({ node, children, ...props }) {
                  const textContent = String(children);
                  const isIntro = textContent.includes("사용자 질의") || textContent.includes("KIPRIS");
                  
                  if (isIntro) {
                    return (
                      <div className="bg-slate-50/90 border-l-4 border-slate-400 rounded-r-xl p-4 sm:p-4.5 text-slate-800 text-[14px] sm:text-[14.5px] shadow-sm mb-4">
                        <p className="font-extrabold text-slate-500 text-[10.5px] mb-1.5 uppercase tracking-wider select-none">검색 브리핑 요약</p>
                        <p className="leading-relaxed font-semibold text-slate-800">{children}</p>
                      </div>
                    );
                  }
                  return (
                    <p className="my-0.5 text-slate-750 leading-relaxed text-[13.5px] sm:text-[14.5px] font-medium" {...props}>
                      {children}
                    </p>
                  );
                }
              }}
            >
              {introText}
            </ReactMarkdown>
          </div>
        )}

        {/* 개별 특허 카드형 리스트 */}
        {patentsData.length > 0 && (
          <div className="space-y-4.5 mb-5">
            {patentsData.map((patent, idx) => {
              const parsedInfo = parsePatentContent(patent.title, patent.content);
              
              if (parsedInfo.isParsed) {
                return (
                  <div key={idx} className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-all hover:border-slate-350">
                    {/* 타이틀 헤더 */}
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <span className="flex items-center justify-center w-6.5 h-6.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 font-extrabold text-[12px] sm:text-[13px] shadow-sm select-none shrink-0">
                        {idx + 1}
                      </span>
                      <h3 className="text-[15px] sm:text-[16px] font-black text-slate-900 leading-snug">
                        {patent.title.replace(/^\d+\.\s*/, "")}
                      </h3>
                    </div>

                    {/* 수직 정렬된 콘텐츠 영역 (좌측 밀착) */}
                    <div className="space-y-3">
                      {/* 메타데이터 라인 */}
                      <div className="text-[12.5px] font-bold text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1 select-none">
                        <span>출원번호: {parsedInfo.appNum}</span>
                        <span className="text-slate-300">•</span>
                        <span>출원일: {parsedInfo.appDate}</span>
                      </div>

                      {/* 기술 요약 */}
                      <div className="text-[13.5px] sm:text-[14.5px] text-slate-700 leading-relaxed font-medium">
                        <span className="font-extrabold text-slate-900 block mr-1.5">
                          <i className="ri-file-text-line mr-1.5 text-slate-500 align-middle" />
                          기술 요약
                        </span>
                        <p className="text-slate-650 mt-0.5">{parsedInfo.summary}</p>
                      </div>

                      {/* 질의와의 유사점 */}
                      <div className="text-[13.5px] sm:text-[14.5px] text-slate-800 leading-relaxed font-bold border-t border-slate-100/70 pt-2.5">
                        <span className="text-slate-900 block mr-1.5">
                          <i className="ri-focus-3-line mr-1.5 text-slate-500 align-middle" />
                          질의와의 유사점
                        </span>
                        <p className="text-slate-700 mt-0.5 font-semibold">{parsedInfo.similarity}</p>
                      </div>
                    </div>
                  </div>
                );
              }

              // 파싱 실패 또는 스트리밍 중인 불완전 상태 폴백
              return (
                <div key={idx} className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm hover:shadow-md transition-all hover:border-slate-300">
                  <div className="flex items-center gap-2 mb-3.5 pb-2.5 border-b border-slate-100">
                    <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-slate-100 border border-slate-200 text-slate-850 font-extrabold text-[11.5px] sm:text-[12.5px] shadow-sm select-none">
                      {idx + 1}
                    </span>
                    <h3 className="text-[14px] sm:text-[15px] font-black text-slate-900 leading-snug">
                      {patent.title.replace(/^\d+\.\s*/, "")}
                    </h3>
                  </div>
                  
                  <div className="prose prose-slate max-w-none text-slate-800 whitespace-pre-wrap leading-relaxed">
                    <ReactMarkdown
                      components={{
                        ul({ node, children, ...props }) {
                          return (
                            <ul className="list-none pl-1.5 my-0 space-y-0.5 text-slate-700 font-medium" {...props}>
                              {children}
                            </ul>
                          );
                        },
                        li({ node, children, ...props }) {
                          return (
                            <li className="relative pl-4 text-slate-700 leading-normal text-[13.5px] sm:text-[14.5px] my-0 py-0.5" {...props}>
                              <span className="absolute left-0 top-[6.5px] w-1.5 h-1.5 rounded-full bg-slate-400 select-none" />
                              {children}
                            </li>
                          );
                        },
                        p({ node, children, ...props }) {
                          return (
                            <p className="my-0.5 text-slate-700 leading-normal text-[13.5px] sm:text-[14.5px] font-medium" {...props}>
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
                      {patent.content}
                    </ReactMarkdown>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 스트리밍 중 대기 텍스트 */}
        {patentsData.length === 0 && !introText && !isStreaming && (
          <div className="text-slate-400 text-sm font-medium py-4 text-center">
            답변을 생성하고 있습니다...
          </div>
        )}

        {conclusionText && (
          <div className="mt-6 p-6.5 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm">
            <h4 className="text-[15px] sm:text-[16px] font-black text-slate-900 mb-3 flex items-center gap-1.5 select-none">
              ■ 종합 결론 및 활용 조언
            </h4>
            <div className="prose prose-slate max-w-none text-slate-800 leading-relaxed">
              <ReactMarkdown
                components={{
                  p({ node, children, ...props }) {
                    return (
                      <p className="text-slate-850 leading-relaxed text-[14px] sm:text-[15px] font-bold" {...props}>
                        {children}
                      </p>
                    );
                  }
                }}
              >
                {conclusionText}
              </ReactMarkdown>
            </div>
          </div>
        )}
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
