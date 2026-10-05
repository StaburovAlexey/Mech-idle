import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SceneView, type SceneFrame } from './scene';
import { createEnemyModel, type EnemyModelKind } from './enemyModels';
import { attackConfig } from './game';

/** Exercise real instance updates/disposal on CPU; this deliberately does not claim WebGL coverage. */
function cpuScene() {
  // TS private fields compile to ordinary properties; bypass only the WebGL/DOM constructor.
  const view = Object.create(SceneView.prototype) as Record<string, any>;
  Object.assign(view, {
    scene: new THREE.Scene(), camera: new THREE.OrthographicCamera(), clock: 0, angle: 0, pulse: 0, prevHp: 1,
    particles: [], previous: new Map(), lastBulletIds: new Set(), batches: {}, showcase: [], disposed: false,
    turretHead: new THREE.Group(), barrel: new THREE.Group(), flash: new THREE.Mesh(),
    allGeometries: new Set(), allMaterials: new Set(), allTextures: new Set(), observer: { disconnect: vi.fn() },
    fieldViewport: { x: 0, y: 0, width: 390, height: 600 },
    renderer: { setScissorTest() {}, clear() {}, setViewport() {}, setScissor() {}, render() {}, dispose: vi.fn(), domElement: { remove: vi.fn() } },
  });
  const material = new THREE.MeshBasicMaterial();
  function mesh(count: number) { const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.1, .1, .1), material, count); view.scene.add(mesh); return mesh; }
  for (const kind of ['normal', 'fast', 'ranged', 'boss'] as EnemyModelKind[]) {
    const model = createEnemyModel(kind), byName: Record<string, unknown> = {};
    const parts = model.parts.map(definition => {
      const part = { definition, mesh: new THREE.InstancedMesh(definition.geometry, material, 24), world: new THREE.Matrix4() };
      byName[definition.name] = part; view.scene.add(part.mesh); return part;
    });
    view.batches[kind] = { model, parts, byName, count: 0 };
  }
  for (const name of ['shadowMesh', 'impactMesh', 'hpBack', 'hpFront']) view[name] = mesh(24);
  view.bulletMesh = mesh(80); view.enemyProjectileMesh = mesh(32); view.particleMesh = mesh(100); view.warningMesh = mesh(32);
  for (const name of ['rangeRing', 'turretRing', 'targetRing']) { view[name] = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 8), new THREE.MeshBasicMaterial()); view.scene.add(view[name]); }
  return view;
}

function frame(): SceneFrame {
  return {
    enemies: (['normal', 'fast', 'ranged', 'boss'] as const).map((kind, index) => ({ id: kind, kind, x: 3 + index, y: 4, hp: 10, maxHp: 10, attackPhase: 'strike', attackTime: 0, attackDuration: attackConfig(kind === 'normal' ? 'ordinary' : kind).strike })),
    bullets: [{ id: 'turret-1', x: 1, y: 1 }], enemyProjectiles: [{ id: 'enemy-1', sourceId: 'ranged', x: 5, y: 3 }],
    turretHPfraction: 1, target: null, phase: 'combat', elapsed: 20, paused: false,
  };
}

describe('real enemy instance rendering', () => {
  it('renders all four rigs in 30 batches and keeps enemy projectiles outside turret firing bookkeeping', () => {
    const view = cpuScene(); view.render(frame(), .016);
    const parts = Object.values(view.batches).flatMap((batch: any) => batch.parts);
    expect(parts).toHaveLength(30); expect(parts.every((part: any) => part.mesh.count === 1)).toBe(true);
    expect(view.shadowMesh.count).toBe(4); expect(view.impactMesh.count).toBe(3);
    expect(view.bulletMesh.count).toBe(1); expect(view.enemyProjectileMesh.count).toBe(1);
    expect([...view.lastBulletIds]).toEqual(['turret-1']);
    expect(view.lastBulletIds.has('enemy-1')).toBe(false);
    view.dispose();
  });

  it('freezes actual instance matrices, particles and firing effects when paused', () => {
    const view = cpuScene(), current = frame(); view.render(current, .016);
    view.particles.push({ x: 0, y: 1, z: 0, vx: 1, vy: 1, vz: 1, life: 1, max: 1, color: 0xffffff });
    view.pulse = .02; // A stale shot event must not restart a frozen flash.
    const matrices = Object.values(view.batches).flatMap((batch: any) => batch.parts.map((part: any) => [...part.mesh.instanceMatrix.array]));
    const before = { clock: view.clock, pulse: view.pulse, particle: { ...view.particles[0] } };
    for (let i = 0; i < 6; i++) view.render({ ...current, paused: true, shooting: true }, .05);
    expect(Object.values(view.batches).flatMap((batch: any) => batch.parts.map((part: any) => [...part.mesh.instanceMatrix.array]))).toEqual(matrices);
    expect(view.clock).toBe(before.clock); expect(view.pulse).toBe(before.pulse); expect(view.particles[0]).toEqual(before.particle);
    view.dispose();
  });

  it('caps instance pools and releases shared resources exactly once on repeated disposal', () => {
    const view = cpuScene(), current = frame();
    current.enemies = Array.from({ length: 70 }, (_, i) => ({ ...current.enemies[0], id: i }));
    current.enemyProjectiles = Array.from({ length: 90 }, (_, i) => ({ id: i, x: i, y: 1 }));
    view.render(current, .016);
    expect(view.batches.normal.count).toBe(24); expect(view.enemyProjectileMesh.count).toBe(32);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    view.scene.traverse((object: THREE.Object3D) => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); materials.add(object.material as THREE.Material); } });
    const spies = [...geometries, ...materials].map(resource => vi.spyOn(resource, 'dispose'));
    view.dispose(); view.dispose();
    spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    expect(view.renderer.dispose).toHaveBeenCalledTimes(1); expect(view.observer.disconnect).toHaveBeenCalledTimes(1);
  });
});
