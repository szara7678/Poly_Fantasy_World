# TroubleShooting

## 기록 지침
- 중요한 오류 재현 절차, 원인, 수정 방법을 시간순으로 기록합니다.
- 커밋/파일/라인 레퍼런스가 있으면 함께 남깁니다.

## 2025-08-12
- PowerShell에서 명령 체이닝(`&&`) 실패 → 설치 명령을 두 줄로 분리하여 해결.
- GH Pages 정적 자산 404: 원인 `vite.config.ts`의 `base`가 리포지토리 경로와 불일치(`/polyfantasy/`). 조치 `base: '/Poly_Fantasy_World/'`로 수정, 빌드 확인. 추가로 `vitest/config`의 `defineConfig`로 변경해 `test` 옵션 타입 오류 제거.


