## 2025-08-12

- Vite + React + TS 템플릿으로 전환, 기본 의존성 설치
- `vite.config.ts`: `base: '/polyfantasy/'`, React 플러그인, Vitest 설정 추가
- ESLint/Prettier/Vitest 설정 및 스크립트 추가
- 초기 구조 생성: `src/ecs`, `src/systems`, `src/render/three`, `src/ui`
- 시스템 스텁: `SanctumSystem`, `FogOfWarSystem`, `NodeRegenSystem`, `Loop`
- 렌더: `SceneRoot`로 기본 씬/카메라/조명/그리드
- UI: `App`, `SanctumPanel`, `DebugPanel`
- 스타일 단순화: 풀스크린 레이아웃
- 테스트 셋업: `test/setup.ts`

