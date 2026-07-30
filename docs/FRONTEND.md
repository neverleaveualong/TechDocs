# 프론트엔드 기술 문서

- 수정일자: 2026-07-30 13:49 KST
- 작성자: Woohyun Sim
- 목적: 사용자의 검색·수집·분석 흐름과 프론트엔드 상태관리 책임을 설명합니다.

## 역할

- 자연어 검색 화면을 제공합니다.
- 검색 결과, 특허 출처, AI 답변을 함께 보여줍니다.
- ClaimLens 분석 진행 상황과 비교 결과를 단계별로 표시합니다.
- 특허 수집 요청과 대시보드 통계 조회를 제공합니다.
- 백엔드 오류와 스트림 중단 상태를 사용자에게 전달합니다.

## 상태관리 기준

- 서버 상태:
  - 대시보드 통계는 TanStack React Query의 `useQuery`로 관리합니다.
  - 업로드와 피드백 전송은 `useMutation`으로 관리합니다.
  - 특허 수집 성공 후 `stats` query cache를 무효화해 최신 통계를 다시 조회합니다.
- 스트림 상태:
  - RAG 검색 NDJSON 이벤트는 `useSearchStream`이 관리합니다.
  - ClaimLens SSE 이벤트는 `useClaimLensStream`이 관리합니다.
  - 각 Hook이 로딩, 진행 이벤트, 답변 누적, 오류, 취소를 관리합니다.
  - 새로운 검색이 시작되면 이전 요청을 취소하고 오래된 응답이 화면을 덮어쓰지 않도록 실행 ID를 확인합니다.
- 화면 상태:
  - 검색 모드, 입력값, 모달 표시, 스크롤 위치와 같은 화면 전용 상태는 페이지와 컴포넌트가 관리합니다.
  - 백엔드에서 다시 조회할 수 있는 데이터는 컴포넌트 로컬 상태에 중복 저장하지 않습니다.

## 백엔드 연동

- 일반 REST 요청은 `frontend/lib/api.ts`의 공통 요청 함수가 처리합니다.
- 오류 응답은 `ApiError`로 변환해 상태 코드와 사용자 메시지를 함께 보존합니다.
- RAG 검색은 `application/x-ndjson` 응답을 줄 단위로 읽습니다.
- ClaimLens 분석은 `text/event-stream` 응답을 SSE 이벤트 단위로 읽습니다.
- 스트림 연결이 실패하면 RAG 검색은 일반 검색 API로 fallback합니다.
- 사용자가 검색을 취소하거나 다른 검색을 시작하면 `AbortController`로 이전 요청을 종료합니다.

## 주요 디렉터리

- `frontend/app/`
  - 페이지와 애플리케이션 진입점을 관리합니다.
- `frontend/components/`
  - 검색 결과, ClaimLens 보고서, 레이아웃을 관리합니다.
- `frontend/hooks/`
  - 스트리밍 요청과 상태 전이를 관리합니다.
- `frontend/lib/api.ts`
  - REST, NDJSON, SSE 통신과 오류 변환을 관리합니다.
- `frontend/types/`
  - 백엔드 응답과 화면 데이터의 TypeScript 타입을 관리합니다.

## 유지보수 원칙

- 서버 상태와 화면 상태를 같은 상태 변수에 섞지 않습니다.
- 스트림 처리 로직은 페이지 컴포넌트가 아니라 전용 Hook에 둡니다.
- API 응답 계약을 변경할 때 `frontend/types/`와 API 호출 함수를 함께 검토합니다.
- 검색 결과 UI를 변경할 때 RAG와 ClaimLens 두 모드의 상태 표시를 함께 확인합니다.
