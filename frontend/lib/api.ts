import type { SearchResponse, SearchStreamEvent, SimilarityResponse } from "@/types/search";
import type { Stats } from "@/types/stats";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://techdocs-1v4q.onrender.com";

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
  return fetchApi<SearchResponse>("/api/search/search", {
    method: "POST",
    body: JSON.stringify({ query, top_k: topK }),
  });
}

export async function searchPatentsStream(
  query: string,
  onEvent: (event: SearchStreamEvent) => void,
  topK: number = 5
) {
  const res = await fetch(`${API_URL}/api/search/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "요청 실패" }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }

  if (!res.body) {
    throw new Error("스트리밍 응답을 받을 수 없습니다.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as SearchStreamEvent;
      if (event.type === "error") {
        throw new Error(event.detail);
      }
      onEvent(event);
    }
  }

  if (buffer.trim()) {
    const event = JSON.parse(buffer) as SearchStreamEvent;
    if (event.type === "error") {
      throw new Error(event.detail);
    }
    onEvent(event);
  }
}

export async function submitFeedback(queryLogId: number, rating: number, comment?: string) {
  return fetchApi<{ id: number }>("/api/feedback", {
    method: "POST",
    body: JSON.stringify({ query_log_id: queryLogId, rating, comment }),
  });
}

export async function getFeedbackStats() {
  return fetchApi<import("@/types/search").FeedbackStats>("/api/feedback/stats");
}

export async function similaritySearch(query: string, topK: number = 5) {
  return fetchApi<SimilarityResponse>("/api/search/similarity", {
    method: "POST",
    body: JSON.stringify({ query, top_k: topK }),
  });
}

export async function getStats() {
  return fetchApi<Stats>("/api/stats/");
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
