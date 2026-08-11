// ============================================================
// 파일 역할: ClaimLens SSE 이벤트와 화면에서 사용하는 분석 데이터 계약을 정의한다.
//
// 작성자: 심우현
// 최종 수정일: 2026년 8월 11일
//
// 주요 책임:
// - 이벤트 종류별 필수 필드 정의
// - 후보 특허와 청구항 비교 행 타입 정의
// - Backend의 camelCase payload 계약 유지
// ============================================================

export type ClaimLensStep =
  | "input_analysis"
  | "patent_search"
  | "claim_loading"
  | "feature_matching"
  | "report_generation"
  | "analysis";

export type ClaimLensMatchStatus = "matched" | "partial" | "not_found" | "uncertain";

export interface ClaimLensPatentSummary {
  id: number;
  applicationNumber: string;
  title: string;
  applicantName: string | null;
  registerStatus: string | null;
  abstract: string | null;
}

export interface ClaimLensCandidate {
  vectorId: string;
  score: number;
  matchedTextType: string;
  matchedText: string;
  claimComparisonReady: boolean;
  patent: ClaimLensPatentSummary;
  claim: Record<string, unknown> | null;
  claimElementCount: number;
}

export interface ClaimLensChartRow {
  applicationNumber: string;
  patentTitle: string;
  claimNumber: number | null;
  claimElementOrder: number | null;
  claimElement: string;
  productFeature: string | null;
  match: ClaimLensMatchStatus;
  evidence: string | null;
  uncertainty: string | null;
  score: number;
}

interface ClaimLensEventBase {
  step?: ClaimLensStep | null;
  tool?: string | null;
  message?: string | null;
  data?: unknown;
}

export interface ClaimLensStepEvent extends ClaimLensEventBase {
  type: "step_started" | "step_completed";
  step: ClaimLensStep;
}

export interface ClaimLensQueryPlanEvent extends ClaimLensEventBase {
  type: "query_plan";
  step: "input_analysis";
  data: Record<string, unknown>;
}

export interface ProductFeaturesEvent extends ClaimLensEventBase {
  type: "tool_result";
  step: "input_analysis";
  tool: "extract_product_features";
  data: { features: string[] };
}

export interface CandidateSearchEvent extends ClaimLensEventBase {
  type: "tool_result";
  step: "patent_search";
  tool: "search_claim_candidates";
  data: { candidates: ClaimLensCandidate[] };
}

export interface ClaimElementCountEvent extends ClaimLensEventBase {
  type: "tool_result";
  step: "claim_loading";
  tool: "load_claim_elements";
  data: { claimElementCount: number };
}

export type ClaimLensToolResultEvent =
  | ProductFeaturesEvent
  | CandidateSearchEvent
  | ClaimElementCountEvent;

export interface ClaimLensSupervisorDecisionEvent extends ClaimLensEventBase {
  type: "supervisor_decision";
  step: "patent_search";
  data: Record<string, unknown>;
}

export interface ClaimLensAutoIngestEvent extends ClaimLensEventBase {
  type: "auto_ingest_started" | "auto_ingest_completed";
  step: "patent_search";
  data?: Record<string, unknown> | null;
}

export interface ClaimLensRetrySearchEvent extends ClaimLensEventBase {
  type: "retry_search";
  step: "patent_search";
}

export interface ClaimLensChartRowEvent extends ClaimLensEventBase {
  type: "claim_chart_row";
  data: ClaimLensChartRow;
}

export interface ClaimLensFinalReportEvent extends ClaimLensEventBase {
  type: "final_report";
  data: { markdown: string };
}

export interface ClaimLensErrorEvent extends ClaimLensEventBase {
  type: "error";
  step: "analysis";
  data: { error: string };
}

export type ClaimLensEvent =
  | ClaimLensStepEvent
  | ClaimLensQueryPlanEvent
  | ClaimLensToolResultEvent
  | ClaimLensSupervisorDecisionEvent
  | ClaimLensAutoIngestEvent
  | ClaimLensRetrySearchEvent
  | ClaimLensChartRowEvent
  | ClaimLensFinalReportEvent
  | ClaimLensErrorEvent;

export interface ClaimLensState {
  events: ClaimLensEvent[];
  reportMarkdown: string;
  error: string | null;
}
