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
- 성역 시스템 스텁 + 반경 링 렌더 미리보기(`createSanctumRenderSystem`)
- FoW 간이 오버레이(검은 평면) + 토글 버튼(`createFogOfWarRenderSystem`)
- 노드 재생 시스템(`NodeRegenSystem`) 루프 연결(초당 비율)
- 성역: 마나 소모(시전 180) 및 유지비(성역당 −0.2/s), 마나 재생(기본 1/s)
- 고정틱(60Hz) vs 렌더틱 분리 루프
- 기본 씬/카메라/조명/그리드
- 디버그 패널(FPS)

## 규칙(요약)
- 건설: `Road`는 어디든 가능, 그 외 `Building`은 성역 내부 반경 내에서만 가능 (`BuildRules`)

## 라이선스
MIT


