import type { GameWorld } from '../ecs';
import { getActiveWorld } from '../ecs';
import { getBuildings } from './Buildings';
import { getRoads } from './RoadNetwork';
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
import { getMaxSanctums, getSanctumRadiusMult, getSanctumUpkeepMult } from './ResearchSystem';
const RADIUS_PER_LEVEL = 18; // plan: radius = 18m × (level+1) → Lv1=36m, Lv2=54m, Lv3=72m
const MAX_LEVEL = 3;

function computeRadius(level: number): number {
  // level starts at 1 → radius = 18 × (1+1) = 36m
  return RADIUS_PER_LEVEL * (Math.max(1, level) + 1) * getSanctumRadiusMult();
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
  if (state.sanctums.length >= getMaxSanctums()) return false;
  if (world.player.mana < MANA_COST) return false;
  return true;
}

export function consecrate(center: [number, number, number], _radius: number): void {
  // In this prototype, consecrate() becomes a request that triggers casting
  if (!canStartConsecrate()) return;
  // Prevent overlap with buildings/roads
  const bs = getBuildings();
  const rs = getRoads();
  for (const b of bs) {
    if (Math.hypot(center[0] - b.position[0], center[2] - b.position[2]) < computeRadius(1) + 2) {
      try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Sanctum', text: '성지 반경이 기존 건물과 과도하게 겹칩니다' } })); } catch {}
      return;
    }
  }
  for (const r of rs) {
    if (Math.hypot(center[0] - r.position[0], center[2] - r.position[2]) < computeRadius(1) + 1) {
      try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Sanctum', text: '성지 반경이 기존 도로와 과도하게 겹칩니다' } })); } catch {}
      return;
    }
  }
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
  const upkeep = state.sanctums.length * UPKEEP_PER_SANCTUM_PER_SEC * getSanctumUpkeepMult();
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
          const created = { center: state.casting.center, radius: computeRadius(level), level } as const;
          state.sanctums.push({ center: created.center, radius: created.radius, level: created.level });
          try { window.dispatchEvent(new CustomEvent('pfw-sanctum-created', { detail: created })); } catch {}
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

  function buildRingMesh(radius: number, color = 0x00ccff, thickness = 0.06, glow = true): THREE.Group {
    const g = new THREE.Group();
    const segments = 128;
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      positions.push(
        Math.cos(a0) * radius,
        0.05,
        Math.sin(a0) * radius,
        Math.cos(a1) * radius,
        0.05,
        Math.sin(a1) * radius
      );
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1.0, linewidth: 2 });
    const line = new THREE.LineSegments(geometry, material);
    g.add(line);
    if (glow) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.01, radius - thickness), radius + thickness, 128),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      g.add(ring);
    }
    return g;
  }

  const ringMeshes: THREE.Group[] = [];
  const glowMeshes: THREE.Mesh[] = [];
  let elapsed = 0;

  // Placement interaction
  const element = (scene as any).renderer?.domElement as HTMLCanvasElement | undefined;
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0
  const ndc = new THREE.Vector2();
  let placing = false;
  let hover: THREE.Vector3 | null = null;
  let previewRing: THREE.LineSegments | null = null;

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

  const onRequest = (): void => {
    placing = true;
    // Build/Target 모드 중첩 방지
    try { window.dispatchEvent(new CustomEvent('pfw-set-build-mode', { detail: 'None' })); } catch {}
    try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Sanctum', text: '성역 배치 시작' } })); } catch {}
  };
  window.addEventListener('pfw-sanctum-place-request', onRequest as EventListener);

  function onClick(ev: MouseEvent): void {
    if (!placing) return;
    const hit = toWorld(ev);
    if (!hit) return;
    consecrate([hit.x, 0, hit.z], 0);
    placing = false;
    hover = null;
    if (previewRing) { group.remove(previewRing); (previewRing.material as THREE.Material).dispose(); previewRing.geometry.dispose(); previewRing = null; }
    try { window.dispatchEvent(new CustomEvent('pfw-sanctum-placed')); } catch {}
    try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Sanctum', text: '성역 배치 완료' } })); } catch {}
  }
  if (element) element.addEventListener('click', onClick, true);

  function onMove(ev: MouseEvent): void {
    if (!placing) return;
    const hit = toWorld(ev);
    hover = hit;
  }
  if (element) element.addEventListener('mousemove', onMove, true);

  return function SanctumRenderSystem(_world: GameWorld, _dt: number): void {
    elapsed += _dt;
    // Sync meshes to data length
    const data = getSanctums();
    // Remove extra meshes
    while (ringMeshes.length > data.length) {
      const m = ringMeshes.pop()!;
      group.remove(m);
      m.traverse?.((obj: any) => { obj.geometry?.dispose?.(); obj.material?.dispose?.(); });
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
        const m = buildRingMesh(s.radius, 0x00e5ff, 0.08, true);
        m.position.set(s.center[0], 0.03, s.center[2]);
        (m as any).userData = { radius: s.radius };
        ringMeshes[i] = m;
        group.add(m);

        // soft glow disk
        const disk = new THREE.Mesh(
          new THREE.RingGeometry(Math.max(0.01, s.radius * 0.96), s.radius * 1.06, 64),
          new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending })
        );
        disk.rotation.x = -Math.PI / 2;
        disk.position.set(s.center[0], 0.01, s.center[2]);
        glowMeshes[i] = disk;
        group.add(disk);
      } else {
        const m = ringMeshes[i];
        m.position.set(s.center[0], 0.03, s.center[2]);
        if ((m as any).userData.radius !== s.radius) {
          group.remove(m);
          m.traverse?.((obj: any) => { obj.geometry?.dispose?.(); obj.material?.dispose?.(); });
          const nm = buildRingMesh(s.radius, 0x00e5ff, 0.08, true);
          nm.position.copy(m.position);
          (nm as any).userData = { radius: s.radius };
          ringMeshes[i] = nm;
          group.add(nm);
        }
        // sync disk radius/pos
        let disk = glowMeshes[i];
        if (!disk) {
          disk = new THREE.Mesh(
            new THREE.RingGeometry(Math.max(0.01, s.radius * 0.96), s.radius * 1.06, 64),
            new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending })
          );
          disk.rotation.x = -Math.PI / 2;
          glowMeshes[i] = disk;
          group.add(disk);
        }
        disk.position.set(s.center[0], 0.01, s.center[2]);
        const newGeom = new THREE.RingGeometry(Math.max(0.01, s.radius * 0.96), s.radius * 1.06, 64);
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

    // Placement preview ring
    if (placing && hover) {
      const r = computeRadius(1);
      if (!previewRing) {
        const g = buildRingMesh(r, 0x66ff88, 0.1, true);
        previewRing = (g.children[0] as any as THREE.LineSegments);
        group.add(g);
      }
      (previewRing.parent as THREE.Object3D).position.set(hover.x, 0.03, hover.z);
      // 간단 충돌 표시: 반경 내에 건물/도로가 많으면 프리뷰 색을 붉게
      let blocked = false;
      try {
        const bs = getBuildings();
        const rs = getRoads();
        for (const b of bs) if (Math.hypot(hover.x - b.position[0], hover.z - b.position[2]) < r + 2) { blocked = true; break; }
        if (!blocked) for (const r0 of rs) if (Math.hypot(hover.x - r0.position[0], hover.z - r0.position[2]) < r + 1) { blocked = true; break; }
      } catch {}
      (previewRing.material as THREE.LineBasicMaterial).color = new THREE.Color(blocked ? 0xff4444 : 0x00ff88);
    } else if (previewRing) {
      const parent = previewRing.parent as THREE.Object3D;
      group.remove(parent);
      parent.traverse?.((obj: any) => { obj.geometry?.dispose?.(); obj.material?.dispose?.(); });
      previewRing = null;
    }
  };
}


