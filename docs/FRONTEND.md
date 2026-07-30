# 프론트엔드 기술 문서

- 수정일자: 2026-07-30 15:35 KST
- 작성자: Woohyun Sim
- 목적: 사용자의 검색·수집·분석 흐름과 프론트엔드 상태관리 책임을 설명합니다.

## 기술 스택

- Next.js App Router:
  - 검색, 업로드, 대시보드, 도움말 화면과 공통 레이아웃을 구성합니다.
- React:
  - 화면 컴포넌트와 사용자 상호작용을 구성합니다.
- TypeScript:
  - 검색, ClaimLens, 통계 API 응답과 화면 데이터의 형태를 명확하게 관리합니다.
- TanStack React Query:
  - 백엔드에서 조회·저장되는 서버 상태의 캐시, 로딩, 오류, 갱신을 관리합니다.
- `useReducer`와 Custom Hook:
  - 여러 단계로 진행되는 NDJSON·SSE 스트림 상태를 한곳에서 관리합니다.
- Tailwind CSS:
  - 화면별 공통 스타일과 반응형 레이아웃을 구성합니다.
- React Markdown:
  - AI 답변을 사용자 화면에서 읽기 쉬운 문서 형태로 표시합니다.

## 기술 선택과 해결한 문제

- React Query를 사용한 이유:
  - 대시보드 통계와 특허 수집 결과처럼 백엔드에 저장된 데이터를 화면 상태와 분리하기 위해 사용합니다.
  - 수집이 끝난 뒤 통계 캐시를 무효화해 새로고침 없이 최신 수치를 조회할 수 있습니다.
- Custom Hook을 사용한 이유:
  - 페이지 컴포넌트에 스트림 연결, 이벤트 누적, 취소, 오류 처리가 섞이지 않도록 분리합니다.
  - 검색과 ClaimLens가 각각의 스트림 형식과 상태 전이를 독립적으로 관리할 수 있습니다.
- `useReducer`를 사용한 이유:
  - 답변 조각 누적, 이벤트 목록, 로딩, 완료, 오류 상태를 명시적인 이벤트로 관리합니다.
  - 스트리밍 과정에서 여러 상태가 함께 바뀌어도 전이 규칙을 한곳에서 확인할 수 있습니다.
- NDJSON·SSE를 사용한 이유:
  - AI 답변과 Agent 진행 상황을 요청 종료 후 한 번에 보여주지 않고 실시간으로 전달하기 위해 사용합니다.
- TypeScript를 사용한 이유:
  - 백엔드 응답 필드 변경으로 인한 화면 오류를 빌드 단계에서 발견할 수 있도록 합니다.

## 사용자 화면

- 검색 화면:
  - `frontend/app/search/page.tsx`가 검색 모드와 입력값을 관리합니다.
  - RAG 검색과 ClaimLens 분석을 같은 화면에서 선택할 수 있습니다.
  - 검색 결과, AI 답변, 특허 출처, Agent 진행 상태를 함께 보여줍니다.
  - ClaimLens 결과는 후보 특허, 구성요소 비교, 보고서 영역으로 나누어 표시합니다.
- 업로드 화면:
  - `frontend/app/upload/page.tsx`에서 회사와 기간을 입력받아 특허 수집을 요청합니다.
  - 수집 중, 성공, 실패 상태를 mutation 상태와 연결해 표시합니다.
- 대시보드:
  - `frontend/app/dashboard/page.tsx`에서 특허 수, 회사별 통계, ClaimLens 통계를 조회합니다.
  - 최초 조회와 새로고침 중인 상태를 구분해 표시합니다.
- 공통 화면:
  - `frontend/app/layout.tsx`가 공통 레이아웃과 `Providers`를 구성합니다.
  - `Sidebar`, `SearchBar`, `PatentCard`, `PatentDetailModal`과 같은 재사용 컴포넌트로 화면을 구성합니다.

## 상태관리 구조

- 서버 상태:
  - `frontend/app/providers.tsx`에서 하나의 React Query Client를 애플리케이션에 제공합니다.
  - 대시보드 통계는 `useQuery`로 조회하고 캐시와 갱신 상태를 관리합니다.
  - 특허 수집과 피드백 전송은 `useMutation`으로 실행 결과와 오류를 관리합니다.
  - 특허 수집 성공 후 `stats` query cache를 무효화해 대시보드가 최신 데이터를 다시 조회합니다.
- 스트림 상태:
  - RAG 검색 NDJSON 이벤트는 `useSearchStream`이 관리합니다.
  - ClaimLens SSE 이벤트는 `useClaimLensStream`이 관리합니다.
  - 두 Hook은 `useReducer`로 로딩, 이벤트 목록, 답변 누적, 오류, 종료 상태를 명시적으로 관리합니다.
  - 스트림 상태는 React Query 캐시에 넣지 않고, 스트림 생명주기에 맞는 전용 상태로 관리합니다.
- 화면 상태:
  - 검색 모드, 검색어, 활성 결과, 모달 표시, 스크롤 위치와 같은 화면 전용 상태는 페이지 또는 컴포넌트가 관리합니다.
  - 백엔드에서 다시 조회할 수 있는 값은 로컬 상태에 중복 저장하지 않습니다.

## RAG 검색 상태 흐름

- 사용자가 검색을 시작하면 `useSearchStream.start()`가 이전 요청을 먼저 취소합니다.
- Hook이 초기 상태를 만들고 로딩 상태를 시작합니다.
- `searchPatentsStream`이 NDJSON 이벤트를 읽어 답변 조각, 출처, Agent 이벤트를 전달합니다.
- 답변 조각은 순서대로 누적되고 출처와 완료 이벤트는 별도 상태로 반영됩니다.
- 스트림 요청이 실패하면 일반 검색 API로 fallback합니다.
- 사용자가 새 검색을 시작한 뒤 이전 요청이 늦게 도착해도 실행 ID가 다른 이벤트는 무시합니다.
- 컴포넌트가 해제되면 `AbortController`로 연결을 종료합니다.

## ClaimLens 상태 흐름

- 사용자가 제품 설명을 제출하면 `useClaimLensStream.start()`가 SSE 연결을 시작합니다.
- 수신한 이벤트를 순서대로 보관해 Agent 진행 상황과 분석 결과를 단계별로 렌더링합니다.
- 후보 특허, 품질 판단, 구성요소 비교, 보고서 데이터를 `ClaimLensResult`가 표현합니다.
- 연결 오류와 사용자 취소를 구분해 화면에 표시합니다.
- 새로운 분석이 시작되면 이전 연결을 종료하고 이전 실행의 이벤트가 현재 결과에 섞이지 않도록 합니다.

## 백엔드 연동

- 모든 일반 API 요청은 `frontend/lib/api.ts`의 공통 요청 함수가 처리합니다.
- 오류 응답은 `ApiError`로 변환해 HTTP 상태 코드와 사용자 메시지를 함께 보존합니다.
- RAG 검색은 `application/x-ndjson` 응답을 줄 단위로 읽습니다.
- ClaimLens 분석은 `text/event-stream` 응답을 SSE 이벤트 단위로 읽습니다.
- 스트림 연결이 실패하면 RAG 검색은 동기 검색 API로 fallback합니다.
- 요청 취소는 `AbortController`를 사용해 네트워크 연결과 화면 상태를 함께 정리합니다.

## 컴포넌트 책임

- `frontend/app/search/page.tsx`:
  - 검색 모드 선택, 입력 제출, 화면 배치, Hook 결과 연결을 담당합니다.
- `frontend/hooks/useSearchStream.ts`:
  - RAG NDJSON 연결, 이벤트 누적, fallback, 취소와 stale 요청 방지를 담당합니다.
- `frontend/hooks/useClaimLensStream.ts`:
  - ClaimLens SSE 연결, 이벤트 누적, 취소와 오류 상태를 담당합니다.
- `frontend/components/search/ClaimLensResult.tsx`:
  - ClaimLens 분석 결과와 보고서 표현을 담당합니다.
- `frontend/components/search/AiAnswer.tsx`:
  - AI 답변 표현과 사용자 피드백 mutation을 담당합니다.
- `frontend/app/dashboard/page.tsx`:
  - 통계 조회와 새로고침 상태를 담당합니다.
- `frontend/app/upload/page.tsx`:
  - 특허 수집 mutation과 수집 완료 후 통계 갱신을 담당합니다.

## 주요 디렉터리

- `frontend/app/`
  - 페이지, 공통 레이아웃, React Query Provider를 관리합니다.
- `frontend/components/`
  - 검색 결과, ClaimLens 보고서, 특허 카드, 공통 UI를 관리합니다.
- `frontend/hooks/`
  - 스트리밍 요청과 상태 전이를 관리합니다.
- `frontend/lib/api.ts`
  - REST, NDJSON, SSE 통신과 오류 변환을 관리합니다.
- `frontend/types/`
  - 검색, ClaimLens, 통계 응답 타입을 관리합니다.

## 검증 방법

- `npm run lint`:
  - 사용하지 않는 코드와 Next.js·TypeScript 관련 정적 규칙을 확인합니다.
- `npx tsc --noEmit`:
  - API 응답 타입과 컴포넌트 간 타입 호환성을 확인합니다.
- `npm run build`:
  - 실제 배포용 Next.js 빌드가 가능한지 확인합니다.
- 스트림 기능 검토:
  - 검색 중 취소, 새 검색 시작, 스트림 오류, 일반 검색 fallback을 확인합니다.
  - ClaimLens 연결 오류, 사용자 취소, 분석 완료 상태를 확인합니다.

## 유지보수 원칙

- 서버에서 관리되는 데이터와 화면에서만 필요한 상태를 분리합니다.
- 스트림 처리 로직은 페이지 컴포넌트가 아니라 전용 Hook에 둡니다.
- API 응답 계약을 변경할 때 API client와 TypeScript 타입을 함께 검토합니다.
- 검색 결과 UI를 변경할 때 RAG와 ClaimLens 두 모드의 상태 표시를 함께 확인합니다.
- 새 서버 조회 기능은 React Query 도입 여부를 먼저 검토합니다.
- 새 스트리밍 기능은 취소, 재실행, stale 응답, 연결 오류를 함께 설계합니다.
