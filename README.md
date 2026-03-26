# TechDocs

> RAG 기반 특허 문서 AI 검색 플랫폼

KIPRIS 공공데이터 기반의 특허 문서를 벡터 임베딩하여 자연어 의미 검색 + LLM 답변 생성을 제공하는 풀스택 RAG 시스템

**[Demo](https://techdocs-app.vercel.app/)**

<!-- 스크린샷은 배포 후 추가 -->
<!-- ![TechDocs Screenshot](docs/screenshots/main.png) -->

---

## 배포 환경

| 서비스 | URL |
|--------|-----|
| **Frontend** | https://techdocs-app.vercel.app |
| **Backend API** | https://techdocs-1v4q.onrender.com |
| **API Docs** | https://techdocs-1v4q.onrender.com/docs |

---

## 핵심 기능

| 기능 | 설명 |
|------|------|
| **AI 특허 검색** | 자연어 질문 → 벡터 유사도 검색 → LLM이 관련 특허 기반 답변 생성 |
| **특허 탐색** | 유사도 점수와 함께 관련 특허 브라우징 |
| **데이터 수집** | KIPRIS API에서 출원인 기반 특허 일괄 수집 → 벡터DB 자동 저장 |
| **대시보드** | 수집 특허 건수, 기업별 현황 |

---

## 아키텍처

```
┌──────────────────┐     ┌──────────────────────────────┐     ┌───────────────┐
│                  │     │          FastAPI              │     │               │
│   Next.js        │────▶│                              │────▶│   Pinecone    │
│   Frontend       │ API │  ┌─────────┐  ┌───────────┐ │     │   Vector DB   │
│   (Vercel)       │◀────│  │ RAG     │  │ Ingest    │ │     │               │
│                  │     │  │Pipeline │  │ Pipeline  │ │     │  cosine       │
│  - AI 검색       │     │  └────┬────┘  └─────┬─────┘ │     │  similarity   │
│  - 특허 탐색     │     │       │              │       │     │  search       │
│  - 데이터 수집   │     │  ┌────▼────┐  ┌─────▼─────┐ │     └───────────────┘
│  - 대시보드      │     │  │ OpenAI  │  │  KIPRIS   │ │
└──────────────────┘     │  │GPT-4o-  │  │  Open API │ │
                         │  │  mini   │  └───────────┘ │
                         │  └─────────┘                │
                         │       (Render)              │
                         └──────────────────────────────┘

인제스트: KIPRIS → Document 변환 → 청킹(500자) → 임베딩(1536d) → Pinecone 저장
검  색: 질문 임베딩 → Pinecone 유사도 검색 → 컨텍스트 + LLM → 답변 생성
```

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| **Backend** | Python, FastAPI, LangChain, Pydantic, slowapi (Rate Limiting) |
| **RAG** | OpenAI Embeddings (text-embedding-3-small, 1536d), Pinecone, GPT-4o-mini |
| **Frontend** | Next.js (App Router), TypeScript, Tailwind CSS, react-markdown |
| **Infra** | Docker, docker-compose, Vercel (Frontend), Render (Backend) |
| **Data** | KIPRIS Open API (특허 공공데이터) |

---

## 프로젝트 구조

```
TechDocs/
├── backend/
│   ├── app/
│   │   ├── api/            # FastAPI 엔드포인트
│   │   │   ├── search.py   # RAG 검색 API (Rate Limited)
│   │   │   ├── ingest.py   # 인제스트 API
│   │   │   └── stats.py    # 대시보드 통계 API
│   │   ├── core/           # RAG 핵심 로직
│   │   │   ├── rag_pipeline.py
│   │   │   ├── embeddings.py
│   │   │   ├── vectorstore.py
│   │   │   ├── llm.py
│   │   │   ├── prompts.py
│   │   │   └── rate_limit.py
│   │   ├── ingestion/      # 데이터 수집 파이프라인
│   │   │   ├── kipris_client.py
│   │   │   ├── document_loader.py
│   │   │   ├── text_splitter.py
│   │   │   └── pipeline.py
│   │   └── models/         # Pydantic 스키마
│   ├── scripts/
│   │   └── seed_patents.py # 초기 데이터 시딩
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/
│   ├── app/                # Next.js App Router
│   │   ├── page.tsx        # 홈
│   │   ├── search/         # AI 검색
│   │   ├── upload/         # 데이터 수집
│   │   └── dashboard/      # 대시보드
│   ├── components/         # React 컴포넌트
│   ├── lib/                # API 클라이언트
│   ├── types/              # TypeScript 타입
│   └── Dockerfile
│
├── docker-compose.yml      # 프로덕션
├── docker-compose.dev.yml  # 개발
└── .github/workflows/ci.yml
```

---

## 시작하기

### 사전 요구사항

- Python 3.10+
- Node.js 20+
- [OpenAI](https://platform.openai.com) API 키
- [Pinecone](https://app.pinecone.io) 계정 (무료)
- KIPRIS API 키

### 설치

```bash
git clone https://github.com/neverleaveualong/TechDocs.git
cd TechDocs
```

**백엔드**
```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate  # Windows
pip install -r requirements.txt
cp .env.example .env           # API 키 입력
```

**프론트엔드**
```bash
cd frontend
npm install
```

### 환경변수 (.env)

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

### 실행

```bash
# 백엔드 (터미널 1)
cd backend && uvicorn app.main:app --reload --port 8000

# 프론트엔드 (터미널 2)
cd frontend && npm run dev

# 초기 데이터 시딩 (터미널 3)
cd backend && python -m scripts.seed_patents
```

### Docker로 실행

```bash
docker compose up --build
```

---

## API

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/health` | 서버 상태 확인 |
| `POST` | `/api/search` | RAG 검색 (AI 답변 + 출처 특허) |
| `POST` | `/api/search/similar` | 유사도 검색 (관련 문서만) |
| `POST` | `/api/ingest` | 특허 데이터 인제스트 |
| `GET` | `/api/stats` | 대시보드 통계 |

**Swagger UI**: https://techdocs-1v4q.onrender.com/docs

---

## 설계 결정

| 결정 | 이유 |
|------|------|
| OpenAI text-embedding-3-small | 1536d, 비용 효율적이면서 높은 검색 정확도 |
| GPT-4o-mini | 빠른 응답 속도, 충분한 한국어 성능 |
| 청킹 500자 + overlap 50 | 특허 초록 평균 200~600자, 실험 결과 검색 정확도 최적 |
| Pinecone (cosine, 1536d) | 관리형 벡터DB, 텍스트 유사도에 cosine 최적 |
| slowapi Rate Limiting | API 남용 방지 (검색 분당 10회) |
| 프롬프트 할루시네이션 방지 | 출처 인용 강제, 근거 없으면 미답변 규칙 |
