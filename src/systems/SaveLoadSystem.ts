import { getSanctums, setSanctums } from './SanctumSystem';
import * as BP from './BlueprintSystem';
import { getInventory, addItem } from './Inventory';
import { getRoads, addRoadWithDurability } from './RoadNetwork';
import { listTargets, addTarget } from './TargetSystem';
import { getBuildings, addBuilding } from './Buildings';

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

const KEY_V1 = 'pfw_save_v1';
const KEY_V2 = 'pfw_save_v2';

export function doSave(): void {
  const data: SaveDataV2 = {
    version: 2,
    sanctums: getSanctums(),
    blueprints: BP.getBlueprints(),
    inventory: getInventory(),
    roads: getRoads().map((r) => ({ position: r.position, type: r.type as any, durability: r.durability })),
    targets: listTargets().map((t) => ({ position: t.position })),
    buildings: getBuildings().map((b) => ({ kind: b.kind as any, position: b.position })),
  };
  localStorage.setItem(KEY_V2, JSON.stringify(data));
}

export function hasSave(): boolean {
  return localStorage.getItem(KEY_V2) !== null || localStorage.getItem(KEY_V1) !== null;
}

export function clearSave(): void {
  localStorage.removeItem(KEY_V2);
  localStorage.removeItem(KEY_V1);
}

export function doLoad(): boolean {
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


