import * as THREE from 'three';
import type { SceneRoot } from '../render/three/SceneRoot';
import { getHeightAt } from './BiomeSystem';

export interface PreviewLine {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
}

const previews: PreviewLine[] = [];

export function setPreviewLine(line: PreviewLine | null): void {
  previews.length = 0;
  if (line) previews.push(line);
}

export function clearPreview(): void {
  previews.length = 0;
}

export function createRoadPreviewRenderSystem(scene: SceneRoot) {
  const group = new THREE.Group();
  scene.scene.add(group);
  const lines: Record<string, THREE.Line> = {};

  function ensure(id: string, from: THREE.Vector3, to: THREE.Vector3): THREE.Line {
    let l = lines[id];
    if (!l) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({ color: 0x44c0ff, transparent: true, opacity: 0.85 });
      l = new THREE.Line(geom, mat);
      lines[id] = l;
      group.add(l);
    }
    const pos = (l.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
    // Only update the buffer attributes if changed to reduce WebGL buffer updates
    if (pos.getX(0) !== from.x || pos.getY(0) !== from.y || pos.getZ(0) !== from.z) {
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.needsUpdate = true;
    }
    if (pos.getX(1) !== to.x || pos.getY(1) !== to.y || pos.getZ(1) !== to.z) {
      pos.setXYZ(1, to.x, to.y, to.z);
      pos.needsUpdate = true;
    }
    return l;
  }

  return function RoadPreviewRender() {
    // remove stale
    for (const id of Object.keys(lines)) {
      if (!previews.find((p) => p.id === id)) {
        const l = lines[id];
        group.remove(l);
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
        delete lines[id];
      }
    }
    // sync
    for (const p of previews) {
      const yh0 = (getHeightAt(p.from[0], p.from[2]) - 0.5) * 1.2;
      const yh1 = (getHeightAt(p.to[0], p.to[2]) - 0.5) * 1.2;
      ensure(p.id, new THREE.Vector3(p.from[0], 0.05 + yh0, p.from[2]), new THREE.Vector3(p.to[0], 0.05 + yh1, p.to[2]));
    }
  };
}


