import type { GameWorld } from '../ecs';

type UpdateFn = (world: GameWorld, dt: number) => void;

export class GameLoop {
  private readonly world: GameWorld;
  private readonly onFixedUpdate: UpdateFn[] = [];
  private readonly onRenderUpdate: UpdateFn[] = [];
  private lastTimeMs = 0;
  private rafHandle = 0;

  constructor(world: GameWorld) {
    this.world = world;
  }

  addFixedSystem(system: UpdateFn): void {
    this.onFixedUpdate.push(system);
  }

  addRenderSystem(system: UpdateFn): void {
    this.onRenderUpdate.push(system);
  }

  start(): void {
    this.lastTimeMs = performance.now();
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    cancelAnimationFrame(this.rafHandle);
  }

  private tick = (nowMs: number): void => {
    const elapsed = (nowMs - this.lastTimeMs) / 1000;
    this.lastTimeMs = nowMs;

    this.world.time.accumulatorSeconds += elapsed;
    while (this.world.time.accumulatorSeconds >= this.world.time.fixedDeltaSeconds) {
      for (const sys of this.onFixedUpdate) sys(this.world, this.world.time.fixedDeltaSeconds);
      this.world.time.accumulatorSeconds -= this.world.time.fixedDeltaSeconds;
    }

    for (const sys of this.onRenderUpdate) sys(this.world, elapsed);

    this.rafHandle = requestAnimationFrame(this.tick);
  };
}


