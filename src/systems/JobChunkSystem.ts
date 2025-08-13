import type { GameWorld } from '../ecs';
import { getNodes, type ResourceNode } from './NodeRegenSystem';
import { getRoads } from './RoadNetwork';

export interface JobChunk {
  id: string; // e.g., Gather_forest_01 or Maintain_road_...
  kind: 'Gather' | 'Maintain';
  nodeId: string; // for Gather: nodeId, for Maintain: refId (e.g., road id)
  nodeType: ResourceNode['type'];
  position: [number, number, number];
  slots: { soft: number; hard: number };
  reserved: number;
  available: number; // remaining capacity or repair need (>=0)
}

const chunks = new Map<string, JobChunk>();
const reservations = new Map<string, number[]>(); // chunkId -> expiry timestamps(ms)
const RES_TTL_MS = 10000; // 10s

function computeAvailable(n: ResourceNode): number {
  const safeReserve = n.capMax * 0.2;
  // 저장 용량이 가득 찼으면 채집을 전면 중지
  try {
    const inv: any = (globalThis as any).__pfw_inventory_api;
    const item = n.type === 'Forest' ? 'Wood' : n.type === 'IronMine' ? 'Stone' : n.type === 'HerbPatch' ? 'Herb' : 'ManaRaw';
    const free = inv?.getFreeCapacity?.(item) ?? Infinity;
    if (free <= 0) return 0;
  } catch {}
  return Math.max(0, Math.floor(n.capNow - safeReserve));
}

function ensureChunkForNode(n: ResourceNode): void {
  const id = `Gather_${n.nodeId}`;
  const slots = n.slots ?? { soft: 4, hard: 6 };
  const reserved = (reservations.get(id) ?? []).length;
  const jc: JobChunk = {
    id,
    kind: 'Gather',
    nodeId: n.nodeId,
    nodeType: n.type,
    position: n.position,
    slots,
    reserved,
    available: computeAvailable(n),
  };
  chunks.set(id, jc);
}

export function listJobChunks(): ReadonlyArray<JobChunk> {
  return Array.from(chunks.values());
}

export function getJobChunk(id: string): JobChunk | undefined {
  return chunks.get(id);
}

export function reserveJobChunk(id: string): boolean {
  const c = chunks.get(id);
  if (!c) return false;
  const arr = reservations.get(id) ?? [];
  const now = performance.now();
  const pruned = arr.filter((t) => t > now);
  if (pruned.length >= c.slots.hard) { reservations.set(id, pruned); return false; }
  pruned.push(now + RES_TTL_MS);
  reservations.set(id, pruned);
  c.reserved = pruned.length;
  return true;
}

export function releaseJobChunk(id: string): void {
  const arr = reservations.get(id) ?? [];
  arr.sort((a, b) => a - b);
  arr.shift();
  reservations.set(id, arr);
  const c = chunks.get(id);
  if (c) c.reserved = arr.length;
}

export function pruneJobChunkReservations(): void {
  const now = performance.now();
  for (const [id, arr] of reservations) {
    const pruned = arr.filter((t) => t > now);
    if (pruned.length !== arr.length) reservations.set(id, pruned);
    const c = chunks.get(id);
    if (c) c.reserved = pruned.length;
  }
}

export function effectiveWorkersFor(chunkId: string, n: number): number {
  const c = chunks.get(chunkId);
  if (!c) return n;
  // 플랜 규칙 적용:
  // eff(n) = n (n <= soft)
  // eff(n) = soft + 0.6*(n-soft) (soft < n <= hard)
  // n > hard 인 경우 hard 구간의 효율을 유지(더 이상 증원해도 효율 증가 없음)
  const soft = Math.max(0, c.slots.soft);
  const hard = Math.max(soft, c.slots.hard);
  const nn = Math.max(0, Math.floor(n));
  if (nn <= soft) return nn;
  if (nn <= hard) return soft + 0.6 * (nn - soft);
  // beyond hard: cap at eff(hard)
  return soft + 0.6 * (hard - soft);
}

export function JobChunkSystem(_world: GameWorld, _dt: number): void {
  // Refresh chunk list from nodes
  const nodes = getNodes();
  const alive = new Set<string>();
  for (const n of nodes) {
    const id = `Gather_${n.nodeId}`;
    alive.add(id);
    ensureChunkForNode(n);
  }
  // Road maintenance chunks (dynamic from durability each tick)
  try {
    const roads = getRoads();
    for (const r of roads) {
      const dur = r.durability ?? 1;
      if (dur >= 0.98) continue;
      const need = Math.ceil((1 - dur) * 10);
      const id = `Maintain_${r.id}`;
      alive.add(id);
      chunks.set(id, {
        id,
        kind: 'Maintain',
        nodeId: r.id,
        nodeType: 'Forest',
        position: r.position,
        slots: { soft: 1, hard: 2 },
        reserved: (reservations.get(id) ?? []).length,
        available: need,
      });
    }
  } catch {}

  // Merge external chunks (e.g., non-road maintenance demos)
  const extras: any[] = (globalThis as any).__pfw_extra_chunks ?? [];
  for (const ex of extras) {
    const id = ex.id as string;
    alive.add(id);
    chunks.set(id, {
      id,
      kind: (ex.kind ?? 'Gather') as any,
      nodeId: ex.refId ?? id,
      nodeType: ex.nodeType ?? 'Forest',
      position: ex.position ?? [0,0,0],
      slots: ex.slots ?? { soft: 1, hard: 2 },
      reserved: (reservations.get(id) ?? []).length,
      available: ex.available ?? 1,
    });
  }
  // Remove chunks for nodes that no longer exist
  for (const id of Array.from(chunks.keys())) {
    if (!alive.has(id)) chunks.delete(id);
  }
  // Prune expired reservations
  pruneJobChunkReservations();
  // expose for quick UI linking without circular import
  (globalThis as any).__pfw_jobchunks = listJobChunks();
  // Degrade road durability in batched intervals with larger steps (수요/트래픽 근사)
  try {
    const roads = getRoads();
    const store = (globalThis as any);
    store.__pfw_wear_accum = (store.__pfw_wear_accum ?? 0) + (_dt ?? 0);
    const interval = 60; // slower wear application interval
    if (store.__pfw_wear_accum >= interval) {
      store.__pfw_wear_accum = 0;
      for (const r of roads) {
        // 간이 트래픽: 인접 시민 수를 기반으로 마모량 증가(최대 +50%)
        const nearC = ((globalThis as any).__pfw_cit_top5 ? Object.keys((globalThis as any).__pfw_cit_top5).length : 0);
        const trafficMul = 1 + Math.min(0.3, nearC * 0.008);
        const step = 0.04 * trafficMul; // wear slower
        r.durability = Math.max(0.6, (r.durability ?? 1) - step);
      }
    }
  } catch {}
}


