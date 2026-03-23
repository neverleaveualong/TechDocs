export interface PatentSource {
  invention_title: string;
  applicant_name: string;
  application_number: string;
  application_date: string;
  relevance_text: string;
}

export interface SearchResponse {
  answer: string;
  sources: PatentSource[];
  query: string;
}

export interface SimilarityResult {
  content: string;
  metadata: Record<string, string>;
  score: number;
}

export interface SimilarityResponse {
  results: SimilarityResult[];
}
