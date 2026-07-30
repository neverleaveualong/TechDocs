export type ClaimLensEventType =
  | "step_started"
  | "tool_result"
  | "step_completed"
  | "claim_chart_row"
  | "final_report"
  | "query_plan"
  | "supervisor_decision"
  | "auto_ingest_started"
  | "auto_ingest_completed"
  | "retry_search"
  | "error";

export interface ClaimLensEvent {
  type: ClaimLensEventType;
  step?: string | null;
  tool?: string | null;
  message?: string | null;
  data?: Record<string, unknown> | null;
}

export interface ClaimLensPatentSummary {
  title?: string;
  applicant_name?: string;
  applicantName?: string;
  application_number?: string;
  applicationNumber?: string;
  application_date?: string;
  applicationDate?: string;
  register_status?: string;
  registerStatus?: string;
  abstract?: string;
}

export interface ClaimLensCandidate {
  patent?: ClaimLensPatentSummary;
  score?: number;
  matchedTextType?: string;
  claimComparisonReady?: boolean;
}

export interface ClaimLensState {
  events: ClaimLensEvent[];
  reportMarkdown: string;
  error: string | null;
}
