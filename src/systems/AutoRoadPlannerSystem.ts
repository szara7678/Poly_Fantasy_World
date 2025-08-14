import type { GameWorld } from '../ecs';
import { getSanctums } from './SanctumSystem';
import { getMonsters } from './MonsterSystem';
import { getRoadSlopeAllowance } from './ResearchSystem';
import { getHeightAt } from './BiomeSystem';
import { addBlueprint, getBlueprints } from './BlueprintSystem';
import type { RoadType } from './RoadNetwork';
import { hasRoadNear } from './RoadNetwork';
import { listJobChunks } from './JobChunkSystem';
import { getBuildingsByKind } from './Buildings';
import { getQty } from './Inventory';

function snap2(v: number): number { return Math.round(v / 2) * 2; }

function hasRoadOrBlueprintAt(pos: [number, number, number]): boolean {
  try {
    const roads: any[] = (globalThis as any).__pfw_roads ?? [];
    if (roads.find(r => Math.abs(r.position[0] - pos[0]) < 0.5 && Math.abs(r.position[2] - pos[2]) < 0.5)) return true;
  } catch {}
  const bps = getBlueprints();
  if (bps.find(b => b.type === 'Road' && Math.abs(b.position[0] - pos[0]) < 0.5 && Math.abs(b.position[2] - pos[2]) < 0.5)) return true;
  return false;
}

function pathKey(a: Pos, b: Pos): string {
  const ax = Math.round(a[0]); const az = Math.round(a[2]);
  const bx = Math.round(b[0]); const bz = Math.round(b[2]);
  return ax < bx || (ax === bx && az <= bz) ? `${ax},${az}->${bx},${bz}` : `${bx},${bz}->${ax},${az}`;
}

function coverageAlong(from: Pos, to: Pos): number {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) return 1;
  const ux = dx / len; const uz = dz / len;
  const step = 2.0;
  let covered = 0; let total = 0;
  for (let t = 0; t <= len; t += step) {
    const x = from[0] + ux * t; const z = from[2] + uz * t;
    total++;
    if (hasRoadNear(snap2(x), snap2(z), 0.9)) covered++;
  }
  return total > 0 ? covered / total : 1;
}

// per-session installed route registry
const installedRoutes = new Set<string>();

function placeRoadLine(from: [number, number, number], to: [number, number, number], type: RoadType, budget: number): number {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dz);
  if (len < 0.1) return 0;
  const ux = dx / len;
  const uz = dz / len;
  const step = 2.0;
  let placed = 0;
  const key = pathKey(from, to);
  // Skip if this route was already installed, or existing road coverage is high
  if (installedRoutes.has(key)) return 0;
  if (coverageAlong(from, to) >= 0.8) { installedRoutes.add(key); return 0; }
  for (let t = 0; t <= len && placed < budget; t += step) {
    const x = from[0] + ux * t;
    const z = from[2] + uz * t;
    const pos: [number, number, number] = [snap2(x), 0, snap2(z)];
    if (hasRoadOrBlueprintAt(pos) || hasRoadNear(pos[0], pos[2], 0.9)) continue;
    const ok = addBlueprint('Road' as any, pos, type, undefined, { silent: true });
    if (!ok) continue;
    placed += 1;
  }
  if (placed > 0) installedRoutes.add(key);
  return placed;
}

let cooldown = 0; // sec
type Pos = [number, number, number];

function nearest(of: Pos[], to: Pos): Pos | null {
  let best: Pos | null = null;
  let bestD = Infinity;
  for (const p of of) {
    const d = Math.hypot(p[0] - to[0], p[2] - to[2]);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

export function AutoRoadPlannerSystem(_world: GameWorld, dt: number): void {
  cooldown -= dt;
  if (cooldown > 0) return;
  cooldown = 5.0; // evaluate every 5s to avoid spam
  const s = getSanctums()[0];
  if (!s) return;
  const storages = getBuildingsByKind('Storage');
  const hubs: Pos[] = storages.length > 0
    ? storages.map(b => [b.position[0], 0, b.position[2]] as Pos)
    : [[s.center[0], 0, s.center[2]]];

  const lumberyards = getBuildingsByKind('Lumberyard');
  const smelters = getBuildingsByKind('Smelter');
  const workshops = getBuildingsByKind('Workshop');
  const labs = getBuildingsByKind('ResearchLab');

  // Build candidate connections with weights
  const candidates: Array<{ from: Pos; to: Pos; score: number; type: RoadType }>
    = [];

  // 1) Resource nodes (job chunks) -> nearest relevant building or hub
  const chunks = listJobChunks();
  for (const ch of chunks) {
    if (ch.available <= 0) continue;
    // 경사/위험 패널티: 경로 후보가 지나치게 가파르면 제외
    const allow = getRoadSlopeAllowance();
    const steps = 8;
    let blocked = false;
    let slopePenalty = 1.0;
    let riskPenalty = 1.0;
    let targets: Pos[] = [];
    if (ch.nodeType === 'Forest' && lumberyards.length > 0) targets = lumberyards.map(b => [b.position[0], 0, b.position[2]] as Pos);
    else if (ch.nodeType === 'IronMine' && smelters.length > 0) targets = smelters.map(b => [b.position[0], 0, b.position[2]] as Pos);
    if (targets.length === 0) targets = hubs;
    const t = nearest(targets, ch.position as any);
    if (!t) continue;
    // 경사/위험 계산
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = t[0] + (ch.position[0] - t[0]) * u;
      const z = t[2] + (ch.position[2] - t[2]) * u;
      const x2 = t[0] + (ch.position[0] - t[0]) * Math.min(1, u + 1 / steps);
      const z2 = t[2] + (ch.position[2] - t[2]) * Math.min(1, u + 1 / steps);
      const h1 = getHeightAt(x, z);
      const h2 = getHeightAt(x2, z2);
      const dh = (h2 - h1) * 1.2;
      const dx = Math.hypot(x2 - x, z2 - z);
      const deg = Math.atan2(Math.abs(dh), Math.max(1e-3, dx)) * 180 / Math.PI;
      if (deg > allow) { blocked = true; break; }
      if (deg > allow - 10) slopePenalty *= 0.9;
      // 위험: 인접 몬스터가 가까울수록 패널티 누적
      const mons = getMonsters();
      if (mons.length > 0) {
        let nearest = Infinity;
        for (const m of mons) {
          const d2 = Math.hypot(m.pos.x - x, m.pos.z - z);
          if (d2 < nearest) nearest = d2;
        }
        const local = nearest <= 10 ? 0.7 : nearest <= 20 ? 0.85 : 1.0;
        riskPenalty *= local;
      }
    }
    if (blocked) continue;
    const d = Math.hypot(t[0] - ch.position[0], t[2] - ch.position[2]);
    const need = Math.max(1, ch.available);
    const score = (need / Math.max(8, d)) * slopePenalty * riskPenalty;
    candidates.push({ from: t, to: ch.position as any, score, type: 'Gravel' });
  }

  // 2) Logistics chain: Storage <-> Processors and Processors <-> Workshop, Lab <-> Storage
  function addPair(aList: Pos[], bList: Pos[], scarcity: number, type: RoadType = 'Gravel') {
    if (aList.length === 0 || bList.length === 0) return;
    for (const a of aList) {
      const b = nearest(bList, a);
      if (!b) continue;
      const d = Math.hypot(a[0] - b[0], a[2] - b[2]);
      if (d < 4) continue;
      const score = scarcity / Math.max(6, d);
      candidates.push({ from: a, to: b, score, type });
    }
  }

  const qtyPlank = getQty('Plank' as any) || 0;
  const qtyIngot = getQty('IronIngot' as any) || 0;
  const qtyTool = getQty('Tool' as any) || 0;
  const scarcityPlank = Math.max(1, 50 - qtyPlank);
  const scarcityIngot = Math.max(1, 40 - qtyIngot);
  const scarcityTool = Math.max(1, 30 - qtyTool);

  const storagePos = hubs;
  const lumberPos = lumberyards.map(b => [b.position[0], 0, b.position[2]] as Pos);
  const smeltPos = smelters.map(b => [b.position[0], 0, b.position[2]] as Pos);
  const workPos = workshops.map(b => [b.position[0], 0, b.position[2]] as Pos);
  const labPos = labs.map(b => [b.position[0], 0, b.position[2]] as Pos);

  addPair(storagePos, lumberPos, scarcityPlank);
  addPair(storagePos, smeltPos, scarcityIngot);
  addPair(lumberPos, workPos, Math.max(scarcityPlank, scarcityTool));
  addPair(smeltPos, workPos, Math.max(scarcityIngot, scarcityTool));
  addPair(storagePos, labPos, Math.max(1, 20 - qtyTool));

  // 3) Fallback: hub <-> sanctum edge if nothing else
  if (candidates.length === 0) {
    const center: Pos = [s.center[0], 0, s.center[2]];
    for (const h of hubs) {
      const d = Math.hypot(h[0] - center[0], h[2] - center[2]);
      if (d < 6) continue;
      candidates.push({ from: center, to: h, score: 1 / Math.max(6, d), type: 'Gravel' });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  let globalBudget = 8; // smaller per tick
  let totalPlaced = 0;
  for (const c of candidates) {
    if (globalBudget <= 0) break;
    const placed = placeRoadLine(c.from, c.to, c.type, Math.min(6, globalBudget));
    globalBudget -= placed;
    totalPlaced += placed;
  }

  if (totalPlaced > 0) {
    try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Road', text: `자동 도로 청사진 +${totalPlaced}` } })); } catch {}
  }
}


