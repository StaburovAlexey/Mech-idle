import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SceneView } from './scene';
import { SPAWN_RADIUS } from './spawnGeometry';

function buildStation() {
  const context = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  const scene = new THREE.Scene(), allTextures = new Set<THREE.Texture>();
  const target = {
    scene, allTextures,
    addGeometry(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D) {
      const mesh = new THREE.Mesh(geometry, material); parent.add(mesh); return mesh;
    },
  };
  (SceneView.prototype as unknown as { buildArena(this: typeof target): void }).buildArena.call(target);
  scene.updateMatrixWorld(true);
  return scene;
}

afterEach(() => vi.unstubAllGlobals());

describe('Quaternius reactor arena geometry', () => {
  it('generates a steel deck and reactor hull before optional model loads with bounded mesh cost', () => {
    const scene = buildStation();
    const station = scene.getObjectByName('quaternius-reactor-arena')!;
    expect(station).toBeInstanceOf(THREE.Group);
    expect(station.children.map(child => child.name)).toEqual([
      'station-deck-base', 'station-deck-panels', 'station-reactors-and-hull', 'station-reactor-light', 'station-gate-fallback',
    ]);
    let triangles = 0;
    station.traverse(o => {
      if (o instanceof THREE.Mesh) triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
    });
    expect(triangles).toBeLessThan(5500);
  });

  it('keeps all arena surfaces below the existing portals and firing circle', () => {
    const scene = buildStation();
    const ground = scene.getObjectByName('station-deck-base') as THREE.Mesh;
    const deck = scene.getObjectByName('station-deck-panels') as THREE.Mesh;
    const ray = new THREE.Raycaster();
    for (const radius of [0, 10, SPAWN_RADIUS]) for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12;
      ray.set(new THREE.Vector3(Math.cos(angle) * radius, 1, Math.sin(angle) * radius), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObjects([ground, deck]);
      expect(hits[0].point.y).toBeGreaterThanOrEqual(.048 - 1e-6);
      expect(hits[0].point.y).toBeLessThan(.067);
    }
  });

  it('keeps the tall reactor hull behind and beyond the enemy spawn circle', () => {
    const scene = buildStation();
    const building = scene.getObjectByName('station-reactors-and-hull') as THREE.Mesh;
    const pos = building.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) expect(pos.getZ(i)).toBeLessThan(-SPAWN_RADIUS);
  });
});
