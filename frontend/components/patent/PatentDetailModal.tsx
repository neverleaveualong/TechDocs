"use client";

import { useEffect } from "react";
import type { PatentSource } from "@/types/search";

interface PatentDetailModalProps {
  patent: PatentSource | null;
  onClose: () => void;
}

function formatDate(value: string) {
  if (!value || value.length < 8) return value || "-";
  return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
}

function formatScore(value?: number | null) {
  return typeof value === "number" ? value.toFixed(3) : "-";
}

function DetailItem({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 break-words text-xs font-semibold text-gray-800 ${mono ? "font-mono" : ""}`}>
        {value || "정보 없음"}
      </p>
    </div>
  );
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

  if (!patent) return null;

  const matchedTerms = Array.isArray(patent.matched_terms) ? patent.matched_terms : [];
  const content = patent.full_content || patent.relevance_text || "상세 문서 내용이 없습니다.";

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-gray-950/55 px-3 py-3 backdrop-blur-sm sm:px-6 sm:py-5">
      <button
        type="button"
        aria-label="상세 모달 닫기"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="patent-detail-title"
        className="relative flex h-[calc(100dvh-24px)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_30px_120px_rgba(15,23,42,0.32)] sm:h-[calc(100dvh-40px)]"
      >
        <div className="relative shrink-0 overflow-hidden border-b border-gray-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ecfeff_48%,#fff7ed_100%)] px-5 py-4 sm:px-7 sm:py-5">
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {patent.register_status && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                    {patent.register_status}
                  </span>
                )}
                <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">
                  관련도 {formatScore(patent.score)}
                </span>
                {patent.score_type && (
                  <span className="rounded-full border border-gray-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase text-gray-500">
                    {patent.score_type}
                  </span>
                )}
              </div>
              <h2 id="patent-detail-title" className="text-lg font-black leading-7 text-gray-950 sm:text-2xl">
                {patent.invention_title || "제목 없음"}
              </h2>
              <p className="mt-2 text-xs font-medium leading-5 text-gray-600">
                사용자가 직접 근거를 확인할 수 있도록 특허 메타데이터와 초록/문서 내용을 보여줍니다.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white/85 text-gray-500 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-300"
              aria-label="닫기"
            >
              <i className="ri-close-line text-lg" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DetailItem label="출원번호" value={patent.application_number} mono />
            <DetailItem label="출원일" value={formatDate(patent.application_date)} />
            <DetailItem label="출원인" value={patent.applicant_name} />
            <DetailItem label="IPC 분류" value={patent.ipc_number} mono />
          </div>

          {matchedTerms.length > 0 && (
            <div className="mt-4 rounded-2xl border border-teal-100 bg-white p-4">
              <div className="flex items-center gap-2">
                <i className="ri-focus-3-line text-teal-600" />
                <h3 className="text-sm font-bold text-gray-900">질의와 매칭된 키워드</h3>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {matchedTerms.map((term) => (
                  <span
                    key={term}
                    className="rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-[11px] font-bold text-teal-700"
                  >
                    {term}
                  </span>
                ))}
              </div>
            </div>
          )}

          {patent.relevance_reason && (
            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <div className="flex items-center gap-2">
                <i className="ri-lightbulb-flash-line text-amber-600" />
                <h3 className="text-sm font-bold text-gray-900">선택 이유</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-amber-900">{patent.relevance_reason}</p>
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <i className="ri-file-text-line text-gray-500" />
                <h3 className="text-sm font-bold text-gray-900">문서 내용</h3>
              </div>
              <span className="text-[10px] font-semibold text-gray-400">{content.length.toLocaleString()} chars</span>
            </div>
            <p className="whitespace-pre-wrap px-4 py-4 text-sm leading-7 text-gray-700">
              {content}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
