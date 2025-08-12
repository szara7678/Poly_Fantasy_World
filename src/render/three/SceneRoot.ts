import * as THREE from 'three';

export class SceneRoot {
  public readonly scene: THREE.Scene;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly camera: THREE.PerspectiveCamera;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    const width = container.clientWidth;
    const height = container.clientHeight;

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(6, 6, 6);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    container.appendChild(this.renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(5, 10, 7.5);
    this.scene.add(light);

    const grid = new THREE.GridHelper(20, 20, 0x333333, 0x222222);
    this.scene.add(grid);

    const ambient = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(ambient);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}


