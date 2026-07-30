# 백엔드(AI Agent) 기술 문서

- 수정일자: 2026-07-30 16:39 KST
- 작성자: Woohyun Sim
- 목적: 자연어 검색, 자동 수집, 답변 생성, ClaimLens 분석을 처리하는 백엔드의 기술 선택과 책임을 설명합니다.

## 기술 스택

- Python 3.12:
  - AI Agent와 데이터 처리 로직을 구성합니다.
- FastAPI:
  - REST API, 요청 검증, 오류 응답, NDJSON·SSE 스트리밍을 제공합니다.
- Pydantic·Pydantic Settings:
  - API 요청·응답 타입과 환경변수 설정을 관리합니다.
- LangGraph·LangChain:
  - Supervisor와 Worker Agent의 실행 순서와 상태를 관리합니다.
- OpenAI:
  - 자연어 답변 생성과 특허 문서 임베딩에 사용합니다.
- Pinecone:
  - 특허 원문 청크와 ClaimLens 청구항 임베딩을 검색합니다.
- BM25·RRF·FlashRank:
  - 키워드 검색, 검색 결과 결합, 후보 재정렬에 사용합니다.
- SQLAlchemy:
  - PostgreSQL과 SQLite의 데이터 저장을 관리합니다.
- PostgreSQL:
  - 검색 기록, 피드백, ClaimLens 원천 데이터, 자동 수집 상태를 저장합니다.
- SQLite FTS5:
  - 로컬 환경에서 특허 키워드 검색을 보조합니다.
- KIPRIS Open API:
  - 특허 검색과 부족한 특허 데이터 자동 수집에 사용합니다.
- slowapi:
  - 검색 API 호출 빈도를 제한합니다.

## 기술 선택과 해결한 문제

- FastAPI를 사용한 이유:
  - 자연어 검색과 분석 결과를 JSON, NDJSON, SSE 형태로 일관되게 제공하기 위해 사용합니다.
- LangGraph를 사용한 이유:
  - 검색 결과가 부족할 때 수집과 재검색을 연결하고, 상태에 따라 다음 Agent 작업을 결정하기 위해 사용합니다.
- Pinecone과 키워드 검색을 함께 사용하는 이유:
  - 자연어 의미가 유사한 특허와 핵심 용어가 일치하는 특허를 함께 찾기 위해 사용합니다.
- PostgreSQL과 Pinecone을 분리한 이유:
  - 검색 임베딩은 벡터 저장소에, 검색 기록과 분석 원천 데이터는 관계형 DB에 저장해 각 저장소의 책임을 분리합니다.
- Service와 Repository를 분리한 이유:
  - 검색 흐름과 데이터 저장 방식을 분리해 API 변경과 저장소 변경의 영향을 줄입니다.
- NDJSON·SSE를 사용하는 이유:
  - Agent의 진행 상황과 답변을 요청 종료 후 한 번에 반환하지 않고 실시간으로 전달하기 위해 사용합니다.

## 백엔드 책임

- 자연어 질문을 검색 계획으로 변환합니다.
- 검색 결과의 품질을 판단합니다.
- 결과가 부족하면 KIPRIS에서 특허를 수집하고 검색 데이터로 저장합니다.
- 수집 데이터를 반영해 검색을 다시 실행합니다.
- 검색 근거와 출처를 바탕으로 답변을 생성합니다.
- 제품 설명과 특허 청구항 구성요소를 비교합니다.
- 검색, 분석, 자동 수집 진행 상태를 프론트엔드로 전달합니다.
- QueryLog, Feedback, ClaimLens 원천 데이터와 자동 수집 상태를 저장합니다.

## AI Agent 구성

- Supervisor Agent:
  - 현재 검색 상태, 후보 수, 관련도와 매칭 결과를 확인합니다.
  - 다음 작업을 검색, 수집, 답변 생성 중에서 결정합니다.
- Retriever Agent:
  - 특허 후보를 검색합니다.
  - 검색 결과의 관련도와 품질을 계산합니다.
- Ingest Agent:
  - KIPRIS 특허를 수집합니다.
  - 문서를 분할하고 임베딩한 뒤 검색 저장소에 적재합니다.
- Generator Agent:
  - 검색 근거를 바탕으로 답변을 생성합니다.
  - 답변 생성 전 출처 목록을 확정합니다.
- ClaimLens Workflow:
  - 제품 기능을 추출합니다.
  - 후보 특허의 청구항과 구성요소를 조회합니다.
  - 구성요소별 `matched`, `partial`, `uncertain`, `not_found` 결과를 생성합니다.
  - 최종 기술 검토 초안을 생성합니다.

## 자연어 RAG 검색 흐름

- 사용자가 자연어 질문을 입력합니다.
- `SearchStreamService`가 검색 계획을 생성하고 Agent 그래프를 실행합니다.
- Supervisor가 검색 또는 자동 수집 여부를 결정합니다.
- Retriever가 특허 후보와 검색 품질을 반환합니다.
- 결과가 부족하면 Ingest가 KIPRIS 데이터를 수집합니다.
- 수집 완료 후 Retriever가 새 데이터로 재검색합니다.
- Generator가 검색 근거 기반 답변을 스트리밍합니다.
- QueryLog Repository가 질문, 답변, 출처와 응답 시간을 저장합니다.

## ClaimLens 분석 흐름

- `ClaimLensAnalysisService`가 분석 단계를 조정합니다.
- 제품 설명에서 검색 질의와 제품 기능을 추출합니다.
- ClaimLens 벡터 저장소에서 후보 특허를 검색합니다.
- 후보 품질이 낮으면 자동 수집과 재검색을 수행합니다.
- 청구항과 구성요소를 불러옵니다.
- 제품 기능과 청구항 구성요소를 비교합니다.
- 비교 결과와 기술 검토 초안을 SSE 이벤트로 전달합니다.

## 계층별 책임

- API:
  - 요청 파라미터 검증, HTTP 응답, 오류, 스트리밍 연결을 담당합니다.
- Service:
  - 검색 스트림과 ClaimLens 분석의 전체 실행 순서를 담당합니다.
- Agent:
  - 검색, 수집, 답변 생성과 같은 AI 작업을 담당합니다.
- Repository:
  - QueryLog와 같은 영속 데이터 저장을 담당합니다.
- Core:
  - 검색, 임베딩, 재정렬, ClaimLens 비교와 같은 도메인 로직을 담당합니다.
- Model:
  - API 요청·응답과 DB 모델을 정의합니다.

## 스트리밍과 오류 처리

- RAG 검색:
  - `application/x-ndjson`으로 검색 계획, Agent 이벤트, 출처, 답변 조각을 전달합니다.
- ClaimLens:
  - `text/event-stream`으로 분석 단계, 후보, 비교 결과, 보고서를 전달합니다.
- 일반 API 오류:
  - 내부 원인은 로그에 기록하고 클라이언트에는 공개용 메시지만 반환합니다.
- 스트리밍 오류:
  - 스트림 시작 전에는 HTTP 오류로 반환합니다.
  - 스트림 시작 후에는 `error` 이벤트로 반환합니다.
- QueryLog 저장 오류:
  - 저장 실패를 로그에 기록하지만 검색 응답 자체는 중단하지 않습니다.

## 외부 연동과 데이터 책임

- KIPRIS:
  - 특허 목록과 청구항 원천 데이터를 제공합니다.
- OpenAI:
  - 답변 생성과 임베딩을 수행합니다.
- Pinecone:
  - RAG namespace와 ClaimLens Agent namespace의 벡터를 저장합니다.
- PostgreSQL:
  - `query_logs`, `feedbacks`, `patents`, `claims`, `claim_elements`, `auto_ingest_cache`를 저장합니다.
- SQLite FTS5:
  - 로컬 환경에서 특허 청크의 키워드 검색을 보조합니다.

## 검증 방법

- 백엔드 전체 테스트:
  - `cd backend && pytest`
- 검색 스트림 테스트:
  - `cd backend && pytest tests/test_search_stream_service.py`
- ClaimLens 서비스 테스트:
  - `cd backend && pytest tests/test_claimlens_service.py`
- API 오류 테스트:
  - `cd backend && pytest tests/test_api_errors.py`
- DB 세션·QueryLog 테스트:
  - `cd backend && pytest tests/test_database_session.py tests/test_query_log_repository.py`
- SQLite FTS 테스트:
  - `cd backend && pytest tests/test_sqlite_fts.py`
- 애플리케이션 문법 검사:
  - `cd backend && python -m py_compile app/main.py app/config.py`

## 유지보수 원칙

- API 계층에 핵심 비즈니스 판단과 DB 직접 접근을 추가하지 않습니다.
- 여러 저장소를 조합하거나 상태 변경 조건을 판단하는 로직은 Service에 둡니다.
- 저장 방식은 Repository에 감추고 Agent나 API가 DB 세부 구현에 직접 의존하지 않도록 합니다.
- 스트리밍 이벤트의 타입과 필드명을 변경할 때 프론트엔드 파서와 Hook을 함께 검토합니다.
- API나 DB 스키마 변경 시 [API 설계서](API.md), [DB 설계서](DATABASE.md), 프론트엔드 타입을 함께 갱신합니다.
