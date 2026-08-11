# Frontend 작업 규칙

이 문서는 `frontend/`를 수정할 때 적용합니다. 공통 이름·주석 규칙은 `CODING_RULES.md`, Git 작업 규칙은 `GIT_RULES.md`를 함께 따릅니다.

## 작업 전 확인

1. `Docs/PRODUCT_BRIEF.md`에서 사용자와 핵심 사용 흐름을 확인합니다.
2. `Docs/API.md`에서 요청·응답과 NDJSON·SSE 계약을 확인합니다.
3. 설치된 `frontend/node_modules/next/dist/docs/`에서 변경과 관련된 Next.js 문서를 확인합니다.
4. 페이지, 하위 컴포넌트, Hook, `lib/api.ts`, `types/`와 관련 호출부를 함께 읽습니다.

## 구조와 책임

| 경로 | 책임 |
| --- | --- |
| `app/` | route, layout, Provider와 화면 조합 |
| `components/` | 재사용 가능한 UI와 결과 표시 |
| `hooks/` | 스트림 수명주기, 복합 상태 전이 및 화면 동작 |
| `lib/api.ts` | Backend URL, HTTP 요청, stream parsing과 오류 변환 |
| `types/` | API 응답과 화면에서 공유하는 데이터 계약 |

- Page는 route 입력과 화면 조합을 담당하고, 큰 결과 UI나 복잡한 요청 상태를 직접 구현하지 않습니다.
- Component는 전달받은 데이터 표시와 사용자 이벤트 전달에 집중합니다.
- API 호출을 여러 컴포넌트에서 직접 작성하지 않고 `lib/api.ts`에 모읍니다.
- 반복되는 UI만 공통화하며 한 번만 쓰이는 작은 표현까지 성급하게 추상화하지 않습니다.

## 상태 관리

- 서버 조회·변경·캐시는 TanStack Query를 사용합니다.
- NDJSON·SSE처럼 순서가 있는 스트림 상태는 전용 Hook과 `useReducer`로 관리합니다.
- 입력값, modal, 펼침 상태처럼 화면에만 필요한 값은 component `useState`를 사용합니다.
- 같은 서버 데이터를 별도 로컬 state로 복사하지 않습니다.
- 새 요청 시작, mode 전환, component unmount 시 기존 stream을 취소합니다.
- 늦게 도착한 이전 요청이 현재 화면을 덮지 않도록 요청 식별과 stale event 무시 동작을 유지합니다.

## API와 타입

- Backend의 snake_case, camelCase, null 가능 여부를 추측으로 바꾸지 않고 실제 계약을 타입에 반영합니다.
- `any`, 무근거 type assertion 또는 lint disable로 계약 오류를 숨기지 않습니다.
- 일반 HTTP 실패와 HTTP 200 내부의 NDJSON·SSE `error` 이벤트를 모두 실패 상태로 처리합니다.
- NDJSON chunk가 줄 중간에서 나뉘거나 SSE frame이 여러 read에 걸쳐 들어오는 경우를 고려해 buffer를 유지합니다.
- 새로운 이벤트를 추가하면 parser, union type, reducer 및 표시 component를 함께 확인합니다.
- 환경별 Backend 주소는 `NEXT_PUBLIC_API_URL`을 사용하고 코드에 새 운영 URL을 직접 추가하지 않습니다.

## React와 Next.js

- Hook은 조건문, 반복문 또는 조기 return 뒤에서 호출하지 않습니다.
- Client Component는 browser API, state, effect 또는 event handler가 필요한 경계에만 사용합니다.
- effect는 외부 시스템 동기화와 cleanup에 사용하고 파생 값 계산에 사용하지 않습니다.
- render 중 state를 변경하지 않고 state 변경이 필요한 경우 사용자 이벤트 또는 명확한 effect에서 처리합니다.
- list key는 index보다 안정적인 데이터 식별자를 우선합니다.
- production build와 hydration에서 동작이 달라질 수 있는 browser 전용 코드를 확인합니다.

## UI와 접근성

- button, link, heading, label 등 의미에 맞는 HTML 요소를 사용합니다.
- 키보드로 검색, mode 전환, modal 열기·닫기 및 주요 결과 탐색이 가능해야 합니다.
- loading, 빈 결과, 오류, 중단 및 성공 상태를 화면에서 구분합니다.
- 색상만으로 상태를 전달하지 않고 텍스트나 아이콘을 함께 제공합니다.
- 모바일과 desktop에서 긴 특허 제목, 출원번호, Markdown 답변 및 표가 레이아웃을 깨지 않는지 확인합니다.
- 프로젝트의 기존 Tailwind 토큰과 공통 component를 우선 사용합니다.

## 주석과 리팩토링

- UI가 무엇을 그리는지 반복하는 주석은 제거합니다.
- stream 취소, 자동 scroll, hydration, 접근성 우회처럼 구현 이유가 코드만으로 명확하지 않은 곳에 한국어 주석을 남깁니다.
- Page에서 분리할 때 입력 props와 event callback을 명시하고 Backend 응답 전체를 무분별하게 전달하지 않습니다.
- 화면 변경과 API·상태 구조 변경은 가능한 한 분리하여 검증합니다.

## 검증

```bash
cd frontend
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

변경한 사용자 흐름은 loading, 성공, 빈 결과, 오류, 취소 및 연속 요청을 확인합니다. API 이벤트를 변경하면 실제 Backend payload 형태의 fixture로 런타임 검증과 selector를 테스트합니다. 비동기 Server Component는 Vitest 대신 E2E 테스트로 검증합니다.
