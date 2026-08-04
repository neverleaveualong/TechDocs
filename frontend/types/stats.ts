export interface CompanyStats {
  applicant: string;
  patent_count: number;
}

export interface SummaryStats {
  total_patents: number;
  analyzed_patents: number;
  analysis_rate: number;
  total_claims: number;
  independent_claims: number;
  claim_elements: number;
}

export interface AutoIngestStats {
  enabled: boolean;
  daily_kipris_calls: number;
  monthly_kipris_calls: number;
  daily_limit: number;
  monthly_limit: number;
  cache_ttl_days: number;
  total_runs: number;
}

export interface EngineeringDetails {
  total_vectors: number;
  rag_vectors: number;
  agent_vectors: number;
}

export interface Stats {
  index_name: string;
  embedding_model: string;
  summary: SummaryStats;
  companies: CompanyStats[];
  auto_ingest: AutoIngestStats;
  engineering_details: EngineeringDetails;
}

