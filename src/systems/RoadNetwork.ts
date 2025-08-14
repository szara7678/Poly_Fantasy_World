import * as THREE from 'three';
import { getHeightAt } from './BiomeSystem';
import { clearPathCache } from './Pathfinding';
import { getRoadSpeedMult } from './ResearchSystem';
import type { SceneRoot } from '../render/three/SceneRoot';

export type RoadType = 'Dirt' | 'Gravel' | 'Wood' | 'Stone';

export interface RoadTile {
  id: string;
  type: RoadType;
  position: [number, number, number];
  durability?: number; // 0..1
}

const roads: RoadTile[] = [];

// Spatial index for nearby lookups (simple uniform grid)
const CELL_SIZE = 4; // meters
const grid = new Map<string, RoadTile[]>(); // key: `${ix},${iz}`

function keyFor(x: number, z: number): string {
  const ix = Math.floor(x / CELL_SIZE);
  const iz = Math.floor(z / CELL_SIZE);
  return `${ix},${iz}`;
}

function addToGrid(tile: RoadTile): void {
  const k = keyFor(tile.position[0], tile.position[2]);
  const arr = grid.get(k) ?? [];
  arr.push(tile);
  grid.set(k, arr);
}

function getNearby(x: number, z: number): RoadTile[] {
  const ix = Math.floor(x / CELL_SIZE);
  const iz = Math.floor(z / CELL_SIZE);
  const out: RoadTile[] = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const k = `${ix + dx},${iz + dz}`;
      const arr = grid.get(k);
      if (arr && arr.length) out.push(...arr);
    }
  }
  return out;
}

export function addRoad(position: [number, number, number], type: RoadType = 'Dirt'): RoadTile {
  // Deduplicate/merge: if a road tile already exists very close, merge instead of adding
  const near = getNearby(position[0], position[2]);
  const existing = near.find(r => Math.abs(r.position[0] - position[0]) < 0.9 && Math.abs(r.position[2] - position[2]) < 0.9);
  if (existing) {
    // Prefer higher-grade type by rough speed ordering
    const order: Record<RoadType, number> = { Dirt: 1, Gravel: 2, Wood: 2, Stone: 3 } as any;
    if (order[type] > order[existing.type]) existing.type = type;
    existing.durability = Math.max(existing.durability ?? 1.0, 1.0);
    return existing;
  }
  const tile: RoadTile = { id: `road_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, position, type, durability: 1.0 };
  roads.push(tile);
  addToGrid(tile);
  try { clearPathCache(); } catch {}
  return tile;
}

export function addRoadWithDurability(position: [number, number, number], type: RoadType, durability: number): RoadTile {
  const near = getNearby(position[0], position[2]);
  const existing = near.find(r => Math.abs(r.position[0] - position[0]) < 0.9 && Math.abs(r.position[2] - position[2]) < 0.9);
  if (existing) {
    const order: Record<RoadType, number> = { Dirt: 1, Gravel: 2, Wood: 2, Stone: 3 } as any;
    if (order[type] > order[existing.type]) existing.type = type;
    existing.durability = Math.max(existing.durability ?? 1.0, Math.max(0.0, Math.min(1.0, durability)));
    return existing;
  }
  const tile: RoadTile = { id: `road_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, position, type, durability: Math.max(0.0, Math.min(1.0, durability)) };
  roads.push(tile);
  addToGrid(tile);
  try { clearPathCache(); } catch {}
  return tile;
}

export function getRoads(): RoadTile[] {
  return roads;
}

// Query: is there a road tile near x,z within tolerance meters
export function hasRoadNear(x: number, z: number, tol = 0.9): boolean {
  const near = getNearby(x, z);
  return near.some(r => Math.abs(r.position[0] - x) < tol && Math.abs(r.position[2] - z) < tol);
}

export function speedFactorAt(x: number, z: number): number {
  let factor = 1.0;
  const candidates = getNearby(x, z);
  for (const r of candidates) {
    const dx = x - r.position[0];
    const dz = z - r.position[2];
    const distSq = dx * dx + dz * dz;
    if (distSq <= 9 * 9) {
      // within 9 units
      const wear = Math.max(0.6, r.durability ?? 1);
      switch (r.type) {
        case 'Dirt':
          factor = Math.max(factor, 1.25 * wear);
          break;
        case 'Gravel':
          factor = Math.max(factor, 1.4 * wear);
          break;
        case 'Wood':
          factor = Math.max(factor, 1.35 * wear);
          break;
        case 'Stone':
          factor = Math.max(factor, 1.55 * wear);
          break;
        default:
          break;
      }
    }
  }
  return factor * getRoadSpeedMult();
}

export function createRoadRenderSystem(scene: SceneRoot) {
  const group = new THREE.Group();
  scene.scene.add(group);
  const meshes: Record<string, THREE.Mesh> = {};
  (globalThis as any).__pfw_roads = roads;

  function colorFor(type: RoadType): number {
    switch (type) {
      case 'Dirt':
        return 0x8a7a55;
      case 'Gravel':
        return 0x9a9a9a;
      case 'Wood':
        return 0xb08040;
      case 'Stone':
        return 0xcfcfcf;
      default:
        return 0xaaaaaa;
    }
  }

  return function RoadRenderSystem(): void {
    // Remove stale
    for (const id of Object.keys(meshes)) {
      if (!roads.find((r) => r.id === id)) {
        const m = meshes[id];
        group.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        delete meshes[id];
      }
    }
    // Ensure meshes for all roads and sync props
    for (const r of roads) {
      let m = meshes[r.id];
      if (!m) {
        m = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 0.08, 2.2),
          new THREE.MeshBasicMaterial({ color: colorFor(r.type) })
        );
        meshes[r.id] = m;
        group.add(m);
      }
      const h = getHeightAt(r.position[0], r.position[2]);
      const y = (h - 0.5) * 1.2;
      m.position.set(r.position[0], 0.04 + y, r.position[2]);
      const mat = m.material as THREE.MeshBasicMaterial;
      const wear = Math.max(0.6, r.durability ?? 1);
      mat.color.set(colorFor(r.type));
      mat.opacity = 0.6 + 0.4 * wear;
      mat.transparent = true;
    }
  };
}


