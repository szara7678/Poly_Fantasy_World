import * as THREE from 'three';
import type { SceneRoot } from '../render/three/SceneRoot';
import { canBuild, explainBuildRule, type BuildType } from './BuildRules';
// costs.json is consumed by BuildSystem; preview does not need it directly
import { addBlueprint } from './BlueprintSystem';

export interface BuildPreviewState {
  mode: BuildType | 'None';
  hoverPos: [number, number, number] | null;
  isValid: boolean;
  lastExplain: string;
}

const state: BuildPreviewState = {
  mode: 'None',
  hoverPos: null,
  isValid: false,
  lastExplain: '',
};

export function setBuildMode(mode: BuildType | 'None'): void {
  state.mode = mode;
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
    const pos: [number, number, number] = [hit.x, 0, hit.z];
    state.hoverPos = pos;
    if (state.mode === 'None') {
      state.isValid = false;
      previewMesh.visible = false;
      return;
    }
    const type = state.mode as BuildType;
    state.isValid = canBuild({ position: pos, type });
    state.lastExplain = explainBuildRule({ position: pos, type });
    (previewMesh.material as THREE.MeshBasicMaterial).color.set(state.isValid ? 0x00ff88 : 0xff5555);
    previewMesh.visible = true;
    previewMesh.position.set(pos[0], 0.1, pos[2]);
  }

  function onClick(): void {
    if (!state.hoverPos || state.mode === 'None' || !state.isValid) return;
    addBlueprint(state.mode as BuildType, state.hoverPos);
  }

  element.addEventListener('pointermove', updateHover);
  element.addEventListener('click', onClick);

  return function BuildPreviewRenderSystem() {
    // nothing per-frame; preview updated by pointer events
  };
}


