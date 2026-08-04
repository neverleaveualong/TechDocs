"use client";

import { useEffect, useRef } from "react";

interface SearchAutoScrollOptions {
  eventCount: number;
  isLoading: boolean;
  hasResult: boolean;
  isStreaming: boolean;
  streamedAnswer: string;
}

export function useSearchAutoScroll({
  eventCount,
  isLoading,
  hasResult,
  isStreaming,
  streamedAnswer,
}: SearchAutoScrollOptions) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const hasScrolledToResult = useRef(false);

  useEffect(() => {
    if (!isLoading || eventCount === 0) return;

    const timer = window.setTimeout(() => {
      timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [eventCount, isLoading]);

  useEffect(() => {
    if (isLoading) {
      hasScrolledToResult.current = false;
      return;
    }
    if (!hasResult || hasScrolledToResult.current) return;

    const timer = window.setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      hasScrolledToResult.current = true;
    }, 150);
    return () => window.clearTimeout(timer);
  }, [hasResult, isLoading]);

  useEffect(() => {
    if (!isStreaming || !streamedAnswer) return;
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isStreaming, streamedAnswer]);

  return { timelineRef, resultRef };
}
