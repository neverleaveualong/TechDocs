"use client";

import { useState, useEffect, useCallback } from "react";

const demoScenarios = [
  {
    query: "2차전지 열 관리 기술",
    answer: "2차전지 열 관리 기술은 배터리 셀의 온도를 최적 범위로 유지하기 위한 냉각·가열 시스템입니다. 주요 방식으로 액냉식, 공냉식, 히트파이프 방식이 있습니다.",
    results: [
      { title: "이차전지 냉각 시스템 및 방법", applicant: "삼성전자", score: 94.2 },
      { title: "배터리 모듈의 열 관리 장치", applicant: "엘지에너지솔루션", score: 91.7 },
      { title: "전기차용 배터리 팩 냉각 구조", applicant: "현대자동차", score: 88.3 },
      { title: "리튬이온 전지 온도 제어 방법", applicant: "에스케이하이닉스", score: 85.1 },
    ],
  },
  {
    query: "반도체 식각 공정 특허",
    answer: "반도체 식각 공정은 웨이퍼 표면의 불필요한 물질을 제거하는 핵심 공정입니다. 플라즈마 식각, 습식 식각, 건식 식각 등이 있으며 미세 패턴 형성에 필수적입니다.",
    results: [
      { title: "플라즈마 식각 장치 및 방법", applicant: "삼성전자", score: 96.1 },
      { title: "반도체 건식 식각 공정 제어", applicant: "에스케이하이닉스", score: 92.4 },
      { title: "미세 패턴용 선택적 식각 기술", applicant: "삼성전자", score: 89.8 },
      { title: "웨이퍼 표면 습식 식각 장치", applicant: "에스케이하이닉스", score: 86.5 },
    ],
  },
  {
    query: "ERP 클라우드 마이그레이션",
    answer: "ERP 클라우드 마이그레이션은 기존 온프레미스 ERP 시스템을 클라우드 환경으로 전환하는 기술입니다. 데이터 무결성 보장, 보안 강화, 실시간 동기화가 핵심입니다.",
    results: [
      { title: "클라우드 기반 ERP 데이터 동기화", applicant: "더존비즈온", score: 93.7 },
      { title: "하이브리드 클라우드 ERP 아키텍처", applicant: "더존비즈온", score: 90.2 },
      { title: "SaaS ERP 보안 인증 시스템", applicant: "더존비즈온", score: 87.9 },
      { title: "멀티테넌트 ERP 자원 관리 방법", applicant: "더존비즈온", score: 84.6 },
    ],
  },
];

export type DemoPhase = "idle" | "typing" | "searching" | "result";

export interface DemoScenario {
  query: string;
  answer: string;
  results: { title: string; applicant: string; score: number }[];
}

export { demoScenarios };

export function useSearchDemo() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [phase, setPhase] = useState<DemoPhase>("idle");
  const [typedLen, setTypedLen] = useState(0);
  const [visibleResults, setVisibleResults] = useState(0);

  const scenario = demoScenarios[scenarioIdx];

  const reset = useCallback((nextIdx: number) => {
    setScenarioIdx(nextIdx);
    setPhase("idle");
    setTypedLen(0);
    setVisibleResults(0);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setPhase("typing"), 1000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase !== "typing") return;
    if (typedLen >= scenario.query.length) {
      const t = setTimeout(() => setPhase("searching"), 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTypedLen((l) => l + 1), 60 + Math.random() * 30);
    return () => clearTimeout(t);
  }, [phase, typedLen, scenario.query.length]);

  useEffect(() => {
    if (phase !== "searching") return;
    const t = setTimeout(() => setPhase("result"), 1000);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "result") return;
    if (visibleResults >= scenario.results.length + 1) {
      const t = setTimeout(() => {
        const next = (scenarioIdx + 1) % demoScenarios.length;
        reset(next);
        setTimeout(() => setPhase("typing"), 600);
      }, 4000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVisibleResults((v) => v + 1), 250);
    return () => clearTimeout(t);
  }, [phase, visibleResults, scenario.results.length, scenarioIdx, reset]);

  return { phase, typedLen, visibleResults, scenario };
}
