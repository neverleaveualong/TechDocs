const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "요청 실패" }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function searchPatents(query: string, topK: number = 5) {
  return fetchApi<import("@/types/search").SearchResponse>("/api/search", {
    method: "POST",
    body: JSON.stringify({ query, top_k: topK }),
  });
}

export async function similaritySearch(query: string, topK: number = 5) {
  return fetchApi<import("@/types/search").SimilarityResponse>(
    "/api/search/similar",
    {
      method: "POST",
      body: JSON.stringify({ query, top_k: topK }),
    }
  );
}

export async function getStats() {
  return fetchApi<{
    total_vectors: number;
    dimension: number;
    index_name: string;
    companies: {
      applicant: string;
      patent_count: number;
      vector_count: number;
    }[];
  }>("/api/stats");
}

export async function ingestPatents(
  applicant: string,
  pages: number = 5,
  startDate?: string,
  endDate?: string
) {
  return fetchApi<{ status: string; patents_collected: number; vectors_stored: number }>(
    "/api/ingest",
    {
      method: "POST",
      body: JSON.stringify({
        applicant,
        pages,
        start_date: startDate || "",
        end_date: endDate || "",
      }),
    }
  );
}
