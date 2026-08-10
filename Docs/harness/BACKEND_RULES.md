# Backend 작업 규칙

이 문서는 `backend/`를 수정할 때 적용합니다. 공통 이름·주석 규칙은 `CODING_RULES.md`, Git 작업 규칙은 `GIT_RULES.md`를 함께 따릅니다.

## 작업 전 확인

1. `Docs/PRODUCT_BRIEF.md`에서 제품 의도와 유지해야 할 사용자 흐름을 확인합니다.
2. `Docs/API.md`와 `Docs/DATABASE.md`에서 공개 계약과 데이터 관계를 확인합니다.
3. 변경 대상뿐 아니라 Router, 호출 Service, Agent·Core, Repository, 모델 및 관련 테스트를 함께 읽습니다.

## 계층별 책임

| 경로 | 책임 |
| --- | --- |
| `app/api/` | HTTP 요청 검증, dependency 주입, 상태 코드와 응답 구성 |
| `app/services/` | 유스케이스와 스트림 오케스트레이션, 계층 간 호출 순서 |
| `app/agents/` | LangGraph 상태, Agent 결정, 노드 실행과 전이 |
| `app/core/` | 검색, 품질 판단, 청구항 비교 등 핵심 로직 |
| `app/ingestion/` | KIPRIS 수집, 파싱, 청킹 및 저장소 적재 |
| `app/repositories/` | 반복되는 관계형 DB 조회·저장 경계 |
| `app/models/` | SQLAlchemy 영속 모델과 Pydantic 입출력 계약 |
| `app/db/` | 엔진, 세션, 스키마 초기화 |

- Router에 검색·수집·분석 알고리즘을 추가하지 않습니다.
- Service는 FastAPI 객체에 의존하지 않는 로직을 우선하고, 외부 의존성은 테스트에서 교체할 수 있게 전달합니다.
- Core는 HTTP 응답 형식이나 UI 표시 문구보다 도메인 입력과 결과를 중심으로 설계합니다.
- 계층을 나누기 위한 단순 전달용 파일은 만들지 않습니다. 책임이나 테스트 경계가 분명할 때 분리합니다.

## API와 스트림 계약

- `/api` 경로, Pydantic 필드, HTTP 상태와 `{ "detail": ... }` 오류 형식을 임의로 바꾸지 않습니다.
- 검색 NDJSON은 한 줄에 하나의 JSON 이벤트를 유지합니다.
- ClaimLens SSE는 `event:`와 `data:` frame 및 frame 사이 빈 줄을 유지합니다.
- 이벤트 `type`, 필드명, 순서 또는 종료 조건을 바꾸기 전에 Frontend parser와 타입, 회귀 테스트를 함께 확인합니다.
- 스트림 내부 실패는 비밀정보가 없는 공통 오류 이벤트로 전달하고 원인은 서버 로그에 남깁니다.
- 동기 네트워크·LLM·DB 작업으로 async event loop를 장시간 막지 않습니다.

## DB와 외부 저장소

- HTTP 범위 세션은 `Depends(get_db)`를 사용하고, 요청 밖 작업은 명시적인 세션 범위를 사용합니다.
- 쓰기 실패 시 rollback하고 모든 경로에서 세션을 닫습니다.
- raw SQL은 사용자 값을 문자열로 조합하지 않고 binding parameter를 사용합니다.
- 관계형 DB 행과 Pinecone metadata ID를 함께 사용하는 변경은 두 저장소의 정합성과 실패 순서를 검토합니다.
- 특허·청구항을 재적재할 때 기존 관계형 행, SQLite FTS 청크 및 Pinecone 벡터의 중복·삭제 동작을 확인합니다.
- 스키마 변경은 `create_all()`만으로 기존 운영 DB를 변경할 수 없으므로 마이그레이션과 rollback 계획을 먼저 마련합니다.

## Agent와 RAG

- LangGraph state key와 Supervisor 행동은 내부 계약으로 취급하고 생산자·소비자를 함께 수정합니다.
- 검색 결과가 없거나 외부 서비스가 실패한 경우를 정상 성공 데이터로 위장하지 않습니다.
- 자동 수집의 호출 한도, cache TTL, 재검색 조건을 우회하지 않습니다.
- 출처 없는 답변, 잘못된 출원번호 인용 또는 근거와 무관한 비교가 생기지 않도록 기존 검증을 유지합니다.
- 특허 침해를 확정하는 법률 판단처럼 표현하지 않고 근거 기반 검토 초안의 범위를 유지합니다.

## 주석과 리팩토링

- 오래된 헤더와 실제 책임이 다르면 코드 확인 후 함께 수정합니다.
- 번호만 붙인 주석이나 코드 동작을 그대로 번역한 주석은 제거합니다.
- 예외 처리, 외부 API 제약, 재검색 조건 및 데이터 정합성처럼 이유가 필요한 곳에 한국어 주석을 남깁니다.
- 빈 `except`, 광범위한 무근거 fallback, 오류 무시는 사용하지 않습니다.
- 동작 변경과 파일 이동·함수 분리는 가능한 한 별도 단계로 검증합니다.

## 검증

변경 범위에 가장 가까운 테스트를 먼저 실행하고 Backend 전체 검증으로 마무리합니다.

```bash
cd backend
python -m compileall -q app
python -m unittest discover -s tests -v
```

DB 변경은 commit·rollback·close와 관계·중복 테스트를 추가합니다. NDJSON 또는 SSE 변경은 이벤트 형식, 순서, 정상 종료 및 오류 이벤트를 검증합니다. 외부 OpenAI, Pinecone, KIPRIS 호출은 테스트에서 대체하고 실제 호출이 필요하면 환경과 비용 영향을 먼저 확인합니다.
