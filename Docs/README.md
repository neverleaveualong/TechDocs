# TechDocs 문서 안내

이 폴더는 TechDocs의 제품·설계 문서와 작업 규칙을 관리합니다. 코드나 문서를 수정하기 전에 루트 [`AGENTS.md`](../AGENTS.md)와 아래 하네스 문서를 순서대로 확인합니다.

## 작업 전 필수 확인

1. [`CODING_RULES.md`](harness/CODING_RULES.md): 이름, 파일 상단 설명 및 로직 주석 규칙
2. [`GIT_RULES.md`](harness/GIT_RULES.md): 브랜치, 커밋, PR 및 병합 규칙
3. [PR 본문 템플릿](../.github/pull_request_template.md): PR 작성 형식

작업 영역에 따라 다음 문서를 추가로 확인합니다.

- Backend: [`BACKEND_RULES.md`](harness/BACKEND_RULES.md), [`API.md`](API.md), [`DATABASE.md`](DATABASE.md)
- Frontend: [`FRONTEND_RULES.md`](harness/FRONTEND_RULES.md), [`API.md`](API.md)

## 제품 의도 확인

- [`PRODUCT_BRIEF.md`](PRODUCT_BRIEF.md): 서비스 목적, 주요 사용자, 핵심 흐름 및 리팩토링 우선순위
- 기능 또는 구조를 크게 변경하기 전에 이 문서를 확인하고, 구현과 기획 의도가 다르면 원하는 결과를 기준으로 작업 범위를 정합니다.

## 현재 설계 문서

- [`API.md`](API.md): 일반 JSON, 검색 NDJSON 및 ClaimLens SSE 계약
- [`DATABASE.md`](DATABASE.md): 관계형 DB, SQLite FTS5 및 Pinecone 저장 구조
- [`DATABASE_REVIEW.md`](DATABASE_REVIEW.md): DB 컬럼 사용처, RAG·ClaimLens 흐름 및 리팩토링 판단 기준
- [`CLAIMLENS_REDESIGN.md`](CLAIMLENS_REDESIGN.md): 실제 특허 표본 검증 기반 ClaimLens 사용자 흐름과 청구항 비교 목표 설계
- [`PAIN_POINTS.md`](PAIN_POINTS.md): 전체 코드 점검 결과와 우선순위별 리팩토링 백로그

## 문서 관리 원칙

- 하네스의 세부 규칙은 `Docs/harness/`에서 관리합니다.
- 실제 코드, 설정 및 CI와 문서 내용이 다르면 구현을 먼저 확인한 뒤 문서를 함께 수정합니다.
- 일회성 작업 기록, 과거 계획, 생성된 평가 결과 및 `.pr-body-*` 같은 임시 PR 본문은 저장소에 남기지 않습니다.
- Markdown 문서를 추가하거나 이동 또는 삭제하면 루트 [`README.md`](../README.md)의 문서 지도를 함께 갱신합니다.
