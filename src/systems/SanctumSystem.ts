import type { GameWorld } from '../ecs';

export interface SanctumData {
  center: [number, number, number];
  radius: number;
}

export interface SanctumState {
  sanctums: SanctumData[];
}

const state: SanctumState = {
  sanctums: [],
};

export function getSanctums(): SanctumData[] {
  return state.sanctums;
}

export function consecrate(center: [number, number, number], radius: number): void {
  state.sanctums.push({ center, radius });
}

export function SanctumSystem(_world: GameWorld, _dt: number): void {
  // Placeholder for upkeep, effects, and interactions
}


