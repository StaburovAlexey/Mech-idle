import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SceneView } from './scene';
import { WASTELAND_LIMITS } from './decoration';

// Build the real terrain geometry on the CPU. This does not claim WebGL coverage.
function buildTerrain() {
  const context = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  const scene = new THREE.Scene(), textures = new Set<THREE.Texture>();
  const target = {
    scene,
    allTextures: textures,
    addGeometry(geometry: THREE.BufferGeometry, material: THREE.Material) {
      const mesh = new THREE.Mesh(geometry, material); scene.add(mesh); return mesh;
    },
  };
  const builder = SceneView.prototype as unknown as { buildArena(this: typeof target): void };
  builder.buildArena.call(target);
  scene.updateMatrixWorld(true);
  return { scene, textures, meshes: scene.children.filter(child => child instanceof THREE.Mesh) as THREE.Mesh[] };
}

afterEach(() => vi.unstubAllGlobals());

describe('post-apocalyptic field actual CPU geometry', () => {
  it('merges static dressing into five meshes with shared matte material and bounded geometry', () => {
    const { meshes, textures } = buildTerrain();
    expect(meshes).toHaveLength(5);
    expect(textures.size).toBe(1); // Only the existing baked turret contact shadow.
    const material = meshes.find(mesh => mesh.name === 'wasteland-road-dust-and-cracks')!.material;
    expect(meshes.find(mesh => mesh.name === 'wasteland-low-wreckage')!.material).toBe(material);
    expect(meshes.find(mesh => mesh.name === 'wasteland-dry-scrub')!.material).toBe(material);
    let triangles = 0;
    for (const mesh of meshes) {
      const position = mesh.geometry.getAttribute('position');
      expect([...position.array].every(Number.isFinite)).toBe(true);
      expect([...mesh.geometry.getAttribute('normal').array].every(Number.isFinite)).toBe(true);
      triangles += (mesh.geometry.index?.count ?? position.count) / 3;
    }
    expect(triangles).toBeLessThan(12000);
    expect((material as THREE.MeshStandardMaterial).roughness).toBe(1);
  });

  it('keeps continuous walkable earth and flat marks below the unchanged range ring', () => {
    const { scene } = buildTerrain();
    const ground = scene.getObjectByName('wasteland-continuous-ground') as THREE.Mesh;
    expect(ground.position.y).toBe(WASTELAND_LIMITS.groundHeight);
    expect((ground.geometry as THREE.PlaneGeometry).parameters.width).toBeGreaterThan(100);
    const marks = scene.getObjectByName('wasteland-road-dust-and-cracks') as THREE.Mesh;
    marks.geometry.computeBoundingBox();
    expect(marks.geometry.boundingBox!.max.y).toBeLessThanOrEqual(WASTELAND_LIMITS.surfaceHeight);
    expect(marks.geometry.boundingBox!.min.y).toBeGreaterThan(WASTELAND_LIMITS.groundHeight);
    const ray = new THREE.Raycaster();
    for (let i = 0; i < 64; i++) {
      const angle = i * Math.PI / 32;
      ray.set(new THREE.Vector3(Math.cos(angle) * 10, 1, Math.sin(angle) * 10), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObjects([ground, marks]);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].point.y).toBeLessThan(.076);
      expect(hits[0].point.y).toBeGreaterThanOrEqual(WASTELAND_LIMITS.groundHeight - 1e-6);
    }
  });

  it('attaches the outer ruins to the actual field without adding combat colliders', () => {
    const {scene}=buildTerrain();
    const ruins=scene.getObjectByName('wasteland-outer-industrial-ruins') as THREE.Group;
    expect(ruins).toBeDefined();expect(ruins.userData.decorativeOnly).toBe(true);
    expect(ruins.children).toHaveLength(4);
    let meshes=0,triangles=0;
    scene.traverse(object=>{if(object instanceof THREE.Mesh){meshes++;triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;}});
    expect(meshes).toBe(9);expect(triangles).toBeLessThan(24000);
  });

  it('keeps every wreckage and plant vertex away from the firing ring and below mechs', () => {
    const { scene } = buildTerrain();
    for (const [name, maxHeight] of [['wasteland-low-wreckage', WASTELAND_LIMITS.rubbleHeight], ['wasteland-dry-scrub', WASTELAND_LIMITS.grassHeight]] as const) {
      const mesh = scene.getObjectByName(name) as THREE.Mesh;
      const position = mesh.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        expect(Math.hypot(position.getX(i), position.getZ(i))).toBeGreaterThanOrEqual(WASTELAND_LIMITS.raisedClearRadius - 1e-5);
        expect(position.getY(i)).toBeLessThanOrEqual(WASTELAND_LIMITS.groundHeight + maxHeight);
      }
    }
  });
});
