import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

function manifest(file: string) {
  const data = readFileSync(new URL('../public/assets/oplot/' + file + '.glb', import.meta.url));
  expect(data.toString('ascii', 0, 4)).toBe('glTF');
  expect(data.readUInt32LE(8)).toBe(data.length);
  return JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)));
}

test('ships self-contained arena assets and all runtime animation clips', () => {
  const turret = manifest('turret');
  expect(turret.nodes.map((node: { name: string }) => node.name)).toEqual(expect.arrayContaining(['Base', 'Head', 'Barrel']));
  for (const file of ['ruin-1', 'ruin-3', 'ruin-5']) expect(manifest(file).meshes.length).toBeGreaterThan(0);
  for (const [file, walk, attack] of [['Mike', 'Walk', 'Punch'], ['Leela', 'Run', 'SwordSlash'], ['Stan', 'Walk', 'Shoot'], ['George', 'Walk', 'Punch']]) {
    const mech = manifest(file);
    expect(mech.skins).toHaveLength(1);
    expect(mech.animations.map((clip: { name: string }) => clip.name).sort()).toEqual(['Idle', walk, attack].sort());
    expect(mech.images.every((image: { uri?: string }) => !image.uri)).toBe(true);
  }
});
