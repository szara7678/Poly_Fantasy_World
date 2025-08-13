# TroubleShooting

## 기록 지침
- 중요한 오류 재현 절차, 원인, 수정 방법을 시간순으로 기록합니다.
- 커밋/파일/라인 레퍼런스가 있으면 함께 남깁니다.

## 2025-08-12
- PowerShell에서 명령 체이닝(`&&`) 실패 → 설치 명령을 두 줄로 분리하여 해결.
- GH Pages 정적 자산 404: 원인 `vite.config.ts`의 `base`가 리포지토리 경로와 불일치(`/polyfantasy/`). 조치 `base: '/Poly_Fantasy_World/'`로 수정, 빌드 확인. 추가로 `vitest/config`의 `defineConfig`로 변경해 `test` 옵션 타입 오류 제거.

## 2025-08-13
- 증상: 건물 짓기 시작 후 프레임 급락. 장시간 플레이 시 점진적 악화.
- 원인: `CitizenSystem`이 프레임마다 전역 `__pfw_near_builders` 배열에 빌더 좌표를 계속 push 하나, 소비 측(`BuildSystem`)에서 비우지 않아 무제한 누적. 또한 `BuildSystem`이 동일 프레임 내 `getBlueprints().find`를 다수 호출하여 O(n^2) 탐색 부담 가중.
- 조치:
  - `src/systems/BuildSystem.ts`: 틱마다 로컬 캐시 `bpList`/`bpById`를 만들어 반복 `find` 제거. 틱 끝에 `__pfw_near_builders = []`로 초기화하여 누적 방지. 참고 라인: 마지막 clear 섹션.
- 결과: 대규모 빌드 진행 중 프레임 드랍 현저히 완화, 장시간 플레이 시 메모리 상승 억제.


