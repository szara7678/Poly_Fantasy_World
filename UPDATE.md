## 2025-08-12
- Build: 전언(Build/Tag) 멀티를 건설 시간에 적용. 도로 청사진 완공 시 `RoadNetwork.addRoad`로 타일 생성.
- Gather: `NodeRegenSystem`에 `gatherTick` 추가. 전언(Gather/Forest, Gather/IronMine)과 작업자 수를 반영하여 Wood/Stone 자동 적재.
- UI: `EdictPanel`에 채집 전언 버튼 2종 추가.
- Docs: README의 현재 구현 섹션을 MVP 핵심 루프에 맞게 갱신.
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
- GitHub Pages 배포: `.github/workflows/gh-pages.yml`를 `gh-pages` 브랜치 푸시 방식으로 구성 (`peaceiris/actions-gh-pages@v3` 사용)

### 추가 구현
- `NodeRegenSystem`을 고정틱 루프에 연결
- 성역 반경 링 미리보기 렌더러 추가(`createSanctumRenderSystem`)
- FoW 간이 오버레이 및 토글 추가(`createFogOfWarRenderSystem` + UI 버튼)
- 월드 상태에 플레이어 마나 추가(최대치/재생률). 성역화 시 마나 180 소모, 성역 유지비 −0.2/s 적용

### Fixes
- GH Pages 404 수정: `vite.config.ts`의 `base`를 `'/Poly_Fantasy_World/'`로 변경(리포지토리 경로와 일치)

