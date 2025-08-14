import { getHeightAt } from './BiomeSystem';
import { speedFactorAt } from './RoadNetwork';
import { getMonsters } from './MonsterSystem';
import { getRoadSlopeAllowance } from './ResearchSystem';

type Vec2 = { x: number; z: number };

// Tunable parameters (exposed via Debug UI)
type PFParams = {
  roadWeight: number; // >1 favors roads more strongly
  dangerStrong: number; // m
  dangerWeak: number; // m
  slopeBiasDeg: number; // degrees added to allowance for leniency (- makes more strict)
  cell: number; // grid cell size
  maxRadius: number; // search window radius
};

const pfParams: PFParams = {
  roadWeight: 1.0,
  dangerStrong: 8,
  dangerWeak: 16,
  slopeBiasDeg: 0,
  cell: 4,
  maxRadius: 48,
};

export function getPFParams(): PFParams { return { ...pfParams }; }
export function setPFParams(p: Partial<PFParams>): void {
  if (typeof p.roadWeight === 'number') pfParams.roadWeight = Math.max(0.2, Math.min(3, p.roadWeight));
  if (typeof p.dangerStrong === 'number') pfParams.dangerStrong = Math.max(2, Math.min(30, p.dangerStrong));
  if (typeof p.dangerWeak === 'number') pfParams.dangerWeak = Math.max(pfParams.dangerStrong + 1, Math.min(60, p.dangerWeak));
  if (typeof p.slopeBiasDeg === 'number') pfParams.slopeBiasDeg = Math.max(-15, Math.min(15, p.slopeBiasDeg));
  if (typeof p.cell === 'number') pfParams.cell = Math.max(2, Math.min(8, Math.floor(p.cell)));
  if (typeof p.maxRadius === 'number') pfParams.maxRadius = Math.max(16, Math.min(128, Math.floor(p.maxRadius)));
}

function heuristic(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nearestDanger(x: number, z: number): number {
  const mons = getMonsters();
  if (mons.length === 0) return Infinity;
  let best = Infinity;
  for (const m of mons) {
    const d = Math.hypot(m.pos.x - x, m.pos.z - z);
    if (d < best) best = d;
  }
  return best;
}

function slopeDeg(ax: number, az: number, bx: number, bz: number): number {
  const h1 = getHeightAt(ax, az);
  const h2 = getHeightAt(bx, bz);
  const dh = (h2 - h1) * 1.2;
  const dx = Math.hypot(bx - ax, bz - az);
  return Math.atan2(Math.abs(dh), Math.max(1e-3, dx)) * 180 / Math.PI;
}

function stepCost(ax: number, az: number, bx: number, bz: number): number {
  // Base move cost
  let cost = Math.hypot(bx - ax, bz - az) / 4; // normalize to cell size
  // Roads cheaper (faster)
  const roadFactor = speedFactorAt(ax, az);
  const roadWeight = Math.max(0.2, pfParams.roadWeight);
  cost *= Math.max(0.4, (1.6 / Math.max(1.0, roadFactor)) ** roadWeight);
  // Slope penalty
  const allow = getRoadSlopeAllowance() + pfParams.slopeBiasDeg;
  const deg = slopeDeg(ax, az, bx, bz);
  if (deg > allow + 8) return Infinity; // block
  if (deg > allow) cost *= 4;
  else if (deg > allow - 10) cost *= 1.2;
  // Danger penalty
  const nd = nearestDanger(bx, bz);
  if (nd <= pfParams.dangerStrong) cost *= 4;
  else if (nd <= pfParams.dangerWeak) cost *= 1.6;
  return cost;
}

function reconstruct(came: Map<string, string>, node: string, idxToPos: (idx: number) => Vec2): Vec2[] {
  const out: Vec2[] = [];
  let cur = node;
  while (cur) {
    const id = parseInt(cur, 10);
    out.push(idxToPos(id));
    const prev = came.get(cur);
    if (!prev) break;
    cur = prev;
  }
  out.reverse();
  return out;
}

export function computePath(from: [number, number], to: [number, number], maxRadius = pfParams.maxRadius, cell = pfParams.cell): [number, number, number][] | null {
  const fx = from[0], fz = from[1];
  const tx = to[0], tz = to[1];
  const minx = Math.min(fx, tx) - maxRadius;
  const minz = Math.min(fz, tz) - maxRadius;
  const maxx = Math.max(fx, tx) + maxRadius;
  const maxz = Math.max(fz, tz) + maxRadius;
  const nx = Math.max(3, Math.ceil((maxx - minx) / cell));
  const nz = Math.max(3, Math.ceil((maxz - minz) / cell));

  function posToIdx(x: number, z: number): number {
    const ix = Math.max(0, Math.min(nx - 1, Math.round((x - minx) / cell)));
    const iz = Math.max(0, Math.min(nz - 1, Math.round((z - minz) / cell)));
    return iz * nx + ix;
  }
  function idxToPos(idx: number): Vec2 {
    const iz = Math.floor(idx / nx);
    const ix = idx - iz * nx;
    return { x: minx + ix * cell, z: minz + iz * cell };
  }

  const start = posToIdx(fx, fz);
  const goal = posToIdx(tx, tz);

  const open = new Set<string>();
  const came = new Map<string, string>();
  const g = new Map<string, number>();
  const f = new Map<string, number>();
  function toKey(id: number): string { return String(id); }
  open.add(toKey(start));
  g.set(toKey(start), 0);
  f.set(toKey(start), heuristic(idxToPos(start), idxToPos(goal)));

  const neigh = [
    [1,0],[0,1],[-1,0],[0,-1],
    [1,1],[-1,1],[1,-1],[-1,-1],
  ];

  let iter = 0;
  const maxIter = nx * nz * 4;
  while (open.size > 0 && iter++ < maxIter) {
    // pick node in open with lowest f
    let curKey: string | null = null;
    let bestF = Infinity;
    for (const k of open) {
      const fv = f.get(k) ?? Infinity;
      if (fv < bestF) { bestF = fv; curKey = k; }
    }
    if (!curKey) break;
    const curIdx = parseInt(curKey, 10);
    if (curIdx === goal) {
      const pts = reconstruct(came, curKey, idxToPos);
      // simplify by skipping unnecessary points
      const out: [number, number, number][] = [];
      for (const p of pts) out.push([p.x, 0, p.z]);
      return out;
    }
    open.delete(curKey);
    const curPos = idxToPos(curIdx);
    const cG = g.get(curKey) ?? Infinity;
    for (const [dx, dz] of neigh) {
      const nPos = { x: curPos.x + dx * cell, z: curPos.z + dz * cell };
      if (nPos.x < minx || nPos.x > maxx || nPos.z < minz || nPos.z > maxz) continue;
      const nIdx = posToIdx(nPos.x, nPos.z);
      const nk = toKey(nIdx);
      const sc = stepCost(curPos.x, curPos.z, nPos.x, nPos.z);
      if (!isFinite(sc)) continue;
      const tentative = cG + sc;
      if (tentative < (g.get(nk) ?? Infinity)) {
        came.set(nk, curKey);
        g.set(nk, tentative);
        const h = heuristic(nPos, idxToPos(goal));
        f.set(nk, tentative + h);
        open.add(nk);
      }
    }
  }
  return null;
}

// Simple cache keyed by rounded start/end grid with TTL
type Cached = { path: [number, number, number][] | null; t: number };
const pathCache = new Map<string, Cached>();
const MAX_CACHE = 64;
const CACHE_TTL_MS = 5000; // 5 seconds
function cacheKey(from: [number, number], to: [number, number], cell: number): string {
  const fx = Math.round(from[0] / cell), fz = Math.round(from[1] / cell);
  const tx = Math.round(to[0] / cell), tz = Math.round(to[1] / cell);
  return `${fx},${fz}->${tx},${tz}`;
}

export function computePathCached(from: [number, number], to: [number, number], maxRadius = pfParams.maxRadius, cell = pfParams.cell): [number, number, number][] | null {
  const key = cacheKey(from, to, cell);
  const now = performance.now();
  const hit = pathCache.get(key);
  if (hit && (now - hit.t) <= CACHE_TTL_MS) return hit.path ?? null;
  const res = computePath(from, to, maxRadius, cell);
  if (pathCache.size >= MAX_CACHE) {
    // evict first key
    const k0 = pathCache.keys().next().value as string | undefined;
    if (k0) pathCache.delete(k0);
  }
  pathCache.set(key, { path: res, t: now });
  return res;
}

// Debug render system
import * as THREE from 'three';
import type { SceneRoot } from '../render/three/SceneRoot';

export function createPathDebugRenderSystem(scene: SceneRoot) {
  const group = new THREE.Group();
  scene.scene.add(group);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffcc00 });
  const sphereGeo = new THREE.SphereGeometry(0.2, 8, 6);
  return function PathDebugRender(): void {
    // clear group
    while (group.children.length) {
      const c = group.children.pop()!;
      // @ts-ignore
      c.geometry?.dispose?.();
      // @ts-ignore
      c.material?.dispose?.();
    }
    const on = (window as any).__pfw_path_debug_on as boolean | undefined;
    const path: [number, number, number][] | undefined = (window as any).__pfw_path_debug as any;
    if (!on || !path || path.length < 2) return;
    const verts: number[] = [];
    for (const p of path) { verts.push(p[0], p[1] + 0.05, p[2]); }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const line = new THREE.Line(geom, lineMat.clone());
    group.add(line);
    for (const p of path) {
      const s = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0x00ffff }));
      s.position.set(p[0], p[1] + 0.05, p[2]);
      group.add(s);
    }
  };
}

export function clearPathCache(): void {
  pathCache.clear();
}

// Simplify path by skipping intermediate points when a straight segment is acceptable
function canLink(ax: number, az: number, bx: number, bz: number, cell: number): boolean {
  // sample along the straight line every half-cell to ensure slope/danger is OK
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil((len / cell) * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + dx * t;
    const z = az + dz * t;
    const nd = nearestDanger(x, z);
    if (nd <= 8) return false;
    // local slope between current and small step ahead
    const x2 = ax + dx * Math.min(1, t + 1 / steps);
    const z2 = az + dz * Math.min(1, t + 1 / steps);
    const deg = slopeDeg(x, z, x2, z2);
    if (deg > getRoadSlopeAllowance() + 8) return false;
  }
  return true;
}

function smoothPath(path: [number, number, number][], cell: number): [number, number, number][] {
  if (!path || path.length <= 2) return path;
  const out: [number, number, number][] = [];
  let i = 0;
  while (i < path.length) {
    out.push(path[i]);
    let j = Math.min(path.length - 1, i + 1);
    for (let k = i + 2; k < path.length; k++) {
      if (canLink(path[i][0], path[i][2], path[k][0], path[k][2], cell)) j = k; else break;
    }
    i = j;
    if (i === path.length - 1) { out.push(path[i]); break; }
  }
  // remove consecutive duplicates
  const final: [number, number, number][] = [];
  for (const p of out) {
    if (final.length === 0 || final[final.length - 1][0] !== p[0] || final[final.length - 1][2] !== p[2]) final.push(p);
  }
  return final;
}

export function computePathSmart(from: [number, number], to: [number, number], maxRadius = pfParams.maxRadius, cell = pfParams.cell): [number, number, number][] | null {
  const base = computePathCached(from, to, maxRadius, cell);
  if (!base) return null;
  return smoothPath(base, cell);
}


