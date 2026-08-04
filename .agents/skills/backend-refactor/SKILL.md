---
name: backend-refactor
description: Refactor TechDocs FastAPI, SQLAlchemy, ingestion, search, and LangGraph backend without breaking REST, NDJSON, SSE, database, or agent-state contracts. Use for API/service/repository separation, query optimization, transaction changes, async pipeline work, RAG changes, and backend performance cleanup under backend/.
---

# Backend Refactor

`docs/API.md`, Pydantic 모델, 프론트엔드 타입을 함께 계약 기준으로 삼는다. Router는 HTTP,
Service/Agent는 흐름, Repository/DB는 영속성 책임을 갖도록 유지한다.

## 📋 표준 작업 워크플로우

1. **경계 추적**: 대상 endpoint에서 모델→router→service/agent→repository/외부 API까지
   호출 흐름과 테스트를 읽는다. 그래프 state key, node transition, DB transaction,
   NDJSON/SSE 이벤트 순서를 기준선으로 남긴다.
2. **안전하게 분리·최적화**: 공개 Pydantic schema와 이벤트 envelope를 유지한다. async
   경로의 blocking I/O를 격리하고, SQLAlchemy 및 바인딩 파라미터를 사용한다. 세션 소유권,
   commit/rollback/close 지점을 명시하며 PostgreSQL과 SQLite FTS5 양쪽 영향을 확인한다.
3. **계약·회귀 검증**: 가까운 테스트부터 전체 pytest를 실행한다. endpoint가 바뀌면
   `frontend/lib/api.ts`, `frontend/types`, `docs/API.md`를 동기화하고 프론트 타입 검사도 한다.

## 🛠️ 빌드/타입체크/테스트 실행 커맨드

```bash
cd backend && python -m compileall -q app
cd backend && python -m pytest tests/test_search_api_flow.py
cd backend && python -m pytest
# API 계약을 건드린 경우
cd frontend && npx tsc --noEmit
# 컨테이너/의존성을 바꾼 경우, 저장소 루트에서
docker compose build backend
```

## 🛡️ Quality Checklist

- [ ] REST 상태 코드·오류 `detail`, NDJSON media type/행 경계, SSE frame/event 순서가 유지된다.
- [ ] Pydantic schema와 프론트 TypeScript 타입이 일치한다.
- [ ] async event loop에 동기 네트워크·무거운 CPU 작업을 직접 추가하지 않았다.
- [ ] DB 세션이 닫히고 쓰기 실패가 rollback되며 쿼리는 파라미터화되어 있다.
- [ ] LangGraph state key와 supervisor/retriever/ingest/generator 전이가 테스트된다.
- [ ] 외부 API 실패·timeout·빈 결과가 명시적으로 처리되고 비밀정보가 로그에 없다.
- [ ] 관련 테스트와 전체 pytest 결과를 완료 보고에 남겼다.
