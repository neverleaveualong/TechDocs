export interface CompanyStats {
  applicant: string;
  patent_count: number;
  vector_count: number;
}

export interface Stats {
  total_vectors: number;
  dimension: number;
  index_name: string;
  companies: CompanyStats[];
}
