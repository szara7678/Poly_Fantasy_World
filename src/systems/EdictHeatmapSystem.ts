import * as THREE from 'three';
import type { SceneRoot } from '../render/three/SceneRoot';
import type { GameWorld } from '../ecs';
import { getNodes } from './NodeRegenSystem';
import { getDomainTagMultiplier } from './EdictSystem';

// 간단 전언 히트맵: Gather 도메인의 멀티값을 노드 중심으로 붉게 시각화
let HEATMAP_RADIUS_M = 30; // default radius in meters
let HEATMAP_STRENGTH = 1.0; // 0..1 multiplier
let HEATMAP_VISIBLE = true;

export function setEdictHeatmapRadius(meters: number): void {
  HEATMAP_RADIUS_M = Math.max(5, Math.min(120, meters));
}
export function setEdictHeatmapStrength(mult: number): void {
  HEATMAP_STRENGTH = Math.max(0, Math.min(1.0, mult));
}
export function setEdictHeatmapVisible(v: boolean): void { HEATMAP_VISIBLE = !!v; }

export function createEdictHeatmapRenderSystem(scene: SceneRoot) {
  const WORLD_SIZE = 400; // FoW와 동일 커버리지
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

  // Additive red overlay
  const material = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 1.0, alphaMap: texture, blending: THREE.AdditiveBlending });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 1, 1), material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, 0.06, 0);
  scene.scene.add(plane);

  function worldToUV(x: number, z: number): { u: number; v: number } {
    const half = WORLD_SIZE / 2;
    const u = THREE.MathUtils.clamp((x + half) / WORLD_SIZE, 0, 1);
    const v = THREE.MathUtils.clamp((z + half) / WORLD_SIZE, 0, 1);
    return { u, v };
  }

  function drawRadial(px: number, py: number, pr: number, strength: number): void {
    const grd = ctx.createRadialGradient(px, py, 0, px, py, pr);
    const alpha = THREE.MathUtils.clamp(strength, 0, 1);
    const g = Math.floor(255 * (1 - alpha));
    // alphaMap은 그레이스케일 사용 → 중앙 낮은 그레이(투명), 외곽 높은 그레이(불투명)
    grd.addColorStop(0, `rgb(${Math.floor(255 * (1 - alpha))},${g},${g})`);
    grd.addColorStop(1, 'rgb(255,255,255)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  return function EdictHeatmapRender(_world: GameWorld, _dt: number): void {
    // Toggle visibility
    plane.visible = HEATMAP_VISIBLE;
    if (!HEATMAP_VISIBLE) return;
    // Clear to fully transparent alphaMap (white = fully transparent for alphaMap)
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Draw Gather multipliers around nodes
    const nodes = getNodes();
    for (const n of nodes) {
      const mult = getDomainTagMultiplier('Gather', n.type);
      const strength = (Math.max(0, mult - 1) / 2) * HEATMAP_STRENGTH; // 1.0→0, 3.0→1.0, scaled
      if (strength <= 0) continue;
      const { u, v } = worldToUV(n.position[0], n.position[2]);
      const px = Math.floor(u * WIDTH);
      const py = Math.floor((1 - v) * HEIGHT);
      const pr = Math.ceil(((HEATMAP_RADIUS_M) / WORLD_SIZE) * WIDTH);
      drawRadial(px, py, Math.max(4, pr), strength);
    }

    texture.needsUpdate = true;
  };
}



