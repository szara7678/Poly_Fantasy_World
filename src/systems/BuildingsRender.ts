import * as THREE from 'three';
import { getHeightAt } from './BiomeSystem';
import type { SceneRoot } from '../render/three/SceneRoot';
import { getBuildings } from './Buildings';

function colorFor(kind: string): number {
  switch (kind) {
    case 'Lumberyard': return 0x3bb273;
    case 'Smelter': return 0x996633;
    case 'Workshop': return 0x3388cc;
    case 'ResearchLab': return 0x8a7dff;
    default: return 0xffffff;
  }
}

export function createBuildingsRenderSystem(scene: SceneRoot) {
  const group = new THREE.Group();
  scene.scene.add(group);
  const meshes: Record<string, THREE.Mesh> = {};
  const heightCache: Record<string, number> = {};
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  return function BuildingsRender() {
    const list = getBuildings();
    for (const id of Object.keys(meshes)) {
      if (!list.find((b) => b.id === id)) {
        const m = meshes[id];
        group.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        delete meshes[id];
        delete heightCache[id];
      }
    }
    for (const b of list) {
      let m = meshes[b.id];
      if (!m) {
        // Kind별로 간단한 실루엣 구성
        const geoMat = new THREE.MeshBasicMaterial({ color: colorFor(b.kind) });
        if (b.kind === 'Lumberyard') {
          const g = new THREE.Group();
          const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 2.6), geoMat); base.position.y = 0.2; g.add(base);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.8, 6), new THREE.MeshBasicMaterial({ color: 0x8b5a2b })); roof.position.y = 1.1; g.add(roof);
          const log = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.6, 8), new THREE.MeshBasicMaterial({ color: 0x8b5a2b })); log.rotation.z = Math.PI/2; log.position.set(0,0.6,0.4); g.add(log);
          m = (g as unknown as THREE.Mesh);
        } else if (b.kind === 'Smelter') {
          const g = new THREE.Group();
          const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 2.0), geoMat); base.position.y = 0.25; g.add(base);
          const furnace = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.2, 12), new THREE.MeshBasicMaterial({ color: 0x555555 })); furnace.position.y = 1.1; g.add(furnace);
          const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.2, 10), new THREE.MeshBasicMaterial({ color: 0x333333 })); chimney.position.set(0.7, 1.8, 0); g.add(chimney);
          m = (g as unknown as THREE.Mesh);
        } else if (b.kind === 'Workshop') {
          const g = new THREE.Group();
          const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 2.2), geoMat); base.position.y = 0.25; g.add(base);
          const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 2.0), new THREE.MeshBasicMaterial({ color: 0xcccccc, wireframe: true })); frame.position.y = 1.0; g.add(frame);
          const bench = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.6), new THREE.MeshBasicMaterial({ color: 0x8b5a2b })); bench.position.set(0.0, 0.6, 0.2); g.add(bench);
          m = (g as unknown as THREE.Mesh);
        } else if (b.kind === 'ResearchLab') {
          const g = new THREE.Group();
          const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 2.0), geoMat); base.position.y = 0.2; g.add(base);
          const dome = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), new THREE.MeshBasicMaterial({ color: 0x99bbff, transparent: true, opacity: 0.65 })); dome.position.y = 1.2; g.add(dome);
          const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), new THREE.MeshBasicMaterial({ color: 0xdddddd })); antenna.position.set(0.6, 1.9, 0); g.add(antenna);
          m = (g as unknown as THREE.Mesh);
        } else {
          m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.4), geoMat);
        }
        meshes[b.id] = m;
        group.add(m);
        // compute and cache static ground offset once (biome height static)
        const h = getHeightAt(b.position[0], b.position[2]);
        const y = (h - 0.5) * 1.2;
        heightCache[b.id] = 0.8 + y;
        m.position.set(b.position[0], heightCache[b.id], b.position[2]);
      }
      // 간단 애니메이션(연기/장비 흔들림 등)
      const t = performance.now() / 1000;
      if ((meshes[b.id] as any).children) {
        if (b.kind === 'Smelter') {
          const chim = (meshes[b.id] as any).children.find((ch: any) => ch.geometry?.parameters?.radiusTop === 0.18);
          if (chim) chim.position.y = (heightCache[b.id] ?? 0.8) + 1.8 + Math.sin(t * 2) * 0.02;
        }
        if (b.kind === 'Workshop') {
          const bench = (meshes[b.id] as any).children.find((ch: any) => ch.geometry?.parameters?.depth === 0.6);
          if (bench) bench.position.x = Math.sin(t * 1.5) * 0.05;
        }
      }
    }
  };
  // Click to open inspector
  const onClick = (ev: MouseEvent): void => {
    const canvas = (scene as any).renderer?.domElement as HTMLCanvasElement | undefined;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, scene.camera);
    const values = Object.values(meshes) as THREE.Object3D[];
    const hits = raycaster.intersectObjects(values as THREE.Object3D[], true);
    if (hits.length > 0) {
      // ascend to the root we manage
      let o: THREE.Object3D | null = hits[0].object as THREE.Object3D;
      const set = new Set(values as THREE.Object3D[]);
      while (o && !set.has(o)) o = (o.parent as THREE.Object3D | null);
      const root = o ?? hits[0].object;
      const entry = Object.entries(meshes).find(([, v]) => v === root);
      const id = entry?.[0];
      if (id) {
        try { window.dispatchEvent(new CustomEvent('pfw-open-inspector', { detail: { type: 'Building', id } })); } catch {}
      }
    }
  };
  const el = (scene as any).renderer?.domElement as HTMLCanvasElement | undefined;
  el?.addEventListener('click', onClick as EventListener, true);
}


