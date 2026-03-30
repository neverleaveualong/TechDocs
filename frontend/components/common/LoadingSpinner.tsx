"use client";

import { useState, useEffect } from "react";

const tips = [
  "Pinecone에서 코사인 유사도로 관련 특허를 검색하고 있습니다",
  "검색된 특허 청크를 GPT-4o-mini에 전달하고 있습니다",
  "GPT-4o-mini가 특허 내용을 분석하고 답변을 생성하고 있습니다",
  "RAG 파이프라인 처리 중입니다, 잠시만 기다려주세요",
  "거의 다 되었습니다, 잠시만 기다려주세요",
];

export default function LoadingSpinner({ message = "로딩 중..." }: { message?: string }) {
  const [elapsed, setElapsed] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // 팁 순환: 0→15초→30초→60초→90초
  useEffect(() => {
    if (elapsed >= 90) setTipIdx(4);
    else if (elapsed >= 60) setTipIdx(3);
    else if (elapsed >= 30) setTipIdx(2);
    else if (elapsed >= 15) setTipIdx(1);
    else setTipIdx(0);
  }, [elapsed]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}분 ${sec.toString().padStart(2, "0")}초` : `${sec}초`;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* 프로그레스 바 (불확정 — 끝까지 안 감) */}
      <div className="h-1 bg-gray-100 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-teal-400 to-teal-500 rounded-full"
          style={{
            width: `${Math.min(30 + elapsed * 0.5, 92)}%`,
            transition: "width 1s linear",
          }}
        />
      </div>

      <div className="p-5 sm:p-6">
        {/* 메인 */}
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-sm shrink-0">
            <div
              className="w-5 h-5 rounded-full border-[2.5px] border-white/30 border-t-white"
              style={{ animation: "spin 0.8s linear infinite" }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">{message}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{tips[tipIdx]}</p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xl font-bold text-teal-600 tabular-nums block">{formatTime(elapsed)}</span>
            <span className="text-[10px] text-gray-400">경과</span>
          </div>
        </div>

        {/* 예상 시간 안내 */}
        <div className="mt-4 flex items-center gap-2 px-3.5 py-2.5 bg-gray-50 border border-gray-100 rounded-lg">
          <i className="ri-time-line text-gray-400 text-sm shrink-0" />
          <p className="text-[11px] text-gray-500">
            벡터 검색 → 청크 추출 → AI 답변 생성 순서로 처리되며, <span className="font-semibold text-gray-700">약 10~30초</span> 소요됩니다.
          </p>
        </div>

        {/* 오래 걸릴 때 추가 안내 */}
        {elapsed >= 60 && (
          <div className="mt-3 flex items-center gap-2 px-3.5 py-2.5 bg-amber-50 border border-amber-100 rounded-lg animate-fade-in">
            <i className="ri-information-line text-amber-500 text-sm shrink-0" />
            <p className="text-[11px] text-amber-700">
              평소보다 시간이 걸리고 있습니다. 서버 상태에 따라 더 걸릴 수 있습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
