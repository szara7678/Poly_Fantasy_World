import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class SceneRoot {
  public readonly scene: THREE.Scene;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly controls: OrbitControls;
  private readonly container: HTMLElement;
  private readonly pressed: Set<string> = new Set();
  private lastTimeMs = performance.now();

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0a);

    const width = container.clientWidth;
    const height = container.clientHeight;

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 5000);
    this.camera.position.set(40, 120, 40);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(1);
    // Ensure container has no stale canvases (dev StrictMode mounts)
    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.enablePan = true;
    this.controls.target.set(0, 0, 0);
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minPolarAngle = 0.2;

    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(5, 10, 7.5);
    this.scene.add(light);

    const grid = new THREE.GridHelper(4000, 400, 0x222222, 0x222222);
    grid.visible = false;
    this.scene.add(grid);

    const axes = new THREE.AxesHelper(2);
    axes.visible = false;
    this.scene.add(axes);

    const originMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.05, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe066 })
    );
    originMarker.position.set(0, 0.03, 0);
    this.scene.add(originMarker);

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);
    // ground plane 제거: 그리드 가시성 확보

    const onKeyDown = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (t as any)?.isContentEditable) return;
      this.pressed.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      this.pressed.delete(e.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    (this as any)._onKeyDown = onKeyDown;
    (this as any)._onKeyUp = onKeyUp;
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  render(): void {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTimeMs) / 1000));
    this.lastTimeMs = now;

    // keyboard navigation
    const moveSpeed = 100; // m/s
    const riseSpeed = 30; // m/s
    const yawSpeed = 5.0; // rad/s
    if (this.pressed.size > 0) {
      const cam = this.camera;
      const target = this.controls.target.clone();
      const forward = target.clone().sub(cam.position);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      let move = new THREE.Vector3();
      if (this.pressed.has('KeyW')) move.add(forward);
      if (this.pressed.has('KeyS')) move.add(forward.clone().multiplyScalar(-1));
      if (this.pressed.has('KeyA')) move.add(right.clone().multiplyScalar(-1));
      if (this.pressed.has('KeyD')) move.add(right);
      if (move.lengthSq() > 1e-6) {
        move.normalize().multiplyScalar(moveSpeed * dt);
        cam.position.add(move);
        this.controls.target.add(move);
      }
      if (this.pressed.has('Space')) {
        const up = riseSpeed * dt;
        cam.position.y += up;
        this.controls.target.y += up;
      }
      if (this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight')) {
        const down = riseSpeed * dt;
        cam.position.y -= down;
        this.controls.target.y -= down;
      }
      // yaw around target with Q/E
      if (this.pressed.has('KeyQ') || this.pressed.has('KeyE')) {
        const dir = this.pressed.has('KeyQ') ? 1 : -1; // Q left, E right
        const angle = dir * yawSpeed * dt;
        const rel = cam.position.clone().sub(this.controls.target);
        const rot = new THREE.Matrix4().makeRotationY(angle);
        rel.applyMatrix4(rot);
        cam.position.copy(this.controls.target.clone().add(rel));
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    try {
      this.renderer.dispose();
    } catch {}
    if (this.renderer.domElement && this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
    try {
      window.removeEventListener('keydown', (this as any)._onKeyDown as EventListener);
      window.removeEventListener('keyup', (this as any)._onKeyUp as EventListener);
    } catch {}
  }
}


