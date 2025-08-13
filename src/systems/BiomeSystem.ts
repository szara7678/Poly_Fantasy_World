import * as THREE from 'three';
import type { SceneRoot } from '../render/three/SceneRoot';

export type Biome = 'DeepWater' | 'ShallowWater' | 'Beach' | 'Plains' | 'Grassland' | 'Forest' | 'Wetland' | 'Hills' | 'Rocky' | 'Snow';

// World params
const WORLD_HALF = 256; // meters
const SEED = 1337;

// Hash helpers for deterministic value noise
function hash2(ix: number, iz: number): number {
  const x = ix | 0; const z = iz | 0;
  let h = (x * 374761393 + z * 668265263) ^ (SEED * 1274126177);
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h & 0xfffffff) / 0xfffffff;
}

function smoothstep(t: number): number { return t * t * (3 - 2 * t); }

function valueNoise2D(x: number, z: number, scale: number): number {
  const fx = x / scale; const fz = z / scale;
  const x0 = Math.floor(fx); const z0 = Math.floor(fz);
  const tx = fx - x0; const tz = fz - z0;
  const x1 = x0 + 1; const z1 = z0 + 1;
  const v00 = hash2(x0, z0);
  const v10 = hash2(x1, z0);
  const v01 = hash2(x0, z1);
  const v11 = hash2(x1, z1);
  const sx = smoothstep(tx); const sz = smoothstep(tz);
  const a = v00 * (1 - sx) + v10 * sx;
  const b = v01 * (1 - sx) + v11 * sx;
  return a * (1 - sz) + b * sz; // 0..1
}

function fbm(x: number, z: number, baseScale: number, octaves = 4, persistence = 0.5, lacunarity = 2.0): number {
  let amp = 1.0;
  let freq = 1.0;
  let sum = 0;
  let div = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x, z, baseScale / freq);
    div += amp;
    amp *= persistence;
    freq *= lacunarity;
  }
  return sum / Math.max(1e-6, div);
}

function temperatureAt(x: number, z: number): number {
  // base latitudinal gradient + noise
  const lat = 0.5 + (z / (WORLD_HALF * 2)); // -1..1 → 0..1
  const n = fbm(x + 1000, z + 1000, 180, 3, 0.55, 2.3);
  return THREE.MathUtils.clamp(0.85 * (1 - Math.abs(lat - 0.5) * 1.6) + 0.15 * n, 0, 1);
}

function moistureAt(x: number, z: number): number {
  return fbm(x - 2000, z + 3000, 140, 4, 0.5, 2.1);
}

export function getHeightAt(x: number, z: number): number {
  return fbm(x, z, 220, 5, 0.5, 2.0);
}

export function getBiomeAt(x: number, z: number): Biome {
  const h = getHeightAt(x, z);
  const m = moistureAt(x, z);
  const t = temperatureAt(x, z);
  if (h < 0.30) return 'DeepWater';
  if (h < 0.34) return 'ShallowWater';
  if (h < 0.37) return 'Beach';
  if (h < 0.55) {
    if (m < 0.35) return 'Plains';
    if (m < 0.6) return 'Grassland';
    return 'Wetland';
  }
  if (h < 0.72) {
    return m > 0.55 ? 'Forest' : 'Hills';
  }
  if (t < 0.45) return 'Snow';
  return 'Rocky';
}

function colorFor(biome: Biome): number {
  switch (biome) {
    case 'DeepWater': return 0x1a2a5a;
    case 'ShallowWater': return 0x2a6faa;
    case 'Beach': return 0xded29c;
    case 'Plains': return 0xa7d46f;
    case 'Grassland': return 0x6ecb63;
    case 'Forest': return 0x2d7a3e;
    case 'Wetland': return 0x379683;
    case 'Hills': return 0x8c9a5b;
    case 'Rocky': return 0x8b8c7a;
    case 'Snow': return 0xe9f1f7;
    default: return 0x444444;
  }
}

export function createBiomeRenderSystem(scene: SceneRoot) {
  const size = 1024; // texture size
  const worldSize = WORLD_HALF * 2; // meters
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  // paint once
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wx = -WORLD_HALF + (x / (size - 1)) * worldSize;
      const wz = -WORLD_HALF + (y / (size - 1)) * worldSize;
      const b = getBiomeAt(wx, wz);
      const col = colorFor(b);
      const i = (y * size + x) * 4;
      img.data[i + 0] = (col >> 16) & 0xff;
      img.data[i + 1] = (col >> 8) & 0xff;
      img.data[i + 2] = col & 0xff;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipMapLinearFilter;

  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldSize, worldSize), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, -0.001, 0);
  scene.scene.add(mesh);

  return function BiomeRenderSystem(): void {
    // static texture; nothing per-frame for now
  };
}


