import * as THREE from 'three';
import type { GameWorld } from '../ecs';
import { applySanctumBoundaryMitigation } from './CombatHooks';
import type { SceneRoot } from '../render/three/SceneRoot';

interface Projectile {
  id: string;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3;
  baseDamage: number;
  isRangedOrAoe: boolean;
}

const projectiles: Projectile[] = [];
let lastDamageApplied = 0;

export function getLastDamage(): number {
  return lastDamageApplied;
}

export function spawnProjectile(from: [number, number, number], to: [number, number, number], baseDamage = 20, isRangedOrAoe = true): void {
  const f = new THREE.Vector3(from[0], from[1], from[2]);
  const t = new THREE.Vector3(to[0], to[1], to[2]);
  const dir = t.clone().sub(f).normalize();
  const speed = 20; // m/s
  const p: Projectile = {
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    pos: f,
    vel: dir.multiplyScalar(speed),
    target: t,
    baseDamage,
    isRangedOrAoe,
  };
  projectiles.push(p);
}

export function ProjectileSystem(_world: GameWorld, dt: number): void {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.pos.addScaledVector(p.vel, dt);
    if (p.pos.distanceTo(p.target) < 0.6) {
      // impact
      lastDamageApplied = applySanctumBoundaryMitigation({ position: [p.pos.x, p.pos.y, p.pos.z], isRangedOrAoe: p.isRangedOrAoe, baseDamage: p.baseDamage });
      projectiles.splice(i, 1);
    }
  }
}

export function createProjectileRenderSystem(scene: SceneRoot) {
  const group = new THREE.Group();
  scene.scene.add(group);
  const pool: THREE.Mesh[] = [];

  function getSphere(): THREE.Mesh {
    const m = pool.pop();
    if (m) { group.add(m); return m; }
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xff4444 })
    );
    group.add(mesh);
    return mesh;
  }

  return function ProjectileRenderSystem() {
    // clear children to pool
    while (group.children.length) {
      const c = group.children.pop() as THREE.Mesh;
      pool.push(c);
    }
    // draw spheres at projectile positions
    for (const p of projectiles) {
      const s = getSphere();
      s.position.copy(p.pos);
    }
  };
}


