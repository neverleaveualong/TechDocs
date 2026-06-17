export interface PatentSource {
  invention_title: string;
  applicant_name: string;
  application_number: string;
  application_date: string;
  register_status: string;
  relevance_text: string;
}

export interface SearchResponse {
  answer: string;
  sources: PatentSource[];
  query: string;
  query_log_id?: number;
}

export type SearchStreamEvent =
  | {
      type: "query_plan";
      data: Record<string, unknown>;
    }
  | {
      type: "sources";
      query: string;
      sources: PatentSource[];
    }
  | {
      type: "answer_delta";
      delta: string;
    }
  | {
      type: "auto_ingest_started" | "retry_search";
      message: string;
    }
  | {
      type: "auto_ingest_completed";
      data: Record<string, unknown>;
    }
  | {
      type: "done";
      query: string;
      query_log_id?: number;
    }
  | {
      type: "error";
      detail: string;
    };

export interface FeedbackCreate {
  query_log_id: number;
  rating: number;
  comment?: string;
}

export interface FeedbackStats {
  total_queries: number;
  total_feedbacks: number;
  positive_rate: number;
  recent_negative_queries: { id: number; query: string; answer: string }[];
}

export interface SimilarityResult {
  content: string;
  metadata: Record<string, string>;
  score: number;
}

export interface SimilarityResponse {
  results: SimilarityResult[];
}
