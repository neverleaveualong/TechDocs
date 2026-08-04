---
name: qa-automation
description: Add and maintain deterministic TechDocs automated tests with pytest, Vitest or Jest, and Playwright. Use for regression coverage, API and stream tests, frontend unit-test setup, browser E2E flows, mocks, fixtures, accessibility checks, coverage reporting, and CI quality-gate changes.
---

# QA Automation

현재 백엔드에는 pytest 테스트가 있다. 프론트엔드에는 Playwright 패키지만 있고 Vitest/Jest
스크립트, test config, E2E spec은 없다. 도구를 도입할 때 설정·스크립트·대표 테스트·CI를
같은 변경에 포함하고, 설치되지 않은 runner의 성공을 주장하지 않는다.

## 📋 표준 작업 워크플로우

1. **위험 기반 설계**: 변경의 공개 동작과 실패 모드를 목록화하고 가장 낮은 레벨에서
   검증한다. 순수 로직은 unit, DB/API는 integration, 검색·ClaimLens 핵심 여정은 E2E로
   배치한다. bug fix는 수정 전 실패하는 회귀 테스트부터 만든다.
2. **결정론적으로 구현**: pytest fixture와 dependency override, Vitest/Jest의 모듈 mock
   또는 MSW, Playwright의 network routing을 사용한다. OpenAI/Pinecone/KIPRIS 실서비스,
   실제 secret, 임의 sleep, 실행 순서에 의존하지 않는다. locator는 role/label을 우선한다.
3. **격리·반복 검증**: 단일 테스트→관련 suite→전체 suite 순서로 실행한다. 임시 DB,
   mock, timer, browser context를 정리하고 E2E를 반복 실행해 flaky 여부를 확인한다.

## 🛠️ 빌드/타입체크/테스트 실행 커맨드

```bash
# 현재 사용 가능
cd backend && python -m pytest
cd frontend && npm run lint
cd frontend && npx tsc --noEmit
cd frontend && npm run build

# 프론트 테스트 기반을 추가하면서 package.json에 아래 script를 명시
cd frontend && npm run test
cd frontend && npm run test:coverage
cd frontend && npx playwright test
cd frontend && npx playwright test --repeat-each=3
```

Vitest와 Jest를 동시에 도입하지 않는다. React/TypeScript ESM 구성에는 특별한 제약이
없으면 Vitest를 우선하되, 선택 이유와 정확한 script를 `package.json`에 기록한다.

## 🛡️ Quality Checklist

- [ ] 테스트가 사용자 관찰 가능 동작을 검증하며 구현 세부사항에 과결합되지 않는다.
- [ ] 정상·빈 결과·검증 실패·외부 오류·timeout/취소 경로를 포함한다.
- [ ] NDJSON partial chunk/keepalive/error와 SSE frame/error를 회귀 테스트한다.
- [ ] 네트워크·시간·random·DB 상태가 통제되고 고정 sleep이 없다.
- [ ] 테스트가 독립 실행·병렬 실행 가능하며 fixture와 임시 상태를 정리한다.
- [ ] E2E locator는 role/label 우선이며 trace/screenshot은 실패 시에만 보존한다.
- [ ] 커버리지 임계값은 측정된 기준선 이후 설정하고 숫자를 임의로 만들지 않는다.
- [ ] CI와 로컬 명령이 동일하며 반복 실행 결과를 완료 보고에 남겼다.
