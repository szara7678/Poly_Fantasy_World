import type { GameWorld } from '../ecs';
import { getActiveWorld } from '../ecs';
import * as THREE from 'three';
import type { SceneRoot } from '../render/three/SceneRoot';

export interface SanctumData {
  center: [number, number, number];
  radius: number;
  level: number;
}

export interface SanctumState {
  sanctums: SanctumData[];
  cooldownRemainingSec: number;
  casting: null | (
    | {
        mode: 'create';
        remainingSec: number;
        center: [number, number, number];
        level: number;
      }
    | {
        mode: 'expand';
        remainingSec: number;
        index: number;
        targetLevel: number;
      }
  );
}

const state: SanctumState = {
  sanctums: [],
  cooldownRemainingSec: 0,
  casting: null,
};

export function getSanctums(): SanctumData[] {
  return state.sanctums;
}

export function setSanctums(list: SanctumData[]): void {
  state.sanctums.length = 0;
  for (const s of list) state.sanctums.push({ center: [...s.center] as any, radius: s.radius, level: s.level ?? 1 });
  state.casting = null;
  state.cooldownRemainingSec = 0;
}

export function isInsideAnySanctumXZ(pos: [number, number, number]): boolean {
  for (const s of state.sanctums) {
    const dx = pos[0] - s.center[0];
    const dz = pos[2] - s.center[2];
    if (Math.hypot(dx, dz) <= s.radius) return true;
  }
  return false;
}

const MANA_COST = 180;
const CAST_TIME_SEC = 6;
const COOLDOWN_SEC = 180;
const UPKEEP_PER_SANCTUM_PER_SEC = 0.2;
const MAX_SANCTUMS = 2;
const RADIUS_PER_LEVEL = 36; // visibly larger in prototype; matches plan initial (Lv1=36m)
const MAX_LEVEL = 3;

function computeRadius(level: number): number {
  return RADIUS_PER_LEVEL * (level + 1);
}

export function getCooldownRemaining(): number {
  return Math.max(0, state.cooldownRemainingSec);
}

export function getCastingRemaining(): number {
  return state.casting ? Math.max(0, state.casting.remainingSec) : 0;
}

export function canStartConsecrate(): boolean {
  const world = getActiveWorld();
  if (state.casting) return false;
  if (state.cooldownRemainingSec > 0) return false;
  if (state.sanctums.length >= MAX_SANCTUMS) return false;
  if (world.player.mana < MANA_COST) return false;
  return true;
}

export function consecrate(center: [number, number, number], _radius: number): void {
  // In this prototype, consecrate() becomes a request that triggers casting
  if (!canStartConsecrate()) return;
  const world = getActiveWorld();
  world.player.mana = Math.max(0, world.player.mana - MANA_COST);
  // level 1 sanctum by default
  state.casting = { mode: 'create', remainingSec: CAST_TIME_SEC, center, level: 1 };
}

export function canStartExpand(index: number): boolean {
  const world = getActiveWorld();
  if (state.casting) return false;
  if (state.cooldownRemainingSec > 0) return false;
  const s = state.sanctums[index];
  if (!s) return false;
  if (s.level >= MAX_LEVEL) return false;
  if (world.player.mana < MANA_COST) return false;
  return true;
}

export function expandSanctum(index: number): void {
  if (!canStartExpand(index)) return;
  const world = getActiveWorld();
  world.player.mana = Math.max(0, world.player.mana - MANA_COST);
  const targetLevel = state.sanctums[index].level + 1;
  state.casting = { mode: 'expand', remainingSec: CAST_TIME_SEC, index, targetLevel };
}

export function SanctumSystem(_world: GameWorld, dt: number): void {
  // Mana regen and upkeep
  const world = getActiveWorld();
  const upkeep = state.sanctums.length * UPKEEP_PER_SANCTUM_PER_SEC;
  world.player.mana = Math.min(
    world.player.manaMax,
    Math.max(0, world.player.mana + world.player.manaRegenPerSec * dt - upkeep * dt)
  );

  // Cooldown and casting timers
  if (state.cooldownRemainingSec > 0) state.cooldownRemainingSec = Math.max(0, state.cooldownRemainingSec - dt);

  if (state.casting) {
    state.casting.remainingSec -= dt;
    if (state.casting.remainingSec <= 0) {
      if (state.casting.mode === 'create') {
        const level = state.casting.level;
        state.sanctums.push({ center: state.casting.center, radius: computeRadius(level), level });
      } else if (state.casting.mode === 'expand') {
        const idx = state.casting.index;
        const s = state.sanctums[idx];
        if (s) {
          s.level = Math.min(MAX_LEVEL, state.casting.targetLevel);
          s.radius = computeRadius(s.level);
        }
      }
      state.casting = null;
      state.cooldownRemainingSec = COOLDOWN_SEC;
    }
  }
}

export function createSanctumRenderSystem(scene: SceneRoot) {
  const group = new THREE.Group();
  scene.scene.add(group);

  function buildRingMesh(radius: number): THREE.LineSegments {
    const segments = 128;
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      positions.push(
        Math.cos(a0) * radius,
        0.02,
        Math.sin(a0) * radius,
        Math.cos(a1) * radius,
        0.02,
        Math.sin(a1) * radius
      );
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0x3aa3ff, transparent: true, opacity: 0.9 });
    return new THREE.LineSegments(geometry, material);
  }

  const ringMeshes: THREE.LineSegments[] = [];
  const glowMeshes: THREE.Mesh[] = [];
  let elapsed = 0;

  return function SanctumRenderSystem(_world: GameWorld, _dt: number): void {
    elapsed += _dt;
    // Sync meshes to data length
    const data = getSanctums();
    // Remove extra meshes
    while (ringMeshes.length > data.length) {
      const m = ringMeshes.pop()!;
      group.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      const g = glowMeshes.pop();
      if (g) {
        group.remove(g);
        g.geometry.dispose();
        (g.material as THREE.Material).dispose();
      }
    }
    // Ensure mesh per sanctum
    for (let i = 0; i < data.length; i++) {
      const s = data[i];
      if (!ringMeshes[i]) {
        const m = buildRingMesh(s.radius);
        m.position.set(s.center[0], s.center[1], s.center[2]);
        (m as any).userData = { radius: s.radius };
        ringMeshes[i] = m;
        group.add(m);

        // soft glow disk
        const disk = new THREE.Mesh(
          new THREE.RingGeometry(Math.max(0.01, s.radius * 0.98), s.radius * 1.02, 64),
          new THREE.MeshBasicMaterial({ color: 0x3aa3ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending })
        );
        disk.rotation.x = -Math.PI / 2;
        disk.position.set(s.center[0], 0.015, s.center[2]);
        glowMeshes[i] = disk;
        group.add(disk);
      } else {
        const m = ringMeshes[i];
        m.position.set(s.center[0], s.center[1], s.center[2]);
        if ((m as any).userData.radius !== s.radius) {
          group.remove(m);
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
          const nm = buildRingMesh(s.radius);
          nm.position.copy(m.position);
          (nm as any).userData = { radius: s.radius };
          ringMeshes[i] = nm;
          group.add(nm);
        }
        // sync disk radius/pos
        let disk = glowMeshes[i];
        if (!disk) {
          disk = new THREE.Mesh(
            new THREE.RingGeometry(Math.max(0.01, s.radius * 0.98), s.radius * 1.02, 64),
            new THREE.MeshBasicMaterial({ color: 0x3aa3ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending })
          );
          disk.rotation.x = -Math.PI / 2;
          glowMeshes[i] = disk;
          group.add(disk);
        }
        disk.position.set(s.center[0], 0.015, s.center[2]);
        const newGeom = new THREE.RingGeometry(Math.max(0.01, s.radius * 0.98), s.radius * 1.02, 64);
        disk.geometry.dispose();
        disk.geometry = newGeom;
      }
    }

    // Pulse animation
    for (let i = 0; i < glowMeshes.length; i++) {
      const disk = glowMeshes[i];
      if (!disk) continue;
      const pulse = 1 + 0.03 * Math.sin(elapsed * 2 + i);
      disk.scale.set(pulse, pulse, pulse);
      const mat = disk.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.18 + 0.12 * (0.5 + 0.5 * Math.sin(elapsed * 2 + i));
    }
  };
}


