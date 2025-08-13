import type { GameWorld } from '../ecs';
import { getBlueprints, removeBlueprint } from './BlueprintSystem';
import { canConsume, consume } from './Inventory';
import { tryReserveWorker, releaseWorker } from './Workers';
import costs from '../data/costs.json' with { type: 'json' };
import { getMultiplier } from './EdictSystem';
import { addRoad } from './RoadNetwork';
import { addBuilding as materializeBuilding } from './Buildings';

interface BuildJob {
  id: string;
  remaining: number;
  hasWorker: boolean;
  total?: number;
}

const jobs: Record<string, BuildJob> = {};

export function BuildSystem(_world: GameWorld, dt: number): void {
  // Builder assist: list of assists with position and multiplier
  const assists: Array<{ pos: [number, number, number]; mult: number }> = (globalThis as any).__pfw_build_assists ?? [];
  // Cache blueprint list and map for this tick to avoid repeated scans
  const bpList = getBlueprints();
  const bpById = new Map(bpList.map((b) => [b.id, b]));
  for (const bp of bpList) {
    if (!jobs[bp.id]) {
      let cfg = (costs as any).build[bp.type] ?? { timeSec: 1.5, cost: {} };
      // Building 세부 종류 지정 시 개별 스펙 적용
      if (bp.type === 'Building' && bp.buildingKind) {
        const bk = (costs as any).buildings?.[bp.buildingKind];
        if (bk) cfg = bk;
      }
      const total = cfg.timeSec ?? 1.5;
      jobs[bp.id] = { id: bp.id, remaining: total, hasWorker: false, total };
    }
  }
  for (const id of Object.keys(jobs)) {
    const job = jobs[id];
    // Try allocate worker and consume resources once when starting
    if (!job.hasWorker) {
      // require at least one Builder near the blueprint to start work
      const bp0 = bpById.get(id);
      if (!bp0) { delete jobs[id]; continue; }
      const nearBuilders = ((globalThis as any).__pfw_near_builders as Array<[number, number, number]> ?? [])
        .some(p => Math.hypot((p[0] - bp0.position[0]), (p[2] - bp0.position[2])) <= 0.9);
      if (!nearBuilders) continue;
      if (!tryReserveWorker()) continue; // wait for worker
      // prototype cost: Building=Wood2, Road=Stone1
      const bp1 = bpById.get(id);
      if (!bp1) { releaseWorker(); delete jobs[id]; continue; }
      let cfg = (costs as any).build[bp1.type] ?? { cost: {} };
      if (bp1.type === 'Building' && bp1.buildingKind) {
        const bk = (costs as any).buildings?.[bp1.buildingKind];
        if (bk) cfg = bk;
      }
      // If road, merge roadTypes override (time/cost by subtype)
      if (bp1.type === 'Road' && bp1 && bp1.roadType) {
        const rt = (costs as any).roadTypes?.[bp1.roadType];
        if (rt) Object.assign(cfg, rt);
      }
      const entries = Object.entries(cfg.cost as Record<string, number>);
      // 비용 처리 정책:
      // - Building: 청사진 생성 시 선결제(일반 흐름). 세이브 복원 청사진은 (bp1 as any).restored=true로 표시되어 있으며 이때만 소비.
      // - Road: 여기에서 소비.
      if (bp1.type === 'Road' || (bp1.type === 'Building' && (bp1 as any).restored)) {
        if (!entries.every(([id, q]) => canConsume(id as any, q))) { releaseWorker(); continue; }
        for (const [id, q] of entries) consume(id as any, q);
      }
      job.hasWorker = true;
    }
    // Apply edict multiplier: Build/(Road|Building) speeds up construction
    const bp = bpById.get(id);
    const tag = bp?.type;
    const mult = getMultiplier('Build', tag);
    // If road subtype has its own time, initialize job at creation already did; here only multiplier
    let speed = dt * Math.max(0.1, mult);
    // Apply builder assists near this blueprint
    const bp2 = bpById.get(id);
    if (bp2 && assists.length > 0) {
      let assistSum = 0;
      for (const a of assists) {
        const dx = a.pos[0] - bp2.position[0];
        const dz = a.pos[2] - bp2.position[2];
        const d = Math.hypot(dx, dz);
        if (d <= 1.1) assistSum += a.mult; // within ~1m adds
      }
      if (assistSum > 0) speed += dt * 0.5 * assistSum;
    }
    job.remaining -= speed;
    if (job.remaining <= 0) {
      // On completion: remove blueprint and materialize effects
      const done = bp; // capture before removal
      removeBlueprint(id);
      // If road, place a road tile into the world for speed factor
      if (done && done.type === 'Road') {
        addRoad(done.position, done.roadType);
      } else if (done && done.type === 'Building') {
        // 실제 건물 생성(종류 미지정 시 기본 주거)
        materializeBuilding((done.buildingKind as any) ?? 'House', done.position);
      }
      if (job.hasWorker) releaseWorker();
      delete jobs[id];
    }
  }
  // clear assists after applying for this frame to avoid unbounded growth
  (globalThis as any).__pfw_build_assists = [];
  // also clear near builder list each tick to avoid unbounded array growth
  (globalThis as any).__pfw_near_builders = [];
}

export function getBuildProgress(): Array<{ id: string; progress: number }>{
  const out: Array<{ id: string; progress: number }> = [];
  for (const [id, job] of Object.entries(jobs)) {
    const total = job.total ?? 0;
    const p = total > 0 ? 1 - Math.max(0, job.remaining) / total : 0;
    out.push({ id, progress: Math.max(0, Math.min(1, p)) });
  }
  return out;
}


