export interface CompanyStats {
  applicant: string;
  patent_count: number;
  vector_count: number;
}

export interface NamespaceStats {
  namespace: string;
  vector_count: number;
}

export interface ClaimLensStats {
  patents: number;
  claims: number;
  active_claims: number;
  independent_claims: number;
  claim_elements: number;
  patents_with_claims: number;
}

export interface Stats {
  total_vectors: number;
  dimension: number;
  index_name: string;
  company_namespace: string;
  company_sample_limit: number;
  company_stats_sampled: boolean;
  namespaces: {
    rag: NamespaceStats;
    agent: NamespaceStats;
    default: NamespaceStats;
  };
  companies: CompanyStats[];
  claimlens: ClaimLensStats;
}
