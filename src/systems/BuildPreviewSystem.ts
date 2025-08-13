import * as THREE from 'three';
import type { SceneRoot } from '../render/three/SceneRoot';
import { canBuild, explainBuildRule, type BuildType } from './BuildRules';
// costs.json is consumed by BuildSystem; preview does not need it directly
import { addBlueprint } from './BlueprintSystem';
import type { RoadType } from './RoadNetwork';
import costs from '../data/costs.json' with { type: 'json' };
// import { getSanctums } from './SanctumSystem';

export interface BuildPreviewState {
  mode: BuildType | 'None';
  hoverPos: [number, number, number] | null;
  isValid: boolean;
  lastExplain: string;
  roadType: RoadType;
}

const state: BuildPreviewState = {
  mode: 'None',
  hoverPos: null,
  isValid: false,
  lastExplain: '',
  roadType: 'Dirt',
};

export function setBuildMode(mode: BuildType | 'None'): void {
  state.mode = mode;
}
export function cycleRoadType(): void {
  const order: RoadType[] = ['Dirt', 'Gravel', 'Wood', 'Stone'];
  const idx = order.indexOf(state.roadType);
  state.roadType = order[(idx + 1) % order.length];
}


export function getBuildPreview(): BuildPreviewState {
  return state;
}

export function createBuildPreviewSystem(scene: SceneRoot): (w: unknown, dt: number) => void {
  const element = scene.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0 plane
  const ndc = new THREE.Vector2();

  const previewMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.2, 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6 })
  );
  previewMesh.visible = false;
  scene.scene.add(previewMesh);

  // No placed tracking needed in prototype; blueprint render handles visuals

  function updateHover(ev: PointerEvent): void {
    const rect = element.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, scene.camera);
    const hit = new THREE.Vector3();
    const res = raycaster.ray.intersectPlane(plane, hit);
    if (!res) {
      state.hoverPos = null;
      previewMesh.visible = false;
      return;
    }
    let pos: [number, number, number] = [hit.x, 0, hit.z];
    state.hoverPos = pos;
    if (state.mode === 'None') {
      state.isValid = false;
      previewMesh.visible = false;
      return;
    }
    const type = state.mode as BuildType;
    // 도로: 성역 내부/외부 모두 허용. 스냅 제거.
    state.isValid = canBuild({ position: pos, type });
    // 설명: 위에서 스냅한 경우 유지, 아니면 규칙 설명
    if (!state.lastExplain) state.lastExplain = explainBuildRule({ position: pos, type });
    (previewMesh.material as THREE.MeshBasicMaterial).color.set(state.isValid ? 0x00ff88 : 0xff5555);
    previewMesh.visible = true;
    previewMesh.position.set(pos[0], 0.1, pos[2]);
    state.hoverPos = pos;
  }

  function onClick(): void {
    if (!state.hoverPos || state.mode === 'None' || !state.isValid) return;
    // pass chosen road type for Road blueprints
    const chosenKind = (window as any).__pfw_building_kind as string | undefined;
    addBlueprint(
      state.mode as BuildType,
      state.hoverPos,
      state.mode === 'Road' ? state.roadType : undefined,
      state.mode === 'Building' ? (chosenKind as any) : undefined,
    );
  }

  element.addEventListener('pointermove', updateHover);
  element.addEventListener('click', onClick);

  return function BuildPreviewRenderSystem() {
    // show quick hint about road type & cost
    if (state.mode === 'Road') {
      const cfg = (costs as any).roadTypes?.[state.roadType] ?? { timeSec: 1.0, cost: {} };
      const costText = Object.entries(cfg.cost ?? {}).map(([k, v]) => `${k}:${v}`).join(', ') || '무료';
      (window as any).__pfw_hint = `Road: ${state.roadType} (t=${cfg.timeSec ?? 1.0}s, cost: ${costText})`;
    } else {
      (window as any).__pfw_hint = '';
    }
  };
}


