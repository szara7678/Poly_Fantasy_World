import type { GameWorld } from '../ecs';

export type FogState = 'Unseen' | 'Explored' | 'Visible';

export interface FogOfWar {
  // Minimal stub for future texture/grid implementation
  debugVisible: boolean;
}

const fog: FogOfWar = { debugVisible: true };

export function FogOfWarSystem(_world: GameWorld, _dt: number): void {
  // TODO: texture-based FoW; for now nothing
}

export function isVisible(): boolean {
  return fog.debugVisible;
}


