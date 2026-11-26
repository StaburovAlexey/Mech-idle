import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SceneView } from './scene';
import { SPAWN_RADIUS } from './spawnGeometry';

function buildCity() {
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

describe('complete ruined-city environment', () => {
  it('generates the plaza and skyline before optional model loads with bounded mesh cost', () => {
    const scene = buildCity();
    const city = scene.getObjectByName('ruined-city')!;
    expect(city).toBeInstanceOf(THREE.Group);
    expect(city.children.map(child => child.name)).toEqual([
      'city-continuous-ground', 'city-plaza', 'city-plaza-rubble', 'city-ruined-blocks',
    ]);
    let triangles = 0;
    city.traverse(o => {
      if (o instanceof THREE.Mesh) triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
    });
    expect(triangles).toBeLessThan(5500);
  });

  it('keeps all arena surfaces below the existing portals and firing circle', () => {
    const scene = buildCity();
    const ground = scene.getObjectByName('city-continuous-ground') as THREE.Mesh;
    const plaza = scene.getObjectByName('city-plaza') as THREE.Mesh;
    const ray = new THREE.Raycaster();
    for (const radius of [0, 10, SPAWN_RADIUS]) for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12;
      ray.set(new THREE.Vector3(Math.cos(angle) * radius, 1, Math.sin(angle) * radius), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObjects([ground, plaza]);
      expect(hits[0].point.y).toBeGreaterThanOrEqual(.048 - 1e-6);
      expect(hits[0].point.y).toBeLessThan(.067);
    }
  });

  it('keeps the tall generated blocks behind and beyond the enemy spawn circle', () => {
    const scene = buildCity();
    const building = scene.getObjectByName('city-ruined-blocks') as THREE.Mesh;
    const pos = building.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) expect(pos.getZ(i)).toBeLessThan(-SPAWN_RADIUS);
  });
});
