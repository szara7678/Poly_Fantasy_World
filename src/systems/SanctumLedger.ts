import type { ItemId } from './Inventory';
import { getSanctums } from './SanctumSystem';
import { getBuildings } from './Buildings';
import { countCitizensNear } from './CitizenSystem';
import { getRoads } from './RoadNetwork';

export interface SanctumStock { [item: string]: number }
export interface SanctumStat {
  index: number;
  center: [number, number, number];
  radius: number;
  stocks: SanctumStock;
  citizensNearby: number;
  buildings: number;
  roadsNearby: number;
}

const stocks: Array<Record<ItemId, number>> = [];

function ensureIndex(i: number): void {
  while (stocks.length <= i) stocks.push({} as Record<ItemId, number>);
}

export function addToSanctum(index: number, item: ItemId, qty: number): void {
  if (qty <= 0) return;
  ensureIndex(index);
  const s = stocks[index];
  s[item] = Math.max(0, (s[item] ?? 0) + qty);
}

export function removeFromSanctum(index: number, item: ItemId, qty: number): void {
  if (qty <= 0) return;
  ensureIndex(index);
  const s = stocks[index];
  s[item] = Math.max(0, (s[item] ?? 0) - qty);
}

export function getSanctumStocks(): ReadonlyArray<SanctumStock> {
  return stocks;
}

export function computeSanctumStats(): SanctumStat[] {
  const sanctums = getSanctums();
  const out: SanctumStat[] = [];
  for (let i = 0; i < sanctums.length; i++) {
    const s = sanctums[i];
    ensureIndex(i);
    const nearCit = countCitizensNear(s.center[0], s.center[2], s.radius + 10);
    const bCount = getBuildings().filter(b => Math.hypot(b.position[0] - s.center[0], b.position[2] - s.center[2]) <= s.radius).length;
    const nearRoads = getRoads().filter(r => Math.hypot(r.position[0] - s.center[0], r.position[2] - s.center[2]) <= s.radius + 20).length;
    out.push({ index: i, center: s.center, radius: s.radius, stocks: { ...stocks[i] }, citizensNearby: nearCit, buildings: bCount, roadsNearby: nearRoads });
  }
  return out;
}

// expose minimal API for systems that cannot import directly
try {
  (globalThis as any).__pfw_sanctum_ledger_add = addToSanctum;
} catch {}


