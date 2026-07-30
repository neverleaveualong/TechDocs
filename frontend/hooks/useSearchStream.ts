"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import { searchPatents, searchPatentsStream } from "@/lib/api";
import type { PatentSource, SearchStreamEvent } from "@/types/search";

interface SearchStreamState {
  answer: string;
  sources: PatentSource[];
  queryLogId?: number;
  events: SearchStreamEvent[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
}

type SearchStreamAction =
  | { type: "start" }
  | { type: "event"; event: SearchStreamEvent }
  | { type: "fallback_success"; answer: string; sources: PatentSource[]; queryLogId?: number }
  | { type: "error"; message: string }
  | { type: "finish" }
  | { type: "reset" };

const initialState: SearchStreamState = {
  answer: "",
  sources: [],
  events: [],
  isLoading: false,
  isStreaming: false,
  error: null,
};

function reducer(state: SearchStreamState, action: SearchStreamAction): SearchStreamState {
  switch (action.type) {
    case "start":
      return {
        ...initialState,
        isLoading: true,
      };
    case "event": {
      const nextState = {
        ...state,
        events: [...state.events, action.event],
      };
      if (action.event.type === "sources") {
        return {
          ...nextState,
          sources: action.event.sources,
          isLoading: false,
          isStreaming: true,
        };
      }
      if (action.event.type === "answer_delta") {
        return {
          ...nextState,
          answer: state.answer + action.event.delta,
        };
      }
      if (action.event.type === "done") {
        return {
          ...nextState,
          queryLogId: action.event.query_log_id,
          isStreaming: false,
        };
      }
      return nextState;
    }
    case "fallback_success":
      return {
        ...state,
        answer: action.answer,
        sources: action.sources,
        queryLogId: action.queryLogId,
      };
    case "error":
      return {
        ...state,
        error: action.message,
      };
    case "finish":
      return {
        ...state,
        isLoading: false,
        isStreaming: false,
      };
    case "reset":
      return initialState;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useSearchStream() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    cancel();
    runRef.current += 1;
    dispatch({ type: "reset" });
  }, [cancel]);

  const start = useCallback(
    async (query: string) => {
      cancel();
      const runId = runRef.current + 1;
      runRef.current = runId;
      const isCurrentRun = () => runRef.current === runId;
      const controller = new AbortController();
      abortRef.current = controller;
      dispatch({ type: "start" });

      try {
        try {
          await searchPatentsStream(
            query,
            (event) => {
              if (isCurrentRun()) dispatch({ type: "event", event });
            },
            5,
            { signal: controller.signal },
          );
        } catch (streamError) {
          if (!isCurrentRun()) return;
          if (isAbortError(streamError)) throw streamError;

          const fallbackResult = await searchPatents(query);
          if (!isCurrentRun()) return;
          dispatch({
            type: "fallback_success",
            answer: fallbackResult.answer,
            sources: fallbackResult.sources,
            queryLogId: fallbackResult.query_log_id,
          });
        }
      } catch (error) {
        if (!isCurrentRun()) return;
        dispatch({
          type: "error",
          message: isAbortError(error) ? "검색이 중단되었습니다." : error instanceof Error ? error.message : "검색 중 오류가 발생했습니다.",
        });
      } finally {
        if (isCurrentRun()) {
          dispatch({ type: "finish" });
          abortRef.current = null;
        }
      }
    },
    [cancel],
  );

  useEffect(() => () => cancel(), [cancel]);

  return { ...state, start, cancel, reset };
}
