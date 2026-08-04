# TechDocs Agentic Harness

이 파일은 `TechDocs/` 전체에 적용되는 최상위 에이전트 지침이다. 더 하위의
`AGENTS.md`가 있으면 해당 디렉터리에서는 하위 지침을 함께 적용하며, 충돌 시 더
구체적인 하위 지침을 우선한다.

## 검증된 프로젝트 기준선

- 기준 HEAD: `00cb6da0985050c86c2bf614adf8cdb6cd938288` (2026-08-04)
- Frontend: Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4,
  TanStack Query
- Backend: Python 3.12, FastAPI, Pydantic, SQLAlchemy, LangGraph/LangChain
- Data/외부 연동: PostgreSQL, SQLite FTS5, Pinecone, OpenAI, KIPRIS
- 전달 계약: 일반 REST JSON, 검색 스트림 NDJSON, ClaimLens 스트림 SSE
- 배포/실행: Docker Compose, Next.js standalone output, Uvicorn

의존성 버전과 실행 명령은 문서가 아니라 `frontend/package.json`,
`frontend/package-lock.json`, `backend/requirements.txt`, Dockerfile, CI를 최종 기준으로
판단한다. Next.js 작업 전에는 `frontend/AGENTS.md`와 설치된
`frontend/node_modules/next/dist/docs/`의 관련 문서를 읽는다.

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

1. **검증 우선**: 수정 전 재현 조건과 기준 동작을 확인한다. 수정 후에는 변경 영역의
   최소 검증과 최종 게이트를 실행하고, 실행하지 못한 검증은 이유와 함께 명시한다.
2. **계약 우선**: API 경로, JSON 필드, HTTP 상태, `detail` 오류 형식, NDJSON 한 줄 한
   이벤트, SSE `data:` 프레임을 암묵적으로 변경하지 않는다. 계약 변경은 백엔드 모델,
   `frontend/types`, `frontend/lib/api.ts`, `docs/API.md`, 관련 테스트를 한 변경에서
   동기화한다.
3. **작은 리팩터링**: 동작 변경과 구조 변경을 분리한다. 공개 인터페이스를 유지하고,
   대규모 파일 이동 전에 참조와 테스트 영향을 검색한다.
4. **타입·린트 강제**: 프론트엔드 완료 조건은 lint, TypeScript, production build 통과다.
   `any`, 무근거 type assertion, lint disable로 문제를 숨기지 않는다.
5. **백엔드 안전성**: 동기 I/O로 async 경로를 막지 않는다. DB 세션을 항상 닫고,
   쓰기 실패 시 rollback하며, SQL은 SQLAlchemy 또는 바인딩 파라미터를 사용한다.
6. **실패를 숨기지 않기**: 빈 `catch`/`except`, 더미 성공값, 과도한 fallback을 넣지
   않는다. 공개 오류에는 비밀정보를 노출하지 않고 서버 로그에는 원인을 남긴다.
7. **보안**: `.env`, API 키, 토큰, 개인정보를 커밋·로그·문서·테스트 fixture에 넣지
   않는다. 외부 OpenAI/Pinecone/KIPRIS 호출은 명시적 필요와 환경 준비가 있을 때만 한다.
8. **측정 무결성**: 성능, 커버리지, Lighthouse, 지연시간 수치는 같은 환경의 before/after
   원시 결과가 있을 때만 주장한다. 추정치는 결과로 문서화하지 않는다.
9. **작업 보존**: 기존 사용자 변경을 되돌리거나 관련 없는 파일을 포맷하지 않는다.
   파괴적 Git 명령을 사용하지 않는다.

## 표준 실행 순서

1. `git status --short`, 관련 코드·테스트·문서와 호출자를 읽고 기준 동작을 정한다.
2. 가장 작은 단위로 수정하고, 가까운 테스트를 먼저 실행한다.
3. 아래 최종 게이트를 실행한 뒤 diff에서 계약, 비밀정보, 불필요한 변경을 점검한다.

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

`frontend/package.json`에는 현재 unit-test 스크립트가 없고 Playwright 설정·spec도 아직
없다. 존재하지 않는 `npm test` 성공을 보고하지 않는다. 테스트 기반을 추가할 때는
`qa-automation` 스킬에 따라 스크립트와 설정을 함께 추가한다.

## 스킬 맵과 도구 호환성

작업을 시작하기 전에 해당 스킬을 읽고 따른다. 여러 영역을 건드리면 각 스킬을 순서대로
적용하되, 두 작업자가 같은 파일을 동시에 편집하지 않는다. 경로는 항상 저장소 루트
`TechDocs/`를 기준으로 해석한다.

- Codex: `.agents/skills/<skill-name>/SKILL.md`
- Gemini: `.gemini/skills/<skill-name>/SKILL.md`
- 두 디렉터리의 같은 이름 스킬은 동일한 내용을 유지한다. 한쪽을 수정하면 같은 변경에서
  다른 쪽도 갱신하고 diff로 일치 여부를 검증한다.

| 작업 신호 | 스킬 이름 (`<skill-name>`) |
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
