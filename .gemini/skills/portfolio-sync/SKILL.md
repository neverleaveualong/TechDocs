---
name: portfolio-sync
description: Measure and document verified TechDocs refactoring outcomes using reproducible Lighthouse, Web Vitals, test coverage, bundle, and API latency evidence. Use after a refactor to compare before and after results, update README or technical portfolio documentation, create architecture summaries, and prevent unsupported performance claims.
---

# Portfolio Sync

문서보다 코드와 원시 측정 결과를 우선한다. 같은 환경의 before/after가 없으면 개선률을
계산하지 않고 `기준선 없음` 또는 `확인 필요`로 표시한다. 외부 취업 포트폴리오는 사용자가
명시적으로 요청한 경우에만 수정한다.

## 📋 표준 작업 워크플로우

1. **측정 계획 고정**: commit, 실행 모드, URL, Node/Python 버전, viewport, warm-up,
   반복 횟수, 데이터·외부 API 조건과 지표를 먼저 정한다. Lighthouse는 median run과
   LCP/CLS/INP 또는 TBT, 백엔드는 p50/p95와 오류율을 사용한다.
2. **원시 증거 수집·비교**: 동일 조건에서 before/after를 여러 번 측정하고 JSON/coverage
   결과와 명령을 보존한다. `% = (before - after) / before * 100` 같은 계산 방향을 지표에
   맞게 명시하며 인과관계가 불확실하면 상관관계로만 서술한다.
3. **문서 동기화**: `README.md`와 관련 `docs/`에 문제→행동→검증→결과 순서로 반영한다.
   아키텍처·API 문서는 실제 코드와 대조하고, 링크와 Mermaid 렌더링을 점검한다.

## 🛠️ 빌드/타입체크/테스트 실행 커맨드

```bash
cd frontend && npm run lint
cd frontend && npx tsc --noEmit
cd frontend && npm run build
cd backend && python -m pytest

# 로컬 production 서버를 별도 터미널에서 실행한 뒤, Lighthouse CLI가 설치된 환경에서
cd frontend && npm run start
npx lighthouse http://localhost:3000 --output=json --output-path=./lighthouse.json

# 커버리지 기반이 구성된 경우에만
cd frontend && npm run test:coverage
cd backend && python -m pytest --cov=app --cov-report=term-missing
```

Lighthouse/coverage 도구가 프로젝트 의존성에 없으면 임의 설치나 숫자 생성을 하지 말고,
실행 불가 사유와 필요한 설정을 보고한다.

## 🛡️ Quality Checklist

- [ ] 모든 수치에 commit, 날짜, 환경, 명령, 반복 횟수와 원시 결과 위치가 있다.
- [ ] before/after가 같은 조건이며 median과 표본 수가 제시된다.
- [ ] Lighthouse 점수만이 아니라 핵심 지표와 기능 회귀 결과를 함께 기록한다.
- [ ] 커버리지와 지연시간 수치를 추정하거나 반올림해 과장하지 않았다.
- [ ] 변경 내용의 기술적 효과와 사용자·업무 효과를 구분해 서술했다.
- [ ] README, `docs/ARCHITECTURE.md`, `docs/API.md`가 실제 코드와 일치한다.
- [ ] 문서 링크·이미지·Mermaid와 최종 검증 명령이 정상이다.
