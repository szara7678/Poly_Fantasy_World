import { getSanctums } from './SanctumSystem';

export type BuildType = 'Road' | 'Building';

export interface BuildRequest {
  position: [number, number, number];
  type: BuildType;
}

function isInsideAnySanctum(pos: [number, number, number]): boolean {
  const sanctums = getSanctums();
  for (const s of sanctums) {
    const dx = pos[0] - s.center[0];
    const dz = pos[2] - s.center[2];
    const dist = Math.hypot(dx, dz);
    if (dist <= s.radius) return true;
  }
  return false;
}

export function canBuild(req: BuildRequest): boolean {
  if (req.type === 'Road') return !isInsideAnySanctum(req.position); // 도로는 성역 밖에서만 가능
  return isInsideAnySanctum(req.position); // 기타 건축물은 성역 내부만 가능
}

export function explainBuildRule(req: BuildRequest): string {
  if (req.type === 'Road') return isInsideAnySanctum(req.position) ? '성역 내부에서는 도로를 깔 수 없습니다.' : '성역 외부이므로 도로 건설 가능합니다.';
  return isInsideAnySanctum(req.position)
    ? '성역 내부이므로 건설 가능합니다.'
    : '성역 외부이므로 건설할 수 없습니다.';
}


