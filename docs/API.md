# TechDocs API 설계서

- 수정일자: 2026-07-30 15:35 KST
- 작성자: Woohyun Sim
- 문서 목적: 현재 백엔드 코드가 제공하는 HTTP API 계약을 요청, 응답, 오류, 스트리밍 이벤트 기준으로 정리합니다.
- 기준 코드:
  - `backend/app/main.py`
  - `backend/app/api/router.py`
  - `backend/app/api/*.py`
  - `backend/app/models/*.py`
- API 기본 주소:
  - 로컬: `http://localhost:8000`
  - 배포: 환경에 따라 설정하며 프론트엔드는 `NEXT_PUBLIC_API_URL`을 사용합니다.
- OpenAPI 문서:
  - FastAPI 기본 문서: `/docs`
  - OpenAPI JSON: `/openapi.json`

## 1. API 운영 원칙

- 모든 요청 본문은 별도 표기가 없으면 `application/json`을 사용합니다.
- API prefix:
  - 상태 확인은 `/health`입니다.
  - 기능 API는 `/api` 아래에 있습니다.
- 인증:
  - 현재 코드에는 사용자 인증·인가 계층이 없습니다.
  - 운영 환경에서 공개 범위를 제한해야 한다면 인증 정책을 별도 설계해야 합니다.
- 오류:
  - 일반 HTTP 오류는 FastAPI의 `detail` 필드를 사용합니다.
  - 입력 검증 실패는 FastAPI 기본 `422 Unprocessable Entity` 형식입니다.
  - 검색 스트림 오류는 스트림이 시작된 뒤 `200 OK` 응답 안에서 `type=error` 이벤트로 전달될 수 있습니다.
- Rate Limit:
  - `/api/search/search`, `/api/search/stream`, `/api/search/similarity`는 `10/minute` 제한을 적용합니다.
  - 제한 초과 시 `429`와 `{"detail":"Rate limit exceeded"}`를 반환합니다.
- 응답 호환성:
  - 외부 필드명은 현재 Pydantic 모델과 프론트엔드 타입을 기준으로 유지합니다.
  - 필드명 변경이 필요한 경우 API 모델, 프론트엔드 타입, 문서를 함께 변경해야 합니다.

## 2. 엔드포인트 요약

| Method | Path | 목적 | 응답 형식 | Rate Limit |
| --- | --- | --- | --- | --- |
| `GET` | `/health/` | 서버 상태 확인 | JSON | 없음 |
| `POST` | `/api/patents/search` | KIPRIS 특허 검색 | JSON | 없음 |
| `POST` | `/api/ingest/` | 특허 수집·청킹·임베딩·저장 | JSON | 없음 |
| `POST` | `/api/search/search` | 동기 자연어 RAG 검색 | JSON | `10/minute` |
| `POST` | `/api/search/stream` | RAG 검색과 답변 스트리밍 | NDJSON | `10/minute` |
| `POST` | `/api/search/similarity` | 답변 없는 유사 문서 검색 | JSON | `10/minute` |
| `POST` | `/api/claimlens/stream` | ClaimLens 분석 스트리밍 | SSE | 없음 |
| `GET` | `/api/stats/` | 벡터·ClaimLens·자동수집 통계 | JSON | 없음 |
| `POST` | `/api/feedback` | 검색 답변 피드백 저장 | JSON | 없음 |
| `GET` | `/api/feedback/stats` | 피드백 통계 조회 | JSON | 없음 |

## 3. 서버 상태 확인

### 3.1 `GET /health/`

- 목적:
  - 애플리케이션 프로세스가 요청을 처리할 수 있는지 확인합니다.
- 응답 `200 OK`:

```json
{
  "status": "ok"
}
```

- 주의사항:
  - 외부 OpenAI, Pinecone, KIPRIS 연결 상태까지 검증하는 readiness check는 아닙니다.
  - `/health`로 요청하면 FastAPI의 trailing slash redirect가 발생할 수 있습니다.

## 4. KIPRIS 특허 검색

### 4.1 `POST /api/patents/search`

- 목적:
  - KIPRIS API에서 출원인과 기간 조건으로 특허 목록을 조회합니다.
- 요청 본문:

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `applicant` | `string` | Yes | - | 출원인 또는 기업명 |
| `start_date` | `string` | No | `""` | 검색 시작일 |
| `end_date` | `string` | No | `""` | 검색 종료일 |
| `page` | `integer` | No | `1` | 조회 페이지 |
| `num_of_rows` | `integer` | No | `20` | 페이지당 조회 건수 |

- 요청 예시:

```json
{
  "applicant": "삼성전자",
  "start_date": "20240101",
  "end_date": "20241231",
  "page": 1,
  "num_of_rows": 20
}
```

- 응답 `200 OK`:

| Field | Type | Description |
| --- | --- | --- |
| `patents` | `PatentItem[]` | 특허 목록 |
| `total_count` | `integer` | 전체 검색 건수 |

- `PatentItem` 필드:

| Field | Type | Description |
| --- | --- | --- |
| `application_number` | `string` | 출원번호 |
| `invention_title` | `string` | 발명의 명칭 |
| `applicant_name` | `string` | 출원인 |
| `ipc_number` | `string` | IPC 분류 |
| `application_date` | `string` | 출원일 |
| `register_status` | `string` | 등록 상태 |
| `abstract` | `string` | 초록 |

- 외부 KIPRIS 오류:
  - 서버 로그에는 원인을 기록합니다.
  - 클라이언트에는 `500`과 `{"detail":"KIPRIS API 호출 실패"}`를 반환합니다.

## 5. 특허 데이터 수집

### 5.1 `POST /api/ingest/`

- 목적:
  - KIPRIS 특허를 수집하고 검색 및 ClaimLens 분석에 사용할 수 있도록 저장합니다.
- 처리 흐름:
  - KIPRIS 조회
  - 문서 변환 및 청킹
  - RAG 검색 데이터 저장
  - SQLite 환경에서 FTS5 보조 인덱스 갱신
  - ClaimLens 특허·청구항·구성요소 저장
  - ClaimLens 벡터 데이터 저장
- 요청 본문:

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `applicant` | `string` | Yes | - | 수집 대상 출원인 |
| `start_date` | `string` | No | `""` | 수집 시작일 |
| `end_date` | `string` | No | `""` | 수집 종료일 |
| `pages` | `integer` | No | `5` | KIPRIS 조회 페이지 수 |

- 응답 기본 필드:

| Field | Type | Description |
| --- | --- | --- |
| `status` | `string` | `success` 또는 `no_data` 등 처리 상태 |
| `patents_collected` | `integer` | 수집한 특허 수 |
| `chunks_created` | `integer` | 생성한 문서 청크 수 |
| `vectors_stored` | `integer` | 저장한 RAG 벡터 수 |

- `no_data` 응답:

```json
{
  "status": "no_data",
  "patents_collected": 0,
  "chunks_created": 0,
  "vectors_stored": 0
}
```

- 주의사항:
  - 수집 API는 외부 API 호출과 벡터 저장을 포함하므로 동기 HTTP 요청 시간이 길어질 수 있습니다.
  - 현재 API 모델에는 `pages`와 날짜 값에 대한 범위·형식 검증이 없습니다.

## 6. 동기 자연어 RAG 검색

### 6.1 `POST /api/search/search`

- 목적:
  - 자연어 질문을 특허 검색과 근거 기반 답변 생성으로 처리합니다.
- 요청 본문:

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `query` | `string` | Yes | - | 자연어 검색 질문 |
| `top_k` | `integer` | No | `5` | 반환할 주요 검색 결과 수 |
| `use_hybrid` | `boolean` | No | `true` | 하이브리드 검색 사용 여부 |
| `use_reranker` | `boolean` | No | `false` | 재정렬 사용 여부. 현재 요청 상태에 보존되는 옵션 |
| `auto_ingest` | `boolean` | No | `true` | 결과 부족 시 자동 수집 허용 여부 |

- 처리 흐름:
  - 자연어 검색 계획 생성
  - Agent 그래프 실행
  - 필요 시 자동 특허 수집 후 재검색
  - 검색 출처가 부족하면 빈 검색 답변 흐름 실행
  - 답변과 출처를 QueryLog에 저장
- 응답 `200 OK`:

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `answer` | `string` | No | 생성된 답변 |
| `sources` | `PatentSource[]` | No | 답변 근거 특허 목록 |
| `query` | `string` | No | 원본 질문 |
| `query_log_id` | `integer` | Yes | QueryLog ID. 저장 실패 시 `null` 가능 |

- `PatentSource` 필드:

| Field | Type | Description |
| --- | --- | --- |
| `invention_title` | `string` | 발명의 명칭 |
| `applicant_name` | `string` | 출원인 |
| `application_number` | `string` | 출원번호 |
| `application_date` | `string` | 출원일 |
| `register_status` | `string` | 등록 상태 |
| `ipc_number` | `string` | IPC 분류 |
| `score` | `number \| null` | 검색 점수 |
| `score_type` | `string` | 점수 유형 |
| `relevance_reason` | `string` | 관련성 판단 이유 |
| `matched_terms` | `string[]` | 일치한 용어 |
| `relevance_text` | `string` | 관련 근거 문장 |
| `full_content` | `string` | 전체 검색 내용 |

- 오류:
  - 내부 예외는 로그에 기록합니다.
  - 클라이언트에는 `500`과 `{"detail":"search failed"}`를 반환합니다.

## 7. RAG 검색 스트리밍

### 7.1 `POST /api/search/stream`

- 목적:
  - 검색 계획, Agent 판단, 자동 수집, 출처, 답변 조각을 실시간으로 전달합니다.
- 응답:
  - HTTP `200 OK`
  - `Content-Type: application/x-ndjson`
  - 한 줄에 하나의 JSON 이벤트를 반환합니다.
- 공통 이벤트 구조:

| Field | Type | Description |
| --- | --- | --- |
| `type` | `string` | 이벤트 유형 |
| `data` | `object` | 이벤트 상세 데이터. 이벤트에 따라 선택적 |
| `message` | `string` | 사용자 표시용 메시지. 이벤트에 따라 선택적 |

- 주요 이벤트:

| `type` | 주요 필드 | 의미 |
| --- | --- | --- |
| `query_plan` | `data` | 자연어 질문에서 만든 검색 계획 |
| `keepalive` | `elapsed_ms` | 5초 동안 Agent 이벤트가 없을 때 연결 유지 |
| `supervisor_decision` | `decision` | 다음 작업과 판단 근거 |
| `agent_action` | `agent`, `message` | 검색 또는 답변 생성 시작 안내 |
| `search_quality` | `phase`, `data` | 검색 품질과 최고 점수 |
| `auto_ingest_started` | `reason`, `message` | 데이터 부족에 따른 자동 수집 시작 |
| `retry_search` | `message` | 수집 데이터 반영 후 재검색 |
| `sources` | `query`, `sources` | 답변 생성에 사용할 출처 |
| `answer_delta` | `delta` | 답변에 추가할 텍스트 조각 |
| `done` | `query`, `query_log_id` | 답변 스트리밍 완료 |
| `error` | `detail` | 스트리밍 중 오류 |

- 답변 누적 예시:

```json
{"type":"sources","query":"배터리 냉각 기술","sources":[]}
{"type":"answer_delta","delta":"관련 특허를 "}
{"type":"answer_delta","delta":"검토한 결과입니다."}
{"type":"done","query":"배터리 냉각 기술","query_log_id":12}
```

- 오류 처리:
  - 스트림 시작 전 HTTP 오류는 일반 HTTP 오류로 처리됩니다.
  - 스트림 시작 후 예외는 `type=error`, `detail=search failed` 이벤트로 전달됩니다.
  - QueryLog 저장 실패는 `query_log_id: null`로 완료될 수 있으며 검색 결과 자체는 중단하지 않습니다.

## 8. 유사 문서 검색

### 8.1 `POST /api/search/similarity`

- 목적:
  - LLM 답변 생성 없이 유사 특허 문서만 조회합니다.
- 요청 본문:

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `query` | `string` | Yes | - |
| `top_k` | `integer` | No | `5` |

- 응답 `200 OK`:

| Field | Type | Description |
| --- | --- | --- |
| `results` | `SimilarityResult[]` | 유사 문서 목록 |
| `results[].content` | `string` | 문서 내용 |
| `results[].metadata` | `object` | 특허 메타데이터 |
| `results[].score` | `number` | 유사도 점수 |

## 9. ClaimLens 분석 스트리밍

### 9.1 `POST /api/claimlens/stream`

- 목적:
  - 제품 설명과 특허 청구항 구성요소를 비교해 기술 검토 초안을 생성합니다.
- 요청 본문:

| Field | Type | Required | Default | Validation |
| --- | --- | --- | --- | --- |
| `product_description` | `string` | Yes | - | 최소 20자 |
| `technical_domain` | `string \| null` | No | `null` | 별도 제한 없음 |
| `top_k` | `integer` | No | `5` | 별도 범위 검증 없음 |

- 요청 예시:

```json
{
  "product_description": "센서가 측정한 온도에 따라 냉각 유량을 자동 조절하는 배터리 관리 시스템",
  "technical_domain": "배터리 열관리",
  "top_k": 5
}
```

- 응답:
  - HTTP `200 OK`
  - `Content-Type: text/event-stream`
  - SSE 형식:

```text
event: step_started
data: {"type":"step_started","step":"input_analysis","message":"..."}

```

- 분석 단계:

| `step` | 의미 |
| --- | --- |
| `input_analysis` | 제품 설명에서 기능과 검색 질의 추출 |
| `patent_search` | 관련 특허 후보 검색과 품질 판단 |
| `claim_loading` | 청구항과 구성요소 로딩 |
| `feature_matching` | 제품 기능과 청구항 구성요소 비교 |
| `report_generation` | 근거 기반 검토 초안 생성 |

- 이벤트 유형:

| `type` | 주요 내용 |
| --- | --- |
| `step_started` | 단계 시작과 안내 메시지 |
| `query_plan` | 생성된 검색 계획 |
| `tool_result` | 후보 특허, 제품 기능, 구성요소 조회 결과 |
| `supervisor_decision` | 품질 등급과 자동 수집 여부 |
| `auto_ingest_started` | 후보 부족에 따른 자동 수집 시작 |
| `auto_ingest_completed` | 자동 수집 결과 |
| `retry_search` | 수집 후 재검색 시작 |
| `claim_chart_row` | 구성요소별 비교 결과 |
| `final_report` | `data.markdown`에 담긴 최종 보고서 |
| `step_completed` | 단계 완료 |
| `error` | 분석 오류 |

- 품질 판단 데이터:
  - `verdict`: `insufficient`, `low_relevance`, `weak_match`, `accepted` 등
  - `action`: `auto_ingest`, `continue`
  - `qualityGrade`: 품질 등급
  - `topScore`: 최고 후보 점수
  - `candidateCount`: 후보 수
  - `claimElementCount`: 청구항 구성요소 수
  - `matchedCount`: 완전 일치 수
  - `partialCount`: 부분 일치 수
  - `thresholds`: 후보·매칭 판단 기준
- 오류:
  - 입력 검증 실패는 `422`입니다.
  - 스트림 시작 후 오류는 `type=error` SSE 이벤트로 전달됩니다.

## 10. 통계 조회

### 10.1 `GET /api/stats/`

- 목적:
  - 벡터 저장소, 회사별 특허 샘플, ClaimLens 영속 데이터, 자동 수집 현황을 한 번에 조회합니다.
- 응답 주요 필드:

| Field | Type | Description |
| --- | --- | --- |
| `index_name` | `string` | Pinecone 인덱스 이름 |
| `dimension` | `integer` | 벡터 차원 |
| `total_vectors` | `integer` | 전체 벡터 수 |
| `company_namespace` | `string` | 회사별 샘플을 조회한 namespace |
| `company_sample_limit` | `integer` | 회사별 샘플 최대 벡터 수, 현재 500 |
| `company_stats_sampled` | `boolean` | 전체가 아닌 샘플 통계인지 여부 |
| `namespaces` | `object` | `rag`, `agent`, `default` namespace별 통계 |
| `companies` | `object[]` | 출원인별 특허 수·벡터 수 |
| `claimlens` | `object` | ClaimLens 특허·청구항·구성요소 수 |
| `auto_ingest` | `object` | 자동 수집 사용 여부, 호출 수, 한도, TTL |

- `namespaces` 항목:
  - `namespace`: namespace 이름
  - `vector_count`: 벡터 수
- `companies` 항목:
  - `applicant`: 출원인
  - `patent_count`: 샘플에서 확인된 특허 수
  - `vector_count`: 샘플에서 확인된 벡터 수
- `claimlens` 항목:
  - `patents`
  - `claims`
  - `active_claims`
  - `independent_claims`
  - `claim_elements`
  - `patents_with_claims`
- `auto_ingest` 항목:
  - `enabled`
  - `daily_kipris_calls`
  - `monthly_kipris_calls`
  - `daily_limit`
  - `monthly_limit`
  - `cache_ttl_days`
  - `total_runs`

## 11. 피드백 저장

### 11.1 `POST /api/feedback`

- 목적:
  - 검색 결과에 대한 사용자 평가와 의견을 QueryLog에 연결해 저장합니다.
- 요청 본문:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `query_log_id` | `integer` | Yes | 대상 QueryLog ID |
| `rating` | `integer` | Yes | 코드 주석상 `1` 또는 `-1` |
| `comment` | `string \| null` | No | 선택 의견 |

- 응답 `200 OK`:

| Field | Type | Description |
| --- | --- | --- |
| `id` | `integer` | Feedback ID |
| `query_log_id` | `integer` | 연결된 QueryLog ID |
| `rating` | `integer` | 사용자 평가 |
| `comment` | `string \| null` | 의견 |
| `created_at` | `string \| null` | ISO 형식 생성 시각 |

- 대상 QueryLog가 없으면:

```json
{
  "detail": "Query log not found"
}
```

- 상태 코드: `404 Not Found`
- 현재 제약:
  - Pydantic 모델에는 `rating` 값이 `1` 또는 `-1`인지 강제하는 validator가 없습니다.
  - 향후 API 계약을 강화할 때 기존 클라이언트 호환성을 먼저 검토해야 합니다.

## 12. 피드백 통계

### 12.1 `GET /api/feedback/stats`

- 목적:
  - 전체 QueryLog, 피드백 수, 긍정 비율, 최근 부정 피드백을 조회합니다.
- 응답:

| Field | Type | Description |
| --- | --- | --- |
| `total_queries` | `integer` | 전체 검색 기록 수 |
| `total_feedbacks` | `integer` | 전체 피드백 수 |
| `positive_rate` | `number` | 긍정 평가 비율, 소수 셋째 자리 반올림 |
| `recent_negative_queries` | `object[]` | 최근 부정 피드백 최대 10건 |

- `recent_negative_queries` 항목:
  - `id`: QueryLog ID
  - `query`: 검색 질문
  - `answer`: 당시 답변
  - `feedback_at`: 피드백 생성 시각

## 13. 오류 계약 요약

| 상황 | Status | 응답 |
| --- | --- | --- |
| 정상 JSON API | `200` | 엔드포인트별 응답 모델 |
| 요청 본문 검증 실패 | `422` | FastAPI validation detail |
| 검색 Rate Limit 초과 | `429` | `{"detail":"Rate limit exceeded"}` |
| 존재하지 않는 QueryLog | `404` | `{"detail":"Query log not found"}` |
| 일반 내부 오류 | `500` | 공개용 `detail` 메시지 |
| 스트림 처리 중 오류 | `200` 연결 내 이벤트 | NDJSON 또는 SSE `error` 이벤트 |

## 14. 변경 관리

- API 요청·응답 필드 변경 시 확인 대상:
  - Pydantic 모델
  - FastAPI Router
  - `frontend/lib/api.ts`
  - `frontend/types/`
  - 프론트엔드 컴포넌트와 Hook
  - 이 문서
- DB 스키마 변경이 API 응답에 영향을 주면 [DB 설계서](DATABASE.md)와 함께 갱신합니다.
- 스트림 이벤트의 `type`, 필드명, 순서를 변경할 때는 프론트엔드 파서와 상태 reducer 회귀 테스트를 함께 수정합니다.
