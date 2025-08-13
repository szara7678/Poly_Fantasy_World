import * as THREE from 'three';
import type { GameWorld } from '../ecs';
import type { SceneRoot } from '../render/three/SceneRoot';
import { addExploredStroke, addVisibleSweep } from './FogOfWarSystem';
import { speedFactorAt } from './RoadNetwork';

interface Scout {
  id: string;
  angle: number; // radians around circle path
  radius: number; // path radius
  speed: number; // radians per second
  pos: THREE.Vector3;
  lastStrokePos: THREE.Vector3;
}

const scouts: Scout[] = [];

export function getScoutCount(): number {
  return scouts.length;
}

export function spawnScout(radius = 80, speed = 0.3): void {
  const angle = Math.random() * Math.PI * 2;
  const s: Scout = {
    id: `scout_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    angle,
    radius,
    speed,
    pos: new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
    lastStrokePos: new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
  };
  scouts.push(s);
}

export function clearScouts(): void {
  scouts.length = 0;
}

export function ScoutSystem(_world: GameWorld, dt: number): void {
  // Update positions and emit FoW stroke
  for (const s of scouts) {
    // apply road speed factor when near roads (simplified)
    const factor = speedFactorAt(s.pos.x, s.pos.z);
    s.angle += (s.speed * factor) * dt;
    const nx = Math.cos(s.angle) * s.radius;
    const nz = Math.sin(s.angle) * s.radius;
    const prev = s.pos.clone();
    s.pos.set(nx, 0, nz);
    const dist = prev.distanceTo(s.pos);
    if (dist > 1.0) {
      addExploredStroke(
        [
          [prev.x, prev.z],
          [s.pos.x, s.pos.z],
        ],
        10
      );
      // 간이 부채꼴 스윕: 현재 위치를 중심으로 25m 원형 가시 스탬프
      addVisibleSweep([s.pos.x, s.pos.z], 25);
      s.lastStrokePos.copy(s.pos);
    }
  }
}

export function createScoutRenderSystem(scene: SceneRoot) {
  const group = new THREE.Group();
  scene.scene.add(group);
  const spheres: Record<string, THREE.Mesh> = {};

  return function ScoutRenderSystem(_world: GameWorld, _dt: number): void {
    // sync meshes
    // remove stale
    for (const id of Object.keys(spheres)) {
      if (!scouts.find((s) => s.id === id)) {
        const m = spheres[id];
        group.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        delete spheres[id];
      }
    }
    // ensure meshes
    for (const s of scouts) {
      let m = spheres[s.id];
      if (!m) {
        m = new THREE.Mesh(
          new THREE.SphereGeometry(1.2, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0xffcc33 })
        );
        spheres[s.id] = m;
        group.add(m);
      }
      m.position.set(s.pos.x, 0.8, s.pos.z);
    }
  };
}


