import * as THREE from 'three';
import type { SceneRoot } from '../render/three/SceneRoot';
import type { GameWorld } from '../ecs';

export interface TargetOrder {
  id: string;
  position: [number, number, number];
}

const targets: TargetOrder[] = [];

export function listTargets(): ReadonlyArray<TargetOrder> { return targets; }

export function addTarget(position: [number, number, number]): TargetOrder {
  const t: TargetOrder = { id: `tgt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, position };
  targets.push(t);
  return t;
}

export function clearTargets(): void { targets.length = 0; }

export function removeTarget(id: string): void {
  const i = targets.findIndex((t) => t.id === id);
  if (i >= 0) targets.splice(i, 1);
}

export function createTargetRenderSystem(scene: SceneRoot) {
  const group = new THREE.Group();
  scene.scene.add(group);

  const meshes: Record<string, THREE.Object3D> = {};

  // Placement interaction
  const element = scene.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0
  const ndc = new THREE.Vector2();

  let placing = false;

  function toWorld(ev: MouseEvent): THREE.Vector3 | null {
    const rect = element.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, scene.camera);
    const hit = new THREE.Vector3();
    const ok = raycaster.ray.intersectPlane(plane, hit);
    return ok ? hit : null;
  }

  const onRequest = (): void => {
    placing = true;
    // Build 모드 중첩 방지: None으로 전환
    window.dispatchEvent(new CustomEvent('pfw-set-build-mode', { detail: 'None' }));
  };
  window.addEventListener('pfw-target-place-request', onRequest as EventListener);

  function onClick(ev: MouseEvent): void {
    if (!placing) return;
    const hit = toWorld(ev);
    if (!hit) return;
    addTarget([hit.x, 0, hit.z]);
    placing = false;
  }
  element.addEventListener('click', onClick, true); // capture 먼저 처리

  function marker(): THREE.Object3D {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    const pin = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 1.0, 16),
      new THREE.MeshBasicMaterial({ color: 0xffcc33 })
    );
    pin.position.set(0, 0.6, 0);
    g.add(pin);
    return g;
  }

  let tAccum = 0;
  return function TargetRenderSystem(_world: GameWorld, dt: number): void {
    tAccum += dt;
    // remove stale
    for (const id of Object.keys(meshes)) {
      if (!targets.find((t) => t.id === id)) {
        const m = meshes[id];
        group.remove(m);
        // @ts-ignore
        m.traverse?.((obj: any) => {
          if (obj.geometry) obj.geometry.dispose?.();
          if (obj.material) obj.material.dispose?.();
        });
        delete meshes[id];
      }
    }
    // ensure meshes and sync
    for (const t of targets) {
      let m = meshes[t.id];
      if (!m) {
        m = marker();
        meshes[t.id] = m as THREE.Object3D;
        group.add(m);
      }
      m.position.set(t.position[0], 0.02, t.position[2]);
      // pulse
      const s = 1 + 0.1 * Math.sin(tAccum * 3);
      m.scale.set(s, 1, s);
    }
  };
}


