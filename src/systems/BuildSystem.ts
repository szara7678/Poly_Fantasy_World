import type { GameWorld } from '../ecs';
import { getBlueprints, removeBlueprint } from './BlueprintSystem';
import { canConsume, consume } from './Inventory';
import { tryReserveWorker, releaseWorker } from './Workers';
import costs from '../data/costs.json' assert { type: 'json' };

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
      const entries = Object.entries(cfg.cost as Record<string, number>);
      if (!entries.every(([id, q]) => canConsume(id as any, q))) { releaseWorker(); continue; }
      for (const [id, q] of entries) consume(id as any, q);
      job.hasWorker = true;
    }
    job.remaining -= dt;
    if (job.remaining <= 0) {
      // For prototype: simply remove blueprint and place a solid cube
      // Real implementation would spend resources, queue workers, etc.
      removeBlueprint(id);
      if (job.hasWorker) releaseWorker();
      delete jobs[id];
    }
  }
}


