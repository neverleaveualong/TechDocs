export interface PatentItem {
  application_number: string;
  invention_title: string;
  applicant_name: string;
  ipc_number: string;
  application_date: string;
  register_status: string;
  abstract: string;
}

export interface PatentSearchResponse {
  patents: PatentItem[];
  total_count: number;
}
