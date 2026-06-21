"use client";

import { useEffect, useState } from "react";
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

function formatScore(value?: number | null) {
  return typeof value === "number" ? value.toFixed(3) : "-";
}

function DetailItem({
  label,
  value,
  mono = false,
  icon,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  icon?: string;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-gray-200/80 bg-white p-3.5 shadow-sm transition hover:border-teal-200 hover:shadow-md">
      {icon && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
          <i className={`${icon} text-lg`} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400">{label}</p>
        <p className={`mt-1 truncate text-sm font-bold text-gray-800 ${mono ? "font-mono" : ""}`}>
          {value || "정보 없음"}
        </p>
      </div>
    </div>
  );
}

function HighlightedText({ text, highlights }: { text: string; highlights: string[] }) {
  if (!highlights || highlights.length === 0) return <>{text}</>;

  const escapedHighlights = highlights
    .map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean);

  if (escapedHighlights.length === 0) return <>{text}</>;

  const regex = new RegExp(`(${escapedHighlights.join("|")})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = highlights.some(
          (h) => h.toLowerCase() === part.toLowerCase()
        );
        return isMatch ? (
          <mark
            key={i}
            className="bg-teal-100/70 text-teal-950 font-bold px-0.5 rounded-sm border-b-2 border-teal-300"
          >
            {part}
          </mark>
        ) : (
          part
        );
      })}
    </>
  );
}

function PatentContentRenderer({ content, matchedTerms }: { content: string; matchedTerms: string[] }) {
  const lines = content.split("\n");

  return (
    <div className="space-y-4 font-sans text-[15px] leading-8 text-gray-800 tracking-normal">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        const isTitle = /^【[^】]+】/.test(trimmed);
        const isParagraphNumber = /^\[\d{4}\]/.test(trimmed);

        if (isTitle) {
          return (
            <h4
              key={idx}
              className="mt-6 mb-2 text-base font-extrabold text-gray-900 flex items-center gap-2 border-l-4 border-teal-500 pl-3"
            >
              <HighlightedText text={trimmed} highlights={matchedTerms} />
            </h4>
          );
        }

        if (isParagraphNumber) {
          const numMatch = trimmed.match(/^(\[\d{4}\])(.*)/);
          if (numMatch) {
            return (
              <p key={idx} className="pl-4 relative">
                <span className="absolute left-0 text-xs font-mono text-gray-400 font-bold mt-1 select-none">
                  {numMatch[1]}
                </span>
                <span className="text-gray-800 pl-4 block">
                  <HighlightedText text={numMatch[2].trim()} highlights={matchedTerms} />
                </span>
              </p>
            );
          }
        }

        return (
          <p key={idx} className="leading-8 text-gray-800">
            <HighlightedText text={trimmed} highlights={matchedTerms} />
          </p>
        );
      })}
    </div>
  );
}

export default function PatentDetailModal({ patent, onClose }: PatentDetailModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

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
  if (!mounted) return null;

  const matchedTerms = Array.isArray(patent.matched_terms) ? patent.matched_terms : [];
  const content = patent.full_content || patent.relevance_text || "상세 문서 내용이 없습니다.";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-md sm:p-6">
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
        className="relative z-10 flex h-full max-h-[85vh] sm:max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
      >
        <div className="sticky top-0 z-10 shrink-0 border-b border-gray-100 bg-white/95 backdrop-blur-md px-6 py-5 sm:px-8 sm:py-6">
          <div className="relative flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="mb-3.5 flex flex-wrap items-center gap-2">
                {patent.register_status && (
                  <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 shadow-sm">
                    {patent.register_status}
                  </span>
                )}
                <span className="rounded-full border-0 bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-1 text-xs font-black text-white shadow-md shadow-blue-500/10">
                  관련도 {formatScore(patent.score)}
                </span>
                {patent.score_type && (
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-bold uppercase text-gray-500 tracking-wider">
                    {patent.score_type}
                  </span>
                )}
              </div>
              <h2 id="patent-detail-title" className="text-xl font-black leading-8 text-slate-900 sm:text-2xl tracking-tight">
                {patent.invention_title || "제목 없음"}
              </h2>
              <p className="mt-2.5 text-xs font-semibold leading-5 text-gray-400 flex items-center gap-1.5">
                <i className="ri-information-line text-sm text-teal-600" />
                RAG 시스템에 활용된 특허 메타데이터와 핵심 매칭 구절 및 초록 내용입니다.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-400 shadow-sm transition-all duration-200 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
              aria-label="닫기"
            >
              <i className="ri-close-line text-xl" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50/50 p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DetailItem label="출원번호" value={patent.application_number} mono icon="ri-fingerprint-line" />
            <DetailItem label="출원일" value={formatDate(patent.application_date)} icon="ri-calendar-event-line" />
            <DetailItem label="출원인" value={patent.applicant_name} icon="ri-building-line" />
            <DetailItem label="IPC 분류" value={patent.ipc_number} mono icon="ri-git-branch-line" />
          </div>

          {matchedTerms.length > 0 && (
            <div className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                <i className="ri-focus-3-line text-lg text-teal-600" />
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">질의와 매칭된 핵심 키워드</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {matchedTerms.map((term) => (
                  <span
                    key={term}
                    className="rounded-full border border-teal-100/70 bg-teal-50/50 px-3 py-1 text-xs font-black text-teal-700 hover:bg-teal-100/50 transition-colors"
                  >
                    #{term}
                  </span>
                ))}
              </div>
            </div>
          )}

          {patent.relevance_reason && (
            <div className="rounded-2xl border-l-4 border-amber-500 bg-amber-50/50 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <i className="ri-lightbulb-flash-line text-lg text-amber-600" />
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">AI 분석에 따른 최종 채택 사유</h3>
              </div>
              <p className="text-[14px] leading-7 font-medium text-amber-900/90 whitespace-pre-line">
                {patent.relevance_reason}
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/60 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <i className="ri-file-text-line text-lg text-slate-500" />
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">특허 상세 및 초록 본문</h3>
              </div>
              <span className="rounded-full bg-gray-200/70 px-2.5 py-1 font-mono text-[10px] font-bold text-gray-600">
                {content.length.toLocaleString()} 글자
              </span>
            </div>
            <div className="p-6 sm:p-8">
              <PatentContentRenderer content={content} matchedTerms={matchedTerms} />
            </div>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
