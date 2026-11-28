import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { walkClipTime } from './oplotModels';
import { shortenStride } from './shortStride';
import { SPAWN_RADIUS } from './spawnGeometry';
import { splitTurretMount } from './turretMount';

function manifest(file: string) {
  const data = readFileSync(new URL('../public/assets/oplot/' + file + '.glb', import.meta.url));
  expect(data.toString('ascii', 0, 4)).toBe('glTF');
  expect(data.readUInt32LE(8)).toBe(data.length);
  return JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)));
}

test('ships self-contained arena assets and all runtime animation clips', () => {
  const turret = manifest('turret');
  expect(turret.nodes.map((node: { name: string }) => node.name)).toEqual(expect.arrayContaining(['Base', 'Head', 'Barrel']));

  for (const [file, walk, attack] of [['Mike', 'Walk', 'Punch'], ['Leela', 'Run', 'SwordSlash'], ['Stan', 'Walk', 'Shoot'], ['George', 'Walk', 'Punch']]) {
    const mech = manifest(file);
    expect(mech.skins).toHaveLength(1);
    expect(mech.animations.map((clip: { name: string }) => clip.name).sort()).toEqual(['Idle', walk, attack].sort());
    expect(mech.images.every((image: { uri?: string }) => !image.uri)).toBe(true);
  }
});

test('ships the city models with embedded standard textures and no decoder dependencies', () => {
  for (const file of ['ruined-apartment-shell', 'wrecked-bus', 'rubble-heap-medium']) {
    const data = readFileSync(new URL('../public/assets/city/' + file + '.glb', import.meta.url));
    expect(data.toString('ascii', 0, 4)).toBe('glTF');
    const json = JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)));
    expect(json.images.every((image: { uri?: string; mimeType: string }) => !image.uri && image.mimeType === 'image/jpeg')).toBe(true);
    expect(json.extensionsRequired ?? []).not.toContain('KHR_texture_basisu');
    expect(json.extensionsRequired ?? []).not.toContain('EXT_meshopt_compression');
  }
});

test('samples gait by travel, with clip-specific strides scaled to the actual model', () => {
  const radius = (travel: number) => SPAWN_RADIUS - travel;
  expect(walkClipTime('normal', radius(0), 2, 1)).toBe(0);
  expect(walkClipTime('normal', radius(.32), 2, 1)).toBeCloseTo(.25);
  expect(walkClipTime('normal', radius(.64), 2, 1)).toBeCloseTo(.50);
  expect(walkClipTime('normal', radius(.64), 4, 1)).toBeCloseTo(.25);
  expect(walkClipTime('normal', radius(1.60), 2, 1)).toBeCloseTo(.25);
  expect(walkClipTime('fast', radius(.504), 2, 1)).toBeCloseTo(.25);
  expect(walkClipTime('ranged', radius(.3816), 2, 1)).toBeCloseTo(.25);
  expect(walkClipTime('boss', radius(.27), 2, .8)).toBeCloseTo(.20);
});


function loadGeometry(name: string) {
  // WebGL texture decoding is irrelevant to this bone-level check. Reuse the original BIN/accessors.
  const raw = readFileSync(new URL('../public/assets/oplot/' + name + '.glb', import.meta.url));
  const json = manifest(name);
  delete json.images; delete json.textures; delete json.materials;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  const serialized = JSON.stringify(json);
  const chunk = Buffer.from(serialized.padEnd(Math.ceil(serialized.length / 4) * 4, ' '));
  const tail = raw.subarray(20 + raw.readUInt32LE(12)), header = Buffer.from(raw.subarray(0, 20));
  header.writeUInt32LE(20 + chunk.length + tail.length, 8); header.writeUInt32LE(chunk.length, 12);
  const glb = Uint8Array.from(Buffer.concat([header, chunk, tail])).buffer;
  return new GLTFLoader().parseAsync(glb, '');
}

test('keeps all three feet and the bottom ring fixed while the collar and column rotate', async () => {
  const { scene } = await loadGeometry('turret');
  const base = scene.getObjectByName('Base') as THREE.Mesh;
  const original = Array.from(base.geometry.index!.array);
  const swivel = splitTurretMount(base);
  const fixed = Array.from(base.geometry.index!.array), moving = Array.from(swivel.geometry.index!.array);
  expect(fixed.length).toBeGreaterThan(0); expect(moving.length).toBeGreaterThan(0);
  expect([...fixed,...moving].sort((a,b)=>a-b)).toEqual(original.sort((a,b)=>a-b));
  expect(swivel.material).toBe(base.material);
  const heights = (mesh: THREE.Mesh, indices: number[]) => indices.map(i =>
    mesh.position.y + mesh.scale.y * mesh.geometry.getAttribute('position').getY(i));
  expect(Math.max(...heights(base,fixed))).toBeLessThan(.27);
  expect(Math.min(...heights(swivel,moving))).toBeLessThan(.16);
  expect(Math.max(...heights(swivel,moving))).toBeGreaterThan(1.4);
  const turntable = new THREE.Group(); scene.add(turntable); turntable.add(swivel);
  scene.updateMatrixWorld(true);
  const foot = base.matrixWorld.clone(), column = swivel.matrixWorld.clone();
  turntable.rotation.y = Math.PI / 2; scene.updateMatrixWorld(true);
  expect(base.matrixWorld.equals(foot)).toBe(true);
  expect(swivel.matrixWorld.equals(column)).toBe(false);
});

test.each([['Mike', 'Walk', .50], ['Leela', 'Run', .42], ['Stan', 'Walk', .72], ['George', 'Walk', .50]] as const)(
  'shortens %s foot travel while preserving ground height and leg reach', async (name, gait, ratio) => {
    const {scene, animations} = await loadGeometry(name);
    const original = animations.find(a => a.name === gait)!;
    const edited = shortenStride(scene, original, ratio);
    const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).y;
    const mixer = new THREE.AnimationMixer(scene);
    const sample = (clip: THREE.AnimationClip) => {
      const action = mixer.clipAction(clip).play();
      const foot = scene.getObjectByName('FootL')!, heel = scene.getObjectByName('FootBackL');
      const tip = heel ?? scene.getObjectByName('LowerLegL')!;
      const tipY = heel ? 0 : name === 'Mike' ? 1.359 : 1.413;
      const frames = Math.ceil(clip.duration * 48);
      const values = Array.from({length: frames}, (_, i) => {
        action.time = clip.duration * i / frames; mixer.update(0);
        const point = foot.getWorldPosition(new THREE.Vector3());
        const gap = tip.localToWorld(new THREE.Vector3(0, tipY, 0)).distanceTo(point) / size;
        return {y: point.y, z: point.z, gap};
      });
      action.stop();
      return values;
    };
    const before = sample(original), after = sample(edited);
    const span = (samples: typeof before) => Math.max(...samples.map(s => s.z)) - Math.min(...samples.map(s => s.z));
    expect(span(after) / span(before)).toBeCloseTo(ratio, 2);
    expect(Math.max(...after.map((s, i) => Math.abs(s.y - before[i].y)))).toBeLessThan(.005);
    expect(Math.max(...after.map(s => s.gap))).toBeLessThan(.022);
    if (name === 'Mike' || name === 'Stan') {
      const legs = ['UpperLegL', 'LowerLegL', 'UpperLegR', 'LowerLegR'].map(name => scene.getObjectByName(name)!);
      const action = mixer.clipAction(edited).play();
      mixer.update(0);
      let last = legs.map(leg => leg.quaternion.clone());
      for (let i = 1; i <= 200; i++) {
        action.time = edited.duration * i / 200; mixer.update(0);
        for (const [j, leg] of legs.entries()) expect(leg.quaternion.angleTo(last[j])).toBeLessThan(.18);
        last = legs.map(leg => leg.quaternion.clone());
      }
      action.stop();
    }
  },
);
