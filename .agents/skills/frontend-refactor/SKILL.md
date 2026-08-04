---
name: frontend-refactor
description: Refactor TechDocs Next.js 16 App Router and React 19 frontend code while preserving API and streaming contracts. Use for component decomposition, hook or TanStack Query state changes, rendering performance work, client/server boundary changes, and frontend type cleanup under frontend/.
---

# Frontend Refactor

`frontend/AGENTS.md`와 설치된 Next.js 문서를 먼저 읽는다. 백엔드 계약의 소비 지점은
`lib/api.ts`와 `types/`이며, 검색 NDJSON과 ClaimLens SSE 파서는 호환성 경계로 취급한다.

## 📋 표준 작업 워크플로우

1. **기준선 확인**: 대상 페이지·컴포넌트·Hook의 호출자를 검색하고 Server/Client
   Component 경계, loading/error/empty 상태, 요청 취소와 스트림 종료 동작을 기록한다.
2. **작게 리팩터링**: 서버 상태는 TanStack Query, 스트리밍 상태는 전용 Hook에 둔다.
   파생 상태를 중복 저장하지 않고 안정적인 key를 사용한다. 측정 없이 `useMemo`,
   `useCallback`, 전역 상태 라이브러리 또는 `'use client'` 범위를 늘리지 않는다.
3. **회귀 검증**: 관련 화면과 모바일/데스크톱 동작을 확인하고 lint, 타입 검사, production
   build를 통과시킨다. 계약 변경이 있으면 백엔드 모델·API 문서·테스트도 함께 갱신한다.

## 🛠️ 빌드/타입체크/테스트 실행 커맨드

```bash
cd frontend && npm run lint
cd frontend && npx tsc --noEmit
cd frontend && npm run build
# QA 기반이 추가된 뒤 package.json에 정의된 실제 명령만 실행
cd frontend && npm run test
cd frontend && npx playwright test
```

현재 `npm run test`는 정의되어 있지 않다. 테스트 도입 전에는 실행 가능하다고 가정하지
말고 `qa-automation`을 적용한다.

## 🛡️ Quality Checklist

- [ ] API 경로, 요청/응답 필드, `ApiError`, NDJSON/SSE 파싱 동작이 유지된다.
- [ ] 요청 교체·unmount 시 `AbortController`와 stream reader가 정리된다.
- [ ] loading, empty, error, retry 상태가 사용자에게 구분되어 보인다.
- [ ] 불필요한 클라이언트 컴포넌트, 중복 상태, 렌더 중 부수효과, index key가 없다.
- [ ] `any`, 무근거 assertion, lint disable이 추가되지 않았다.
- [ ] 키보드 조작, focus 표시, 모바일 레이아웃이 유지된다.
- [ ] lint, TypeScript, production build 결과를 완료 보고에 남겼다.
