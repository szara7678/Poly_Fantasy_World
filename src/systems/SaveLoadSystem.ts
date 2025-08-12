import { getSanctums, setSanctums } from './SanctumSystem';
import { getBlueprints, clearBlueprints, addBlueprint } from './BlueprintSystem';
import { getInventory, addItem } from './Inventory';

export interface SaveDataV1 {
  version: 1;
  sanctums: ReturnType<typeof getSanctums>;
  blueprints: ReturnType<typeof getBlueprints>;
  inventory: ReturnType<typeof getInventory>;
}

const KEY = 'pfw_save_v1';

export function doSave(): void {
  const data: SaveDataV1 = {
    version: 1,
    sanctums: getSanctums(),
    blueprints: getBlueprints(),
    inventory: getInventory(),
  };
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function hasSave(): boolean {
  return localStorage.getItem(KEY) !== null;
}

export function clearSave(): void {
  localStorage.removeItem(KEY);
}

export function doLoad(): boolean {
  const raw = localStorage.getItem(KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw) as SaveDataV1;
    if (!data || data.version !== 1) return false;
    // restore sanctums
    setSanctums(data.sanctums ?? []);
    // restore blueprints
    clearBlueprints();
    for (const b of data.blueprints ?? []) addBlueprint(b.type as any, b.position as any);
    // restore inventory (additive overwrite)
    for (const [k, v] of Object.entries(data.inventory ?? {})) addItem(k as any, (v as number) - (getInventory() as any)[k]);
    return true;
  } catch {
    return false;
  }
}


