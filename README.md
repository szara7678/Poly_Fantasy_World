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
- `vite.config.ts`의 `base: '/polyfantasy/'` 설정
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
- 성역 시스템 스텁(성역화 버튼으로 메모리 상 성역 추가)
- FoW 시스템 스텁(향후 텍스처 구현)
- 고정틱(60Hz) vs 렌더틱 분리 루프
- 기본 씬/카메라/조명/그리드
- 디버그 패널(FPS)

## 라이선스
MIT


