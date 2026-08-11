# TechDocs API 설계

이 문서는 현재 Backend와 Frontend 코드가 사용하는 외부 계약을 정리한 AS-IS 설계서입니다. FastAPI Router, Pydantic 모델, 스트림 서비스 또는 Frontend 타입을 변경하면 같은 작업에서 이 문서를 갱신합니다.

## 기본 정보

- 로컬 Backend 기본 주소: `http://localhost:8000`
- 일반 API prefix: `/api`
- 일반 오류 본문: `{ "detail": "사용자에게 공개할 메시지" }`
- 일반 검색과 similarity 검색 제한: 클라이언트 IP 기준 `10/minute`
- 검색 스트림: 줄마다 JSON 객체 하나를 전달하는 NDJSON
- ClaimLens 스트림: 빈 줄로 frame을 구분하는 SSE

## Endpoint 목록

| Method | 경로 | 응답 형식 | 용도 |
| --- | --- | --- | --- |
| GET | `/health/` | JSON | Backend 상태 확인 |
| POST | `/api/patents/search` | JSON | KIPRIS 출원인·기간 검색 |
| POST | `/api/ingest/` | JSON | KIPRIS 수집과 검색 저장소 적재 |
| POST | `/api/search/search` | JSON | 자연어 특허 검색과 일괄 답변 |
| POST | `/api/search/stream` | NDJSON | Agent 진행 상태와 답변 스트리밍 |
| POST | `/api/search/similarity` | JSON | RAG namespace 벡터 유사도 검색 |
| POST | `/api/claimlens/stream` | SSE | 제품 설명과 특허 청구항 비교 |
| POST | `/api/feedback` | JSON | 검색 답변 평가 저장 |
| GET | `/api/feedback/stats` | JSON | 평가 통계 조회 |
| GET | `/api/stats/` | JSON | 특허·분석·수집·벡터 통계 조회 |

## 공통 데이터 형식

### 특허 검색 출처

```json
{
  "invention_title": "발명의 명칭",
  "applicant_name": "출원인",
  "application_number": "출원번호",
  "application_date": "출원일",
  "register_status": "등록 상태",
  "ipc_number": "IPC 분류",
  "score": 0.82,
  "score_type": "hybrid",
  "relevance_reason": "관련성 설명",
  "matched_terms": ["검색어"],
  "relevance_text": "검색 근거 문장",
  "full_content": "원문 내용"
}
```

`score`, `ipc_number`, `score_type`, `relevance_reason`, `matched_terms`, `full_content`는 검색 경로에 따라 비어 있거나 생략될 수 있습니다.

## 일반 JSON API

### `GET /health/`

```json
{ "status": "ok" }
```

### `POST /api/patents/search`

KIPRIS를 출원인과 기간 기준으로 직접 검색합니다.

```json
{
  "applicant": "삼성전자",
  "start_date": "20240101",
  "end_date": "20241231",
  "page": 1,
  "num_of_rows": 20
}
```

응답은 `patents` 배열과 `total_count`를 반환합니다. 각 특허는 `application_number`, `invention_title`, `applicant_name`, `ipc_number`, `application_date`, `register_status`, `abstract` 필드를 가집니다.

### `POST /api/ingest/`

KIPRIS 검색 결과를 청킹·임베딩하고 RAG 및 ClaimLens 저장소에 적재합니다.

```json
{
  "applicant": "삼성전자",
  "start_date": "",
  "end_date": "",
  "pages": 5
}
```

공개 응답 필드는 `status`, `patents_collected`, `chunks_created`, `vectors_stored`입니다. 내부 ingestion 결과에는 ClaimLens 저장 수치도 있지만 현재 `IngestResponse`에는 포함되지 않습니다.

### `POST /api/search/search`

```json
{
  "query": "전기차 배터리 열 관리 기술",
  "top_k": 5,
  "use_hybrid": true,
  "use_reranker": false,
  "auto_ingest": true
}
```

```json
{
  "answer": "근거가 포함된 답변",
  "sources": [],
  "query": "전기차 배터리 열 관리 기술",
  "query_log_id": 1
}
```

`query_log_id`는 DB 저장에 실패하면 `null`일 수 있습니다. 현재 `use_reranker` 요청 필드는 모델에 존재하지만 Agent 검색 경로의 초기 상태에는 전달되지 않습니다.

### `POST /api/search/similarity`

요청은 `query`와 기본값 5인 `top_k`를 사용합니다. 응답은 다음 구조의 `results` 배열입니다.

```json
{
  "results": [
    {
      "content": "유사 문서 내용",
      "metadata": {},
      "score": 0.82
    }
  ]
}
```

### `POST /api/feedback`

```json
{
  "query_log_id": 1,
  "rating": 1,
  "comment": "도움이 됐습니다."
}
```

- `rating`의 의미는 `1=도움됨`, `-1=도움되지 않음`입니다.
- 존재하지 않는 `query_log_id`는 `404`와 `detail: Query log not found`를 반환합니다.
- 성공 시 생성된 feedback의 `id`, `query_log_id`, `rating`, `comment`, `created_at`을 반환합니다.

### 통계 API

`GET /api/feedback/stats`는 전체 검색 수, 전체 평가 수, 긍정 비율과 최근 부정 평가 검색을 반환합니다.

`GET /api/stats/`는 다음 영역을 반환합니다.

- `index_name`, `embedding_model`
- `summary`: 특허, 분석된 특허, 분석률, 청구항 및 구성요소 수
- `companies`: 출원인별 특허 수 상위 10개
- `auto_ingest`: 활성화 여부, 일·월 호출량, 제한, TTL, 실행 수
- `engineering_details`: Pinecone 전체·RAG·ClaimLens 벡터 수

Pinecone 통계 조회가 실패하면 관계형 통계 요청은 유지하고 벡터 수를 0으로 반환합니다.

## 검색 NDJSON 스트림

### 요청

`POST /api/search/stream`은 일반 검색과 같은 `SearchRequest`를 사용합니다. 응답 Content-Type은 `application/x-ndjson`이며 각 줄은 독립된 JSON 객체입니다.

### 이벤트

| `type` | 주요 필드 | 의미 |
| --- | --- | --- |
| `query_plan` | `data` | 의도, 기술 특징, 검색어 및 KIPRIS 질의 계획 |
| `agent_decision` | `agent`, `decision` | Supervisor의 다음 행동과 판단 근거 |
| `agent_action` | `agent`, `message` | 검색 또는 답변 생성 준비 상태 |
| `search_quality` | `phase`, `data` | 최초·재검색 결과 품질 |
| `agent_completed` | `agent`, `reasoning`, `payload` | Retriever 또는 Generator 완료 |
| `auto_ingest_started` | `reason`, `message` | KIPRIS 자동 수집 시작 |
| `auto_ingest_completed` | `data` | 수집 상태와 저장 건수 |
| `retry_search` | `message` | 새 벡터를 반영한 재검색 시작 |
| `auto_ingest_skipped_retry` | `message` | 저장된 벡터가 없어 재검색 생략 |
| `sources` | `query`, `sources` | 최종 답변에 사용하는 특허 출처 |
| `answer_delta` | `delta` | 답변의 일부 문자열 |
| `done` | `query`, `query_log_id` | 스트림 정상 완료 |
| `keepalive` | `elapsed_ms` | 장시간 처리 중 연결 유지 |
| `error` | `detail` | 스트림 내부 오류 |

이벤트는 대체로 `query_plan → Agent 반복 → sources → answer_delta 반복 → done` 순서로 전달됩니다. 오류 이벤트는 HTTP 200 스트림 내부에서 전달될 수 있으므로 Frontend는 `type: error`를 실패로 처리합니다.

## ClaimLens SSE 스트림

### 요청

```json
{
  "product_description": "비교할 제품과 처리 과정을 구체적으로 설명한 20자 이상의 문장",
  "technical_domain": null,
  "top_k": 5
}
```

`product_description`은 최소 20자입니다. 응답 Content-Type은 `text/event-stream`이며 각 frame은 `event:`와 `data:` 줄로 구성됩니다. `data`에는 다음 공통 형태의 JSON이 들어갑니다.

```json
{
  "type": "step_started",
  "step": "input_analysis",
  "tool": null,
  "message": "단계 설명",
  "data": null
}
```

### 이벤트

| `type` | 의미 |
| --- | --- |
| `step_started` | 단계 시작 |
| `query_plan` | 제품 설명에서 생성한 검색 계획 |
| `tool_result` | 제품 기능 또는 후보 특허 검색 결과 |
| `supervisor_decision` | 후보 품질과 자동 수집 여부 판단 |
| `auto_ingest_started` | ClaimLens용 KIPRIS 수집 시작 |
| `auto_ingest_completed` | 수집 결과와 저장 수치 |
| `retry_search` | 수집 데이터로 후보 재검색 |
| `claim_chart_row` | 제품 기능과 청구항 구성요소 비교 행 |
| `final_report` | Markdown 형식의 검토 초안 |
| `step_completed` | 단계 완료 |
| `error` | 분석 오류 |

단계 이름은 `input_analysis`, `patent_search`, `claim_loading`, `feature_matching`, `report_generation`입니다. 스트림 오류 역시 HTTP 200 내부 이벤트일 수 있습니다.

`tool_result`는 `tool_name`이나 `result`가 아니라 `tool`과 `data`를 사용합니다. 제품 기능과 후보 특허 이벤트의 형태는 다음과 같습니다.

```json
{
  "type": "tool_result",
  "step": "input_analysis",
  "tool": "extract_product_features",
  "message": null,
  "data": {
    "features": ["센서 데이터 수집", "AI 이상 탐지"]
  }
}
```

```json
{
  "type": "tool_result",
  "step": "patent_search",
  "tool": "search_claim_candidates",
  "message": null,
  "data": {
    "candidates": [
      {
        "vectorId": "patent:1:claim:1",
        "score": 0.82,
        "claimComparisonReady": true,
        "matchedTextType": "independent_claim",
        "matchedText": "센서 데이터를 분석하는 단계",
        "patent": {
          "id": 1,
          "applicationNumber": "1020240000001",
          "title": "센서 데이터 분석 장치",
          "applicantName": "출원인",
          "registerStatus": "등록",
          "abstract": "센서 데이터를 이용한 분석 장치"
        },
        "claim": null,
        "claimElementCount": 2
      }
    ]
  }
}
```

`claim_chart_row.data`는 `claimElement`, `productFeature`, `match` 등 camelCase 필드를 사용합니다. `match` 값은 `matched`, `partial`, `not_found`, `uncertain` 중 하나이며 기술적 구성요소 비교 상태를 의미합니다. 법률적 침해 여부를 확정하는 값으로 사용하지 않습니다.

## 계약 변경 규칙

- 경로, HTTP 상태, 요청·응답 필드명, 기본값을 바꾸면 Backend 모델과 Frontend `types`, `lib/api.ts`, 테스트 및 이 문서를 함께 수정합니다.
- NDJSON은 한 줄에 JSON 객체 하나를 유지하고 SSE는 frame 사이의 빈 줄을 유지합니다.
- snake_case와 camelCase가 혼재하므로 기존 필드명을 임의로 변환하지 않습니다.
- 내부 예외, 환경변수, API key 또는 개인정보를 공개 오류에 포함하지 않습니다.
- 스트림 이벤트의 추가는 소비자가 알 수 없는 이벤트를 안전하게 처리하는지 확인하고, 삭제·이름 변경은 명시적인 호환성 변경으로 다룹니다.
