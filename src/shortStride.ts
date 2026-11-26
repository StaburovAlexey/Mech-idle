import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

/** Bake a shorter footprint into the shared gait clip rather than solving legs for every mech every frame. */
export function shortenStride(source: THREE.Group, clip: THREE.AnimationClip, ratio: number) {
  const rig = clone(source);
  const mixer = new THREE.AnimationMixer(rig);
  const action = mixer.clipAction(clip).play();
  const frames = Math.ceil(clip.duration * 48);
  const times = Array.from({length: frames + 1}, (_, i) => clip.duration * i / frames);
  const v = () => new THREE.Vector3();
  const target = v(), localTarget = v(), current = v(), p = v(), from = v(), to = v();
  const turn = new THREE.Quaternion();
  const body = rig.getObjectByName('Body')!;
  const hipPoint = v(), knee = v(), kneeTarget = v(), axis = v(), bend = v();
  const aim = (joint: THREE.Object3D, end: THREE.Vector3, desired: THREE.Vector3) => {
    from.copy(joint.worldToLocal(end)).normalize();
    to.copy(joint.worldToLocal(p.copy(desired))).normalize();
    joint.quaternion.multiply(turn.setFromUnitVectors(from, to));
    joint.updateMatrixWorld(true);
  };
  const legs = ['L', 'R'].map(side => {
    const bone = (part: string) => rig.getObjectByName(part + side);
    const hip = bone('UpperLeg')!, shin = bone('LowerLeg')!, foot = bone('Foot')!;
    const mid = bone('MidLeg'), heel = bone('FootBack');
    return { hip, foot, tip: heel ?? shin, joints: mid ? [shin, mid, hip] : [shin, hip], offset: v(), center: 0 };
  });
  // Measure the midpoint of the authored fore/aft foot sweep, and the rigid shin tip on the two-legged rigs.
  const pick = (time: number) => {
    action.time = time;
    mixer.update(0);
    rig.updateMatrixWorld(true);
  };
  for (const leg of legs) {
    let min = Infinity, max = -Infinity;
    let shinLength = Infinity, hipCenter = 0;
    for (let i = 0; i < frames; i++) {
      pick(times[i]);
      leg.foot.getWorldPosition(target);
      min = Math.min(min, target.z); max = Math.max(max, target.z);
      if (leg.tip === leg.joints[0]) {
        shinLength = Math.min(shinLength, leg.tip.worldToLocal(localTarget.copy(target)).y);
        hipCenter += leg.hip.getWorldPosition(p).z / frames;
      }
    }
    leg.center = (min + max) / 2;
    if (Number.isFinite(shinLength)) {
      leg.offset.y = shinLength;
      leg.center = hipCenter;
    }
  }

  const channels = new Map<string, number[]>();
  const record = (node: THREE.Object3D, property: 'position' | 'quaternion', values: THREE.Vector3 | THREE.Quaternion) => {
    const name = node.name + '.' + property;
    let samples = channels.get(name);
    if (!samples) channels.set(name, samples = []);
    samples.push(...values.toArray());
  };
  for (let i = 0; i <= frames; i++) {
    // Reapply the authored poses including tracks which the previous IK pass changed.
    // Reset the blend accumulator before reevaluating a key which may not have changed.
    action.stop().play();
    pick(i === frames ? 0 : times[i]);
    const twoBone = legs[0].joints.length === 2;
    if (twoBone) {
      // The source straightens these legs beyond their rigid reach at the ends of the cycle.
      // Lower the chassis only as much as needed to keep the shortened targets attached.
      let drop = 0;
      for (const { hip, foot, tip, offset, center } of legs) {
        hip.getWorldPosition(hipPoint); tip.getWorldPosition(knee);
        const reach = hipPoint.distanceTo(knee) + tip.localToWorld(current.copy(offset)).distanceTo(knee);
        foot.getWorldPosition(target);
        target.z = center + (target.z - center) * ratio;
        const dy = Math.sqrt(Math.max(0, (reach - .009) ** 2 - (target.z - hipPoint.z) ** 2 - (target.x - hipPoint.x) ** 2));
        drop = Math.max(drop, hipPoint.y - target.y - dy);
      }
      body.getWorldPosition(p).y -= drop;
      body.position.copy(body.parent!.worldToLocal(p));
      body.updateMatrixWorld(true);
      record(body, 'position', body.position);
    }
    for (const { hip, foot, joints, tip, offset, center } of legs) {
      foot.getWorldPosition(target);
      target.z = center + (target.z - center) * ratio;
      foot.position.copy(foot.parent!.worldToLocal(localTarget.copy(target)));
      if (twoBone) {
        hip.getWorldPosition(hipPoint); tip.getWorldPosition(knee);
        const upper = hipPoint.distanceTo(knee);
        const lower = tip.localToWorld(current.copy(offset)).distanceTo(knee);
        axis.subVectors(target, hipPoint);
        const distance = axis.length(); axis.normalize();
        bend.subVectors(knee, hipPoint).addScaledVector(axis, -p.subVectors(knee, hipPoint).dot(axis)).normalize();
        const along = (upper * upper + distance * distance - lower * lower) / (2 * distance);
        kneeTarget.copy(hipPoint).addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - along * along)));
        aim(hip, knee, kneeTarget);
        aim(tip, tip.localToWorld(current.copy(offset)), target);
      } else {
        for (let pass = 0; pass < 22; pass++) {
          if (tip.localToWorld(current.copy(offset)).distanceToSquared(target) < .000025) break;
          for (const joint of joints) aim(joint, tip.localToWorld(current.copy(offset)), target);
        }
      }
      record(foot, 'position', foot.position);
      for (const joint of joints) record(joint, 'quaternion', joint.quaternion);
    }
  }
  mixer.stopAllAction();
  const pose = clip.tracks.filter(track => !channels.has(track.name));
  for (const [name, values] of channels) {
    pose.push(name.endsWith('.position') ? new THREE.VectorKeyframeTrack(name, times, values) : new THREE.QuaternionKeyframeTrack(name, times, values));
  }
  return new THREE.AnimationClip(clip.name, clip.duration, pose);
}
