import * as THREE from 'three';
import type { SceneRoot } from '../render/three/SceneRoot';
import type { BuildType } from './BuildRules';
import { getBuildProgress } from './BuildSystem';
import type { BuildingKind } from './Buildings';
import type { RoadType } from './RoadNetwork';
import { getBuildings } from './Buildings';
import { getRoads } from './RoadNetwork';
import costs from '../data/costs.json' with { type: 'json' };
import { canConsume, consume } from './Inventory';
import { getHeightAt } from './BiomeSystem';
import { isInsideAnySanctumXZ } from './SanctumSystem';

export interface Blueprint {
  id: string;
  type: BuildType;
  position: [number, number, number];
  roadType?: RoadType;
  buildingKind?: BuildingKind;
}

const blueprints: Blueprint[] = [];

function isSamePos(a: [number, number, number], b: [number, number, number]): boolean {
  const eps = 0.001;
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps;
}

export function addBlueprint(
  type: BuildType,
  position: [number, number, number],
  roadType?: RoadType,
  buildingKind?: BuildingKind,
  options?: { skipCost?: boolean; silent?: boolean; priority?: 'High' | 'Normal' }
): Blueprint | undefined {
  // Deduplicate: if same type and position (and roadType for roads) already exists, skip creating new entry
  const existing = blueprints.find((b) => b.type === type && isSamePos(b.position, position) && (type !== 'Road' || b.roadType === roadType));
  if (existing) return existing;
  // Collision/overlap checks: road vs building, building vs road/building
  const nearDist = 1.2;
  function blockedByBuilding(pos: [number, number, number]): boolean {
    const bs = getBuildings();
    return bs.some((b) => Math.hypot(b.position[0] - pos[0], b.position[2] - pos[2]) < nearDist);
  }
  function blockedByBuildingBlueprint(pos: [number, number, number]): boolean {
    return blueprints.some((b) => b.type === 'Building' && Math.hypot(b.position[0] - pos[0], b.position[2] - pos[2]) < nearDist);
  }
  function blockedByRoad(pos: [number, number, number]): boolean {
    const rs = getRoads();
    return rs.some((r) => Math.abs(r.position[0] - pos[0]) < 0.6 && Math.abs(r.position[2] - pos[2]) < 0.6);
  }
  function blockedByRoadBlueprint(pos: [number, number, number]): boolean {
    return blueprints.some((b) => b.type === 'Road' && Math.abs(b.position[0] - pos[0]) < 0.6 && Math.abs(b.position[2] - pos[2]) < 0.6);
  }
  if (type === 'Road') {
    // 도로: 성역 내부/외부 모두 허용 (겹침만 체크)
    if (blockedByBuilding(position) || blockedByBuildingBlueprint(position) || blockedByRoad(position) || blockedByRoadBlueprint(position)) {
      if (!options?.silent) try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Build', text: '겹침: 건물과 도로가 겹칠 수 없습니다' } })); } catch {}
      return undefined;
    }
  } else if (type === 'Building') {
    // 건물은 반드시 성역 내부
    if (!isInsideAnySanctumXZ(position)) {
      if (!options?.silent) try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Build', text: '성역 외부이므로 건설할 수 없습니다' } })); } catch {}
      return undefined;
    }
    // 건물은 기존 건물/청사진과 더 넉넉한 거리(>=1.8m) 유지
    const tooCloseToBuilding = getBuildings().some((b) => Math.hypot(b.position[0] - position[0], b.position[2] - position[2]) < 1.8);
    const tooCloseToBuildingBp = blueprints.some((b) => b.type === 'Building' && Math.hypot(b.position[0] - position[0], b.position[2] - position[2]) < 1.8);
    if (blockedByRoad(position) || blockedByRoadBlueprint(position) || tooCloseToBuilding || tooCloseToBuildingBp) {
      if (!options?.silent) try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Build', text: '겹침: 건물 배치 위치가 혼잡합니다' } })); } catch {}
      return undefined;
    }
  }
  // upfront cost for Buildings
  if (type === 'Building' && !options?.skipCost) {
    let cfg: any = (costs as any).build?.Building ?? { cost: {} };
    if (buildingKind) {
      const bk = (costs as any).buildings?.[buildingKind];
      if (bk) cfg = bk;
    }
    const entries = Object.entries(cfg.cost ?? {} as Record<string, number>);
    if (!entries.every(([id, q]) => canConsume(id as any, q as number))) {
      if (!options?.silent) try { window.dispatchEvent(new CustomEvent('pfw-ui-log', { detail: { category: 'Build', text: '자원 부족: 청사진 생성 실패' } })); } catch {}
      return undefined;
    }
    for (const [id, q] of entries) consume(id as any, q as number);
  }
   const bp: Blueprint = { id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` as const, type, position, roadType, buildingKind };
  blueprints.push(bp);
  try { if (options?.priority === 'High') (globalThis as any).__pfw_hint = `우선 청사진 생성: ${type}${buildingKind ? `/${buildingKind}` : ''}`; } catch {}
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
  const progressBars: Record<string, THREE.Mesh> = {};
  const solids: Record<string, THREE.Object3D> = {};

  function meshFor(bp: Blueprint): THREE.Object3D {
    if (bp.type === 'Road') {
      const color = bp.roadType === 'Gravel' ? 0x999999 : bp.roadType === 'Wood' ? 0xb8860b : bp.roadType === 'Stone' ? 0xcccccc : 0xaaaa66;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.12, 2.2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
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
        // remove progress bar if any
        const pb = progressBars[id];
        if (pb) {
          group.remove(pb);
          pb.geometry.dispose();
          (pb.material as THREE.Material).dispose();
          delete progressBars[id];
        }
      }
    }
    // expose list for other systems (e.g., role scoring)
    (globalThis as any).__pfw_blueprints = getBlueprints();
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
      // progress bar
      let bar = progressBars[bp.id];
      if (!bar) {
        bar = new THREE.Mesh(
          new THREE.PlaneGeometry(2.0, 0.12),
          new THREE.MeshBasicMaterial({ color: 0x44c0ff, transparent: true, opacity: 0.85 })
        );
        bar.rotation.x = -Math.PI / 2;
        progressBars[bp.id] = bar;
        group.add(bar);
      }
      // Position the bar above ground; higher for buildings
      const h = getHeightAt(bp.position[0], bp.position[2]);
      const baseY = (h - 0.5) * 1.2;
      const yBar = baseY + (bp.type === 'Road' ? 0.2 : 1.4);
      if (bar.position.x !== bp.position[0] || bar.position.z !== bp.position[2] || bar.position.y !== yBar) {
        bar.position.set(bp.position[0], yBar, bp.position[2]);
      }
    }

    // update progress widths
    const listProg = getBuildProgress?.() ?? [];
    for (const { id, progress } of listProg) {
      const bar = progressBars[id];
      if (bar) {
        const w = Math.max(0.05, progress);
        if (bar.scale.x !== w) bar.scale.set(w, 1, 1);
        (bar.material as THREE.MeshBasicMaterial).color.set(progress >= 1 ? 0x22aa55 : 0x44c0ff);
      }
      const mesh = meshes[id] as THREE.Mesh;
      if (mesh && (mesh.material as any)?.opacity !== undefined) {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        const progClamped = Math.min(1, progress);
        const desiredOpacity = 0.4 + 0.6 * (1 - progClamped);
        if (mat.opacity !== desiredOpacity) mat.opacity = desiredOpacity; // 진행될수록 반투명 유지
        const h = 0.3 + 0.7 * (1 - progClamped);
        if (mesh.scale.y !== h) mesh.scale.set(1, h, 1);
      }
    }
  };
}


