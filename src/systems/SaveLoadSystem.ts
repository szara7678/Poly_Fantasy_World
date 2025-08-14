import { getSanctums, setSanctums } from './SanctumSystem';
import * as BP from './BlueprintSystem';
import { getInventory, addItem } from './Inventory';
import { getRoads, addRoadWithDurability } from './RoadNetwork';
import { listTargets, addTarget } from './TargetSystem';
import { getBuildings, addBuilding } from './Buildings';
import { getResearchSnapshot, applyResearchSnapshot } from './ResearchSystem';
import { getMonsterSnapshots, applyMonsterSnapshots } from './MonsterSystem';
import { getPFParams, setPFParams } from './Pathfinding';
import { getCoin, addCoin, spendCoin } from './Economy';
import { getCitizenSnapshots, applyCitizenSnapshots } from './CitizenSystem';

export interface SaveDataV1 {
  version: 1;
  sanctums: ReturnType<typeof getSanctums>;
  blueprints: ReturnType<typeof BP.getBlueprints>;
  inventory: ReturnType<typeof getInventory>;
}

export interface SaveDataV2 extends Omit<SaveDataV1, 'version'> {
  version: 2;
  roads: Array<{ position: [number, number, number]; type: string; durability?: number }>;
  targets: Array<{ position: [number, number, number] }>;
  buildings: Array<{ kind: string; position: [number, number, number] }>;
}

export interface SaveDataV3 extends Omit<SaveDataV2, 'version' | 'buildings'> {
  version: 3;
  research: ReturnType<typeof getResearchSnapshot>;
  citizens?: ReturnType<typeof getCitizenSnapshots>;
  monsters?: ReturnType<typeof getMonsterSnapshots>;
  coin?: number;
  buildings: Array<{ kind: string; position: [number, number, number]; level?: number; active?: boolean }>;
  pfParams?: ReturnType<typeof getPFParams>;
}

const KEY_V1 = 'pfw_save_v1';
const KEY_V2 = 'pfw_save_v2';
const KEY_V3 = 'pfw_save_v3';

export function doSave(): void {
  const data: SaveDataV3 = {
    version: 3,
    sanctums: getSanctums(),
    blueprints: BP.getBlueprints(),
    inventory: getInventory(),
    roads: getRoads().map((r) => ({ position: r.position, type: r.type as any, durability: r.durability })),
    targets: listTargets().map((t) => ({ position: t.position })),
    buildings: getBuildings().map((b) => ({ kind: b.kind as any, position: b.position, level: (b as any).level, active: (b as any).active })),
    research: getResearchSnapshot(),
    citizens: getCitizenSnapshots(),
    monsters: getMonsterSnapshots(),
    coin: getCoin(),
    pfParams: getPFParams(),
  };
  localStorage.setItem(KEY_V3, JSON.stringify(data));
}

export function hasSave(): boolean {
  return localStorage.getItem(KEY_V3) !== null || localStorage.getItem(KEY_V2) !== null || localStorage.getItem(KEY_V1) !== null;
}

export function clearSave(): void {
  localStorage.removeItem(KEY_V3);
  localStorage.removeItem(KEY_V2);
  localStorage.removeItem(KEY_V1);
}

export function doLoad(): boolean {
  // Try V3 first
  const raw3 = localStorage.getItem(KEY_V3);
  if (raw3) {
    try {
      const data = JSON.parse(raw3) as SaveDataV3;
      if (data && data.version === 3) {
        setSanctums(data.sanctums ?? []);
        // blueprints
        BP.clearBlueprints();
        for (const b of data.blueprints ?? []) {
          BP.addBlueprint?.(b.type as any, b.position as any, (b as any).roadType, (b as any).buildingKind, { skipCost: true });
          try {
            const list = BP.getBlueprints();
            const last = list[list.length - 1] as any;
            if (last && last.type === 'Building') last.restored = true;
          } catch {}
        }
        for (const [k, v] of Object.entries(data.inventory ?? {})) addItem(k as any, (v as number) - (getInventory() as any)[k]);
        for (const r of data.roads ?? []) addRoadWithDurability(r.position as any, r.type as any, (r as any).durability ?? 1.0);
        for (const t of data.targets ?? []) addTarget(t.position as any);
        for (const b of data.buildings ?? []) {
          const nb = addBuilding(b.kind as any, b.position as any);
          try {
            if (typeof (b as any).level === 'number') {
              (require('./Buildings') as any).setBuildingLevel?.(nb.id, (b as any).level);
            }
            if (typeof (b as any).active === 'boolean') {
              (require('./Buildings') as any).setBuildingActive?.(nb.id, (b as any).active);
            }
          } catch {}
        }
        if (typeof (data as any).coin === 'number') {
          const target = (data as any).coin as number;
          const cur = getCoin();
          const delta = target - cur;
          if (delta > 0) addCoin(delta);
          else if (delta < 0) spendCoin(-delta);
        }
        applyResearchSnapshot(data.research ?? {} as any);
        if ((data as any).pfParams) setPFParams((data as any).pfParams);
        if (data.citizens && data.citizens.length > 0) applyCitizenSnapshots(data.citizens as any);
        if (data.monsters && data.monsters.length > 0) applyMonsterSnapshots(data.monsters as any);
        return true;
      }
    } catch {}
  }
  // Try V2 first
  const raw2 = localStorage.getItem(KEY_V2);
  if (raw2) {
    try {
      const data = JSON.parse(raw2) as SaveDataV2;
      if (data && data.version === 2) {
        setSanctums(data.sanctums ?? []);
        // blueprints
        BP.clearBlueprints();
        for (const b of data.blueprints ?? []) {
          // 복원된 청사진: Road는 정상, Building은 비용을 재차 청구하지 않도록 'skipCost'로 복원.
          BP.addBlueprint?.(b.type as any, b.position as any, (b as any).roadType, (b as any).buildingKind, { skipCost: true });
          // BuildSystem에서 복원 건물 청사진은 비용을 건설 시작 시 1회만 청구하도록 플래그 부여
          try {
            const list = BP.getBlueprints();
            const last = list[list.length - 1] as any;
            if (last && last.type === 'Building') last.restored = true;
          } catch {}
        }
        // inventory (additive overwrite)
        for (const [k, v] of Object.entries(data.inventory ?? {})) addItem(k as any, (v as number) - (getInventory() as any)[k]);
        // roads
        for (const r of data.roads ?? []) addRoadWithDurability(r.position as any, r.type as any, (r as any).durability ?? 1.0);
        // targets
        for (const t of data.targets ?? []) addTarget(t.position as any);
        // buildings
        for (const b of data.buildings ?? []) addBuilding(b.kind as any, b.position as any);
        return true;
      }
    } catch {}
  }
  // Fallback to V1
  const raw1 = localStorage.getItem(KEY_V1);
  if (!raw1) return false;
  try {
    const data1 = JSON.parse(raw1) as SaveDataV1;
    if (!data1 || data1.version !== 1) return false;
    setSanctums(data1.sanctums ?? []);
    BP.clearBlueprints();
    for (const b of data1.blueprints ?? []) BP.addBlueprint?.(b.type as any, b.position as any, (b as any).roadType);
    for (const [k, v] of Object.entries(data1.inventory ?? {})) addItem(k as any, (v as number) - (getInventory() as any)[k]);
    return true;
  } catch {
    return false;
  }
}


