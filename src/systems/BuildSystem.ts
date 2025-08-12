import type { GameWorld } from '../ecs';
import { getBlueprints, removeBlueprint } from './BlueprintSystem';
import { canConsume, consume } from './Inventory';
import { tryReserveWorker, releaseWorker } from './Workers';
import costs from '../data/costs.json' assert { type: 'json' };
import { getMultiplier } from './EdictSystem';
import { addRoad } from './RoadNetwork';

interface BuildJob {
  id: string;
  remaining: number;
  hasWorker: boolean;
}

const jobs: Record<string, BuildJob> = {};

export function BuildSystem(_world: GameWorld, dt: number): void {
  for (const bp of getBlueprints()) {
    if (!jobs[bp.id]) {
      const cfg = (costs as any).build[bp.type] ?? { timeSec: 1.5, cost: {} };
      jobs[bp.id] = { id: bp.id, remaining: cfg.timeSec ?? 1.5, hasWorker: false };
    }
  }
  for (const id of Object.keys(jobs)) {
    const job = jobs[id];
    // Try allocate worker and consume resources once when starting
    if (!job.hasWorker) {
      if (!tryReserveWorker()) continue; // wait for worker
      // prototype cost: Building=Wood2, Road=Stone1
      const bp = getBlueprints().find((b) => b.id === id);
      if (!bp) { releaseWorker(); delete jobs[id]; continue; }
      const cfg = (costs as any).build[bp.type] ?? { cost: {} };
      // If road, merge roadTypes override (time/cost by subtype)
      if (bp.type === 'Road' && bp && bp.roadType) {
        const rt = (costs as any).roadTypes?.[bp.roadType];
        if (rt) Object.assign(cfg, rt);
      }
      const entries = Object.entries(cfg.cost as Record<string, number>);
      if (!entries.every(([id, q]) => canConsume(id as any, q))) { releaseWorker(); continue; }
      for (const [id, q] of entries) consume(id as any, q);
      job.hasWorker = true;
    }
    // Apply edict multiplier: Build/(Road|Building) speeds up construction
    const bp = getBlueprints().find((b) => b.id === id);
    const tag = bp?.type;
    const mult = getMultiplier('Build', tag);
    // If road subtype has its own time, initialize job at creation already did; here only multiplier
    job.remaining -= dt * Math.max(0.1, mult); // guard against 0
    if (job.remaining <= 0) {
      // On completion: remove blueprint and materialize effects
      const done = bp; // capture before removal
      removeBlueprint(id);
      // If road, place a road tile into the world for speed factor
      if (done && done.type === 'Road') {
        addRoad(done.position, done.roadType);
      }
      if (job.hasWorker) releaseWorker();
      delete jobs[id];
    }
  }
}


