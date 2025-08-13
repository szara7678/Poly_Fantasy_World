import type { GameWorld } from '../ecs';
import * as THREE from 'three';
import type { SceneRoot } from '../render/three/SceneRoot';
import { getSanctums } from './SanctumSystem';

export type FogState = 'Unseen' | 'Explored' | 'Visible';

export interface FogOfWar {
  // Minimal stub for future texture/grid implementation
  debugVisible: boolean;
}

const fog: FogOfWar = { debugVisible: true };

export function FogOfWarSystem(_world: GameWorld, _dt: number): void {
  // TODO: texture-based FoW; for now nothing
}

export function isVisible(): boolean {
  return fog.debugVisible;
}

export function setDebugVisible(v: boolean): void {
  fog.debugVisible = v;
}

type Stroke = { points: Array<[number, number]>; radius: number };
const pendingStrokes: Stroke[] = [];

export function addExploredStroke(points: Array<[number, number]>, radius: number): void {
  pendingStrokes.push({ points, radius });
}

type VisibleStamp = { center: [number, number]; radius: number };
const pendingVisible: VisibleStamp[] = [];

// 정찰 스윕 등: 중심에서 특정 반경을 일시적으로 Visible(완전 투명) 처리
export function addVisibleSweep(center: [number, number], radius: number): void {
  pendingVisible.push({ center, radius });
}

export function createFogOfWarRenderSystem(scene: SceneRoot) {
  // Canvas-based alpha map: Unseen=0.9, Explored=0.6, Visible=0.0
  const WORLD_SIZE = 400; // covers x,z in [-200,200]
  const WIDTH = 512;
  const HEIGHT = 512;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  // Plane that uses alphaMap from canvas
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 1.0,
    alphaMap: texture,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 1, 1), material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, 0.05, 0);
  scene.scene.add(plane);

  function worldToUV(x: number, z: number): { u: number; v: number } {
    const half = WORLD_SIZE / 2;
    const u = THREE.MathUtils.clamp((x + half) / WORLD_SIZE, 0, 1);
    const v = THREE.MathUtils.clamp((z + half) / WORLD_SIZE, 0, 1);
    return { u, v };
  }

  function drawCircle(px: number, py: number, pr: number, gray: number): void {
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    const g = Math.round(THREE.MathUtils.clamp(gray, 0, 1) * 255);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fill();
  }

  function drawStrokeWorld(points: Array<[number, number]>, radius: number, gray: number): void {
    if (points.length < 2) return;
    // Draw discs along the polyline in texture space
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, z0] = points[i];
      const [x1, z1] = points[i + 1];
      const { u: u0, v: v0 } = worldToUV(x0, z0);
      const { u: u1, v: v1 } = worldToUV(x1, z1);
      const p0x = Math.floor(u0 * WIDTH);
      const p0y = Math.floor((1 - v0) * HEIGHT);
      const p1x = Math.floor(u1 * WIDTH);
      const p1y = Math.floor((1 - v1) * HEIGHT);
      const pr = Math.ceil((radius / WORLD_SIZE) * WIDTH);
      const steps = Math.max(1, Math.ceil(Math.hypot(p1x - p0x, p1y - p0y) / (pr > 0 ? pr : 1)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = Math.round(p0x + (p1x - p0x) * t);
        const py = Math.round(p0y + (p1y - p0y) * t);
        drawCircle(px, py, Math.max(1, pr), gray);
      }
    }
  }

  // Initialize empty; explored buffer persists and decays over time
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  texture.needsUpdate = true;

  const EXPLORED_HALF_LIFE_SEC = 7 * 60; // 약 7분 후 절반 정도로 퇴색 (플랜 5~10분 범위)

  return function FogOfWarRenderSystem(_world: GameWorld, _dt: number): void {
    const sanctums = getSanctums();
    // Show plane only when FoW enabled and there is at least one sanctum
    plane.visible = !fog.debugVisible && sanctums.length > 0;
    if (!plane.visible) return;

    // Decay explored toward unseen (fade-in black) — time-based using dt
    const decay = Math.pow(0.5, Math.max(0, _dt) / EXPLORED_HALF_LIFE_SEC);
    const img = ctx.getImageData(0, 0, WIDTH, HEIGHT);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      // grayscale in R=G=B
      const g = data[i];
      // move toward 230 (0.9*255) slowly
      const target = 230;
      const ng = Math.min(target, Math.round(g * decay + target * (1 - decay)));
      data[i] = data[i + 1] = data[i + 2] = ng;
      // alpha should remain 255 for alphaMap sampling
      data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // Apply queued explored strokes (e.g., scout paths)
    while (pendingStrokes.length > 0) {
      const stroke = pendingStrokes.shift()!;
      drawStrokeWorld(stroke.points, stroke.radius, 0.6);
    }

    // Apply queued visible stamps (e.g., scout fan sweep simplified as a disk)
    while (pendingVisible.length > 0) {
      const s = pendingVisible.shift()!;
      const { u, v } = worldToUV(s.center[0], s.center[1]);
      const px = Math.floor(u * WIDTH);
      const py = Math.floor((1 - v) * HEIGHT);
      const pr = Math.ceil((s.radius / WORLD_SIZE) * WIDTH);
      drawCircle(px, py, Math.max(1, pr), 0.0);
    }

    for (const s of sanctums) {
      const { u, v } = worldToUV(s.center[0], s.center[2]);
      const px = Math.floor(u * WIDTH);
      const py = Math.floor((1 - v) * HEIGHT);
      const pr = Math.ceil((s.radius / WORLD_SIZE) * WIDTH);
      // Explored ring (lighter black)
      drawCircle(px, py, Math.max(0, pr + 6), 0.6);
      // Visible core (fully clear)
      drawCircle(px, py, Math.max(0, pr), 0.0);
    }
    texture.needsUpdate = true;
  };
}


