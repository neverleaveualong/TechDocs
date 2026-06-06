# TechDocs

> KIPRIS 특허 문서를 수집하고, RAG 기반으로 검색/요약/답변을 제공하는 특허 문서 AI 검색 서비스

TechDocs는 특허 문서를 키워드로만 찾기 어렵다는 문제에서 시작한 개인 프로젝트입니다. KIPRIS Open API에서 출원인 기준 특허 데이터를 수집하고, 특허 초록과 메타데이터를 임베딩해 Pinecone에 저장한 뒤, 사용자의 자연어 질문에 맞는 특허 근거를 찾아 GPT-4o-mini가 답변을 생성합니다.

단순 챗봇이 아니라 **데이터 수집 -> 문서 정제 -> 청킹 -> 임베딩 -> 검색 -> LLM 답변 -> 출처/피드백 저장**까지 이어지는 RAG 파이프라인을 직접 구현한 프로젝트입니다.

**Demo**: https://techdocs-app.vercel.app  
**API Docs**: https://techdocs-1v4q.onrender.com/docs

---

## 기획 배경

특허 데이터는 기술 동향, 경쟁사 분석, 아이디어 검증에 유용하지만 실제로 활용하려면 몇 가지 불편함이 있습니다.

- 특허 제목/초록/IPC/출원번호가 흩어져 있어 빠르게 맥락을 파악하기 어렵습니다.
- 키워드가 정확히 일치하지 않으면 관련 특허를 놓치기 쉽습니다.
- 검색 결과를 하나씩 읽고 비교해야 해서 기술 요약과 근거 확인에 시간이 오래 걸립니다.
- LLM 답변만 제공하면 어떤 특허를 근거로 답했는지 검증하기 어렵습니다.

TechDocs는 이 문제를 해결하기 위해 자연어 질문으로 관련 특허를 찾고, 답변과 함께 출처 특허를 표시하는 구조로 설계했습니다.

---

## 핵심 기능

| 기능 | 구현 내용 |
| --- | --- |
| 특허 데이터 수집 | KIPRIS Open API에서 출원인, 기간, 페이지 수 기준으로 특허 목록을 수집합니다. |
| 문서 정제/청킹 | 특허 제목, 출원번호, 출원인, IPC, 출원일, 등록상태, 초록을 LangChain Document로 변환하고 청크 단위로 나눕니다. |
| 벡터 저장 | OpenAI `text-embedding-3-small`로 1536차원 임베딩을 만들고 Pinecone에 저장합니다. |
| AI 검색 | 질문을 임베딩해 관련 특허 청크를 검색하고 GPT-4o-mini가 근거 기반 답변을 생성합니다. |
| Hybrid Search | Vector Search와 BM25 키워드 검색을 함께 수행하고 RRF로 순위를 병합합니다. |
| Reranker 옵션 | Flashrank 기반 reranker로 후보 문서를 2차 정렬할 수 있게 분리했습니다. |
| 스트리밍 답변 | `/api/search/stream`에서 NDJSON 형태로 출처와 답변 토큰을 순차 전송합니다. |
| 출처 표시 | 답변 근거가 된 특허의 제목, 출원인, 출원번호, 출원일, 관련 본문을 함께 제공합니다. |
| 피드백 루프 | 검색 로그와 좋아요/싫어요 피드백을 SQLite에 저장해 나중에 품질 개선 근거로 사용할 수 있게 했습니다. |
| 대시보드 | Pinecone 메타데이터를 조회해 전체 벡터 수, 차원 수, 회사별 특허/벡터 수를 보여줍니다. |

---

## 사용자 흐름

1. 사용자가 "2차전지 열 관리 특허"처럼 자연어로 질문합니다.
2. 프론트엔드는 `/api/search/stream`으로 검색 요청을 보냅니다.
3. 백엔드는 Hybrid Search 또는 Vector Search로 관련 특허 청크를 찾습니다.
4. 검색된 문서에는 출원번호, 발명명칭, 출원인, IPC, 출원일, 등록상태를 붙여 LLM context로 전달합니다.
5. GPT-4o-mini가 context 안의 근거만 사용해 답변을 생성합니다.
6. 프론트엔드는 출처 목록을 먼저 보여주고, 답변은 스트리밍으로 누적 표시합니다.
7. 검색 로그와 답변, 출처가 SQLite에 저장되고 사용자는 답변에 피드백을 남길 수 있습니다.

---

## 시스템 구조

```text
KIPRIS Open API
      |
      v
Ingest Pipeline
  - applicant/date/page 기준 수집
  - XML/JSON 응답 파싱
  - PatentItem -> LangChain Document 변환
  - 특허 메타데이터 + 초록 청킹
      |
      v
OpenAI Embedding
  - text-embedding-3-small
  - 1536 dimensions
      |
      v
Pinecone Vector DB
      |
      v
Search Pipeline
  - Vector Search
  - BM25 Search
  - RRF rank fusion
  - optional Flashrank reranker
      |
      v
GPT-4o-mini
  - 특허 근거 기반 답변 생성
  - 출처 없는 내용은 답변하지 않도록 prompt 제약
      |
      v
Next.js Frontend
  - 검색 화면
  - 스트리밍 답변
  - 출처 특허 목록
  - 피드백 버튼
  - 대시보드/수집 화면
```

---

## 주요 구현 포인트

### 1. 특허 식별자를 검색 context에 포함

LLM이 특허 내용을 답변할 때 출원번호나 발명 명칭을 놓치지 않도록 `RAGPipeline._build_context()`에서 각 문서 앞에 메타데이터 헤더를 붙였습니다.

포함하는 메타데이터:

- 출원번호
- 발명의 명칭
- 출원인
- IPC 분류
- 출원일
- 등록상태

이렇게 구성해 답변이 단순 요약에 그치지 않고 어떤 특허를 근거로 했는지 추적할 수 있게 했습니다.

### 2. Vector Search와 BM25를 결합

특허 검색은 의미적으로 비슷한 문서도 찾아야 하지만, 출원번호/기술 키워드처럼 정확한 단어 매칭도 중요합니다. 그래서 Pinecone Vector Search와 `rank-bm25` 기반 BM25 검색을 같이 수행하고 RRF(Reciprocal Rank Fusion)로 결과를 합쳤습니다.

- Vector Search: 의미가 비슷한 특허 청크 검색
- BM25: 키워드가 직접 포함된 특허 청크 검색
- RRF: 두 검색 결과의 순위를 합산해 최종 후보 선정

### 3. Fetch Streaming 기반 검색 응답

기존 동기 검색은 LLM 답변이 끝날 때까지 화면이 멈춰 보입니다. `/api/search/stream`에서는 먼저 출처 특허를 보내고, 이후 답변 조각을 `answer_delta` 이벤트로 보내 사용자가 답변 생성을 실시간으로 확인할 수 있게 했습니다.

스트림 이벤트:

- `sources`: 검색된 특허 출처 목록
- `answer_delta`: LLM 답변 조각
- `done`: 검색 로그 ID 반환
- `error`: 검색 실패 메시지

### 4. 피드백 루프

검색 결과와 답변을 개선하려면 실패 사례가 남아야 합니다. 검색할 때마다 `query_logs` 테이블에 질문, 답변, 출처, 검색 모드, 응답 시간을 저장하고, 사용자가 남긴 좋아요/싫어요를 `feedbacks` 테이블에 연결했습니다.

저장 데이터:

- 질문
- 생성 답변
- 출처 특허 JSON
- hybrid/vector 검색 모드
- 응답 시간
- 사용자 평가와 코멘트

---

## API 요약

| Method | Endpoint | 설명 |
| --- | --- | --- |
| `GET` | `/health` | 서버 상태 확인 |
| `POST` | `/api/search/search` | 동기 RAG 검색. 답변과 출처를 한 번에 반환합니다. |
| `POST` | `/api/search/stream` | 스트리밍 RAG 검색. 출처와 답변 조각을 NDJSON으로 반환합니다. |
| `POST` | `/api/search/similarity` | LLM 답변 없이 유사 문서만 반환합니다. |
| `POST` | `/api/ingest` | KIPRIS 특허 수집, 청킹, 임베딩, Pinecone 저장을 실행합니다. |
| `GET` | `/api/stats/` | Pinecone 인덱스와 회사별 벡터/특허 통계를 조회합니다. |
| `POST` | `/api/feedback` | 검색 답변에 대한 사용자 피드백을 저장합니다. |
| `GET` | `/api/feedback/stats` | 피드백 통계와 최근 부정 피드백을 조회합니다. |

---

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | Next.js App Router, TypeScript, Tailwind CSS, react-markdown |
| Backend | Python, FastAPI, Pydantic, slowapi |
| RAG | LangChain, OpenAI Embeddings, GPT-4o-mini, Pinecone |
| Retrieval | Pinecone Vector Search, BM25, RRF, Flashrank optional reranker |
| Data | KIPRIS Open API |
| Feedback | SQLite, WAL mode |
| Infra | Docker, docker-compose, Vercel, Render |
| CI | GitHub Actions, Python syntax/module checks, Next.js build |

---

## 프로젝트 구조

```text
TechDocs/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── search.py      # 동기/스트리밍 검색 API
│   │   │   ├── ingest.py      # KIPRIS 수집 API
│   │   │   ├── stats.py       # Pinecone 통계 API
│   │   │   └── feedback.py    # 검색 피드백 API
│   │   ├── core/
│   │   │   ├── rag_pipeline.py
│   │   │   ├── hybrid_search.py
│   │   │   ├── reranker.py
│   │   │   ├── vectorstore.py
│   │   │   ├── embeddings.py
│   │   │   ├── llm.py
│   │   │   └── prompts.py
│   │   ├── db/
│   │   │   └── database.py    # SQLite query_logs/feedbacks
│   │   ├── ingestion/
│   │   │   ├── kipris_client.py
│   │   │   ├── document_loader.py
│   │   │   ├── text_splitter.py
│   │   │   └── pipeline.py
│   │   └── models/
│   ├── eval/                # RAGAS/검색 성능 평가 스크립트
│   ├── scripts/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── search/           # AI 검색 화면
│   │   ├── upload/           # 특허 수집 화면
│   │   ├── dashboard/        # 통계 대시보드
│   │   └── help/
│   ├── components/
│   ├── lib/api.ts            # API client + stream parser
│   └── types/
├── .github/workflows/ci.yml
├── docker-compose.yml
└── docker-compose.dev.yml
```

---

## 로컬 실행

### 요구사항

- Python 3.12 권장
- Node.js 20+
- OpenAI API key
- Pinecone API key/index
- KIPRIS API key

### Backend

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Docker

```bash
docker compose up --build
```

---

## 환경변수

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX_NAME=techdocs-patents
KIPRIS_API_KEY=...
KIPRIS_BASE_URL=http://plus.kipris.or.kr/kipo-api/kipi
FRONTEND_URL=http://localhost:3000
```

Frontend 배포 환경에서는 다음 값이 필요합니다.

```env
NEXT_PUBLIC_API_URL=https://techdocs-1v4q.onrender.com
```

---

## CI에서 확인하는 것

GitHub Actions의 `CI` workflow는 `main`, `develop` push와 `main`, `develop` 대상 PR에서 실행됩니다.

- backend job
  - Python 3.12 설정
  - `backend/requirements.txt` 설치
  - `app/main.py`, `app/config.py` 문법 검사
  - 핵심 모델 모듈(`app.models.patent`, `app.models.search`, `app.models.ingest`) 존재 여부 검사

- frontend job
  - Node.js 20 설정
  - `frontend/package-lock.json` 기준 `npm ci`
  - Next.js production build 실행

이 CI는 배포 자체를 수행하지 않고, 백엔드/프론트엔드가 최소한 빌드 가능한 상태인지 확인하는 용도입니다.

---

## 현재 한계와 개선 방향

- BM25 인덱스를 요청 시 Pinecone에서 다시 구성하므로 데이터가 많아지면 캐싱 전략이 필요합니다.
- 한국어 토큰화는 정규식 기반 간이 토크나이저라 Kiwi 같은 형태소 분석기를 적용하면 BM25 품질을 더 높일 수 있습니다.
- Reranker는 optional 구조로 분리되어 있지만, 운영 환경에서는 모델 캐시/콜드스타트 비용을 고려해야 합니다.
- 피드백 데이터는 SQLite에 저장되므로 운영 규모가 커지면 Postgres 등 외부 DB로 옮기는 것이 적합합니다.
