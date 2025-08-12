import * as THREE from 'three';
import type { SceneRoot } from '../render/three/SceneRoot';
import type { BuildType } from './BuildRules';

export interface Blueprint {
  id: string;
  type: BuildType;
  position: [number, number, number];
}

const blueprints: Blueprint[] = [];

export function addBlueprint(type: BuildType, position: [number, number, number]): Blueprint {
  const bp: Blueprint = { id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` as const, type, position };
  blueprints.push(bp);
  return bp;
}

export function getBlueprints(): Blueprint[] {
  return blueprints;
}

export function clearBlueprints(): void {
  blueprints.length = 0;
}

export function removeBlueprint(id: string): void {
  const idx = blueprints.findIndex((b) => b.id === id);
  if (idx >= 0) blueprints.splice(idx, 1);
}

export function createBlueprintRenderSystem(scene: SceneRoot) {
  const group = new THREE.Group();
  scene.scene.add(group);
  const meshes: Record<string, THREE.Object3D> = {};
  const solids: Record<string, THREE.Object3D> = {};

  function meshFor(bp: Blueprint): THREE.Object3D {
    if (bp.type === 'Road') {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.1, 2),
        new THREE.MeshBasicMaterial({ color: 0xaaaa66, transparent: true, opacity: 0.8 })
      );
      return m;
    }
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.6, 2),
      new THREE.MeshBasicMaterial({ color: 0x66c1ff, transparent: true, opacity: 0.9 })
    );
    return m;
  }

  return function BlueprintRenderSystem(): void {
    const list = getBlueprints();
    // Remove solids orphaned (keep simple)
    for (const id of Object.keys(solids)) {
      if (list.find((b) => b.id === id)) continue;
    }
    // Remove stale
    for (const id of Object.keys(meshes)) {
      if (!list.find((b) => b.id === id)) {
        const obj = meshes[id];
        group.remove(obj);
        // @ts-ignore
        if (obj.geometry) obj.geometry.dispose?.();
        // @ts-ignore
        if (obj.material) obj.material.dispose?.();
        delete meshes[id];
        // Place completed solid for visual feedback
        if (!solids[id]) {
          const m = new THREE.Mesh(
            new THREE.BoxGeometry(2, 0.8, 2),
            new THREE.MeshBasicMaterial({ color: 0x229955 })
          );
          m.position.copy(obj.position);
          solids[id] = m;
          group.add(m);
        }
      }
    }
    // keep solids light pulse
    const t = performance.now() / 1000;
    for (const id of Object.keys(solids)) {
      const m = solids[id];
      const s = 1 + 0.02 * Math.sin(t * 3);
      m.scale.set(s, 1, s);
    }
    // Ensure all have meshes
    for (const bp of list) {
      if (!meshes[bp.id]) {
        const m = meshFor(bp);
        m.position.set(bp.position[0], bp.type === 'Road' ? 0.05 : 0.3, bp.position[2]);
        meshes[bp.id] = m;
        group.add(m);
      }
    }
  };
}


