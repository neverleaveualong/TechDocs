# TechDocs — RAG 기반 특허 문서 AI 검색 플랫폼

> TechLens의 키워드 검색 한계 → RAG 의미 기반 검색으로 해결
> 더존비즈온 AI직군 (AI 인프라개발/엔지니어) 포트폴리오 메인 프로젝트

---

## 1. 프로젝트 개요

### 한 줄 요약

**특허 문서를 AI로 검색·분석하는 RAG 기반 인텔리전스 플랫폼**

### 문제 정의

| 기존 (TechLens) | 한계 |
|---|---|
| "삼성전자"로 키워드 검색 | 정확한 키워드를 알아야만 검색 가능 |
| 제목에 키워드가 있어야 나옴 | "배터리 수명 기술" → "에너지 밀도 향상" 특허 못 찾음 |
| 목록만 보여줌 | 특허 내용을 직접 읽어야 함 |

### 해결 (TechDocs)

```
자연어로 질문 → 의미 기반 검색 → AI가 요약·분석해서 답변
```

### 타겟 사용자

- 기업 R&D팀 (기술 동향 조사)
- 변리사 (유사 특허 탐색)
- 스타트업 (경쟁사 특허 분석)

### 핵심 기능 4가지

**1. AI 특허 검색 (메인)**
```
사용자: "전기차 배터리 냉각 관련 최신 특허 알려줘"
  → 질문을 벡터로 변환 (임베딩)
  → Pinecone에서 유사 특허 검색 (벡터 + BM25 하이브리드)
  → 검색된 특허 + 질문을 LLM에 전달
  → AI 답변: "관련 특허 5건입니다. 1. 수냉식 배터리 냉각 장치 (삼성SDI)..."
```

**2. 특허 문서 업로드**
```
사용자가 PDF/텍스트 업로드
  → 텍스트 추출 → 청킹 → 임베딩 → Pinecone 저장
  → 이후 AI 검색 대상에 포함
```

**3. 유사 특허 비교**
```
특허 A 선택 → "이거랑 비슷한 특허 찾아줘"
  → 해당 특허의 임베딩과 유사도 높은 특허 검색
  → 유사도 점수와 함께 표시
```

**4. 특허 탐색 브라우징**
```
업종/기간별 특허 브라우징
  → 수집된 특허 목록 조회
  → 클릭하면 AI 요약 제공
```

### 사용 시나리오

```
시나리오 1 — 기술 조사:
  "2차전지 열 관리 기술 특허 알려줘"
  → AI: "관련 특허 5건을 찾았습니다.
        1. 수냉식 배터리 냉각 장치 (삼성SDI, 2024)
        2. 히트파이프 기반 열관리 (LG에너지솔루션, 2024) ..."

시나리오 2 — 특허 분석:
  "이 특허의 핵심 청구항을 요약해줘"
  → AI: "본 특허는 ... 기술에 관한 것으로, 핵심 청구항은 ..."

시나리오 3 — 유사 특허 탐색:
  특허 A 선택 → "비슷한 특허 찾아줘"
  → AI: 벡터 유사도로 관련 특허 5건 + 유사도 점수 표시
```

### 페이지 구성

```
┌─────────────────────────────────────────────┐
│ 1. 메인 (AI 검색)                            │
│    자연어 질문 → AI 답변 + 출처 특허 카드     │
├─────────────────────────────────────────────┤
│ 2. 특허 탐색                                 │
│    업종/기간별 브라우징 + AI 요약              │
├─────────────────────────────────────────────┤
│ 3. 문서 업로드                               │
│    PDF/텍스트 → 임베딩 → 검색 대상 추가       │
├─────────────────────────────────────────────┤
│ 4. 분석 대시보드                             │
│    검색 기록, 자주 나오는 IPC 분류 등         │
└─────────────────────────────────────────────┘
```

### 데이터 전략

```
초기 시딩: KIPRIS API 100회 호출 → 특허 ~1000건 수집 → 임베딩 → Pinecone 저장
추가 데이터: 사용자 PDF 업로드 → 자동 임베딩 → Pinecone 추가
검색 시: Pinecone에서만 검색 (KIPRIS 재호출 불필요)
KIPRIS 월 1000회 = 시딩 100회 + 테스트/데모 여유 900회
```

---

## 2. 기술 스택

| 영역 | 기술 | 선택 이유 |
|---|---|---|
| Backend | FastAPI (Python) | JD 요구: Python 백엔드, async 지원 |
| RAG Framework | LangChain | JD 요구: RAG 파이프라인, 업계 표준 |
| Vector DB | Pinecone (무료 티어) | JD 요구: 벡터DB, 관리형 서비스 |
| Embedding | HuggingFace sentence-transformers (로컬) | 무료, 로컬 실행, 768차원 |
| LLM | Ollama + llama3 8B (로컬) | 무료, 로컬 실행, 프로덕션은 OpenAI/Azure 교체 가능 |
| Frontend | Next.js + TypeScript + shadcn/ui | App Router, 파일 기반 라우팅 |
| Container | Docker + docker-compose | JD 요구: 컨테이너 기반 운영 |
| Deploy | Render (BE) + Vercel (FE) | JD 요구: 클라우드 배포, 무료 티어 |
| CI/CD | GitHub Actions | JD 요구: MLOps, 자동 빌드/테스트/배포 |
| Data | KIPRIS Open API | 특허 데이터 소스, 월 1000회 무료 |

> **비용 전략**: 개발/데모는 전부 무료(로컬 LLM + 로컬 임베딩). 프로덕션 전환 시 OpenAI 또는 Azure OpenAI로 config만 교체하면 됨 → 면접에서 "비용 최적화 설계" 어필 가능

---

## 3. 아키텍처

### 검색 흐름

```
[사용자] ─── 자연어 질문 ───> [React FE]
                                  │
                             POST /api/search
                                  │
                             [FastAPI BE]
                                  │
                   ┌──────────────┼──────────────┐
                   │              │              │
             [Embedding]    [Pinecone]      [Ollama/llama3]
             (HuggingFace)  (유사도 검색)    (답변 생성)
                   │              │              │
                   └──────────────┼──────────────┘
                                  │
                            검색 결과 + AI 답변
```

### 데이터 인제스트 흐름

```
[KIPRIS API] → [특허 수집] → [Document 변환] → [텍스트 청킹]
                                                      │
                                                [임베딩 변환]
                                                      │
                                                [Pinecone 저장]
```

---

## 4. 디렉토리 구조

```
TechDocs/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI 앱 진입점
│   │   ├── config.py                # 환경변수 (pydantic-settings)
│   │   ├── dependencies.py          # DI: Pinecone, LLM chain
│   │   │
│   │   ├── api/                     # 엔드포인트
│   │   │   ├── router.py            # 라우터 통합
│   │   │   ├── search.py            # /api/search (RAG 검색)
│   │   │   ├── ingest.py            # /api/ingest (데이터 인제스트)
│   │   │   ├── patents.py           # /api/patents (특허 조회)
│   │   │   └── health.py            # /health
│   │   │
│   │   ├── core/                    # RAG 핵심 로직
│   │   │   ├── rag_pipeline.py      # RAG 파이프라인 (검색→컨텍스트→답변)
│   │   │   ├── embeddings.py        # 임베딩 모델 래퍼
│   │   │   ├── vectorstore.py       # Pinecone 클라이언트
│   │   │   ├── llm.py               # LLM 클라이언트
│   │   │   └── prompts.py           # 프롬프트 템플릿
│   │   │
│   │   ├── ingestion/               # 데이터 수집 파이프라인
│   │   │   ├── kipris_client.py     # KIPRIS API 호출
│   │   │   ├── document_loader.py   # 특허 → LangChain Document
│   │   │   ├── text_splitter.py     # 청킹 (500자, overlap 50)
│   │   │   └── pipeline.py          # 인제스트 오케스트레이션
│   │   │
│   │   ├── models/                  # Pydantic 스키마
│   │   │   ├── search.py
│   │   │   ├── patent.py
│   │   │   └── ingest.py
│   │   │
│   │   └── utils/
│   │       └── logger.py
│   │
│   ├── scripts/
│   │   ├── seed_patents.py          # 초기 데이터 시딩
│   │   └── test_pipeline.py         # E2E 테스트
│   │
│   ├── tests/
│   │   ├── test_rag_pipeline.py
│   │   ├── test_search_api.py
│   │   └── test_ingestion.py
│   │
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── app/                      # Next.js App Router
│   │   │   ├── layout.tsx            # 루트 레이아웃
│   │   │   ├── page.tsx              # 메인 (AI 검색)
│   │   │   ├── explore/
│   │   │   │   └── page.tsx          # 특허 탐색
│   │   │   ├── upload/
│   │   │   │   └── page.tsx          # 문서 업로드
│   │   │   └── dashboard/
│   │   │       └── page.tsx          # 분석 대시보드
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn/ui
│   │   │   ├── search/
│   │   │   │   ├── SearchBar.tsx     # 검색 입력
│   │   │   │   ├── AiAnswer.tsx      # LLM 답변 (마크다운)
│   │   │   │   └── SearchResults.tsx # 출처 특허 카드
│   │   │   └── patent/
│   │   │       ├── PatentCard.tsx
│   │   │       └── PatentDetail.tsx
│   │   │
│   │   ├── lib/
│   │   │   ├── api.ts               # fetch 기반 API 호출
│   │   │   └── utils.ts             # cn() 등 유틸
│   │   │
│   │   ├── hooks/
│   │   │   └── useSearch.ts          # React Query 기반
│   │   │
│   │   ├── store/
│   │   │   └── searchStore.ts        # Zustand
│   │   │
│   │   └── types/
│   │       ├── search.ts
│   │       └── patent.ts
│   │
│   ├── Dockerfile
│   ├── next.config.ts
│   ├── tailwind.config.js
│   └── package.json
│
├── docker-compose.yml                # 서비스 오케스트레이션
├── .gitignore
└── docs/
    ├── ARCHITECTURE.md
    └── API.md
```

---

## 5. 환경변수

### backend/.env.example

```env
# LLM (로컬 Ollama — 무료)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3

# 임베딩 (로컬 HuggingFace — 무료)
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

# 벡터DB (Pinecone 무료 티어)
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX_NAME=techdocs-patents

# 데이터 소스
KIPRIS_API_KEY=...
KIPRIS_BASE_URL=http://plus.kipris.or.kr/kipo-api/kipi

# 프론트엔드
FRONTEND_URL=http://localhost:5173

# (선택) 프로덕션용 — config 교체만으로 전환 가능
# OPENAI_API_KEY=sk-...
# LLM_PROVIDER=openai  (기본값: ollama)
```

### 필요한 것

| 항목 | 방법 | 비용 |
|---|---|---|
| Ollama | https://ollama.com 설치 → `ollama pull llama3` | 무료 |
| Pinecone | https://app.pinecone.io 가입 | 무료 |
| KIPRIS | https://plus.kipris.or.kr API 키 발급 | 무료 |
| HuggingFace 모델 | 첫 실행 시 자동 다운로드 (~90MB) | 무료 |

---

## 6. 단계별 구현 계획

### Phase 0: 프로젝트 셋업 (1일)

- [ ] 디렉토리 구조 생성
- [ ] Python 가상환경 + requirements.txt
- [ ] Frontend: Next.js + TS + Tailwind + shadcn 셋업 (`npx create-next-app@latest`)
- [ ] Git 초기화 + .gitignore
- [ ] API 키 발급 (OpenAI, Pinecone, KIPRIS)

**requirements.txt:**
```
fastapi==0.115.*
uvicorn[standard]==0.34.*
langchain==0.3.*
langchain-community==0.3.*
langchain-pinecone==0.2.*
langchain-huggingface==0.1.*
pinecone-client==5.*
sentence-transformers==3.*
pydantic-settings==2.*
httpx==0.28.*
python-dotenv==1.*
xmltodict==0.14.*
```

### Phase 1: 백엔드 기초 + KIPRIS 연동 (2일)

- [ ] FastAPI 앱 생성 (main.py, config.py)
- [ ] CORS 설정
- [ ] /health 엔드포인트
- [ ] KIPRIS API 클라이언트 (kipris_client.py)
- [ ] 특허 Pydantic 모델 (models/patent.py)

### Phase 2: 인제스트 파이프라인 (3일) — JD: RAG 파이프라인, 벡터DB

- [ ] Document 변환 (특허 → LangChain Document)
- [ ] 텍스트 청킹 (RecursiveCharacterTextSplitter, 500자)
- [ ] 임베딩 래퍼 (HuggingFace sentence-transformers, 로컬)
- [ ] Pinecone 인덱스 관리 (생성/upsert/query)
- [ ] 인제스트 파이프라인 오케스트레이션
- [ ] 시딩 스크립트 (특허 100~200건)
- [ ] /api/ingest 엔드포인트

### Phase 3: RAG 검색 파이프라인 (2일) — JD: RAG, 검색시스템

- [ ] LLM 클라이언트 (Ollama llama3, 프로덕션은 OpenAI/Azure 교체 가능)
- [ ] 프롬프트 템플릿 (특허 검색 특화)
- [ ] RAG 파이프라인 (검색 → 컨텍스트 → 답변)
- [ ] /api/search 엔드포인트
- [ ] 요청/응답 스키마

### Phase 4: 프론트엔드 (2~3일)

- [ ] Next.js App Router 페이지 구성 (/, /explore, /upload, /dashboard)
- [ ] API 호출 함수 (fetch 기반)
- [ ] SearchBar 컴포넌트
- [ ] AiAnswer 컴포넌트 (마크다운 렌더링)
- [ ] SearchResults + PatentCard
- [ ] React Query + Zustand 연동

### Phase 5: Docker + 배포 (2일) — JD: 컨테이너, 클라우드

- [ ] backend/Dockerfile
- [ ] frontend/Dockerfile
- [ ] docker-compose.yml
- [ ] Render 배포 (BE)
- [ ] Vercel 배포 (FE)

### Phase 6: 테스트 + 문서화 (2일)

- [ ] pytest 테스트
- [ ] E2E 파이프라인 테스트
- [ ] ARCHITECTURE.md (아키텍처 + 기술 선택 이유)
- [ ] README.md (실행 방법 + 스크린샷)

---

## 7. 비용 분석

| 항목 | 선택 | 비용 |
|---|---|---|
| LLM | Ollama llama3 (로컬) | **$0** |
| 임베딩 | HuggingFace sentence-transformers (로컬) | **$0** |
| 벡터DB | Pinecone 무료 티어 (1 인덱스, 2GB) | **$0** |
| 백엔드 배포 | Render 무료 | **$0** |
| 프론트 배포 | Vercel 무료 | **$0** |
| CI/CD | GitHub Actions 무료 | **$0** |
| 데이터 | KIPRIS 월 1000회 | **$0** |
| **총 비용** | | **$0 (완전 무료)** |

> 프로덕션 전환 시: Ollama → OpenAI/Azure OpenAI, HuggingFace → OpenAI Embedding으로 config만 교체

---

## 8. JD 키워드 커버리지

| JD 요구사항 | TechDocs 해당 부분 |
|---|---|
| RAG 파이프라인 자동화 | Phase 2-3: 인제스트 → 임베딩 → 벡터 저장 → 검색 → 답변 |
| 벡터DB 이해도 | Pinecone: 인덱스 관리, upsert, similarity search |
| Python 백엔드 | FastAPI + async, Pydantic 스키마 검증 |
| LLM 경험 | GPT-4o-mini, LangChain, 프롬프트 엔지니어링 |
| 컨테이너 | Docker 멀티스테이지 빌드, docker-compose |
| 클라우드 배포 | Render (Docker) + Vercel |
| 검색시스템 | 벡터 유사도 검색 (코사인) + BM25 하이브리드 검색 |
| 데이터 파이프라인 | KIPRIS 수집 → 변환 → 청킹 → 임베딩 → 저장 |
| MLOps | GitHub Actions CI/CD (빌드 → 테스트 → 배포 자동화) |

---

## 9. 일정 (2~3주)

| 기간 | Phase | 일수 |
|---|---|---|
| 1주차 전반 | Phase 0 + 1 (셋업 + KIPRIS) | 3일 |
| 1주차 후반 | Phase 2 (인제스트 파이프라인) | 3일 |
| 2주차 전반 | Phase 3 (RAG 검색) | 2일 |
| 2주차 후반 | Phase 4 (프론트엔드) | 3일 |
| 3주차 전반 | Phase 5 (Docker + 배포) | 2일 |
| 3주차 후반 | Phase 6 (테스트 + 문서화) | 2일 |

---

## 10. 면접 핵심 설명 포인트

1. **왜 만들었나**: TechLens 키워드 검색의 한계 → RAG로 해결
2. **왜 RAG인가**: 특허는 LLM 학습 데이터에 없는 도메인 특화 데이터. Fine-tuning보다 비용 효율적이고 실시간 업데이트 가능
3. **청킹 전략**: 특허 초록 평균 200~600자 → 500자로 설정, overlap 50으로 문맥 유지
4. **Pinecone 선택**: 관리형 → 운영 부담 제로, cosine similarity가 텍스트 유사도에 적합
5. **Ollama 로컬 LLM**: 비용 $0으로 개발/데모 가능. 프로덕션은 config 한 줄로 OpenAI/Azure 전환 → "비용 최적화 + 확장 가능한 설계"
6. **하이브리드 검색**: 벡터 검색(의미)만으로 놓치는 정확한 키워드 매칭을 BM25로 보완 → 검색 정확도 향상
7. **CI/CD**: GitHub Actions로 push 시 자동 테스트 + 빌드 + 배포 → MLOps 기본 파이프라인
