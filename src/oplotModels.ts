import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { EnemyAnimationState } from './enemyAnimation';
import type { EnemyModelKind } from './enemyModels';
import { SPAWN_RADIUS } from './spawnGeometry';
import { shortenStride } from './shortStride';

const assetRoot = import.meta.env.BASE_URL + 'assets/oplot/';
const kinds = ['normal', 'fast', 'ranged', 'boss'] as const;
const sources = ['Mike', 'Leela', 'Stan', 'George'] as const;
const movement = ['Walk', 'Run', 'Walk', 'Walk'] as const;
const attacks = ['Punch', 'SwordSlash', 'Shoot', 'Punch'] as const;

// Travel per loop in model heights, calibrated from the planted Foot.L/R motion in each GLB.
const stride: Record<EnemyModelKind, number> = { normal: 1.28, fast: 2.40, ranged: 1.06, boss: 1.08 };
const shorter: Record<EnemyModelKind, number> = { normal: .50, fast: .42, ranged: .72, boss: .50 };

export function walkClipTime(kind: EnemyModelKind, radius: number, height: number, duration: number) {
  return (Math.max(0, SPAWN_RADIUS - radius) / (height * stride[kind] * shorter[kind]) % 1) * duration;
}

export async function loadOplotModels() {
  const loader = new GLTFLoader();
  const get = (file: string) => loader.loadAsync(assetRoot + file + '.glb');
  const [turret, mechs] = await Promise.all([
    get('turret'),
    Promise.all(sources.map(get)),
  ]);
  return { turret, mechs };
}

type Actor = { root: THREE.Group; mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; current?: THREE.AnimationAction };

export class ImportedMechs {
  private source: Record<EnemyModelKind, GLTF>;
  private actors = new Map<EnemyModelKind, Actor[]>();
  private used = new Map<EnemyModelKind, number>();

  constructor(models: GLTF[], private scene: THREE.Scene) {
    this.source = Object.fromEntries(kinds.map((kind, i) => {
      const model = models[i];
      const animations = model.animations.map(clip => clip.name === movement[i] ? shortenStride(model.scene, clip, shorter[kind]) : clip);
      return [kind, { ...model, animations }];
    })) as Record<EnemyModelKind, GLTF>;
  }

  begin() { this.used.clear(); }

  place(enemy: EnemyAnimationState & { x: number; y: number }, angle: number, elapsed: number, height: number, preview: boolean, elevation: number) {
    const {kind} = enemy;
    const index = this.used.get(kind) ?? 0;
    this.used.set(kind, index + 1);
    let pool = this.actors.get(kind);
    if (!pool) this.actors.set(kind, pool = []);
    let actor = pool[index];
    if (!actor) {
      const source = this.source[kind], model = clone(source.scene);
      const bounds = new THREE.Box3().setFromObject(model);
      const scale = height / (bounds.max.y - bounds.min.y);
      model.scale.setScalar(scale); model.position.y = -bounds.min.y * scale;
      // The source mechs face +Z in glTF; the game also aims along +Z.
      const root = new THREE.Group(); root.add(model); this.scene.add(root);
      const mixer = new THREE.AnimationMixer(model);
      const actions = new Map(source.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
      pool[index] = actor = { root, mixer, actions };
    }
    actor.root.visible = true;
    actor.root.position.set(enemy.x, elevation, enemy.y);
    actor.root.rotation.y = angle;
    const i = kinds.indexOf(kind), phase = enemy.attackPhase ?? 'approach';
    const attack = !preview && phase !== 'approach';
    const action = actor.actions.get(preview ? 'Idle' : attack ? attacks[i] : movement[i])!;
    if (actor.current !== action) {
      actor.current?.stop();
      action.reset().setLoop(THREE.LoopOnce, 1).play();
      action.clampWhenFinished = true;
      actor.current = action;
    }
    const duration = action.getClip().duration;
    const t = enemy.attackTime ?? 0;
    const p = Math.min(1, t / Math.max(.001, enemy.attackDuration ?? 1));
    const contact = kind === 'ranged' ? .5 : .52;
    let sample = preview ? (elapsed + i * .15) % duration : walkClipTime(kind, Math.hypot(enemy.x, enemy.y), height, duration);
    if (attack) {
      if (phase === 'windup') sample = duration * contact * p;
      else if (phase === 'strike' && kind === 'boss') {
        // Keep both existing visual contacts at the simulation's strike offsets (0 and .30 s).
        sample = duration * (t < .15 ? contact + t / .15 * (1 - contact) : t < .30 ? contact * (t - .15) / .15 : contact + (1 - contact) * (t - .30) / .25);
      } else if (phase === 'strike') sample = duration * (contact + (1 - contact) * p);
      else sample = duration;
    }
    action.time = THREE.MathUtils.clamp(sample, 0, duration);
    actor.mixer.update(0);
  }

  end() {
    for (const [kind, pool] of this.actors) {
      for (let i = this.used.get(kind) ?? 0; i < pool.length; i++) pool[i].root.visible = false;
    }
  }

  dispose() {
    for (const pool of this.actors.values()) for (const actor of pool) {
      actor.mixer.stopAllAction();
      actor.root.traverse(o => { if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose(); });
    }
  }
}
