import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createOuterScenery, createOuterSceneryLayout, OUTER_SCENERY_LIMITS, type OuterProp, type OuterPropRange } from './outerScenery';
import { createState, serializeState, startRun, step } from './game';
import { SceneView } from './scene';

function sceneryMeshes(group: THREE.Group) { return group.children as THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]; }
function release(group: THREE.Group) {
  for (const mesh of sceneryMeshes(group)) { mesh.geometry.dispose(); mesh.material.dispose(); }
}

describe('outer industrial wasteland scenery', () => {
  it('has an independent deterministic layout with varied remnants and no simulation mutations', () => {
    const state = startRun(createState(), 149), before = serializeState(state), expected = step(state, 90);
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Scenery must own its RNG'); });
    try {
      const layout = createOuterSceneryLayout();
      createOuterSceneryLayout(876);
      expect(createOuterSceneryLayout()).toEqual(layout);
      expect(createOuterSceneryLayout(149)).toEqual(createOuterSceneryLayout(149));
      expect(createOuterSceneryLayout(149)).not.toEqual(createOuterSceneryLayout(150));
      expect(new Set(layout.map(prop => prop.kind))).toEqual(new Set(['wall', 'container', 'tank', 'wreck', 'pipes', 'pole', 'scrub']));
      expect(layout.length).toBeGreaterThan(65);
      expect(layout.length).toBeLessThan(100);
      expect(random).not.toHaveBeenCalled();
      expect(serializeState(state)).toBe(before);
      expect(step(state, 90)).toEqual(expected);
    } finally { random.mockRestore(); }
  });

  it.each([0, 1, 149, 0xffffffff])('keeps every actual vertex clear of the arena and old road for seed %s', seed => {
    const scenery = createOuterScenery(seed), cameraDirection = new THREE.Vector2(14, 17).normalize();
    let minRadius = Infinity, minRoadClearance = Infinity, highestForeground = -Infinity;
    let nearestTall = Infinity, furthestTallTowardCamera = -Infinity, highest = -Infinity, furthest = 0;
    try {
      for (const mesh of sceneryMeshes(scenery)) {
        const positions = mesh.geometry.getAttribute('position');
        expect([...positions.array].every(Number.isFinite)).toBe(true);
        expect([...mesh.geometry.getAttribute('normal').array].every(Number.isFinite)).toBe(true);
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i), radius = Math.hypot(x, z);
          const depth = x * cameraDirection.x + z * cameraDirection.y;
          minRadius = Math.min(minRadius, radius); furthest = Math.max(furthest, radius); highest = Math.max(highest, y);
          minRoadClearance = Math.min(minRoadClearance, Math.abs(Math.cos(.22) * (x + 2.4) - Math.sin(.22) * (z - 1.5)));
          if (depth >= 0) highestForeground = Math.max(highestForeground, y);
          if (y > OUTER_SCENERY_LIMITS.foregroundHeight) {
            nearestTall = Math.min(nearestTall, radius); furthestTallTowardCamera = Math.max(furthestTallTowardCamera, depth);
          }
        }
      }
      expect(minRadius).toBeGreaterThanOrEqual(OUTER_SCENERY_LIMITS.clearRadius);
      expect(minRoadClearance).toBeGreaterThanOrEqual(OUTER_SCENERY_LIMITS.roadHalfWidth);
      expect(highestForeground).toBeLessThanOrEqual(OUTER_SCENERY_LIMITS.foregroundHeight);
      expect(nearestTall).toBeGreaterThanOrEqual(OUTER_SCENERY_LIMITS.tallClearRadius);
      expect(furthestTallTowardCamera).toBeLessThan(0);
      expect(highest).toBeGreaterThan(2.5);
      expect(highest).toBeLessThanOrEqual(OUTER_SCENERY_LIMITS.maxHeight);
      expect(furthest).toBeLessThan(OUTER_SCENERY_LIMITS.maxRadius);
    } finally { release(scenery); }
  });

  it('uses four static draws, no textures, and traceable prop spans within the triangle budget', () => {
    const scenery = createOuterScenery();
    try {
      const props = scenery.userData.props as OuterProp[], ids = new Set(props.map(prop => prop.id));
      let triangles = 0;
      expect(sceneryMeshes(scenery)).toHaveLength(OUTER_SCENERY_LIMITS.maxMeshes);
      expect(new Set(sceneryMeshes(scenery).map(mesh => mesh.name))).toEqual(new Set(['outer-ruins-concrete', 'outer-ruins-metal', 'outer-ruins-scrub', 'outer-ruins-contact']));
      for (const mesh of sceneryMeshes(scenery)) {
        const geometry = mesh.geometry, positions = geometry.getAttribute('position');
        triangles += positions.count / 3;
        expect(geometry.groups).toHaveLength(0);
        expect(geometry.index).toBeNull();
        expect(mesh.userData.decorativeOnly).toBe(true);
        expect(Object.values(mesh.material).some(value => value instanceof THREE.Texture)).toBe(false);
        expect(geometry.boundingBox).not.toBeNull(); expect(geometry.boundingSphere).not.toBeNull();
        let verticesCovered = 0;
        for (const range of geometry.userData.propRanges as OuterPropRange[]) {
          expect(ids.has(range.id)).toBe(true);
          expect(range.start).toBe(verticesCovered);
          expect(range.count % 3).toBe(0);
          verticesCovered += range.count;
        }
        expect(verticesCovered).toBe(positions.count);
      }
      expect(triangles).toBeLessThanOrEqual(OUTER_SCENERY_LIMITS.maxTriangles);
      expect(triangles).toBeGreaterThan(3000);
      expect(scenery.userData.decorativeOnly).toBe(true);
    } finally { release(scenery); }
  });

  it('reproduces the geometry and vertex colors independent of previous builds', () => {
    const first = createOuterScenery(431), unrelated = createOuterScenery(87), second = createOuterScenery(431);
    try {
      for (let i = 0; i < first.children.length; i++) {
        const a = sceneryMeshes(first)[i].geometry, b = sceneryMeshes(second)[i].geometry;
        for (const attribute of ['position', 'normal', 'color']) expect(a.getAttribute(attribute).array).toEqual(b.getAttribute(attribute).array);
        expect(a.userData.propRanges).toEqual(b.userData.propRanges);
      }
    } finally { release(first); release(unrelated); release(second); }
  });

  it('releases construction intermediates and leaves final resources owned by SceneView disposal', () => {
    const geometryDisposals = new Set<THREE.BufferGeometry>(), materialDisposals = new Set<THREE.Material>();
    const geometrySpy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(function (this: THREE.BufferGeometry) { geometryDisposals.add(this); });
    const materialSpy = vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(function (this: THREE.Material) { materialDisposals.add(this); });
    try {
      const scenery = createOuterScenery(), meshes = sceneryMeshes(scenery);
      expect(geometryDisposals.size).toBeGreaterThan(200);
      for (const mesh of meshes) expect(geometryDisposals.has(mesh.geometry)).toBe(false);
      expect(materialDisposals.size).toBe(0);
      const scene = new THREE.Scene(); scene.add(scenery);
      const target = {
        disposed: false, scene, observer: { disconnect: vi.fn() },
        allGeometries: new Set<THREE.BufferGeometry>(), allMaterials: new Set<THREE.Material>(), allTextures: new Set<THREE.Texture>(),
        previous: new Map(), lastBulletIds: new Set(), particles: [],
        renderer: { dispose: vi.fn(), domElement: { remove: vi.fn() } },
      };
      const view = SceneView.prototype as unknown as { dispose(this: typeof target): void };
      view.dispose.call(target);
      for (const mesh of meshes) {
        expect(geometryDisposals.has(mesh.geometry)).toBe(true);
        expect(materialDisposals.has(mesh.material)).toBe(true);
      }
      expect(target.allGeometries.size).toBe(4); expect(target.allMaterials.size).toBe(4);
      expect(target.renderer.dispose).toHaveBeenCalledOnce();
      view.dispose.call(target);
      expect(target.renderer.dispose).toHaveBeenCalledOnce();
    } finally { geometrySpy.mockRestore(); materialSpy.mockRestore(); }
  });
});
