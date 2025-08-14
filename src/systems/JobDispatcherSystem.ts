import type { GameWorld } from '../ecs';
import { listJobChunks, reserveJobChunk } from './JobChunkSystem';
import { getCitizens } from './CitizenSystem';
import { getSanctums } from './SanctumSystem';
import { getBuildingsByKind, type Building } from './Buildings';
import { getQty, type ItemId } from './Inventory';
import { getDesired } from './MarketSystem';
import { getMultiplier } from './EdictSystem';
import { getBlueprints } from './BlueprintSystem';
import { getMonsters } from './MonsterSystem';

type DispatchJob = {
  id: string; // e.g., Gather_nodeId, Maintain_roadId, Assist_buildingId
  kind: 'Gather' | 'Maintain' | 'Assist' | 'Build' | 'Defend' | 'Explore';
  nodeType?: string; // Forest/IronMine/HerbPatch/ManaSpring/Road
  position: [number, number, number];
  slots?: { soft: number; hard: number };
  base: { need: number; edict: number; facility: number };
  value: number; // base value independent of citizen
};

type Assign = {
  jobId: string;
  untilSec: number; // session lock until
};

const assignment = new Map<string, Assign>(); // citizenId -> assignment
let board: Array<{ id: string; value: number; base: DispatchJob['base'] }> = [];

function distance(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0]; const dz = a[2] - b[2];
  return Math.hypot(dx, dz);
}

function clamp(n: number, a: number, b: number): number { return Math.min(b, Math.max(a, n)); }

function desiredGap(item: ItemId): number {
  const desired = Math.max(10, getDesired(item) ?? 50);
  const stock = getQty(item);
  return clamp((desired - stock) / desired, 0, 1.5);
}

function facilityBonus(pos: [number, number, number]): number {
  const sanc = getSanctums()[0];
  const params: any = (globalThis as any).__pfw_dispatch_params || {};
  const facBase = Math.max(1, Math.min(1.3, params.facilityBonus ?? 1.05));
  let m = 1.0;
  if (sanc && distance(pos, [sanc.center[0], 0, sanc.center[2]]) <= sanc.radius) m *= facBase;
  // near Storage bonus approx: check Storage proximity
  try {
    const stores = getBuildingsByKind('Storage' as any);
    for (const s of stores) {
      if (Math.hypot(pos[0] - s.position[0], pos[2] - s.position[2]) <= 12) { m *= 1.1; break; }
    }
  } catch {}
  return m;
}

function buildJobs(): DispatchJob[] {
  const out: DispatchJob[] = [];
  // From JobChunkSystem (Gather/Maintain)
  for (const ch of listJobChunks()) {
    if (ch.kind === 'Gather') {
      const item = ch.nodeType === 'Forest' ? 'Wood' : ch.nodeType === 'IronMine' ? 'Stone' : ch.nodeType === 'HerbPatch' ? 'Herb' : ch.nodeType === 'ManaSpring' ? 'ManaRaw' : undefined;
      const need = (() => { const n = item ? (1 + desiredGap(item as ItemId)) : 1.0; const scale = Math.max(0.5, Math.min(2, ((globalThis as any).__pfw_dispatch_params?.needScale ?? 1.0))); return n * scale; })();
      const ed = (() => { const raw = ch.nodeType ? Math.max(1, getMultiplier('Gather', ch.nodeType as any)) : 1.0; const p = Math.max(0, Math.min(2, ((globalThis as any).__pfw_dispatch_params?.edictPower ?? 1.0))); return Math.pow(raw, p); })();
      const fac = facilityBonus(ch.position as any);
      const base = { need, edict: ed, facility: fac };
      const value = need * ed * fac;
      out.push({ id: ch.id, kind: 'Gather', nodeType: ch.nodeType, position: ch.position, value, base });
    } else if (ch.kind === 'Maintain') {
      const ed = (() => { const raw = Math.max(1, getMultiplier('Build', 'Road')); const p = Math.max(0, Math.min(2, ((globalThis as any).__pfw_dispatch_params?.edictPower ?? 1.0))); return Math.pow(raw, p); })();
      const fac = facilityBonus(ch.position as any);
      const need = 1 + Math.min(2, (ch as any).available ?? 1) * 0.2;
      const base = { need, edict: ed, facility: fac };
      const value = need * ed * fac;
      out.push({ id: ch.id, kind: 'Maintain', nodeType: ch.nodeType, position: ch.position, value, base });
    }
  }
  // Assist production pseudo-jobs (presence near buildings)
  const assistDefs: Array<{ kind: string; out: ItemId }>= [
    { kind: 'Lumberyard', out: 'Plank' },
    { kind: 'Smelter', out: 'IronIngot' },
    { kind: 'Workshop', out: 'Tool' },
    { kind: 'ResearchLab', out: 'ResearchPoint' },
    { kind: 'Herbalist', out: 'Tool' },
  ];
  for (const def of assistDefs) {
    const bs = getBuildingsByKind(def.kind as any) as ReadonlyArray<Building>;
    for (const b of bs) {
      const need = 1 + desiredGap(def.out);
      const ed = 1.0; // not directly affected by edicts now
      const fac = facilityBonus(b.position);
      const base = { need, edict: ed, facility: fac };
      const value = need * ed * fac;
      out.push({ id: `Assist_${b.id}`, kind: 'Assist', position: b.position, value, base });
    }
  }
  // Build jobs from blueprints (presence near blueprint speeds construction in BuildSystem)
  try {
    const bps = getBlueprints();
    for (const b of bps as any[]) {
      if (!b?.position) continue;
      const need = 1 + Math.min(2, 1 + (b?.costLeft ?? 1) * 0.1);
      const ed = Math.max(1, getMultiplier('Build', (b?.buildingKind ?? 'Any') as any));
      const fac = facilityBonus(b.position as any);
      const base = { need, edict: ed, facility: fac };
      const value = need * ed * fac;
      out.push({ id: `Build_${b.id ?? `${b.buildingKind}_${b.position[0].toFixed?.(1)}`}`, kind: 'Build', position: b.position as any, value, base });
    }
  } catch {}
  // Defend jobs near monsters threatening the sanctum
  try {
    const sanc = getSanctums()[0];
    const mons = getMonsters();
    if (sanc) {
      for (const m of mons) {
        const d = Math.hypot(m.pos.x - sanc.center[0], m.pos.z - sanc.center[2]);
        if (d <= sanc.radius * 1.6) {
          const need = 1 + Math.max(0.2, (sanc.radius * 1.6 - d) / Math.max(1, sanc.radius));
          const ed = 1.0;
          const pos: [number, number, number] = [m.pos.x, 0, m.pos.z];
          const fac = facilityBonus(pos);
          const base = { need, edict: ed, facility: fac };
          const value = need * fac;
          out.push({ id: `Defend_${m.id ?? `${m.pos.x.toFixed?.(1)}_${m.pos.z.toFixed?.(1)}`}`, kind: 'Defend', position: pos, value, base });
        }
      }
    }
  } catch {}
  // Explore jobs: points on a ring outside sanctum
  try {
    const sanc = getSanctums()[0];
    if (sanc) {
      const center: [number, number, number] = [sanc.center[0], 0, sanc.center[2]];
      const n = 8;
      const r = Math.max(30, sanc.radius + 25);
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const pos: [number, number, number] = [center[0] + Math.cos(ang) * r, 0, center[2] + Math.sin(ang) * r];
        const need = 1.0 + (i % 2 === 0 ? 0.2 : 0);
        const ed = 1.0;
        const fac = facilityBonus(pos);
        const base = { need, edict: ed, facility: fac };
        const value = need * fac;
        out.push({ id: `Explore_${i}`, kind: 'Explore', position: pos, value, base });
      }
    }
  } catch {}
  return out;
}

function citizenFitFor(job: DispatchJob, c: any): number {
  const A: any = c.aptitude ?? {};
  const STR = c.stats?.STR ?? 10, DEX = c.stats?.DEX ?? 10, VIT = c.stats?.VIT ?? 10, INT = c.stats?.INT ?? 10, WIS = c.stats?.WIS ?? 10;
  let apt = 1.0;
  if (job.kind === 'Gather') {
    if (job.nodeType === 'Forest') apt = A.Forest ?? 1.0;
    else if (job.nodeType === 'IronMine') apt = A.IronMine ?? 1.0;
    else if (job.nodeType === 'HerbPatch') apt = A.Alchemy ?? 1.0;
    else if (job.nodeType === 'ManaSpring') apt = A.Research ?? 1.0;
  } else if (job.kind === 'Assist') {
    // Rough mapping by building output
    apt = 1.0; // fallback
    // Infer from id suffix
    if (job.id.includes('Lumberyard') || job.id.includes('Workshop')) apt = A.Craft ?? 1.0;
    else if (job.id.includes('Smelter')) apt = A.Smith ?? 1.0;
    else if (job.id.includes('ResearchLab')) apt = A.Research ?? 1.0;
    else if (job.id.includes('Herbalist')) apt = A.Alchemy ?? 1.0;
  }
  const stat = (
    job.nodeType === 'Forest' ? ((STR-10)/40 + (DEX-10)/50) :
    job.nodeType === 'IronMine' ? ((STR-10)/40 + (VIT-10)/60) :
    job.nodeType === 'HerbPatch' ? ((INT-10)/40 + (DEX-10)/60) :
    job.nodeType === 'ManaSpring' ? ((INT-10)/35 + (WIS-10)/50) : 0
  );
  const fatigue = Math.max(0.5, 1 - (c.fatigue ?? 0));
  let tool = 1.0;
  const t = c.equipment?.tool;
  if (job.nodeType === 'Forest' && t === 'Axe') tool *= 1.15;
  if (job.nodeType === 'IronMine' && t === 'Pick') tool *= 1.15;
  return Math.max(0.6, (1 + 0.2 * (apt - 1) + stat) * fatigue * tool);
}

function distFactor(job: DispatchJob, c: any): number {
  const d = Math.max(1, Math.hypot((job.position[0] - c.pos.x), (job.position[2] - c.pos.z)));
  return 1 / (1 + d / 60);
}

let timer = 0;

export function getDispatchAssignment(id: string): Assign | undefined { return assignment.get(id); }
export function getDispatchBoard(): ReadonlyArray<{ id: string; value: number; base: DispatchJob['base'] }> { return board; }
export function getAllAssignments(): Readonly<Record<string, Assign>> {
  const o: Record<string, Assign> = {};
  for (const [k, v] of assignment.entries()) o[k] = v;
  return o;
}
export function getSessionInfo(id: string): { jobId: string; timeLeftSec: number } | null {
  const a = assignment.get(id);
  if (!a) return null;
  const now = performance.now() / 1000;
  return { jobId: a.jobId, timeLeftSec: Math.max(0, (a.untilSec - now)) };
}

export function JobDispatcherSystem(_world: GameWorld, dt: number): void {
  timer += dt;
  if (timer < 6) return;
  timer = 0;
  const citizens = [...getCitizens()];
  const jobs = buildJobs();
  // Expose pseudo-jobs as extra chunks for consumer systems to fetch positions
  try {
    const extras = jobs
      .filter(j => j.kind === 'Build' || j.kind === 'Defend' || j.kind === 'Explore' || j.kind === 'Assist')
      .map(j => ({ id: j.id, kind: j.kind, nodeType: j.nodeType, position: j.position, slots: { soft: 1, hard: 2 }, available: 1 }));
    (globalThis as any).__pfw_extra_chunks = extras;
  } catch {}
  // Global board top-10 by base value
  board = jobs.slice().sort((a,b)=> b.value - a.value).slice(0, 10).map(j=> ({ id: j.id, value: j.value, base: j.base }));
  const now = performance.now() / 1000;
  for (const c of citizens) {
    // keep session lock if valid
    const cur = assignment.get(c.id);
    if (cur && cur.untilSec > now) continue;
    // pick K nearest-value candidates
    const scored = jobs
      .map(j => ({ j, score: j.value * citizenFitFor(j, c) * distFactor(j, c) }))
      .sort((a,b)=> b.score - a.score)
      .slice(0, 16);
    let chosen: DispatchJob | null = null;
    for (const s of scored) {
      const j = s.j;
      if (j.kind === 'Gather' || j.kind === 'Maintain') {
        if (!reserveJobChunk(j.id)) continue; // slot contention → try next
      }
      chosen = j; break;
    }
    if (!chosen) continue;
    // session lock duration heuristic by kind
    const lock = chosen.kind === 'Gather' ? 8 : chosen.kind === 'Maintain' ? 8 : 6;
    assignment.set(c.id, { jobId: chosen.id, untilSec: now + lock });
    try { (globalThis as any).__pfw_assignments = Object.fromEntries(assignment.entries()); } catch {}
  }
}


