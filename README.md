# Polyfantasy

웹 기반 실시간 콜로니 시뮬레이션 프로토타입. 렌더링은 Three.js, 아키텍처는 ECS + 시스템 루프, 번들은 Vite를 사용합니다. GitHub Pages로 배포합니다.

## 개발 환경
- Vite + TypeScript + React
- ESLint + Prettier
- Vitest (+ JSDOM, Testing Library)

## 시작하기
```bash
npm install
npm run dev
```

## 빌드/테스트/체크
```bash
npm run build
npm run test
npm run typecheck
npm run lint
```

## GH Pages 배포
- `vite.config.ts`의 `base: '/Poly_Fantasy_World/'` 설정(리포지토리명과 정확히 일치, 대소문자 포함)
- GitHub Actions 워크플로 추가 예정

## 폴더 구조(요약)
```
src/
  ecs/                # 월드/타임 스텁
  systems/            # Loop, Sanctum, FogOfWar, NodeRegen 등 시스템 스텁
  render/three/       # Three.js 초기 씬
  ui/                 # React UI 및 패널
  data/               # JSON 템플릿(향후)
```

## 현재 구현(계획 대응)
- 성역 시스템 + 반경 링/글로우 렌더(`SanctumSystem`, `createSanctumRenderSystem`)
- FoW 캔버스 오버레이 + 성역 가시/Explored 반영(`createFogOfWarRenderSystem`)
- 노드 재생 + 간단 채집(`NodeRegenSystem.gatherTick`) 전언/작업자 반영, 인벤토리 적재
- 건설: 성역 내 규칙(`BuildRules`), 청사진→건설→완성, 전언(Build) 멀티 적용, 도로 타일 생성(`RoadNetwork.addRoad`)
 - 건설: 성역 내 규칙(`BuildRules`), 청사진→건설→완성(진행 바/프리뷰), 전언(Build) 멀티 적용, 도로 타일 생성(`RoadNetwork.addRoad`)
 - 도로 렌더링: 도로 타일 색상/타입별 표시(`createRoadRenderSystem`) + 이동속도 계수(`speedFactorAt`)
 - 도로 규칙: 성역 외부만 건설 허용, 성역 내부에서 배치 시 경계 밖으로 자동 스냅
 - 도로 도우미: 성역↔노드 추천선 계산, 미리보기 라인, 직선 구간 도로 청사진 자동 배치
- 전언 시스템: Build/Gather 도메인, 감쇠/TTL/총합×3 캡(`EdictSystem`)
- 전언 히트맵: Gather 전언 멀티를 붉은 오버레이로 시각화(`EdictHeatmapSystem`)
- 성역: 마나 소모(180) 시전 6s, 쿨 180s, 유지 −0.2/s, 반경 18m×(레벨+1)
- 전투 경계 규칙: 성역 밖 원거리/광역 피해 50% 경감(`CombatHooks.applySanctumBoundaryMitigation` + 투사체 테스트)
- 고정틱(60Hz) vs 렌더틱 분리 루프
- 기본 씬/카메라/조명/그리드, 디버그 패널(FPS/버튼)
- 시장/무역: 단순 계약 로직 + 패널(`MarketSystem`, `MarketPanel`)
 - 세이브/로드: V2 스냅샷(성역/청사진/인벤토리 + 도로/타겟 포함)
 - 시민: 로우폴리 시민 메쉬, 성역 주변 순환 이동, 도로 속도 효과 반영, 이동 경로로 FoW 탐사 스트로크 추가

## 규칙(요약)
- 건설: `Road`는 어디든 가능, 그 외 `Building`은 성역 내부 반경 내에서만 가능 (`BuildRules`)

## 라이선스
MIT


