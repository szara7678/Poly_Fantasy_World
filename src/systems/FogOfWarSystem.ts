import type { GameWorld } from '../ecs';
import * as THREE from 'three';
import type { SceneRoot } from '../render/three/SceneRoot';
import { getSanctums } from './SanctumSystem';

export type FogState = 'Unseen' | 'Explored' | 'Visible';

export interface FogOfWar {
  // showAll true → FoW OFF (전체 보임). false → FoW ON.
  debugVisible: boolean; // backward-compat flag
}

const fog: FogOfWar = { debugVisible: false };

export function FogOfWarSystem(_world: GameWorld, _dt: number): void {
  // TODO: texture-based FoW; for now nothing
}

export function isVisible(): boolean { return fog.debugVisible; }
export function setFogEnabled(enabled: boolean): void { fog.debugVisible = !enabled; try { (window as any).__pfw_is_fog_enabled = enabled; } catch {}
}
export function isFogEnabled(): boolean { return !fog.debugVisible; }

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

// 부채꼴(웨지) 가시화 스탬프
type VisibleSector = { center: [number, number]; radius: number; angleRad: number; fovRad: number };
const pendingSectors: VisibleSector[] = [];
export function addVisibleSector(center: [number, number], radius: number, angleRad: number, fovRad: number): void {
  pendingSectors.push({ center, radius, angleRad, fovRad });
}

export function createFogOfWarRenderSystem(scene: SceneRoot) {
  // Canvas-based alpha maps
  // - exploredTex: 역사적 탐사(Explored) 계층 — Unseen=0.9, Explored=0.6로 채움(시간 경과로 0.9로 퇴색)
  // - visibleTex: 현재 가시(Visible) 계층 — 매 프레임 클리어, 0.0로 스탬프(완전 투명)
  const WORLD_SIZE = 4000; // covers very large worlds
  const WIDTH = 512;
  const HEIGHT = 512;

  const exploredCanvas = document.createElement('canvas');
  exploredCanvas.width = WIDTH;
  exploredCanvas.height = HEIGHT;
  const exploredCtx = exploredCanvas.getContext('2d', { willReadFrequently: false })!;

  const visibleCanvas = document.createElement('canvas');
  visibleCanvas.width = WIDTH;
  visibleCanvas.height = HEIGHT;
  const visibleCtx = visibleCanvas.getContext('2d', { willReadFrequently: false })!;

  const exploredTexture = new THREE.CanvasTexture(exploredCanvas);
  exploredTexture.minFilter = THREE.LinearFilter;
  exploredTexture.magFilter = THREE.LinearFilter;
  exploredTexture.wrapS = THREE.ClampToEdgeWrapping;
  exploredTexture.wrapT = THREE.ClampToEdgeWrapping;

  const visibleTexture = new THREE.CanvasTexture(visibleCanvas);
  visibleTexture.minFilter = THREE.LinearFilter;
  visibleTexture.magFilter = THREE.LinearFilter;
  visibleTexture.wrapS = THREE.ClampToEdgeWrapping;
  visibleTexture.wrapT = THREE.ClampToEdgeWrapping;

  // Plane that uses alphaMap from canvas
  const exploredMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1.0, alphaMap: exploredTexture });
  const exploredPlane = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 1, 1), exploredMat);
  exploredPlane.rotation.x = -Math.PI / 2;
  exploredPlane.position.set(0, 10.0, 0);
  exploredMat.depthTest = false; exploredMat.depthWrite = false; exploredPlane.renderOrder = 10000;
  scene.scene.add(exploredPlane);

  const visibleMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1.0, alphaMap: visibleTexture });
  const visiblePlane = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 1, 1), visibleMat);
  visiblePlane.rotation.x = -Math.PI / 2;
  visiblePlane.position.set(0, 10.001, 0);
  visibleMat.depthTest = false; visibleMat.depthWrite = false; visiblePlane.renderOrder = 10001;
  scene.scene.add(visiblePlane);

  function worldToUV(x: number, z: number): { u: number; v: number } {
    const half = WORLD_SIZE / 2;
    const u = THREE.MathUtils.clamp((x + half) / WORLD_SIZE, 0, 1);
    const v = THREE.MathUtils.clamp((z + half) / WORLD_SIZE, 0, 1);
    return { u, v };
  }

  function drawCircle(ctx: CanvasRenderingContext2D, px: number, py: number, pr: number, gray: number): void {
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    const g = Math.round(THREE.MathUtils.clamp(gray, 0, 1) * 255);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fill();
  }

  function drawStrokeWorld(ctx: CanvasRenderingContext2D, points: Array<[number, number]>, radius: number, gray: number): void {
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
      const pr = Math.max(1, Math.ceil((radius / WORLD_SIZE) * WIDTH));
      const steps = Math.max(1, Math.ceil(Math.hypot(p1x - p0x, p1y - p0y) / (pr > 0 ? pr : 1)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = Math.round(p0x + (p1x - p0x) * t);
        const py = Math.round(p0y + (p1y - p0y) * t);
        drawCircle(ctx, px, py, Math.max(1, pr), gray);
      }
    }
  }

  // Initialize to full fog (opaque): alphaMap uses grayscale as alpha → white(255)=완전 차폐
  exploredCtx.fillStyle = 'rgb(255,255,255)';
  exploredCtx.fillRect(0, 0, WIDTH, HEIGHT);
  exploredTexture.needsUpdate = true;
  visibleCtx.clearRect(0, 0, WIDTH, HEIGHT);
  visibleTexture.needsUpdate = true;

  const EXPLORED_HALF_LIFE_SEC = 7 * 60; // 약 7분 후 절반 정도로 퇴색 (플랜 5~10분 범위)

  return function FogOfWarRenderSystem(_world: GameWorld, _dt: number): void {
    const sanctums = getSanctums();
    // FoW visible when enabled. Planes render on top to darken everything.
    const show = !fog.debugVisible;
    exploredPlane.visible = show;
    visiblePlane.visible = show;
    if (!show) return;
    try { (window as any).__pfw_is_fog_enabled = true; } catch {}

    // Decay explored toward unseen (fade-in black) — time-based using dt
    const decay = Math.pow(0.5, Math.max(0, _dt) / EXPLORED_HALF_LIFE_SEC);
    const img = exploredCtx.getImageData(0, 0, WIDTH, HEIGHT);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      // move toward full fog (255) to re-fog areas slowly
      const g = data[i];
      const target = 255;
      const ng = Math.min(255, Math.round(g * decay + target * (1 - decay)));
      data[i] = data[i + 1] = data[i + 2] = ng;
      // alpha should remain 255 for alphaMap sampling
      data[i + 3] = 255;
    }
    exploredCtx.putImageData(img, 0, 0);
    // Apply queued explored strokes (e.g., scout paths)
    while (pendingStrokes.length > 0) {
      const stroke = pendingStrokes.shift()!;
      drawStrokeWorld(exploredCtx, stroke.points, stroke.radius, 0.6);
    }

    // Reset visible layer for this frame
    visibleCtx.clearRect(0, 0, WIDTH, HEIGHT);
    // Apply queued visible stamps (disk)
    while (pendingVisible.length > 0) {
      const s = pendingVisible.shift()!;
      const { u, v } = worldToUV(s.center[0], s.center[1]);
      const px = Math.floor(u * WIDTH);
      const py = Math.floor((1 - v) * HEIGHT);
      const pr = Math.max(1, Math.ceil((s.radius / WORLD_SIZE) * WIDTH));
      drawCircle(visibleCtx, px, py, Math.max(1, pr), 0.0);
      // also clear explored in this region so it appears bright (no haze) → set to 0 (black)
      drawCircle(exploredCtx, px, py, Math.max(1, pr), 0.0);
    }

    // Apply queued visible sectors (wedge)
    while (pendingSectors.length > 0) {
      const s = pendingSectors.shift()!;
      const { u, v } = worldToUV(s.center[0], s.center[1]);
      const cx = Math.floor(u * WIDTH);
      const cy = Math.floor((1 - v) * HEIGHT);
      const pr = Math.max(1, Math.ceil((s.radius / WORLD_SIZE) * WIDTH));
      const a0 = s.angleRad - s.fovRad * 0.5;
      const a1 = s.angleRad + s.fovRad * 0.5;
      visibleCtx.beginPath();
      visibleCtx.moveTo(cx, cy);
      visibleCtx.arc(cx, cy, Math.max(1, pr), -a0 + Math.PI, -a1 + Math.PI, true);
      visibleCtx.closePath();
      visibleCtx.fillStyle = 'rgb(0,0,0)';
      visibleCtx.fill();
      exploredCtx.beginPath();
      exploredCtx.moveTo(cx, cy);
      exploredCtx.arc(cx, cy, Math.max(1, pr), -a0 + Math.PI, -a1 + Math.PI, true);
      exploredCtx.closePath();
      exploredCtx.fillStyle = 'rgb(0,0,0)';
      exploredCtx.fill();
    }

    for (const s of sanctums) {
      const { u, v } = worldToUV(s.center[0], s.center[2]);
      const px = Math.floor(u * WIDTH);
      const py = Math.floor((1 - v) * HEIGHT);
      const pr = Math.ceil((s.radius / WORLD_SIZE) * WIDTH);
      // 성역은 항상 완전 가시: 두 레이어 모두 0(black)으로 클리어
      drawCircle(exploredCtx, px, py, Math.max(0, pr + 6), 0.0);
      drawCircle(visibleCtx, px, py, Math.max(0, pr), 0.0);
    }
    exploredTexture.needsUpdate = true;
    visibleTexture.needsUpdate = true;
    try {
      const vis = visibleCtx.getImageData(0, 0, WIDTH, HEIGHT);
      (window as any).__pfw_fow_vis = { data: vis.data, W: WIDTH, H: HEIGHT, WORLD_SIZE };
      (window as any).__pfw_is_fog_enabled = true;
    } catch {}
  };
}

export function isWorldVisible(x: number, z: number): boolean {
  if ((globalThis as any).window?.__pfw_is_fog_enabled === false) return true;
  const pack: any = (globalThis as any).window?.__pfw_fow_vis;
  if (!pack) return false;
  const { data, W, H, WORLD_SIZE } = pack;
  const half = WORLD_SIZE / 2;
  const u = Math.max(0, Math.min(1, (x + half) / WORLD_SIZE));
  const v = Math.max(0, Math.min(1, (z + half) / WORLD_SIZE));
  const px = Math.floor(u * W);
  const py = Math.floor((1 - v) * H);
  const idx = (py * W + px) * 4;
  // visible layer is black when visible → low grayscale
  return data[idx] < 8;
}


