# 실행 환경 및 CI

- 수정일자: 2026-07-30 15:35 KST
- 작성자: Woohyun Sim
- 목적: 로컬 실행에 필요한 환경, 필수 환경변수, CI 검증 범위를 정리합니다.

## 목차

- [4-1. 실행 환경](#4-1-실행-환경)
- [4-2. 로컬 실행](#4-2-로컬-실행)
- [4-3. 필수 환경변수](#4-3-필수-환경변수)
- [4-4. 주요 선택 환경변수](#4-4-주요-선택-환경변수)
- [4-5. 보안 원칙](#4-5-보안-원칙)
- [4-6. CI 동작](#4-6-ci-동작)
- [4-7. CI에서 현재 검사하지 않는 항목](#4-7-ci에서-현재-검사하지-않는-항목)
- [4-8. 로컬 검증 명령](#4-8-로컬-검증-명령)

## 4-1. 실행 환경

- Python: `3.12`
- Node.js: `20 이상`
- Database: PostgreSQL
- 선택 실행 방식: Docker Compose

## 4-2. 로컬 실행

- 백엔드:
  - `cd backend`
  - `python -m venv .venv`
  - macOS·Linux: `source .venv/bin/activate`
  - Windows: `.venv\\Scripts\\activate`
  - `pip install -r requirements.txt`
  - `cp .env.example .env`
  - `uvicorn app.main:app --reload --port 8000`
- 프론트엔드:
  - `cd frontend`
  - `npm ci`
  - `npm run dev`
- Docker Compose:
  - 저장소 루트에서 `docker compose up --build`
  - 백엔드: `http://localhost:8000`
  - 프론트엔드: `http://localhost:3000`

## 4-3. 필수 환경변수

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | 답변 생성과 임베딩 |
| `PINECONE_API_KEY` | 특허 벡터 검색 |
| `PINECONE_INDEX_NAME` | Pinecone 인덱스 이름 |
| `KIPRIS_API_KEY` | 특허 검색·수집 |
| `DATABASE_URL` | PostgreSQL 접속 정보 |
| `FRONTEND_URL` | 백엔드 CORS 허용 주소 |
| `NEXT_PUBLIC_API_URL` | 프론트엔드가 호출할 백엔드 주소 |

## 4-4. 주요 선택 환경변수

- `OPENAI_MODEL`:
  - 답변 생성 모델입니다.
- `OPENAI_EMBEDDING_MODEL`:
  - 문서 임베딩 모델입니다.
- `RAG_NAMESPACE`:
  - 일반 검색 데이터 namespace입니다.
- `AGENT_NAMESPACE`:
  - ClaimLens Agent 데이터 namespace입니다.
- `KIPRIS_BASE_URL`:
  - KIPRIS API 기본 주소입니다.
- `AUTO_INGEST_SEARCH_ATTEMPTS`:
  - 자동 수집 후 재검색 시도 횟수입니다.
- `AUTO_INGEST_RAG_RERANK_MIN_SCORE`:
  - RAG 자동 수집 후보의 최소 점수입니다.
- `AUTO_INGEST_CLAIMLENS_RERANK_MIN_SCORE`:
  - ClaimLens 자동 수집 후보의 최소 점수입니다.

## 4-5. 보안 원칙

- 실제 API 키와 비밀번호는 `.env` 또는 배포 플랫폼 secret에만 저장합니다.
- `.env` 파일은 커밋하지 않고 `backend/.env.example`만 공유합니다.
- 환경변수 값은 README와 문서에 실제 값을 기록하지 않습니다.

## 4-6. CI 동작

- workflow:
  - `.github/workflows/ci.yml`
- 실행 조건:
  - `main`, `develop` push
  - `main`, `develop` 대상 Pull Request
- Backend job:
  - Python 3.12 설정
  - `backend/requirements.txt` 설치
  - `app/main.py`, `app/config.py` 문법 검사
  - 핵심 모델 모듈 존재 여부 검사
- Frontend job:
  - Node.js 20 설정
  - `frontend/package-lock.json` 기준 `npm ci`
  - Next.js production build 실행

## 4-7. CI에서 현재 검사하지 않는 항목

- 백엔드 전체 pytest 자동 실행
- 프론트엔드 린트와 TypeScript 검사
- 외부 OpenAI·Pinecone·KIPRIS 실서비스 연결
- 실제 운영 데이터베이스 migration과 rollback

## 4-8. 로컬 검증 명령

- 백엔드 테스트: `cd backend && pytest`
- 프론트엔드 린트: `cd frontend && npm run lint`
- 프론트엔드 타입 검사: `cd frontend && npx tsc --noEmit`
- 프론트엔드 빌드: `cd frontend && npm run build`
