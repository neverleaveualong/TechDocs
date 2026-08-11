// ============================================================
// 파일 역할: Backend API 요청과 NDJSON·SSE 스트리밍 응답 처리를 담당한다.
//
// 작성자: 심우현
// 최종 수정일: 2026년 8월 11일
//
// 주요 책임:
// - 검색과 ClaimLens 요청 생성
// - 스트리밍 frame 파싱 및 계약 검증
// - API 오류를 화면용 오류로 변환
// ============================================================

import type {
  FeedbackStats,
  SearchResponse,
  SearchStreamEvent,
  SimilarityResponse,
} from "@/types/search";
import type { ClaimLensEvent } from "@/types/claimlens";
import type { Stats } from "@/types/stats";
import { isClaimLensEvent } from "@/lib/claimlens-events";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://techdocs-1v4q.onrender.com";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ErrorPayload = {
  detail?: unknown;
  message?: unknown;
  error?: unknown;
};

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;

  const errorPayload = payload as ErrorPayload;
  if (typeof errorPayload.detail === "string" && errorPayload.detail.trim()) {
    return errorPayload.detail;
  }
  if (typeof errorPayload.message === "string" && errorPayload.message.trim()) {
    return errorPayload.message;
  }
  if (typeof errorPayload.error === "string" && errorPayload.error.trim()) {
    return errorPayload.error;
  }
  return fallback;
}

async function throwResponseError(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => null);
  throw new ApiError(
    getErrorMessage(payload, `${fallback} (HTTP ${response.status})`),
    response.status,
  );
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    await throwResponseError(res, "요청 실패");
  }

  return res.json();
}

export async function searchPatents(query: string, topK: number = 5): Promise<SearchResponse> {
  return fetchApi<SearchResponse>("/api/search/search", {
    method: "POST",
    body: JSON.stringify({ query, top_k: topK }),
  });
}

export async function searchPatentsStream(
  query: string,
  onEvent: (event: SearchStreamEvent) => void,
  topK: number = 5,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const res = await fetch(`${API_URL}/api/search/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
    signal: options?.signal,
  });

  if (!res.ok) {
    await throwResponseError(res, "요청 실패");
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
      const parsed = JSON.parse(trimmed) as { type?: string };
      if (parsed.type === "keepalive") continue;
      const event = parsed as SearchStreamEvent;
      if (event.type === "error") {
        throw new ApiError(event.detail, 200);
      }
      onEvent(event);
    }
  }

  if (buffer.trim()) {
    const parsed = JSON.parse(buffer) as { type?: string };
    if (parsed.type === "keepalive") return;
    const event = parsed as SearchStreamEvent;
    if (event.type === "error") {
      throw new ApiError(event.detail, 200);
    }
    onEvent(event);
  }
}

export async function streamClaimLensAnalysis(
  productDescription: string,
  onEvent: (event: ClaimLensEvent) => void,
  options?: { topK?: number; signal?: AbortSignal }
): Promise<void> {
  const res = await fetch(`${API_URL}/api/claimlens/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      product_description: productDescription,
      top_k: options?.topK ?? 5,
    }),
    signal: options?.signal,
  });

  if (!res.ok) {
    await throwResponseError(res, "침해 검토 요청 실패");
  }
  if (!res.body) {
    throw new Error("침해 검토 스트림 응답이 비어 있습니다.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const event = parseClaimLensSse(chunk);
      emitClaimLensEvent(event, onEvent);
    }
  }

  buffer += decoder.decode();
  const finalEvent = parseClaimLensSse(buffer);
  emitClaimLensEvent(finalEvent, onEvent);
}

function emitClaimLensEvent(
  event: ClaimLensEvent | null,
  onEvent: (event: ClaimLensEvent) => void,
): void {
  if (!event) return;
  if (event.type === "error") {
    throw new ApiError(
      getErrorMessage(event.data, event.message || "침해 검토 중 오류가 발생했습니다."),
      200,
    );
  }
  onEvent(event);
}

function parseClaimLensSse(chunk: string): ClaimLensEvent | null {
  const dataLine = chunk.split("\n").find((line) => line.startsWith("data:"));
  if (!dataLine) return null;
  try {
    const parsed: unknown = JSON.parse(dataLine.slice("data:".length).trim());
    if (!isClaimLensEvent(parsed)) {
      throw new ApiError("ClaimLens 응답 계약이 올바르지 않습니다.", 200);
    }
    return parsed;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("ClaimLens 스트림 JSON을 해석할 수 없습니다.", 200);
  }
}

export async function submitFeedback(queryLogId: number, rating: number, comment?: string): Promise<{ id: number }> {
  return fetchApi<{ id: number }>("/api/feedback", {
    method: "POST",
    body: JSON.stringify({ query_log_id: queryLogId, rating, comment }),
  });
}

export async function getFeedbackStats(): Promise<FeedbackStats> {
  return fetchApi<FeedbackStats>("/api/feedback/stats");
}

export async function similaritySearch(query: string, topK: number = 5): Promise<SimilarityResponse> {
  return fetchApi<SimilarityResponse>("/api/search/similarity", {
    method: "POST",
    body: JSON.stringify({ query, top_k: topK }),
  });
}

export async function getStats(): Promise<Stats> {
  return fetchApi<Stats>("/api/stats/");
}

export async function ingestPatents(
  applicant: string,
  pages: number = 5,
  startDate?: string,
  endDate?: string
): Promise<{ status: string; patents_collected: number; vectors_stored: number }> {
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
