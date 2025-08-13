import type { GameWorld } from '../ecs';
import { getQty, consume } from './Inventory';

interface ResearchState {
  maxSanctumsBonus: number; // +0, +1, +2 ...
  roadSpeedMult: number; // multiplicative, starts at 1.0
  sanctumRadiusMult: number; // multiplicative, starts at 1.0
  sanctumUpkeepMult: number; // multiplicative, starts at 1.0
  marketFee: number; // transaction fee rate, starts at 0.05 (5%)
  maxRoadSlopeDeg: number; // allowable road slope in degrees (for helper/planner), default 30
}

const rs: ResearchState = {
  maxSanctumsBonus: 0,
  roadSpeedMult: 1.0,
  sanctumRadiusMult: 1.0,
  sanctumUpkeepMult: 1.0,
  marketFee: 0.05,
  maxRoadSlopeDeg: 30,
};

export function getMaxSanctums(): number {
  const base = 2;
  return base + rs.maxSanctumsBonus;
}

export function getRoadSpeedMult(): number {
  return rs.roadSpeedMult;
}

export function getSanctumRadiusMult(): number {
  return rs.sanctumRadiusMult;
}

export function getSanctumUpkeepMult(): number {
  return rs.sanctumUpkeepMult;
}

export function getMarketFee(): number {
  return rs.marketFee;
}

export function getRoadSlopeAllowance(): number {
  return rs.maxRoadSlopeDeg;
}

export type UpgradeId = 'MaxSanctum+1 (I)' | 'MaxSanctum+1 (II)' | 'Roads+10%' | 'SanctumRadius+10%' | 'SanctumUpkeep-10%' | 'Workers+1' | 'MarketFee-2%' | 'RoadSlope+5°';

export interface UpgradeDef {
  id: UpgradeId;
  costRP: number;
  apply: () => void;
}

const upgrades: UpgradeDef[] = [
  { id: 'MaxSanctum+1 (I)', costRP: 20, apply: () => { rs.maxSanctumsBonus += 1; } },
  { id: 'MaxSanctum+1 (II)', costRP: 30, apply: () => { rs.maxSanctumsBonus += 1; } },
  { id: 'Roads+10%', costRP: 15, apply: () => { rs.roadSpeedMult *= 1.1; } },
  { id: 'SanctumRadius+10%', costRP: 25, apply: () => { rs.sanctumRadiusMult *= 1.1; } },
  { id: 'SanctumUpkeep-10%', costRP: 25, apply: () => { rs.sanctumUpkeepMult *= 0.9; } },
  // Workers+1는 패널에서 Workers API 사용
  { id: 'Workers+1', costRP: 10, apply: () => { /* handled in panel via Workers API; keep placeholder for UI listing */ } },
  { id: 'MarketFee-2%', costRP: 20, apply: () => { rs.marketFee = Math.max(0, 0.03); } },
  { id: 'RoadSlope+5°', costRP: 20, apply: () => { rs.maxRoadSlopeDeg = Math.min(60, rs.maxRoadSlopeDeg + 5); } },
];

export function listUpgrades(): ReadonlyArray<UpgradeDef> { return upgrades; }

export function canPurchase(up: UpgradeDef): boolean {
  return getQty('ResearchPoint' as any) >= up.costRP;
}

export function purchase(up: UpgradeDef): boolean {
  if (!canPurchase(up)) return false;
  // consume integer RP
  if (!consume('ResearchPoint' as any, up.costRP)) return false;
  up.apply();
  return true;
}

export function ResearchSystem(_world: GameWorld, _dt: number): void {
  // placeholder for timed research if needed later
}


