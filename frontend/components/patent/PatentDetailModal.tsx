"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { PatentSource } from "@/types/search";

interface PatentDetailModalProps {
  patent: PatentSource | null;
  onClose: () => void;
}

function formatDate(value: string) {
  if (!value || value.length < 8) return value || "-";
  return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
}

function formatNormalizedScore(value?: number | null) {
  if (typeof value !== "number") return null;
  const percentage = Math.min(Math.round((value / 0.03278) * 100), 100);
  return `${percentage}%`;
}

export default function PatentDetailModal({ patent, onClose }: PatentDetailModalProps) {
  useEffect(() => {
    if (!patent) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [patent, onClose]);

  if (!patent || typeof document === "undefined") return null;

  const matchedTerms = Array.isArray(patent.matched_terms) ? patent.matched_terms : [];
  const content = patent.full_content || patent.relevance_text || "상세 특허 명세서 본문이 없습니다.";
  const scoreDisplay = formatNormalizedScore(patent.score);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-xs">
      <button
        type="button"
        aria-label="상세 모달 닫기"
        className="fixed inset-0 cursor-default bg-transparent"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="patent-detail-title"
        className="relative z-10 flex h-full max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg"
      >
        {/* 📌 상단 헤더 */}
        <div className="sticky top-0 z-10 shrink-0 border-b border-gray-100 bg-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-bold text-gray-900 truncate">특허 명세서 상세 보기</span>
            {scoreDisplay && (
              <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold text-teal-800 border border-teal-100 shrink-0">
                연관도 {scoreDisplay}
              </span>
            )}
            {patent.register_status && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-100 shrink-0">
                {patent.register_status}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="닫기"
          >
            <i className="ri-close-line text-xl" />
          </button>
        </div>

        {/* 📜 깔끔하게 항목별 개행으로 연결되는 본문 (복잡한 테두리/글자수/카드 쪼개기 전면 제거) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs leading-relaxed text-gray-800">
          {/* 1. 기본 정보 (명확한 항목 : 내용 개행 방식) */}
          <div className="space-y-2 border-b border-gray-100 pb-5">
            <div>
              <span className="font-bold text-gray-900">• 출원번호 : </span>
              <span className="font-mono font-semibold text-gray-800">{patent.application_number || "-"}</span>
            </div>
            <div>
              <span className="font-bold text-gray-900">• 발명의 명칭 : </span>
              <span className="font-semibold text-gray-800">{patent.invention_title || "-"}</span>
            </div>
            <div>
              <span className="font-bold text-gray-900">• 출원인 : </span>
              <span className="font-semibold text-gray-800">{patent.applicant_name || "-"}</span>
            </div>
            <div>
              <span className="font-bold text-gray-900">• IPC 분류 : </span>
              <span className="font-mono font-semibold text-gray-800">{patent.ipc_number || "-"}</span>
            </div>
            <div>
              <span className="font-bold text-gray-900">• 출원일자 : </span>
              <span className="font-semibold text-gray-800">{formatDate(patent.application_date)}</span>
            </div>
          </div>

          {/* 2. 매칭 키워드 */}
          {matchedTerms.length > 0 && (
            <div className="space-y-2 border-b border-gray-100 pb-5">
              <span className="font-bold text-gray-900 block">• 주요 검색 키워드 :</span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {matchedTerms.map((term) => (
                  <span
                    key={term}
                    className="rounded-md border border-teal-100 bg-teal-50/60 px-2 py-0.5 text-xs font-semibold text-teal-800"
                  >
                    #{term}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 3. 초록 및 특허 본문 내용 (자연스러운 개행) */}
          <div className="space-y-2">
            <span className="font-bold text-gray-900 block">• 특허 초록 및 본문 내용 :</span>
            <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap pt-1 font-medium">
              {content}
            </div>
          </div>
        </div>

        {/* 하단 닫기 바 */}
        <div className="shrink-0 border-t border-gray-100 bg-gray-50/50 px-6 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white px-4 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-100"
          >
            닫기
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
