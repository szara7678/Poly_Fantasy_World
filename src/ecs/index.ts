export type EntityId = number;

export interface WorldTime {
  fixedDeltaSeconds: number;
  accumulatorSeconds: number;
}

export interface PlayerState {
  mana: number;
  manaMax: number;
  manaRegenPerSec: number;
}

export interface GameWorld {
  time: WorldTime;
  player: PlayerState;
}

export function createWorld(): GameWorld {
  return {
    time: { fixedDeltaSeconds: 1 / 60, accumulatorSeconds: 0 },
    player: { mana: 300, manaMax: 300, manaRegenPerSec: 1.0 },
  };
}

let activeWorld: GameWorld | null = null;
export function setActiveWorld(world: GameWorld): void {
  activeWorld = world;
}
export function getActiveWorld(): GameWorld {
  if (!activeWorld) throw new Error('Active world is not set');
  return activeWorld;
}


