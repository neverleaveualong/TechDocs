export type ClaimLensEventType =
  | "step_started"
  | "tool_result"
  | "step_completed"
  | "claim_chart_row"
  | "final_report"
  | "query_plan"
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

export interface ClaimLensState {
  events: ClaimLensEvent[];
  reportMarkdown: string;
  error: string | null;
}
