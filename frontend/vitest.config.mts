// ============================================================
// 파일 역할: Frontend의 Vitest 실행 범위와 테스트 환경을 설정한다.
//
// 작성자: 심우현
// 최종 수정일: 2026년 8월 11일
//
// 주요 책임:
// - 단위 테스트 파일 탐색 범위 지정
// - 브라우저가 필요 없는 계약 테스트 환경 구성
// ============================================================

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
