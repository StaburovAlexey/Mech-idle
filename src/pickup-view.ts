import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { currencyLabels } from './currency-ui';
import { pickupLanded, pickupPose, type Pickup, type PickupKind } from './pickup';
import { sandHeight } from './sandTerrain';
import type { GameplayViewport } from './viewport';

const kinds = ['parts','scrap'] as const;
type Primitive = { mesh: THREE.Mesh; matrix: THREE.Matrix4 };
type Batch = { source: Primitive[]; meshes: THREE.InstancedMesh[]; capacity: number };

export class PickupView {
 private readonly batches = new Map<PickupKind,Batch>();
 private readonly buttons = new Map<string,HTMLButtonElement>();
 private readonly point = new THREE.Vector3();
 private readonly transform = new THREE.Object3D();
 private readonly matrix = new THREE.Matrix4();
 private readonly reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

 constructor(private readonly scene: THREE.Scene, private readonly container: HTMLElement) {}

 async load(register: (asset: THREE.Object3D) => void, disposed: () => boolean) {
  const loader = new GLTFLoader();
  const assets = await Promise.allSettled(kinds.map(kind => loader.loadAsync(import.meta.env.BASE_URL + 'assets/pickups/' + kind + '.glb')));
  assets.forEach((result,i) => {
   if (result.status !== 'fulfilled') return;
   const asset = result.value.scene;
   register(asset);
   if (disposed()) return;
   asset.updateMatrixWorld(true);
   const source: Primitive[] = [];
   asset.traverse(object => {
    if (object instanceof THREE.Mesh) source.push({mesh: object, matrix: object.matrixWorld.clone()});
   });
   this.batches.set(kinds[i],{source,meshes:[],capacity:0});
  });
  return !disposed() && this.batches.size === kinds.length;
 }

 private ensure(batch: Batch, count: number) {
  if (batch.capacity >= count) return;
  batch.meshes.forEach(mesh => {mesh.removeFromParent();mesh.dispose();});
  batch.capacity = Math.max(16, batch.capacity * 2, count);
  batch.meshes = batch.source.map(({mesh}) => {
   const instances = new THREE.InstancedMesh(mesh.geometry,mesh.material,batch.capacity);
   instances.count = 0; instances.frustumCulled = false;
   instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
   this.scene.add(instances);
   return instances;
  });
 }

 render(items: readonly Pickup[], time: number, camera: THREE.Camera, field: GameplayViewport, interactive: boolean) {
  const visible = new Set<string>();
  for (const [kind,batch] of this.batches) {
   const group = items.filter(item => item.kind === kind);
   this.ensure(batch,group.length);
   batch.meshes.forEach(mesh => {mesh.count = group.length;});
   group.forEach((item,index) => {
    const pose = pickupPose(item,time,this.reduced);
    const ground = Math.max(.048,sandHeight(pose.x,pose.z));
    const t = this.transform;
    t.position.set(pose.x,ground + .025 + pose.height,pose.z);
    t.rotation.set(pose.tilt,pose.yaw,0); t.scale.setScalar(1.25); t.updateMatrix();
    batch.meshes.forEach((mesh,i) => mesh.setMatrixAt(index,this.matrix.multiplyMatrices(t.matrix,batch.source[i].matrix)));
    if (!interactive || !pickupLanded(item,time)) return;
    this.point.set(pose.x,ground + .16,pose.z).project(camera);
    if (Math.abs(this.point.x) >= 1 || Math.abs(this.point.y) >= 1) return;
    visible.add(item.id);
    let button = this.buttons.get(item.id);
    if (!button) {
     button = document.createElement('button');
     button.type = 'button'; button.className = 'battle-pickup'; button.dataset.pickupId = item.id;
     button.setAttribute('aria-label','Подобрать: '+currencyLabels[item.kind]);
     this.buttons.set(item.id,button);
     this.container.append(button);
    }
    const left = field.x + (this.point.x + 1) * field.width / 2;
    const top = this.container.clientHeight - field.y - (this.point.y + 1) * field.height / 2;
    button.style.left = left.toFixed(2) + 'px'; button.style.top = top.toFixed(2) + 'px';
   });
   for (const mesh of batch.meshes) mesh.instanceMatrix.needsUpdate = true;
  }
  for (const [id,button] of this.buttons) if (!visible.has(id)) {button.remove();this.buttons.delete(id);}
 }

 dispose() {
  for (const batch of this.batches.values()) batch.meshes.forEach(mesh => {mesh.removeFromParent();mesh.dispose();});
  for (const button of this.buttons.values()) button.remove();
  this.buttons.clear();
 }
}
