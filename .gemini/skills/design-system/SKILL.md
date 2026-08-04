---
name: design-system
description: Evolve the TechDocs Tailwind CSS 4 design system and user experience with reusable tokens, responsive components, accessibility, and restrained motion. Use for visual redesigns, color or typography changes, layout and navigation work, interaction states, modal behavior, and accessibility fixes in the frontend.
---

# Design System

기존 Pretendard, Remix Icon, Tailwind 4 `@theme` 토큰과 brand/teal 팔레트를 우선
재사용한다. 새 UI 라이브러리나 모션 의존성은 필요성과 번들 비용을 검토하지 않고 추가하지
않는다.

## 📋 표준 작업 워크플로우

1. **UI 감사**: 대상 흐름의 모바일·데스크톱 화면, hover/focus/disabled/loading/error/empty
   상태와 키보드 순서를 확인한다. 반복되는 색상·간격·radius·shadow를 식별한다.
2. **토큰과 패턴으로 구현**: 공통 값은 `frontend/app/globals.css`의 `@theme` 또는 공통
   컴포넌트로 승격한다. semantic HTML을 우선하고, 모달 focus 관리와 명확한 label을
   제공한다. 모션은 상태 이해에 필요한 범위에서 CSS로 구현한다.
3. **시각·접근성 검증**: 320px 수준의 작은 화면부터 넓은 화면까지 overflow와 layout
   shift를 확인한다. 키보드, 대비, reduced motion을 점검한 뒤 정적 검증과 build를 실행한다.

## 🛠️ 빌드/타입체크/테스트 실행 커맨드

```bash
cd frontend && npm run lint
cd frontend && npx tsc --noEmit
cd frontend && npm run build
# Playwright 기반이 준비된 경우
cd frontend && npx playwright test
```

## 🛡️ Quality Checklist

- [ ] 색상·간격·타이포·radius가 재사용 토큰 또는 공통 패턴을 사용한다.
- [ ] 텍스트 대비, focus-visible, label/name, landmark, heading 순서가 적절하다.
- [ ] 모든 기능을 키보드로 사용할 수 있고 모달 focus가 갇히고 복원된다.
- [ ] 320px 모바일과 데스크톱에서 가로 overflow, 겹침, 잘림이 없다.
- [ ] `prefers-reduced-motion`에서 불필요한 animation/transition이 억제된다.
- [ ] 장식적 모션이 입력을 막지 않고 layout 속성을 과도하게 animate하지 않는다.
- [ ] 새 의존성이 필요하면 접근성·번들 영향과 대안을 완료 보고에 기록했다.
