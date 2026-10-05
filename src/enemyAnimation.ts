import * as THREE from 'three';
import type { EnemyModel, EnemyModelKind, EnemyPartName, XYZ } from './enemyModels';

export type AttackPhase = 'approach' | 'windup' | 'strike' | 'recovery';
export interface EnemyAnimationState {
  kind: EnemyModelKind;
  id: number | string;
  attackPhase?: AttackPhase;
  /** Elapsed simulation seconds within the named phase, never wall-clock time. */
  attackTime?: number;
  attackDuration?: number;
}
export interface PartPose { position?: XYZ; rotation?: XYZ; scale?: XYZ }
export interface EnemyPose {
  root: PartPose;
  parts: Partial<Record<EnemyPartName, PartPose>>;
  /** Contact envelope for visual rings only. Damage is exclusively simulation-owned. */
  impact: number;
  muzzle: number;
}
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function seedFor(id: number | string) {
  let hash = 0; for (const ch of String(id)) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0; return hash % 359 / 57;
}
const pulse = (seconds: number, duration: number) => seconds < 0 ? 0 : 1 - smooth(seconds / duration);

/** Deterministic visual pose. Repeated frames at a paused simulation time are identical. */
export function computeEnemyPose(enemy: EnemyAnimationState, simulationTime: number): EnemyPose {
  const phase = enemy.attackPhase ?? 'approach', time = Math.max(0, enemy.attackTime ?? 0);
  const progress = clamp(time / Math.max(.0001, enemy.attackDuration ?? 1));
  const pose: EnemyPose = { root: {}, parts: {}, impact: 0, muzzle: 0 };
  const p = pose.parts;
  const walking = phase === 'approach';
  const gait = simulationTime * (enemy.kind === 'fast' ? 13 : enemy.kind === 'boss' ? 4.8 : enemy.kind === 'ranged' ? 6 : 7.2) + seedFor(enemy.id);
  const step = walking ? Math.sin(gait) : 0;
  const lift = walking ? Math.abs(Math.sin(gait)) : 0;
  const wind = phase === 'windup' ? progress : 0;
  const recovery = phase === 'recovery' ? smooth(progress) : 0;
  if (enemy.kind === 'normal') {
    p.legL = { rotation: [step * .29, 0, -.045] }; p.legR = { rotation: [-step * .29, 0, .045] };
    pose.root.position = [0, lift * .035, 0];
    p.armL = { rotation: [-.12 - step * .20, 0, -.11] }; p.handL = { rotation: [-.15, 0, 0] };
    let arm = -.17 + step * .20, hand = -.18, extend = 0, lean = 0;
    if (phase === 'windup') {
      // Raise the elbow, retract the piston, then drive forward to contact exactly at the phase boundary.
      const prepare = smooth(wind / .6), drive = smooth((wind - .68) / .32);
      arm = mix(mix(-.17, -1.10, prepare), -1.50, drive);
      hand = mix(mix(-.18, .42, prepare), -.04, drive); extend = mix(-.14 * prepare, .32, drive); lean = drive * .08;
    } else if (phase === 'strike') { arm = -1.50; hand = -.04; extend = .32; lean = .08; pose.impact = pulse(time, .15); }
    else if (phase === 'recovery') { arm = mix(-1.50, -.17, recovery); hand = mix(-.04, -.18, recovery); extend = .32 * (1 - recovery); lean = .08 * (1 - recovery); }
    p.body = { rotation: [lean, -.06 * Math.max(0, extend), 0] };
    p.armR = { rotation: [arm, 0, .04] }; p.handR = { position: [0, -extend, 0], rotation: [hand, 0, 0] };
  } else if (enemy.kind === 'fast') {
    p.legL = { rotation: [step * .45, 0, -.04] }; p.legR = { rotation: [-step * .45, 0, .04] };
    let forward = 0, lean = .045, slash = 0, prepare = 0;
    if (phase === 'windup') { prepare = smooth(wind / .5); slash = smooth((wind - .56) / .44); forward = mix(-.11 * prepare, .45, slash); lean = mix(-.08 * prepare, .19, slash); }
    else if (phase === 'strike') { prepare = 1; slash = 1; forward = .45; lean = .19; pose.impact = pulse(time, .14); }
    else if (phase === 'recovery') { prepare = 1 - recovery; slash = 1 - recovery; forward = .45 * (1 - recovery); lean = mix(.19, .045, recovery); }
    pose.root.position = [0, lift * .022 - .06 * prepare, forward];
    p.body = { rotation: [lean, .22 * prepare - .44 * slash, 0] };
    p.armL = { rotation: [-.25 + step * .23 - .75 * prepare - .28 * slash, -.4 * slash, -.30 - .50 * prepare + .80 * slash] };
    p.armR = { rotation: [-.20 - step * .23 - 1.10 * prepare + .76 * slash, .35 * slash, .30 + .63 * prepare - 1.11 * slash] };
  } else if (enemy.kind === 'ranged') {
    p.legL = { rotation: [step * .17, 0, -.025] }; p.legR = { rotation: [-step * .17, 0, .025] };
    p.rearLegL = { rotation: [-step * .17, 0, -.025] }; p.rearLegR = { rotation: [step * .17, 0, .025] };
    pose.root.position = [0, lift * .012, 0];
    let recoil = 0, reload = 0;
    if (phase === 'windup') p.body = { position: [0, -.035 * smooth(wind), 0] };
    if (phase === 'strike') { recoil = .26 * pulse(time, Math.max(.01, enemy.attackDuration ?? .2)); pose.muzzle = pulse(time, .11); p.body = { position: [0, -.035, 0] }; }
    if (phase === 'recovery') { reload = Math.sin(progress * Math.PI) * .10; p.body = { position: [0, -.035 * (1 - recovery), 0] }; }
    p.cannon = { position: [0, 0, -recoil], rotation: [-reload, 0, 0] };
    p.muzzle = { scale: [pose.muzzle, pose.muzzle, pose.muzzle * 2.8] };
  } else {
    p.legL = { rotation: [step * .16, 0, -.08] }; p.legR = { rotation: [-step * .16, 0, .08] };
    let left = -.10 - step * .07, right = -.10 + step * .07, crouch = 0, lean = .025;
    if (phase === 'windup') {
      const liftArms = smooth(wind / .65), slamLeft = smooth((wind - .78) / .22);
      left = mix(mix(-.10, -2.15, liftArms), .10, slamLeft); right = mix(-.10, -2.15, liftArms);
      crouch = -.18 * slamLeft; lean = mix(-.04 * liftArms, .16, slamLeft);
    } else if (phase === 'strike') {
      // Two simulation damage ticks: first fist at t=0, second at t=.30, never an idle sine.
      const second = smooth((time - .17) / .13);
      left = .10; right = mix(-2.15, .10, second); crouch = -.18; lean = .16;
      pose.impact = Math.max(pulse(time, .16), pulse(time - .30, .17));
    } else if (phase === 'recovery') { left = right = mix(.10, -.10, recovery); crouch = -.18 * (1 - recovery); lean = mix(.16, .025, recovery); }
    pose.root.position = [0, lift * .025 + crouch, 0]; p.body = { rotation: [lean, 0, 0] };
    // Keep the planted feet on the terrain while the torso crouches into each slam.
    p.legL!.position = p.legR!.position = [0, -crouch, 0];
    p.armL = { rotation: [left, 0, -.08] }; p.armR = { rotation: [right, 0, .08] };
    p.handL = { rotation: [-.04, 0, 0] }; p.handR = { rotation: [-.04, 0, 0] };
  }
  return pose;
}

export function setPartPose(object: THREE.Object3D, pivot: XYZ, pose: PartPose = {}) {
  const p = pose.position ?? [0, 0, 0], r = pose.rotation ?? [0, 0, 0], s = pose.scale ?? [1, 1, 1];
  object.position.set(pivot[0] + p[0], pivot[1] + p[1], pivot[2] + p[2]);
  object.rotation.set(...r); object.scale.set(...s);
}

/** CPU preview adapter; renderer uses the same local transforms for instancing. */
export function applyEnemyPose(group: THREE.Group, model: EnemyModel, pose: EnemyPose) {
  setPartPose(group, [0, 0, 0], pose.root);
  for (const part of model.parts) setPartPose(group.getObjectByName(part.name)!, part.pivot, pose.parts[part.name]);
  group.updateMatrixWorld(true);
}
