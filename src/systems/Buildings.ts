export type BuildingKind = 'House' | 'Storage' | 'Lumberyard' | 'Smelter' | 'Workshop' | 'ResearchLab';

export interface Building {
  id: string;
  kind: BuildingKind;
  position: [number, number, number];
}

const buildings: Building[] = [];

export function addBuilding(kind: BuildingKind, position: [number, number, number]): Building {
  const b: Building = { id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` , kind, position };
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


