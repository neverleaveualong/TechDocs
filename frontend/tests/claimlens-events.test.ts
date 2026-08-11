// ============================================================
// 파일 역할: ClaimLens SSE 계약 검증과 결과 selector의 회귀 테스트를 수행한다.
//
// 작성자: 심우현
// 최종 수정일: 2026년 8월 11일
//
// 주요 책임:
// - Backend 형식의 이벤트 payload 검증
// - 기능·후보·차트·보고서 추출 검증
// - 이전 필드명과 잘못된 상태값 거부 검증
// ============================================================

import { describe, expect, it } from "vitest";

import {
  getMatchPresentation,
  isClaimLensEvent,
  selectCandidates,
  selectChartRows,
  selectFinalReport,
  selectProductFeatures,
} from "../lib/claimlens-events";
import type { ClaimLensEvent } from "../types/claimlens";

const backendEvents: unknown[] = [
  {
    type: "tool_result",
    step: "input_analysis",
    tool: "extract_product_features",
    message: null,
    data: { features: ["센서 데이터 수집", "AI 이상 탐지"] },
  },
  {
    type: "tool_result",
    step: "patent_search",
    tool: "search_claim_candidates",
    message: null,
    data: {
      candidates: [
        {
          vectorId: "patent:1:claim:1",
          score: 0.82,
          claimComparisonReady: true,
          matchedTextType: "independent_claim",
          matchedText: "센서 데이터를 분석하는 단계",
          patent: {
            id: 1,
            applicationNumber: "1020240000001",
            title: "센서 데이터 분석 장치",
            applicantName: "테크독스",
            registerStatus: "등록",
            abstract: "센서 데이터를 이용한 분석 장치",
          },
          claim: null,
          claimElementCount: 2,
        },
      ],
    },
  },
  {
    type: "claim_chart_row",
    step: null,
    tool: null,
    message: null,
    data: {
      applicationNumber: "1020240000001",
      patentTitle: "센서 데이터 분석 장치",
      claimNumber: 1,
      claimElementOrder: 1,
      claimElement: "센서 데이터를 수집하는 구성",
      productFeature: "센서 데이터 수집",
      match: "matched",
      evidence: "제품 설명에서 동일 기능을 확인함",
      uncertainty: null,
      score: 0.91,
    },
  },
  {
    type: "final_report",
    step: null,
    tool: null,
    message: null,
    data: { markdown: "## 기술 검토 초안" },
  },
];

function validatedEvents(): ClaimLensEvent[] {
  return backendEvents.filter(isClaimLensEvent);
}

describe("ClaimLens SSE 계약", () => {
  it("Backend의 tool/data와 camelCase payload를 허용한다", () => {
    expect(validatedEvents()).toHaveLength(backendEvents.length);
  });

  it("이전 tool_name/result 계약은 거부한다", () => {
    expect(
      isClaimLensEvent({
        type: "tool_result",
        step: "input_analysis",
        tool_name: "extract_product_features",
        result: { features: ["잘못된 계약"] },
      }),
    ).toBe(false);

    expect(
      isClaimLensEvent({
        type: "claim_chart_row",
        step: null,
        tool: null,
        message: null,
        data: {
          applicationNumber: "1020240000001",
          patentTitle: "센서 데이터 분석 장치",
          claimNumber: 1,
          claimElementOrder: 1,
          claimElement: "센서 데이터를 수집하는 구성",
          productFeature: "센서 데이터 수집",
          match: "unsupported_status",
          evidence: null,
          uncertainty: null,
          score: 0.5,
        },
      }),
    ).toBe(false);
  });

  it("기능·후보·차트·보고서를 실제 중첩 위치에서 추출한다", () => {
    const events = validatedEvents();

    expect(selectProductFeatures(events)).toEqual(["센서 데이터 수집", "AI 이상 탐지"]);
    expect(selectCandidates(events)[0].patent.applicationNumber).toBe("1020240000001");
    expect(selectChartRows(events)[0]).toMatchObject({
      claimElement: "센서 데이터를 수집하는 구성",
      productFeature: "센서 데이터 수집",
      match: "matched",
    });
    expect(selectFinalReport(events)).toBe("## 기술 검토 초안");
  });

  it("비교 상태를 법률 판단이 아닌 기술 비교 문구로 변환한다", () => {
    expect(getMatchPresentation("matched").label).toBe("일치 근거 확인");
    expect(getMatchPresentation("partial").label).toBe("부분 일치");
    expect(getMatchPresentation("not_found").label).toBe("대응 기능 없음");
    expect(getMatchPresentation("uncertain").label).toBe("추가 검토 필요");
  });
});
