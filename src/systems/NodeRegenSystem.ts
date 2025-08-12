import type { GameWorld } from '../ecs';

export interface ResourceNode {
  nodeId: string;
  type: 'Forest' | 'IronMine' | 'HerbPatch' | 'ManaSpring';
  capMax: number;
  capNow: number;
  regenPerDay: number; // per real-time day in prototype; later use game days
}

const nodes: ResourceNode[] = [
  { nodeId: 'forest_01', type: 'Forest', capMax: 1000, capNow: 800, regenPerDay: 2 },
  { nodeId: 'iron_01', type: 'IronMine', capMax: 1000, capNow: 600, regenPerDay: 1 },
];

export function getNodes(): ResourceNode[] {
  return nodes;
}

const SECONDS_PER_DAY = 60 * 60 * 24;
const SAFE_RESERVE_RATIO = 0.2; // 안전 저수준 20%

export function NodeRegenSystem(_world: GameWorld, dt: number): void {
  const regenFactor = dt / SECONDS_PER_DAY;
  for (const node of nodes) {
    node.capNow = Math.min(node.capMax, node.capNow + node.regenPerDay * regenFactor);
  }
}

// 간단한 일일 쿼터 스텁: SafeReserve 이상일 때만 "가상 작업"을 발행한다고 가정
export interface DailyQuota {
  nodeId: string;
  available: number; // 오늘 채집 가능한 추정치
}

export function computeDailyQuotas(): DailyQuota[] {
  const quotas: DailyQuota[] = [];
  for (const node of nodes) {
    const safeReserve = node.capMax * SAFE_RESERVE_RATIO;
    const availableNow = Math.max(0, node.capNow - safeReserve);
    quotas.push({ nodeId: node.nodeId, available: Math.floor(availableNow) });
  }
  return quotas;
}


