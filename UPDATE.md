## 2025-08-12
- Build: 전언(Build/Tag) 멀티를 건설 시간에 적용. 도로 청사진 완공 시 `RoadNetwork.addRoad`로 타일 생성.
- Gather: `NodeRegenSystem`에 `gatherTick` 추가. 전언(Gather/Forest, Gather/IronMine)과 작업자 수를 반영하여 Wood/Stone 자동 적재.
- UI: `EdictPanel`에 채집 전언 버튼 2종 추가.
- Docs: README의 현재 구현 섹션을 MVP 핵심 루프에 맞게 갱신.
 - Render: `createRoadRenderSystem` 추가, 도로 타일 타입별 색상 표시 및 `App`에 렌더 시스템 연결.
 - UI: `MarketPanel`을 `App` 우측 패널에 노출.
  - Target: 간단 타겟 시스템/패널(`TargetSystem`, `TargetPanel`) 추가. 지도 클릭으로 타겟 배치, 마커 렌더.
  - Save/Load: V2 포맷 추가(`roads`, `targets`), V1 호환 로드 유지.
  - RoadHelper: 추천선 미리보기 라인 렌더, 2m 간격 직선 도로 청사진 자동 배치, 청사진 중복 방지.
  - Citizen: 로우폴리 시민 메쉬/이동 시스템 추가. 도로 속도 계수 반영, 이동 시 FoW 탐사 스트로크 기록. 디버그 패널에 시민 소환 버튼 추가.
 - Sanctum: 반경 공식을 플랜에 맞게 수정(반경 = 18m×(레벨+1)).
 - FoW: 퇴색 시간 보정(절반으로 퇴색 ~7분; 플랜의 5~10분 범위 충족).
 - Research: 성역 상한 +1 업그레이드 2종 추가(최대 +2).
 - Gather: 시민 채집에 전언(Gather/Forest, Gather/IronMine) 배수 적용.
 - EdictHeatmap: Gather 전언 히트맵 렌더 시스템 추가 및 `App`에 연결.
 - Save/Load: 건물 목록 저장/복원 추가.
 - Citizens: 타겟 지시 우선 적용 및 간단 재평가 후 더 좋은 노드 선택.
 - Build: 청사진 진행도 바 및 진행도 기반 시각 효과(불투명도/높이 스케일) 추가.
 - Road: 성역 내부 배치 시 경계 바깥으로 자동 스냅, 내부 도로 금지 규칙 반영.

## 2025-08-13
- Perf(Build): `BuildSystem`에서 같은 프레임 내 `getBlueprints().find` 반복 호출을 블루프린트 맵 캐시로 대체.
- Perf(Build): 프레임 종료 시 `__pfw_near_builders`를 초기화하여 전역 배열 누수/누적 방지.
 - Logs: 카테고리별 최대 100개 보관, 초과 시 오래된 항목 자동 제거. 로그 패널에서 전체/탭별 보기 선택과 탭별 표시 제한치 조정 가능.
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

