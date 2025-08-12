export type EntityId = number;

export interface WorldTime {
  fixedDeltaSeconds: number;
  accumulatorSeconds: number;
}

export interface GameWorld {
  time: WorldTime;
}

export function createWorld(): GameWorld {
  return {
    time: { fixedDeltaSeconds: 1 / 60, accumulatorSeconds: 0 },
  };
}


