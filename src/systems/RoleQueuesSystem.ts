import type { GameWorld } from '../ecs';
import { listJobChunks, type JobChunk } from './JobChunkSystem';
import { getSanctums } from './SanctumSystem';
import { getBuildingsByKind } from './Buildings';
import { getQty } from './Inventory';
import { getDesired } from './MarketSystem';
import { getMultiplier } from './EdictSystem';

export type RoleId = 'Guard' | 'Lumberjack' | 'Miner' | 'Builder' | 'Researcher' | 'Explorer' | 'Carpenter' | 'Smith' | 'Artisan' | 'Herbalist' | 'Acolyte';

interface QItem {
  id: string;
  role: RoleId;
  pos: [number, number, number];
  weight: number; // base weight independent of citizen
  nodeType?: string;
}

interface JQParams {
  needFactor: number;                // scales (1 + need)
  maintenanceAvailFactor: number;    // scales available factor for Maintain
  facilityStorageBonus: number;      // multiplicative bonus near storage
  sanctumInsideBonus: number;        // multiplicative bonus inside sanctum
  edictMin: number;                  // floor for edict multiplier
  edictPower: number;                // exponent for edict multiplier shaping
  edictTauSec: number;               // EMA time constant for edict smoothing
  travelSanctumScale: number;        // denominator scale for sanctum-center travel factor
  perCitizenTravelScale: number;     // per-citizen travel distance scale
  cowardPenalty: number;             // penalty when outside sanctum and Coward
}

const jqParams: JQParams = {
  needFactor: 1.0,
  maintenanceAvailFactor: 0.2,
  facilityStorageBonus: 1.1,
  sanctumInsideBonus: 1.05,
  edictMin: 1.0,
  edictPower: 1.0,
  edictTauSec: 10,
  travelSanctumScale: 60,
  perCitizenTravelScale: 50,
  cowardPenalty: 0.8,
};

export function getJQParams(): Readonly<JQParams> { return { ...jqParams }; }
export function setJQParams(p: Partial<JQParams>): void {
  Object.assign(jqParams, p);
  try { (globalThis as any).__pfw_jq_params = { ...jqParams }; } catch {}
}

const queues: Record<RoleId, QItem[]> = {
  Guard: [], Lumberjack: [], Miner: [], Builder: [], Researcher: [], Explorer: [], Carpenter: [], Smith: [], Artisan: [], Herbalist: [], Acolyte: [],
};

// Internal smoothing state for edict multipliers used in queues
let edGatherForest = 1.0;
let edGatherIron = 1.0;
let edGatherHerb = 1.0;
let edGatherMana = 1.0;
let edMaintainRoad = 1.0;

function roleOfChunk(ch: JobChunk): RoleId | null {
  if (ch.kind === 'Gather') {
    if (ch.nodeType === 'Forest') return 'Lumberjack';
    if (ch.nodeType === 'IronMine') return 'Miner';
    if (ch.nodeType === 'HerbPatch') return 'Herbalist';
    if (ch.nodeType === 'ManaSpring') return 'Acolyte';
    return null;
  }
  if (ch.kind === 'Maintain') return 'Builder';
  return null;
}

function distance(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0]; const dz = a[2] - b[2];
  return Math.hypot(dx, dz);
}

function clamp(n: number, a: number, b: number): number { return Math.min(b, Math.max(a, n)); }

function baseWeightFor(ch: JobChunk): number {
  let w = 1.0;
  // Urgency based on resource shortage
  if (ch.kind === 'Gather') {
    const item = ch.nodeType === 'Forest' ? 'Wood' : ch.nodeType === 'IronMine' ? 'Stone' : ch.nodeType === 'HerbPatch' ? 'Herb' : ch.nodeType === 'ManaSpring' ? 'ManaRaw' : undefined;
    if (item) {
      const desired = Math.max(10, getDesired(item as any));
      const stock = getQty(item as any);
      const need = Math.max(0, Math.min(1.5, (desired - stock) / desired));
      w *= (1 + need * jqParams.needFactor);
    }
  } else if (ch.kind === 'Maintain') {
    // More need = higher available
    w *= 1 + Math.min(2, (ch as any).available ?? 1) * jqParams.maintenanceAvailFactor;
  }
  // Facility bonus: near Storage or Sanctum
  try {
    const stores = getBuildingsByKind('Storage' as any);
    let near = false;
    for (const s of stores) { if (distance(ch.position as any, [s.position[0],0,s.position[2]]) <= 12) { near = true; break; } }
    if (near) w *= jqParams.facilityStorageBonus;
  } catch {}
  const sanc = getSanctums()[0];
  if (sanc && distance(ch.position as any, [sanc.center[0],0,sanc.center[2]]) <= sanc.radius) w *= jqParams.sanctumInsideBonus;
  // Edict per job
  if (ch.kind === 'Gather') {
    const ed = ch.nodeType === 'Forest' ? edGatherForest :
              ch.nodeType === 'IronMine' ? edGatherIron :
              ch.nodeType === 'HerbPatch' ? edGatherHerb :
              ch.nodeType === 'ManaSpring' ? edGatherMana : 1.0;
    w *= Math.pow(Math.max(jqParams.edictMin, ed), Math.max(0, jqParams.edictPower));
  } else if (ch.kind === 'Maintain') {
    const ed = edMaintainRoad;
    w *= Math.pow(Math.max(jqParams.edictMin, ed), Math.max(0, jqParams.edictPower));
  }
  // Travel proxy: prefer closer to sanctum center
  if (sanc) {
    const d = Math.max(1, distance(ch.position as any, [sanc.center[0],0,sanc.center[2]]));
    w *= 1 / (1 + d / Math.max(1, jqParams.travelSanctumScale));
  }
  return w;
}

export function getRoleQueues(): Readonly<Record<RoleId, QItem[]>> { return queues; }

export function getBestJobForCitizen(c: { id: string; role: RoleId; pos: { x: number; z: number }; traits?: string[] }): QItem | null {
  const q = queues[c.role] ?? [];
  if (q.length === 0) return null;
  let best: QItem | null = null;
  let bestScore = -Infinity;
  for (const it of q) {
    // per-citizen adjustment by travel and risk aversion (Coward reduces outside sanctum work)
    const pos: [number, number, number] = [c.pos.x, 0, c.pos.z];
    const d = Math.max(1, distance(it.pos, pos));
    let score = it.weight * (1 / (1 + d / Math.max(1, jqParams.perCitizenTravelScale)));
    const sanc = getSanctums()[0];
    if (sanc) {
      const dd = Math.hypot(it.pos[0] - sanc.center[0], it.pos[2] - sanc.center[2]);
      if (dd > sanc.radius && c.traits?.includes('Coward')) score *= jqParams.cowardPenalty;
    }
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return best;
}

export function RoleQueuesSystem(_world: GameWorld, dt: number): void {
  // Smooth edict multipliers with EMA so that queues transition gradually
  const a = clamp(dt / Math.max(1, jqParams.edictTauSec), 0.01, 0.5);
  const gForestNow = getMultiplier('Gather', 'Forest' as any);
  const gIronNow = getMultiplier('Gather', 'IronMine' as any);
  const gHerbNow = getMultiplier('Gather', 'HerbPatch' as any);
  const gManaNow = getMultiplier('Gather', 'ManaSpring' as any);
  const mRoadNow = getMultiplier('Build', 'Road' as any);
  edGatherForest = edGatherForest * (1 - a) + gForestNow * a;
  edGatherIron = edGatherIron * (1 - a) + gIronNow * a;
  edGatherHerb = edGatherHerb * (1 - a) + gHerbNow * a;
  edGatherMana = edGatherMana * (1 - a) + gManaNow * a;
  edMaintainRoad = edMaintainRoad * (1 - a) + mRoadNow * a;

  const chunks = listJobChunks();
  for (const r of Object.keys(queues) as RoleId[]) queues[r] = [];
  for (const ch of chunks) {
    const role = roleOfChunk(ch as any);
    if (!role) continue;
    const w = baseWeightFor(ch as any);
    queues[role].push({ id: ch.id, role, pos: ch.position, weight: w, nodeType: (ch as any).nodeType });
  }
  for (const r of Object.keys(queues) as RoleId[]) queues[r].sort((a,b)=> b.weight - a.weight);
  try { (globalThis as any).__pfw_role_queues = queues; } catch {}
}


