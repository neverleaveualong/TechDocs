export interface PatentSource {
  invention_title: string;
  applicant_name: string;
  application_number: string;
  application_date: string;
  register_status: string;
  ipc_number?: string;
  score?: number | null;
  score_type?: string;
  relevance_reason?: string;
  matched_terms?: string[];
  relevance_text: string;
  full_content?: string;
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
      reason?: string;
    }
  | {
      type: "auto_ingest_completed";
      data: Record<string, unknown>;
    }
  | {
      type: "search_quality";
      phase?: "retry";
      data: Record<string, unknown>;
    }
  | {
      type: "done";
      query: string;
      query_log_id?: number;
    }
  | {
      type: "agent_decision";
      agent: string;
      decision: {
        next_action: string;
        reasoning: string;
        parameters: Record<string, unknown>;
      };
    }
  | {
      type: "agent_action";
      agent: string;
      message: string;
    }
  | {
      type: "agent_completed";
      agent: string;
      reasoning: string;
      payload?: Record<string, unknown>;
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
