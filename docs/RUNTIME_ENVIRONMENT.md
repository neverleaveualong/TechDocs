# 실행 환경 및 운영 참고

- 수정일자: 2026-07-30 13:04 KST
- 작성자: 심우현
- 목적: 로컬 실행, 환경변수, CI 검증 범위, 향후 고도화 방향을 애플리케이션 설명과 분리해 관리합니다.

## 로컬 실행 준비

- 요구사항:
  - Python 3.12
  - Node.js 20 이상
  - PostgreSQL
  - Docker를 사용하는 경우 Docker Compose
- 백엔드 설치:
  - `cd backend`
  - `python -m venv .venv`
  - macOS 또는 Linux: `source .venv/bin/activate`
  - Windows: `.venv\\Scripts\\activate`
  - `pip install -r requirements.txt`
  - `cp .env.example .env`
- 프론트엔드 설치:
  - `cd frontend`
  - `npm ci`
- 애플리케이션 실행:
  - 백엔드: `uvicorn app.main:app --reload --port 8000`
  - 프론트엔드: `npm run dev`
  - Docker Compose: 저장소 루트에서 `docker compose up --build`

## 환경변수

- 비밀키:
  - `OPENAI_API_KEY`: 답변 생성과 임베딩에 사용하는 OpenAI 키입니다.
  - `PINECONE_API_KEY`: 특허 벡터 검색에 사용하는 Pinecone 키입니다.
  - `KIPRIS_API_KEY`: KIPRIS 특허 수집 API 키입니다.
- 모델과 저장소:
  - `OPENAI_MODEL`: 답변 생성 모델입니다.
  - `OPENAI_EMBEDDING_MODEL`: 임베딩 모델입니다.
  - `PINECONE_INDEX_NAME`: 특허 벡터 인덱스 이름입니다.
  - `RAG_NAMESPACE`: 일반 RAG 데이터 namespace입니다.
  - `AGENT_NAMESPACE`: Agent 또는 ClaimLens 데이터 namespace입니다.
  - `DATABASE_URL`: PostgreSQL 접속 문자열입니다.
- 외부 API:
  - `KIPRIS_BASE_URL`: KIPRIS API 기본 주소입니다.
- 자동 수집 정책:
  - `AUTO_INGEST_SEARCH_ATTEMPTS`: 일반 검색의 자동 수집 시도 횟수입니다.
  - `AUTO_INGEST_RAG_RERANK_MIN_SCORE`: RAG 자동 수집 후보의 최소 재정렬 점수입니다.
  - `AUTO_INGEST_CLAIMLENS_RERANK_MIN_SCORE`: ClaimLens 자동 수집 후보의 최소 재정렬 점수입니다.
- 웹 애플리케이션:
  - `FRONTEND_URL`: 백엔드 CORS 허용 프론트엔드 주소입니다.
  - `NEXT_PUBLIC_API_URL`: 프론트엔드가 호출할 백엔드 기본 주소입니다.
- 보안 원칙:
  - `.env` 파일과 실제 키 값은 커밋하지 않습니다.
  - 저장소에는 값이 비어 있는 `backend/.env.example`만 유지합니다.
  - 배포 환경에서는 Vercel, Render, GitHub Actions의 secret 또는 environment variable에 주입합니다.

## CI가 확인하는 범위

- workflow 위치:
  - `.github/workflows/ci.yml`
- 실행 조건:
  - `main`, `develop`에 push할 때 실행합니다.
  - `main`, `develop`을 대상으로 하는 Pull Request에서 실행합니다.
- 백엔드 job:
  - Python 3.12를 설치합니다.
  - `backend/requirements.txt`를 설치합니다.
  - `app/main.py`와 `app/config.py`의 문법을 검사합니다.
  - 핵심 모델 모듈의 존재 여부를 검사합니다.
- 프론트엔드 job:
  - Node.js 20을 설치합니다.
  - `frontend/package-lock.json` 기준으로 `npm ci`를 실행합니다.
  - Next.js production build를 실행합니다.
- 현재 CI의 한계:
  - 백엔드 전체 pytest 실행은 아직 workflow에 포함되어 있지 않습니다.
  - 프론트엔드 컴포넌트 및 스트림 상태 회귀 테스트도 아직 별도 job으로 실행되지 않습니다.
  - 외부 OpenAI, Pinecone, KIPRIS 호출을 CI에서 실서비스 방식으로 검증하지 않습니다.

## 검증 명령어

- 백엔드:
  - 전체 테스트: `cd backend && pytest`
  - 특정 테스트: `cd backend && pytest tests/test_search_stream_service.py`
- 프론트엔드:
  - 린트: `cd frontend && npm run lint`
  - 타입 검사: `cd frontend && npx tsc --noEmit`
  - production build: `cd frontend && npm run build`
- 통합 실행:
  - 백엔드가 `http://localhost:8000`에서 실행 중인지 확인합니다.
  - 프론트엔드가 `http://localhost:3000`에서 실행 중인지 확인합니다.
  - `NEXT_PUBLIC_API_URL`이 백엔드 주소를 가리키는지 확인합니다.

## 향후 고도화 방향

- 테스트 자동화:
  - 백엔드 pytest를 CI에 추가합니다.
  - React Query mutation, NDJSON 스트림, ClaimLens SSE의 회귀 테스트를 추가합니다.
  - 외부 API는 mock 또는 test double로 격리합니다.
- 검색 품질:
  - Query Rewrite와 Multi-Query RRF를 실제 검색 품질 지표와 함께 검증합니다.
  - 한국어 형태소 분석과 BM25 토큰화 전략을 비교 평가합니다.
  - Reranker 모델 로딩과 메모리 사용량을 관찰합니다.
- 운영 안정성:
  - OpenTelemetry 기반 trace와 구조화 로그를 도입합니다.
  - 스트림 연결 종료, 외부 API timeout, 자동 수집 한도 초과를 모니터링합니다.
  - 데이터베이스 백업 및 마이그레이션 절차를 별도로 정의합니다.
- 제품 확장:
  - 사용자별 검색 이력과 권한 모델을 도입합니다.
  - ClaimLens 결과에 근거 문장과 특허 원문 위치를 연결합니다.
  - 피드백 데이터를 평가셋과 검색 품질 대시보드로 연결합니다.
