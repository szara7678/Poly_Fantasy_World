import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class SceneRoot {
  public readonly scene: THREE.Scene;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly controls: OrbitControls;
  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0a);

    const width = container.clientWidth;
    const height = container.clientHeight;

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 5000);
    this.camera.position.set(40, 120, 40);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(1);
    // Ensure container has no stale canvases (dev StrictMode mounts)
    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.target.set(0, 0, 0);
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minPolarAngle = 0.2;

    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(5, 10, 7.5);
    this.scene.add(light);

    const grid = new THREE.GridHelper(4000, 400, 0x777777, 0x333333);
    this.scene.add(grid);

    const axes = new THREE.AxesHelper(2);
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
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  render(): void {
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
  }
}


