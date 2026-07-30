"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import { streamClaimLensAnalysis } from "@/lib/api";
import type { ClaimLensEvent } from "@/types/claimlens";

interface ClaimLensStreamState {
  events: ClaimLensEvent[];
  isLoading: boolean;
  error: string | null;
}

type ClaimLensStreamAction =
  | { type: "start" }
  | { type: "event"; event: ClaimLensEvent }
  | { type: "error"; message: string }
  | { type: "finish" }
  | { type: "reset" };

const initialState: ClaimLensStreamState = {
  events: [],
  isLoading: false,
  error: null,
};

function reducer(state: ClaimLensStreamState, action: ClaimLensStreamAction): ClaimLensStreamState {
  switch (action.type) {
    case "start":
      return { ...initialState, isLoading: true };
    case "event":
      return { ...state, events: [...state.events, action.event] };
    case "error":
      return { ...state, error: action.message };
    case "finish":
      return { ...state, isLoading: false };
    case "reset":
      return initialState;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useClaimLensStream() {
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
    async (productDescription: string) => {
      cancel();
      const runId = runRef.current + 1;
      runRef.current = runId;
      const isCurrentRun = () => runRef.current === runId;
      const controller = new AbortController();
      abortRef.current = controller;
      dispatch({ type: "start" });

      try {
        await streamClaimLensAnalysis(
          productDescription,
          (event) => {
            if (isCurrentRun()) dispatch({ type: "event", event });
          },
          { topK: 5, signal: controller.signal },
        );
      } catch (error) {
        if (!isCurrentRun()) return;
        dispatch({
          type: "error",
          message: isAbortError(error)
            ? "ClaimLens 검토가 중단되었습니다."
            : error instanceof Error
              ? error.message
              : "검색 중 오류가 발생했습니다.",
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
