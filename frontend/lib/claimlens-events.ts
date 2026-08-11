// ============================================================
// 파일 역할: ClaimLens SSE payload를 검증하고 화면용 분석 결과를 추출한다.
//
// 작성자: 심우현
// 최종 수정일: 2026년 8월 11일
//
// 주요 책임:
// - JSON payload의 런타임 계약 검증
// - 이벤트 목록에서 기능·후보·차트·보고서 추출
// - 비교 상태를 사용자용 표시 정보로 변환
// ============================================================

import type {
  CandidateSearchEvent,
  ClaimLensCandidate,
  ClaimLensChartRow,
  ClaimLensEvent,
  ClaimLensMatchStatus,
  ProductFeaturesEvent,
} from "@/types/claimlens";

const CLAIMLENS_EVENT_TYPES = new Set([
  "step_started",
  "tool_result",
  "step_completed",
  "claim_chart_row",
  "final_report",
  "query_plan",
  "supervisor_decision",
  "auto_ingest_started",
  "auto_ingest_completed",
  "retry_search",
  "error",
]);

const CLAIMLENS_STEPS = new Set([
  "input_analysis",
  "patent_search",
  "claim_loading",
  "feature_matching",
  "report_generation",
  "analysis",
]);

const MATCH_STATUSES: ReadonlySet<string> = new Set([
  "matched",
  "partial",
  "not_found",
  "uncertain",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isClaimLensCandidate(value: unknown): value is ClaimLensCandidate {
  if (!isRecord(value) || !isRecord(value.patent)) return false;

  const patent = value.patent;
  return (
    typeof value.vectorId === "string" &&
    typeof value.score === "number" &&
    typeof value.matchedTextType === "string" &&
    typeof value.matchedText === "string" &&
    typeof value.claimComparisonReady === "boolean" &&
    (value.claim === null || isRecord(value.claim)) &&
    typeof value.claimElementCount === "number" &&
    typeof patent.id === "number" &&
    typeof patent.applicationNumber === "string" &&
    typeof patent.title === "string" &&
    isNullableString(patent.applicantName) &&
    isNullableString(patent.registerStatus) &&
    isNullableString(patent.abstract)
  );
}

function isClaimLensChartRow(value: unknown): value is ClaimLensChartRow {
  if (!isRecord(value)) return false;

  return (
    typeof value.applicationNumber === "string" &&
    typeof value.patentTitle === "string" &&
    (value.claimNumber === null || typeof value.claimNumber === "number") &&
    (value.claimElementOrder === null || typeof value.claimElementOrder === "number") &&
    typeof value.claimElement === "string" &&
    isNullableString(value.productFeature) &&
    typeof value.match === "string" &&
    MATCH_STATUSES.has(value.match) &&
    isNullableString(value.evidence) &&
    isNullableString(value.uncertainty) &&
    typeof value.score === "number"
  );
}

function hasValidCommonFields(value: Record<string, unknown>): boolean {
  const hasValidStep =
    value.step === undefined ||
    value.step === null ||
    (typeof value.step === "string" && CLAIMLENS_STEPS.has(value.step));
  const hasValidData = value.data === undefined || value.data === null || isRecord(value.data);

  return hasValidStep && isOptionalString(value.tool) && isOptionalString(value.message) && hasValidData;
}

export function isClaimLensEvent(value: unknown): value is ClaimLensEvent {
  if (!isRecord(value) || typeof value.type !== "string" || !CLAIMLENS_EVENT_TYPES.has(value.type)) {
    return false;
  }
  if (!hasValidCommonFields(value)) return false;

  const data = value.data;
  switch (value.type) {
    case "tool_result":
      if (!isRecord(data)) return false;
      if (value.tool === "extract_product_features") {
        return (
          value.step === "input_analysis" &&
          Array.isArray(data.features) &&
          data.features.every((feature) => typeof feature === "string")
        );
      }
      if (value.tool === "search_claim_candidates") {
        return (
          value.step === "patent_search" &&
          Array.isArray(data.candidates) &&
          data.candidates.every(isClaimLensCandidate)
        );
      }
      return (
        value.tool === "load_claim_elements" &&
        value.step === "claim_loading" &&
        typeof data.claimElementCount === "number"
      );
    case "step_started":
    case "step_completed":
      return typeof value.step === "string" && CLAIMLENS_STEPS.has(value.step);
    case "query_plan":
      return value.step === "input_analysis" && isRecord(data);
    case "supervisor_decision":
      return value.step === "patent_search" && isRecord(data);
    case "auto_ingest_started":
    case "auto_ingest_completed":
    case "retry_search":
      return value.step === "patent_search";
    case "claim_chart_row":
      return isClaimLensChartRow(data);
    case "final_report":
      return isRecord(data) && typeof data.markdown === "string";
    case "error":
      return value.step === "analysis" && isRecord(data) && typeof data.error === "string";
  }
  return false;
}

export function selectProductFeatures(events: ClaimLensEvent[]): string[] {
  const event = events.findLast(
    (item): item is ProductFeaturesEvent =>
      item.type === "tool_result" && item.tool === "extract_product_features",
  );
  return event?.data.features ?? [];
}

export function selectCandidates(events: ClaimLensEvent[]): ClaimLensCandidate[] {
  const event = events.findLast(
    (item): item is CandidateSearchEvent =>
      item.type === "tool_result" && item.tool === "search_claim_candidates",
  );
  return event?.data.candidates ?? [];
}

export function selectChartRows(events: ClaimLensEvent[]): ClaimLensChartRow[] {
  return events.flatMap((event) => (event.type === "claim_chart_row" ? [event.data] : []));
}

export function selectFinalReport(events: ClaimLensEvent[]): string {
  const event = events.findLast((item) => item.type === "final_report");
  return event?.data.markdown ?? "";
}

export interface MatchPresentation {
  label: string;
  className: string;
}

export function getMatchPresentation(status: ClaimLensMatchStatus): MatchPresentation {
  switch (status) {
    case "matched":
      return {
        label: "일치 근거 확인",
        className: "bg-red-50 text-red-700 border-red-200",
      };
    case "partial":
      return {
        label: "부분 일치",
        className: "bg-amber-50 text-amber-700 border-amber-200",
      };
    case "not_found":
      return {
        label: "대응 기능 없음",
        className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    case "uncertain":
      return {
        label: "추가 검토 필요",
        className: "bg-gray-100 text-gray-700 border-gray-200",
      };
  }
}
