export type RoadType = 'Dirt' | 'Gravel' | 'Wood' | 'Stone';

export interface RoadTile {
  id: string;
  type: RoadType;
  position: [number, number, number];
}

const roads: RoadTile[] = [];

export function addRoad(position: [number, number, number], type: RoadType = 'Dirt'): RoadTile {
  const tile: RoadTile = { id: `road_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, position, type };
  roads.push(tile);
  return tile;
}

export function getRoads(): RoadTile[] {
  return roads;
}

export function speedFactorAt(x: number, z: number): number {
  let factor = 1.0;
  for (const r of roads) {
    const dx = x - r.position[0];
    const dz = z - r.position[2];
    const distSq = dx * dx + dz * dz;
    if (distSq <= 9 * 9) {
      // within 9 units
      switch (r.type) {
        case 'Dirt':
          factor = Math.max(factor, 1.25);
          break;
        case 'Gravel':
          factor = Math.max(factor, 1.4);
          break;
        case 'Wood':
          factor = Math.max(factor, 1.35);
          break;
        case 'Stone':
          factor = Math.max(factor, 1.55);
          break;
        default:
          break;
      }
    }
  }
  return factor;
}


