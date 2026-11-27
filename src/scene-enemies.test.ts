import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeArenaSun, SceneView, type SceneFrame } from './scene';
import { createEnemyModel, type EnemyModelKind } from './enemyModels';
import { attackConfig } from './game';
import { createPortalMesh, PORTAL_CAPACITY } from './spawnPortal';

/** Exercise real instance updates/disposal on CPU; this deliberately does not claim WebGL coverage. */
function cpuScene() {
  // TS private fields compile to ordinary properties; bypass only the WebGL/DOM constructor.
  const view = Object.create(SceneView.prototype) as Record<string, any>;
  Object.assign(view, {
    scene: new THREE.Scene(), camera: new THREE.OrthographicCamera(), sun: makeArenaSun(), shadowTick: -1, clock: 0, angle: 0, pulse: 0, prevHp: 1,
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
  for (const name of ['impactMesh', 'hpBack', 'hpFront']) view[name] = mesh(24);
  view.bulletMesh = mesh(80); view.enemyProjectileMesh = mesh(32); view.particleMesh = mesh(100); view.portals = createPortalMesh(); view.arrivals = new Map(); view.scene.add(view.portals.mesh);
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
  it('uses one light with a bounded and throttled depth map', () => {
    const view = cpuScene(), current = frame(), sun = view.sun as THREE.DirectionalLight;
    expect(sun.castShadow).toBe(true);
    expect(sun.shadow.mapSize.toArray()).toEqual([1024, 1024]);
    expect(sun.shadow.autoUpdate).toBe(false);
    view.render(current, .01);
    expect(sun.shadow.needsUpdate).toBe(true);
    sun.shadow.needsUpdate = false;
    view.render(current, .01);
    expect(sun.shadow.needsUpdate).toBe(false);
    view.render(current, .03);
    expect(sun.shadow.needsUpdate).toBe(true);
    sun.shadow.needsUpdate = false;
    view.render({ ...current, paused: true }, .05);
    expect(sun.shadow.needsUpdate).toBe(false);
    view.dispose();
  });
  it('renders all four rigs in 30 batches and keeps enemy projectiles outside turret firing bookkeeping', () => {
    const view = cpuScene(); view.render(frame(), .016);
    const parts = Object.values(view.batches).flatMap((batch: any) => batch.parts);
    expect(parts).toHaveLength(30); expect(parts.every((part: any) => part.mesh.count === 1)).toBe(true);
    expect(view.impactMesh.count).toBe(3);
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

  it('opens a red portal before a spawn, raises that mech, and closes it on simulation time', () => {
    const view = cpuScene(), current = frame();
    const enemy = { ...current.enemies[0], id: 'arrival', x: 12, y: 0, attackPhase: 'approach' as const };
    const point = { id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y };
    view.render({ ...current, warnings: [{ ...point, remaining: .25 }], enemies: [] }, .016);
    expect(view.portals.mesh.count).toBe(1);
    expect(view.portals.timing.getX(0)).toBeCloseTo(-.25);
    const arrival = { ...current, enemies: [enemy] };
    view.render({ ...arrival, spawns: [{ ...point, time: 20 }] }, .016);
    expect(view.portals.timing.getX(0)).toBe(0);
    const part = view.batches.normal.parts[0].mesh;
    const position = new THREE.Matrix4();
    part.getMatrixAt(0, position);
    const buried = position.elements[13];
    view.render({ ...arrival, paused: true }, .05);
    part.getMatrixAt(0, position);
    expect(position.elements[13]).toBe(buried);
    expect(view.portals.timing.getX(0)).toBe(0);
    view.render({ ...arrival, elapsed: 20.68 }, .016);
    part.getMatrixAt(0, position);
    expect(position.elements[13]).toBeGreaterThan(buried + 1.5);
    view.render({ ...arrival, elapsed: 20.84 }, .016);
    expect(view.portals.mesh.count).toBe(0);
    view.dispose();
  });

  it('caps instance pools and releases shared resources exactly once on repeated disposal', () => {
    const view = cpuScene(), current = frame();
    current.enemies = Array.from({ length: 70 }, (_, i) => ({ ...current.enemies[0], id: i }));
    current.enemyProjectiles = Array.from({ length: 90 }, (_, i) => ({ id: i, x: i, y: 1 }));
    current.warnings = Array.from({ length: 90 }, (_, i) => ({ id: String(i), x: 1, y: 2, kind: 'normal', remaining: .2 }));
    view.render(current, .016);
    expect(view.portals.mesh.count).toBe(PORTAL_CAPACITY);
    expect(view.batches.normal.count).toBe(24); expect(view.enemyProjectileMesh.count).toBe(32);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    view.scene.traverse((object: THREE.Object3D) => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); materials.add(object.material as THREE.Material); } });
    const spies = [...geometries, ...materials].map(resource => vi.spyOn(resource, 'dispose'));
    view.dispose(); view.dispose();
    spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    expect(view.renderer.dispose).toHaveBeenCalledTimes(1); expect(view.observer.disconnect).toHaveBeenCalledTimes(1);
  });
});
