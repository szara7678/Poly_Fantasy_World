import * as THREE from 'three';
import type { GameWorld } from '../ecs';
import type { SceneRoot } from '../render/three/SceneRoot';
import { getSanctums } from './SanctumSystem';

interface SaintState {
  pos: THREE.Vector3;
  idle: boolean;
}

const saint: SaintState = {
  pos: new THREE.Vector3(0, 0, 0),
  idle: true,
};

export function getSaintPosition(): THREE.Vector3 { return saint.pos.clone(); }

export function SaintSystem(_world: GameWorld, _dt: number): void {
  // If there is at least one sanctum, keep saint near its center (slight forward offset)
  const s = getSanctums()[0];
  if (s) {
    const target = new THREE.Vector3(s.center[0], 0, s.center[2] + 2.2);
    // simple snap (no interpolation for now)
    saint.pos.copy(target);
    saint.idle = true;
  } else {
    // wait at origin before the first sanctum is created
    saint.pos.set(0, 0, 0);
    saint.idle = true;
  }
}

export function createSaintRenderSystem(scene: SceneRoot) {
  const group = new THREE.Group();
  scene.scene.add(group);
  let mesh: THREE.Object3D | null = null;

  function ensureMesh(): void {
    if (mesh) return;
    const g = new THREE.Group();
    // robe/body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.5, 1.5, 12),
      new THREE.MeshBasicMaterial({ color: 0xe6d5a3 })
    );
    body.position.y = 0.75; g.add(body);
    // head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe8cc }));
    head.position.y = 1.6; g.add(head);
    // staff
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 10), new THREE.MeshBasicMaterial({ color: 0x8b5a2b }));
    staff.position.set(0.35, 0.9, 0.05); g.add(staff);
    // halo
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 8, 24), new THREE.MeshBasicMaterial({ color: 0xfff199 }));
    halo.position.set(0, 1.9, 0); halo.rotation.x = Math.PI / 2; g.add(halo);
    mesh = g;
    group.add(g);
  }

  return function SaintRenderSystem(): void {
    ensureMesh();
    if (!mesh) return;
    mesh.position.set(saint.pos.x, 0, saint.pos.z);
    // subtle idle animation
    const t = performance.now() / 1000;
    const y = 0.05 * Math.sin(t * 2);
    mesh.position.y = y;
  };
}


