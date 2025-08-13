import * as THREE from 'three';
import type { SceneRoot } from '../render/three/SceneRoot';
import type { GameWorld } from '../ecs';
import { getBuildings, removeBuilding } from './Buildings';

export function createDemolishSystem(scene: SceneRoot) {
  const element = (scene as any).renderer?.domElement as HTMLCanvasElement | undefined;
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  let demolishing = false;

  function toWorld(ev: MouseEvent): THREE.Vector3 | null {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, scene.camera);
    const hit = new THREE.Vector3();
    const ok = raycaster.ray.intersectPlane(plane, hit);
    return ok ? hit : null;
  }

  const onRequest = () => { demolishing = true; };
  const onCancel = () => { demolishing = false; };
  window.addEventListener('pfw-demolish-on', onRequest as EventListener);
  window.addEventListener('pfw-demolish-off', onCancel as EventListener);

  function onClick(ev: MouseEvent): void {
    if (!demolishing) return;
    const hit = toWorld(ev);
    if (!hit) return;
    const [hx, hz] = [hit.x, hit.z];
    // pick nearest building within 2m
    let best: { id: string; d: number } | null = null;
    for (const b of getBuildings()) {
      const dx = b.position[0] - hx; const dz = b.position[2] - hz;
      const d = Math.hypot(dx, dz);
      if (d <= 2.2 && (!best || d < best.d)) best = { id: b.id, d };
    }
    if (best) {
      if (removeBuilding(best.id)) {
        try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Build', text: '건물 철거 완료' } })); } catch {}
      }
    }
  }
  if (element) element.addEventListener('click', onClick, true);

  return function DemolishSystem(_world: GameWorld, _dt: number) {};
}



