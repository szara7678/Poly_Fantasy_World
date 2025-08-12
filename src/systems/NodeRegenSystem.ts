import type { GameWorld } from '../ecs';

export interface ResourceNode {
  nodeId: string;
  type: 'Forest' | 'IronMine' | 'HerbPatch' | 'ManaSpring';
  capMax: number;
  capNow: number;
  regenPerDay: number; // per real-time day in prototype; later use game days
  position: [number, number, number];
}

const nodes: ResourceNode[] = [
  { nodeId: 'forest_01', type: 'Forest', capMax: 1000, capNow: 800, regenPerDay: 2, position: [8, 0, 8] },
  { nodeId: 'iron_01', type: 'IronMine', capMax: 1000, capNow: 600, regenPerDay: 1, position: [-10, 0, 6] },
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
  // 간단 채집 루프 병행 실행
  gatherTick(dt);
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

// 간단 채집 처리: 전언/작업자를 고려해 인벤토리에 자원 추가
import { addItem } from './Inventory';
import { getMultiplier } from './EdictSystem';
import { tryReserveWorker, releaseWorker } from './Workers';

export function gatherTick(dt: number): void {
  // 한 틱당 최대 1개 작업자만 사용(프로토타입 단순화)
  if (!tryReserveWorker()) return;
  try {
    // 전언: Gather/(Forest|IronMine) -> 생산 속도 멀티
    // 간단히 첫 번째 노드를 선택하여 dt에 비례해 0.2~0.5개 단위로 채집
    for (const node of nodes) {
      const safeReserve = node.capMax * SAFE_RESERVE_RATIO;
      if (node.capNow <= safeReserve) continue;
      const tag = node.type;
      const mult = getMultiplier('Gather', tag);
      // 기본 속도(샘플): Forest=0.25/s(=1통/4s), IronMine=0.2/s(=1/5s)
      const baseRate = node.type === 'Forest' ? 0.25 : node.type === 'IronMine' ? 0.2 : 0.15;
      const amount = baseRate * mult * dt;
      if (amount <= 0) continue;
      const canTake = Math.min(amount, Math.max(0, node.capNow - safeReserve));
      if (canTake <= 0) continue;
      node.capNow -= canTake;
      // 드롭 변환: Forest->Wood, IronMine->Stone(프로토타입)
      const item = node.type === 'Forest' ? 'Wood' : 'Stone';
      addItem(item as any, canTake);
      break; // 한 틱에 한 노드만 처리
    }
  } finally {
    releaseWorker();
  }
}

// 노드 렌더링(간단 시각화)
import * as THREE from 'three';
import type { SceneRoot } from '../render/three/SceneRoot';

export function createNodeRenderSystem(scene: SceneRoot) {
  const group = new THREE.Group();
  scene.scene.add(group);
  const meshes: Record<string, THREE.Mesh> = {};

  function colorFor(type: ResourceNode['type']): number {
    switch (type) {
      case 'Forest': return 0x3bb273;
      case 'IronMine': return 0x888888;
      case 'HerbPatch': return 0x66ccff;
      case 'ManaSpring': return 0x8a7dff;
      default: return 0xffffff;
    }
  }

  return function NodeRenderSystem() {
    // remove stale
    for (const id of Object.keys(meshes)) {
      if (!nodes.find((n) => n.nodeId === id)) {
        const m = meshes[id];
        group.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        delete meshes[id];
      }
    }
    // ensure meshes and sync
    for (const n of nodes) {
      let m = meshes[n.nodeId];
      const fill = THREE.MathUtils.clamp(n.capNow / n.capMax, 0.05, 1);
      if (!m) {
        m = new THREE.Mesh(
          new THREE.CylinderGeometry(2.0, 2.0, 3.0, 18),
          new THREE.MeshBasicMaterial({ color: colorFor(n.type) })
        );
        meshes[n.nodeId] = m;
        group.add(m);
      }
      m.position.set(n.position[0], 1.1, n.position[2]);
      m.scale.set(1, fill, 1); // 남은 자원 비율로 높이 스케일
    }
  };
}


