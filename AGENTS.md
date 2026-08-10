# TechDocs Agentic Harness

이 파일은 `TechDocs/` 전체에 적용되는 최상위 에이전트 지침이다. 더 하위의 `AGENTS.md`가 있으면 해당 디렉터리에서는 하위 지침을 함께 적용하며, 충돌 시 더 구체적인 하위 지침을 우선한다.

## 문서 확인 순서

1. 저장소 전체 작업은 루트 `AGENTS.md`를 먼저 확인한다.
2. 코드를 수정할 때는 `docs/development/coding-conventions.md`를 확인한다.
3. 작업 영역에 해당하는 `.agents/skills/<skill-name>/SKILL.md`를 확인한다.
4. Frontend를 수정할 때는 `frontend/AGENTS.md`와 설치된 Next.js 문서를 추가로 확인한다.
5. PR을 작성할 때는 `docs/development/pull-request-guide.md`와 `.github/pull_request_template.md`를 사용한다.

## Markdown 문서 지도

| 폴더 | Markdown 문서 | 목적 |
| --- | --- | --- |
| `/` | `README.md`, `AGENTS.md` | 프로젝트 소개와 저장소 전체 AI 작업 규칙 |
| `.github/` | `pull_request_template.md` | GitHub PR 본문 기본 형식 |
| `.agents/skills/backend-refactor/` | `SKILL.md` | Codex용 Backend 리팩터링 절차 |
| `.agents/skills/design-system/` | `SKILL.md` | Codex용 디자인 시스템 절차 |
| `.agents/skills/frontend-refactor/` | `SKILL.md` | Codex용 Frontend 리팩터링 절차 |
| `.agents/skills/portfolio-sync/` | `SKILL.md` | Codex용 측정 결과와 문서 동기화 절차 |
| `.agents/skills/qa-automation/` | `SKILL.md` | Codex용 테스트 자동화 절차 |
| `.gemini/skills/*/` | 각 폴더의 `SKILL.md` | `.agents/skills`와 동일한 Gemini용 스킬 사본 |
| `docs/` | `README.md`, `API.md`, `ARCHITECTURE.md`, `BACKEND.md`, `DATABASE.md`, `FRONTEND.md`, `RUNTIME_ENVIRONMENT.md` | 현재 시스템의 상세 기술 문서 |
| `docs/development/` | `coding-conventions.md`, `pull-request-guide.md` | 코딩·주석·PR 작성 규칙 |
| `frontend/` | `AGENTS.md` | Next.js 버전에 맞는 Frontend 전용 AI 규칙 |

- 새 Markdown 문서를 추가하거나 이동 또는 삭제하면 이 표와 루트 `README.md`의 문서 지도를 같은 작업에서 갱신한다.
- 임시 PR 본문, 일회성 작업 기록 및 생성된 평가 결과를 Markdown 파일로 커밋하지 않는다.
- `.agents/skills`와 `.gemini/skills`의 같은 이름 스킬은 동일하게 유지한다.

## 검증된 프로젝트 기준선

- Frontend: Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4, TanStack Query
- Backend: Python 3.12, FastAPI, Pydantic, SQLAlchemy, LangGraph/LangChain
- Data/외부 연동: PostgreSQL, SQLite FTS5, Pinecone, OpenAI, KIPRIS
- 전달 계약: 일반 REST JSON, 검색 스트림 NDJSON, ClaimLens 스트림 SSE
- 배포/실행: Docker Compose, Next.js standalone output, Uvicorn

의존성 버전과 실행 명령은 문서가 아니라 `frontend/package.json`, `frontend/package-lock.json`, `backend/requirements.txt`, Dockerfile, CI를 최종 기준으로 판단한다.

## 시스템 레이어와 책임

| 레이어 | 주요 경로 | 변경 시 지켜야 할 경계 |
| --- | --- | --- |
| UI/페이지 | `frontend/app`, `frontend/components` | Server/Client Component 경계, 반응형·접근성 유지 |
| 클라이언트 상태/계약 | `frontend/hooks`, `frontend/lib/api.ts`, `frontend/types` | React Query와 스트림 수명주기, 백엔드 필드명 유지 |
| HTTP API | `backend/app/api`, `backend/app/models` | Pydantic 요청·응답, 상태 코드, 오류 본문 유지 |
| 서비스/에이전트 | `backend/app/services`, `backend/app/agents`, `backend/app/core` | 그래프 상태와 노드 전이, 근거 기반 응답, 취소·오류 전파 유지 |
| 수집/데이터 | `backend/app/ingestion`, `backend/app/repositories`, `backend/app/db` | 트랜잭션, 파라미터 바인딩, PostgreSQL/SQLite 차이 확인 |
| 문서/운영 | `docs`, `README.md`, Docker/CI 파일 | 코드와 명령을 먼저 검증한 뒤 문서 동기화 |

## 에이전트 실행 핵심 규칙

1. **검증 우선**: 수정 전 재현 조건과 기준 동작을 확인한다. 수정 후에는 변경 영역의 최소 검증과 최종 게이트를 실행하고, 실행하지 못한 검증은 이유와 함께 명시한다.
2. **계약 우선**: API 경로, JSON 필드, HTTP 상태, `detail` 오류 형식, NDJSON 한 줄 한 이벤트, SSE `data:` 프레임을 암묵적으로 변경하지 않는다. 계약 변경은 백엔드 모델, `frontend/types`, `frontend/lib/api.ts`, `docs/API.md`, 관련 테스트를 한 변경에서 동기화한다.
3. **작은 리팩터링**: 동작 변경과 구조 변경을 분리한다. 공개 인터페이스를 유지하고, 대규모 파일 이동 전에 참조와 테스트 영향을 검색한다.
4. **타입·린트 강제**: 프론트엔드 완료 조건은 lint, TypeScript, production build 통과다. `any`, 무근거 type assertion, lint disable로 문제를 숨기지 않는다.
5. **백엔드 안전성**: 동기 I/O로 async 경로를 막지 않는다. DB 세션을 항상 닫고, 쓰기 실패 시 rollback하며, SQL은 SQLAlchemy 또는 바인딩 파라미터를 사용한다.
6. **실패를 숨기지 않기**: 빈 `catch`/`except`, 더미 성공값, 과도한 fallback을 넣지 않는다. 공개 오류에는 비밀정보를 노출하지 않고 서버 로그에는 원인을 남긴다.
7. **보안**: `.env`, API 키, 토큰, 개인정보를 커밋·로그·문서·테스트 fixture에 넣지 않는다. 외부 OpenAI/Pinecone/KIPRIS 호출은 명시적 필요와 환경 준비가 있을 때만 한다.
8. **측정 무결성**: 성능, 커버리지, Lighthouse, 지연시간 수치는 같은 환경의 before/after 원시 결과가 있을 때만 주장한다. 추정치는 결과로 문서화하지 않는다.
9. **작업 보존**: 기존 사용자 변경을 되돌리거나 관련 없는 파일을 포맷하지 않는다. 파괴적 Git 명령을 사용하지 않는다.

## 이름과 로직 주석

- 변수명, 함수명, 클래스명 및 파일명은 의미가 드러나는 영어로 작성한다.
- 복잡한 로직에는 동작을 번역한 설명이 아니라 해당 구현이 필요한 이유를 한국어로 작성한다.
- 자세한 기준은 `docs/development/coding-conventions.md`를 따른다.

## 파일 상단 주석

- 새로 만들거나 의미 있게 수정하는 직접 관리 소스 파일에는 파일 최상단 설명을 작성한다.
- 작성자는 `심우현`, 날짜는 `YYYY년 M월 D일` 형식의 실제 최종 수정일을 사용한다.
- 로직, 동작 또는 파일 책임이 변경되면 `최종 수정일`과 설명을 함께 갱신한다.
- 단순 오탈자, 공백 또는 포맷 수정만 한 경우에는 날짜 갱신을 생략할 수 있다.
- 기존 파일은 의미 있게 변경할 때 상단 주석을 함께 적용한다.
- shebang은 항상 첫 줄에 둔다. JSON, lock 파일, 자동 생성 파일, 마이그레이션, 외부 코드 등 주석을 지원하지 않거나 직접 관리하지 않는 파일에는 적용하지 않는다.

```text
// ============================================================
// 파일 역할: 파일이 담당하는 역할을 한 문장으로 설명한다.
//
// 작성자: 심우현
// 최종 수정일: 2026년 8월 10일
//
// 주요 책임:
// - 핵심 책임 1
// - 핵심 책임 2
// ============================================================
```

Python은 `#`, CSS는 `/* ... */`처럼 각 언어에 맞는 주석 문법을 사용한다.

## PR 작성 규칙

- `main` 브랜치에 직접 커밋하거나 직접 푸시하지 않는다.
- 모든 코드와 문서 변경은 작업 목적에 맞는 별도 브랜치에서 진행한다.
- 작업 브랜치를 원격에 푸시한 뒤 반드시 `main`을 대상으로 PR을 생성한다.
- PR의 CI 결과와 변경 내용을 확인하기 전에는 병합하지 않는다.
- 사용자가 명시적으로 병합을 요청하지 않은 경우 에이전트는 PR만 생성하고 링크를 보고한다.
- 긴급 수정도 사용자가 `main` 직접 반영을 명시적으로 승인하지 않는 한 동일한 PR 절차를 따른다.
- PR 본문은 `.github/pull_request_template.md`의 순서를 유지한다.
- `요약 → 문제점 → 원인 → 한 것 → 결과` 순서로 작성한다.
- 각 항목은 짧고 명확한 `-` 불릿으로 작성한다.
- 추측이나 과장 대신 실제 코드 변경과 검증 결과를 작성한다.
- 해당 사항이 없으면 `- 해당 없음`으로 표시한다.
- 테스트하지 못한 내용은 완료된 것처럼 쓰지 말고 이유를 명시한다.

## 표준 실행 순서

1. `main` 최신 상태와 `git status --short`를 확인한다.
2. `feature/`, `fix/`, `refactor/`, `docs/`, `chore/` 중 작업에 맞는 접두사로 브랜치를 만든다.
3. 관련 코드·테스트·문서와 호출자를 읽고 기준 동작을 정한다.
4. 가장 작은 단위로 수정하고, 가까운 테스트를 먼저 실행한다.
5. 최종 게이트를 실행한 뒤 diff에서 계약, 비밀정보, 불필요한 변경을 점검한다.
6. 작업 브랜치에 커밋하고 원격 브랜치로 푸시한다.
7. `main` 대상 PR을 생성하고 PR 링크와 검증 결과를 보고한다.
8. 사용자의 별도 요청 없이 PR을 자동 병합하지 않는다.

## 검증 명령

저장소 루트에서 실행한다.

```bash
# Backend
cd backend && python -m compileall -q app
cd backend && python -m pytest

# Frontend
cd frontend && npm run lint
cd frontend && npx tsc --noEmit
cd frontend && npm run build

# 컨테이너 구성이 바뀐 경우
docker compose config
docker compose build
```

`frontend/package.json`에는 현재 unit-test 스크립트가 없고 Playwright 설정·spec도 아직 없다. 존재하지 않는 `npm test` 성공을 보고하지 않는다. 테스트 기반을 추가할 때는 `qa-automation` 스킬에 따라 스크립트와 설정을 함께 추가한다.

## 스킬 맵과 도구 호환성

작업을 시작하기 전에 해당 스킬을 읽고 따른다. 여러 영역을 건드리면 각 스킬을 순서대로 적용하되, 두 작업자가 같은 파일을 동시에 편집하지 않는다.

| 작업 신호 | 스킬 이름 |
| --- | --- |
| React/Next.js 컴포넌트, Hook, 상태, 렌더링 성능 리팩터링 | `frontend-refactor` |
| FastAPI, DB, 수집, RAG/LangGraph 파이프라인 리팩터링 | `backend-refactor` |
| 색상·타이포·레이아웃·반응형·접근성·모션 변경 | `design-system` |
| pytest, Vitest/Jest 도입, Playwright E2E, 회귀 테스트 | `qa-automation` |
| Lighthouse/지연시간/커버리지 측정과 README·문서 반영 | `portfolio-sync` |

## 완료 보고 형식

- 변경한 동작과 계약 영향
- 실행한 검증 명령과 결과
- 실행하지 못한 검증 및 남은 위험
- 측정값이 있다면 환경, before/after, 원시 결과 위치
