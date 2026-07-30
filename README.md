# TechDocs

- 수정일자: 2026-07-30 13:04 KST
- 작성자: 심우현
- 프로젝트 성격: AI 기반 특허 검색 및 특허 침해 분석 플랫폼
- 소스코드: 이 저장소의 `backend/`와 `frontend/` 디렉터리에 전체 애플리케이션 코드가 있습니다.
- 데모: https://techdocs-app.vercel.app
- API 문서: https://techdocs-1v4q.onrender.com/docs
- 사용 조건: 포트폴리오 및 기술 검토 목적의 저장소이며 별도 오픈소스 라이선스를 부여하지 않습니다.

## 프로젝트 개요

- 해결하려는 문제:
  - 키워드가 정확히 일치하지 않는 특허를 찾기 어렵습니다.
  - 검색 결과가 부족하면 사용자가 직접 데이터 수집을 다시 요청해야 합니다.
  - 검색 결과와 제품 기능을 특허 청구항 단위로 비교하는 작업에 많은 시간이 걸립니다.
  - 저사양 배포 환경에서 검색 인덱스를 반복 생성하면 응답 지연이 커집니다.
- 해결 방향:
  - 벡터 검색과 BM25를 결합한 하이브리드 검색을 제공합니다.
  - LangGraph Supervisor가 검색, 자동 수집, 재검색, 답변 생성을 조정합니다.
  - ClaimLens가 제품 설명과 특허 청구항 구성요소를 비교합니다.
  - 에이전트 진행 상황과 답변을 스트리밍하여 프론트엔드에서 실시간으로 표시합니다.

## 주요 구현 포인트

- 프론트엔드:
  - Next.js App Router와 TypeScript로 검색, 업로드, 대시보드 화면을 구성합니다.
  - React Query로 통계 조회와 업로드·피드백 mutation을 관리합니다.
  - RAG 검색 NDJSON 스트림은 `useSearchStream`이 누적, 취소, stale 요청 방지를 담당합니다.
  - ClaimLens SSE 스트림은 `useClaimLensStream`이 이벤트 목록, 로딩, 오류 상태를 담당합니다.
  - 검색 결과의 ClaimLens 표현은 `frontend/components/search/ClaimLensResult.tsx`로 분리되어 페이지 컴포넌트의 책임을 줄였습니다.
  - API 오류는 `ApiError`와 공통 응답 파싱 로직으로 사용자 메시지에 전달합니다.
- AI Agent 백엔드:
  - `SupervisorAgent`가 검색 품질과 현재 상태를 바탕으로 다음 작업을 결정합니다.
  - `RetrieverAgent`가 Pinecone 벡터 검색과 BM25 검색을 수행하고 RRF로 결과를 결합합니다.
  - `IngestAgent`가 KIPRIS 데이터를 수집, 분할, 임베딩한 뒤 다시 검색할 수 있도록 저장합니다.
  - `GeneratorAgent`가 검색 근거를 바탕으로 답변을 생성합니다.
  - 검색 스트림은 `SearchStreamService`, ClaimLens 스트림은 `ClaimLensAnalysisService`가 오케스트레이션합니다.
  - QueryLog 저장은 Repository가 담당하며, 저장 실패가 검색 응답을 중단시키지 않도록 기존 동작을 유지합니다.
- 데이터 및 성능:
  - Pinecone은 특허 임베딩과 검색 메타데이터를 저장합니다.
  - PostgreSQL은 QueryLog, Feedback, ClaimLens 분석 결과와 자동 수집 캐시를 저장합니다.
  - BM25 인덱스는 메모리에 캐시하고 신규 수집 시 무효화합니다.
  - ClaimLens는 청구항 구성요소별로 `matched`, `partial`, `uncertain`, `not_found` 상태를 계산합니다.

## 주요 요청 흐름

- RAG 검색:
  - 프론트엔드가 `/api/search/stream`에 질의합니다.
  - FastAPI Router가 `SearchStreamService`를 호출합니다.
  - LangGraph가 Supervisor, Retriever, Ingest, Generator를 순서에 따라 실행합니다.
  - 백엔드는 NDJSON 이벤트를 반환하고 프론트엔드는 Agent Timeline과 답변을 갱신합니다.
  - 마지막에 QueryLog를 저장하고 검색 완료 이벤트를 반환합니다.
- ClaimLens 분석:
  - 프론트엔드가 제품 설명을 `/api/claimlens/stream`에 전송합니다.
  - 서비스가 질의 계획, 후보 검색, 청구항 파싱, 구성요소 비교, 품질 판단을 조정합니다.
  - 백엔드는 SSE 이벤트를 반환하고 프론트엔드는 후보, 비교 결과, 보고서를 단계별로 렌더링합니다.
- 특허 수집:
  - 사용자가 회사와 기간을 입력하면 `/api/ingest/`가 KIPRIS 수집 파이프라인을 실행합니다.
  - 수집 데이터는 청킹, 임베딩, Pinecone 저장 과정을 거칩니다.
  - 수집 완료 후 React Query가 `stats` 캐시를 무효화하여 대시보드를 갱신합니다.

## API 요약

- `GET /health`
  - 서버 상태를 확인합니다.
- `POST /api/patents/search`
  - KIPRIS 특허 검색 결과를 반환합니다.
- `POST /api/search/search`
  - 동기 RAG 검색 결과와 답변, 출처, QueryLog ID를 반환합니다.
- `POST /api/search/stream`
  - RAG 에이전트 이벤트와 답변 조각을 NDJSON으로 반환합니다.
- `POST /api/search/similarity`
  - 답변 생성 없이 유사 특허 문서를 반환합니다.
- `POST /api/claimlens/stream`
  - ClaimLens 분석 진행 상황과 결과를 SSE로 반환합니다.
- `POST /api/ingest/`
  - KIPRIS 특허를 수집하고 임베딩하여 저장합니다.
- `GET /api/stats/`
  - Pinecone namespace, 회사별 샘플 통계, ClaimLens, 자동 수집 통계를 반환합니다.
- `POST /api/feedback`
  - 검색 답변에 대한 평가와 의견을 저장합니다.
- `GET /api/feedback/stats`
  - 피드백 비율과 최근 부정 피드백을 반환합니다.

## 프로젝트 구조

- `backend/app/api/`
  - HTTP 요청, 응답 모델 연결, 상태 코드와 스트리밍 응답을 담당합니다.
- `backend/app/services/`
  - 검색 스트림과 ClaimLens 분석의 업무 흐름을 조정합니다.
- `backend/app/repositories/`
  - QueryLog 등 영속성 저장 책임을 담당합니다.
- `backend/app/agents/`
  - LangGraph 그래프와 Supervisor, Retriever, Ingest, Generator를 정의합니다.
- `backend/app/core/`
  - RAG 파이프라인, 하이브리드 검색, 임베딩, LLM, 재정렬 로직을 담당합니다.
- `backend/app/ingestion/`
  - KIPRIS 호출, 문서 적재, 청킹, 자동 수집 로직을 담당합니다.
- `backend/app/models/`
  - API 요청·응답 모델과 데이터베이스 모델을 정의합니다.
- `backend/tests/`
  - API 오류, 검색 스트림, QueryLog Repository, ClaimLens, SQLite FTS 회귀 테스트를 포함합니다.
- `frontend/app/`
  - Next.js 페이지와 애플리케이션 진입점입니다.
- `frontend/components/`
  - 검색 결과, Agent Timeline, ClaimLens 보고서, 공통 레이아웃을 구성합니다.
- `frontend/hooks/`
  - 서버 스트림과 화면 상태의 수명주기를 관리합니다.
- `frontend/lib/api.ts`
  - REST, NDJSON, SSE API 호출과 오류 파싱을 담당합니다.
- `frontend/types/`
  - 검색, ClaimLens, 통계 응답 타입을 정의합니다.

## 기술 스택

- 프론트엔드:
  - Next.js 16
  - React 19
  - TypeScript
  - TanStack React Query
  - Tailwind CSS
  - React Markdown
- AI Agent 및 백엔드:
  - Python 3.12
  - FastAPI
  - Pydantic Settings
  - LangGraph
  - LangChain
  - OpenAI Embeddings와 Chat Model
  - Pinecone
  - BM25와 RRF
  - FlashRank
- 데이터 저장:
  - PostgreSQL과 SQLAlchemy
  - Pinecone Vector Database
- 외부 연동:
  - KIPRIS Open API
- 실행 및 배포:
  - Docker Compose
  - Vercel
  - Render
  - GitHub Actions

## 실행 환경

- 설치 및 실행 명령어:
  - 백엔드 환경변수와 CI 설명은 [`docs/RUNTIME_ENVIRONMENT.md`](docs/RUNTIME_ENVIRONMENT.md)를 참고합니다.
  - 백엔드 실행: `cd backend && uvicorn app.main:app --reload --port 8000`
  - 프론트엔드 실행: `cd frontend && npm install && npm run dev`
  - 전체 컨테이너 실행: `docker compose up --build`
- 검증 명령어:
  - 백엔드 테스트: `cd backend && pytest`
  - 프론트엔드 린트: `cd frontend && npm run lint`
  - 프론트엔드 타입 검사: `cd frontend && npx tsc --noEmit`
  - 프론트엔드 빌드: `cd frontend && npm run build`

## 저작권 및 사용 조건

- 저작권자: 심우현(Paul Shim)
- 본 저장소의 소스코드, 문서, 아키텍처, 디자인은 저작권 보호 대상입니다.
- 사전 서면 허가 없는 복제, 배포, 2차 저작물 작성, 상업적 사용을 허용하지 않습니다.
- 본 저장소에는 별도 오픈소스 라이선스가 부여되지 않았습니다.
