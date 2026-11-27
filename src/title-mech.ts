import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

/** A single presentation actor, independent of arena enemies and simulation time. */
export class TitleMech {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  private model?: THREE.Object3D;
  private mixer?: THREE.AnimationMixer;
  private width = 1;
  private height = 1;
  private readonly motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private dirty = true;

  constructor() {
    this.scene.add(new THREE.HemisphereLight(0xffefd8, 0x8d6c62, 2));
    const light = new THREE.DirectionalLight(0xffd1a0, 2.1);
    light.position.set(-3, 3, 4);
    const rim = new THREE.DirectionalLight(0xffa166, 2.1);
    rim.position.set(3, 2, -3);
    this.scene.add(light, rim);
    this.camera.position.set(-1.04, .08, 1.75);
    this.camera.lookAt(0, 0, 0);
  }

  setModel(source: GLTF) {
    const model = clone(source.scene);
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 1 / (bounds.max.y - bounds.min.y);
    const anchor = new THREE.Group();
    anchor.add(model);
    model.position.sub(center);
    anchor.scale.setScalar(scale);
    this.scene.add(anchor);
    model.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.material = Array.isArray(object.material) ? object.material.map(m => m.clone()) : object.material.clone();
        object.castShadow = false;
      }
    });
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model);
    const idle = source.animations.find(clip => clip.name === 'Idle');
    if (idle) this.mixer.clipAction(idle).play();
    this.mixer.update(0);
    this.dirty = true;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.dirty = true;
  }

  render(renderer: THREE.WebGLRenderer, delta: number) {
    if (!this.dirty && (delta <= 0 || this.motion.matches || !this.mixer)) return;
    if (!this.motion.matches) this.mixer?.update(Math.max(0, Math.min(.05, delta)));
    const aspect = this.width / this.height;
    const y = Math.max(.55, .30 / aspect);
    this.camera.left = -y * aspect;
    this.camera.right = y * aspect;
    this.camera.top = y;
    this.camera.bottom = -y;
    this.camera.near = .1;
    this.camera.far = 10;
    this.camera.updateProjectionMatrix();
    renderer.setViewport(0, 0, this.width, this.height);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.dirty = false;
  }

  enter() { this.dirty = true; }

  dispose() {
    this.mixer?.stopAllAction();
    if (this.model) this.mixer?.uncacheRoot(this.model);
    this.model?.traverse(object => {
      if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
      if (object instanceof THREE.Mesh)
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    });
  }
}
