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

export function NodeRegenSystem(_world: GameWorld, dt: number): void {
  const regenFactor = dt / SECONDS_PER_DAY;
  for (const node of nodes) {
    node.capNow = Math.min(node.capMax, node.capNow + node.regenPerDay * regenFactor);
  }
}


