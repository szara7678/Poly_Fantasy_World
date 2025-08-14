export type BuildingKind = 'House' | 'Storage' | 'Lumberyard' | 'Smelter' | 'Workshop' | 'ResearchLab' | 'Herbalist';

export interface Building {
  id: string;
  kind: BuildingKind;
  position: [number, number, number];
  level?: number; // for future upgrades
  active?: boolean; // production on/off
}

const buildings: Building[] = [];

export function addBuilding(kind: BuildingKind, position: [number, number, number]): Building {
  const b: Building = { id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` , kind, position, level: 1, active: true };
  buildings.push(b);
  return b;
}

export function getBuildings(): ReadonlyArray<Building> { return buildings; }

export function getBuildingsByKind(kind: BuildingKind): ReadonlyArray<Building> {
  return buildings.filter((b) => b.kind === kind);
}

export function removeBuilding(id: string): boolean {
  const idx = buildings.findIndex((b) => b.id === id);
  if (idx >= 0) { buildings.splice(idx, 1); return true; }
  return false;
}

export function upgradeBuilding(id: string): boolean {
  const b = buildings.find(x => x.id === id);
  if (!b) return false;
  b.level = Math.min(5, (b.level ?? 1) + 1);
  return true;
}

export function downgradeBuilding(id: string): boolean {
  const b = buildings.find(x => x.id === id);
  if (!b) return false;
  b.level = Math.max(1, (b.level ?? 1) - 1);
  return true;
}

export function setBuildingActive(id: string, active: boolean): boolean {
  const b = buildings.find(x => x.id === id);
  if (!b) return false;
  b.active = active;
  return true;
}

export function isBuildingActive(id: string): boolean {
  const b = buildings.find(x => x.id === id);
  return b ? (b.active ?? true) : false;
}

export function setBuildingLevel(id: string, level: number): boolean {
  const b = buildings.find(x => x.id === id);
  if (!b) return false;
  const lv = Math.max(1, Math.min(5, Math.floor(level)));
  b.level = lv;
  return true;
}


