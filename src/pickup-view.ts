import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { currencyLabels } from './currency-ui';
import { groupPickups, PICKUP_KINDS, pickupPose, type Pickup, type PickupKind } from './pickup';
import { sandHeight } from './sandTerrain';
import { FIELD_HALF_WIDTH, type GameplayViewport } from './viewport';

const adGlyph = '<svg viewBox="0 0 24 18" fill="none" aria-hidden="true"><rect x="1" y="1" width="22" height="16" rx="1.5" fill="white" stroke="currentColor" stroke-width="2"/><path d="M5 1v16M19 1v16M1 6h4M1 12h4M19 6h4M19 12h4" stroke="currentColor" stroke-width="1.5"/><path d="m9 5 7 4-7 4Z" fill="currentColor"/></svg>';
type Primitive = { mesh: THREE.Mesh; matrix: THREE.Matrix4 };
type Batch = { source: Primitive[]; meshes: THREE.InstancedMesh[]; capacity: number };

export class PickupView {
 private readonly batches = new Map<PickupKind,Batch>();
 private readonly counts = new Map<string,HTMLElement>();
 private readonly buttons = new Map<string,HTMLButtonElement>();
 private readonly point = new THREE.Vector3();
 private readonly transform = new THREE.Object3D();
 private readonly matrix = new THREE.Matrix4();
 private readonly reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

 constructor(private readonly scene: THREE.Scene, private readonly container: HTMLElement) {}

 async load(register: (asset: THREE.Object3D) => void, disposed: () => boolean) {
  const loader = new GLTFLoader();
  const assets = await Promise.allSettled(PICKUP_KINDS.map(kind => loader.loadAsync(import.meta.env.BASE_URL + 'assets/pickups/' + kind + '.glb')));
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
   this.batches.set(PICKUP_KINDS[i],{source,meshes:[],capacity:0});
  });
  return !disposed() && this.batches.size === PICKUP_KINDS.length;
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
  const {piles,airborne} = groupPickups(items,time);
  const models = airborne.map(item => ({item, shift:0, count:0}));
  const activeButtons = new Set<string>(), activeCounts = new Set<string>();
  const height = this.container.clientHeight;
  const project = (x:number,y:number,z:number) => {
   this.point.set(x,y,z).project(camera);
   if (Math.abs(this.point.x) >= 1 || Math.abs(this.point.y) >= 1) return;
   return {left:field.x + (this.point.x + 1) * field.width / 2,
    top:height - field.y - (this.point.y + 1) * field.height / 2};
  };
  const place = (node:HTMLElement, pos:{left:number;top:number}) => {
   node.style.left = pos.left.toFixed(2) + 'px'; node.style.top = pos.top.toFixed(2) + 'px';
  };
  const right = camera.matrixWorld.elements;
  for (const pile of piles) {
   const anchor = pile[0], parts = pile.filter(item => item.kind === 'parts').length;
   const scrap = pile.length - parts, spread = parts && scrap ? .84 : 0;
   if (parts) models.push({item:{...anchor,kind:'parts'},shift:-spread,count:parts});
   if (scrap) models.push({item:{...anchor,kind:'scrap'},shift:spread,count:scrap});
   if (!interactive || !this.batches.size) continue;
   const pose = pickupPose(anchor,time,this.reduced);
   const pos = project(pose.x,Math.max(.048,sandHeight(pose.x,pose.z)) + .16,pose.z);
   if (!pos) continue;
   activeButtons.add(anchor.id);
   let button = this.buttons.get(anchor.id);
   if (!button) {
    button = document.createElement('button');
    button.type = 'button'; button.className = 'battle-pickup'; button.innerHTML = adGlyph;
    this.buttons.set(anchor.id,button);this.container.append(button);
   }
   const ids = pile.map(item => item.id).join(',');
   if (button.dataset.pickupIds !== ids) {
    const reward = PICKUP_KINDS.filter(kind => kind === 'parts' ? parts : scrap)
     .map(kind => currencyLabels[kind] + ' ×' + (kind === 'parts' ? parts : scrap)).join(', ');
    button.dataset.pickupIds = ids;
    button.title = 'Подобрать: ' + reward + ' (тестовый режим, без рекламы)';
    button.setAttribute('aria-label',button.title);
   }
   const top = Math.max(0,pos.top-54);
   const pixelsPerUnit = field.width / (2*FIELD_HALF_WIDTH);
   button.style.width = Math.max(44,2*(spread+.75)*pixelsPerUnit+16) + 'px';
   button.style.height = Math.max(44,pos.top-top+Math.max(16,.7*pixelsPerUnit+10)) + 'px';
   place(button,{left:Math.max(field.x+22,Math.min(field.x+field.width-22,pos.left)),top});
  }
  for (const [kind,batch] of this.batches) {
   const group = models.filter(model => model.item.kind === kind);
   this.ensure(batch,group.length);
   batch.meshes.forEach(mesh => {mesh.count = group.length;});
   group.forEach(({item,shift,count},index) => {
    const pose = pickupPose(item,time,this.reduced);
    const x = pose.x + right[0] * shift, z = pose.z + right[2] * shift;
    const ground = Math.max(.048,sandHeight(x,z));
    const t = this.transform;
    t.position.set(x,ground + .025 + pose.height,z);
    t.rotation.set(pose.tilt,pose.yaw,0); t.scale.setScalar(1.25); t.updateMatrix();
    batch.meshes.forEach((mesh,i) => mesh.setMatrixAt(index,this.matrix.multiplyMatrices(t.matrix,batch.source[i].matrix)));
    if (!count) return;
    const pos = project(x,ground + .10,z);
    if (!pos) return;
    const key = item.id + '/' + kind;
    activeCounts.add(key);
    let label = this.counts.get(key);
    if (!label) {
     label = document.createElement('span'); label.className = 'battle-pickup-count';
     label.setAttribute('aria-hidden','true'); this.counts.set(key,label); this.container.append(label);
    }
    const text = '×' + count;
    if (label.textContent !== text) label.textContent = text;
    place(label,pos);
   });
   for (const mesh of batch.meshes) mesh.instanceMatrix.needsUpdate = true;
  }
  for (const [id,node] of this.buttons) if (!activeButtons.has(id)) {node.remove();this.buttons.delete(id);}
  for (const [id,node] of this.counts) if (!activeCounts.has(id)) {node.remove();this.counts.delete(id);}
 }

 dispose() {
  for (const batch of this.batches.values()) batch.meshes.forEach(mesh => {mesh.removeFromParent();mesh.dispose();});
  for (const button of this.buttons.values()) button.remove();
  this.buttons.clear();
  for (const label of this.counts.values()) label.remove();
  this.counts.clear();
 }
}
