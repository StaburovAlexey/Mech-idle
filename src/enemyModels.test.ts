import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createEnemyGroup, createEnemyModel, type EnemyModelKind } from './enemyModels';
import { applyEnemyPose, computeEnemyPose, type EnemyAnimationState } from './enemyAnimation';
import { attackConfig } from './game';

const kinds: EnemyModelKind[] = ['normal', 'fast', 'ranged', 'boss'];
function state(kind: EnemyModelKind, attackPhase: EnemyAnimationState['attackPhase'], attackTime: number, attackDuration: number): EnemyAnimationState {
  return { kind, id: 'test-enemy', attackPhase, attackTime, attackDuration };
}

describe('approved enemy procedural geometry', () => {
  it('constructs four independent silhouettes and the cannon platform has four articulated legs', () => {
    const models = kinds.map(createEnemyModel);
    const groups = models.map(model => createEnemyGroup(model));
    const sizes = groups.map(group => new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()));
    expect(models.map(m => m.legs)).toEqual([2, 2, 4, 2]);
    expect(models[2].parts.filter(p => /leg/i.test(p.name))).toHaveLength(4);
    expect(models[1].parts.some(p => p.name === 'handR')).toBe(false); // Blades are their own one-piece forearm silhouette.
    expect(models[0].parts.some(p => p.name === 'handR')).toBe(true); // Piston-punch mechanism.
    expect(sizes[1].y / sizes[1].x).toBeGreaterThan(sizes[0].y / sizes[0].x);
    expect(sizes[2].y).toBeLessThan(sizes[0].y);
    expect(sizes[2].z).toBeGreaterThan(sizes[0].z * 1.7);
    expect(sizes[3].x).toBeGreaterThan(sizes[0].x * 1.4);
    expect(sizes[3].y).toBeGreaterThan(sizes[0].y * 1.4);
    // Different vertex counts prove these are not scaled/recoloured instances of one base mesh.
    expect(new Set(models.map(m => m.parts.reduce((n, p) => n + p.geometry.getAttribute('position').count, 0))).size).toBe(4);
    models.forEach(m => m.dispose());
  });

  it('keeps GPU resources bounded and merges all seams, bolts and pistons into rig parts', () => {
    const models = kinds.map(createEnemyModel);
    expect(models.reduce((n, m) => n + m.parts.length, 0)).toBe(30);
    let triangles = 0;
    for (const model of models) {
      const available = new Set<string>();
      for (const part of model.parts) {
        if (part.parent) expect(available.has(part.parent)).toBe(true);
        available.add(part.name);
        expect(Object.keys(part.geometry.attributes).sort()).toEqual(['color', 'normal', 'position']);
        for (const attribute of Object.values(part.geometry.attributes)) expect([...attribute.array].every(Number.isFinite)).toBe(true);
        expect(part.geometry.groups).toHaveLength(0); // No hidden material groups / draw calls.
        triangles += part.geometry.getAttribute('position').count / 3;
      }
    }
    expect(triangles).toBeLessThan(17000);
    models.forEach(m => m.dispose());
  });

  it('shares exact geometry between standalone previews and instanced gameplay and disposes once', () => {
    const model = createEnemyModel('ranged'), group = createEnemyGroup(model);
    const dispose = model.parts.map(part => vi.spyOn(part.geometry, 'dispose'));
    for (const part of model.parts) expect((group.getObjectByName(part.name) as THREE.Mesh).geometry).toBe(part.geometry);
    model.dispose(); model.dispose();
    dispose.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
  });
});

describe('simulation-driven enemy attack poses', () => {
  it('freezes every part at the same simulation snapshot, including midway through a slam', () => {
    for (const kind of kinds) {
      const snapshot = state(kind, 'strike', .08, kind === 'boss' ? .55 : .2);
      expect(computeEnemyPose(snapshot, 12)).toEqual(computeEnemyPose(snapshot, 999));
      const walking = state(kind, 'approach', 0, 0);
      expect(computeEnemyPose(walking, 12)).toEqual(computeEnemyPose(walking, 12));
      expect(computeEnemyPose(walking, 12)).not.toEqual(computeEnemyPose(walking, 12.1));
    }
  });

  it('lands the melee pose at the real windup-to-strike damage boundary', () => {
    for (const kind of ['normal', 'fast', 'boss'] as const) {
      const config = attackConfig(kind === 'normal' ? 'ordinary' : kind), duration = config.windup;
      const before = computeEnemyPose(state(kind, 'windup', duration, duration), 10);
      const contact = computeEnemyPose(state(kind, 'strike', config.hitOffsets[0], config.strike), 10);
      expect(before.impact).toBe(0); expect(contact.impact).toBe(1);
      for (const name of ['armR', 'armL'] as const) before.parts[name]!.rotation!.forEach((v, i) => expect(v).toBeCloseTo(contact.parts[name]!.rotation![i], 9));
      before.root.position!.forEach((v, i) => expect(v).toBeCloseTo(contact.root.position![i], 9));
    }
  });

  it('shows separate Colossus fist contacts at exactly 0 and .30 seconds', () => {
    const config = attackConfig('boss');
    const pose = (time: number) => computeEnemyPose(state('boss', 'strike', time, config.strike), 10);
    expect(pose(config.hitOffsets[0]).impact).toBe(1); expect(pose(.20).impact).toBe(0); expect(pose(config.hitOffsets[1]).impact).toBe(1);
    expect(pose(0).parts.armL!.rotation![0]).toBe(.10);
    expect(pose(0).parts.armR!.rotation![0]).toBe(-2.15);
    expect(pose(config.hitOffsets[1]).parts.armR!.rotation![0]).toBeCloseTo(.10, 10);
    expect(pose(config.strike).impact).toBe(0);
  });

  it('recoils the cannon only when the simulation fires, then reloads during recovery', () => {
    const config = attackConfig('ranged');
    const windup = computeEnemyPose(state('ranged', 'windup', config.windup / 2, config.windup), 10);
    const shot = computeEnemyPose(state('ranged', 'strike', config.hitOffsets[0], config.strike), 10);
    const recovered = computeEnemyPose(state('ranged', 'recovery', config.recovery, config.recovery), 10);
    expect(windup.muzzle).toBe(0); expect(shot.muzzle).toBe(1); expect(shot.parts.cannon!.position![2]).toBeLessThan(-.2);
    expect(recovered.muzzle).toBe(0); expect(recovered.parts.cannon!.position![2]).toBeCloseTo(0, 10);
    expect(recovered.parts.cannon!.rotation![0]).toBeCloseTo(0, 10);
    expect(shot.impact).toBe(0); // Cannon shots never trigger melee/turret-bullet hit effects.
  });

  it('moves the actual articulated mesh with no renderer or WebGL dependency', () => {
    for (const kind of kinds) {
      const model = createEnemyModel(kind), group = createEnemyGroup(model);
      const partName = kind === 'ranged' ? 'cannon' : kind === 'normal' || kind === 'boss' ? 'handR' : 'armR';
      applyEnemyPose(group, model, computeEnemyPose(state(kind, 'windup', .1, .8), 10));
      const before = group.getObjectByName(partName)!.matrixWorld.clone();
      applyEnemyPose(group, model, computeEnemyPose(state(kind, 'strike', kind === 'boss' ? .3 : 0, .55), 10));
      const after = group.getObjectByName(partName)!.matrixWorld;
      expect(after.equals(before)).toBe(false);
      expect([...after.elements].every(Number.isFinite)).toBe(true);
      model.dispose();
    }
  });

  it('places each Colossus fist at terrain contact on its actual damage tick while feet remain planted', () => {
    const model = createEnemyModel('boss'), group = createEnemyGroup(model), config = attackConfig('boss');
    const exactMinY = (name: string) => {
      const mesh = group.getObjectByName(name) as THREE.Mesh, position = mesh.geometry.getAttribute('position'), vertex = new THREE.Vector3();
      let min = Infinity;
      for (let i = 0; i < position.count; i++) min = Math.min(min, vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).y + .09);
      return min;
    };
    for (const [index, name] of ['handL', 'handR'].entries()) {
      applyEnemyPose(group, model, computeEnemyPose(state('boss', 'strike', config.hitOffsets[index], config.strike), 10));
      // Check actual vertices, not a conservatively transformed local bounding box.
      expect(exactMinY(name)).toBeGreaterThan(.048);
      expect(exactMinY(name)).toBeLessThan(.075);
      for (const leg of ['legL', 'legR']) expect(exactMinY(leg)).toBeGreaterThan(.048);
    }
    model.dispose();
  });
});
