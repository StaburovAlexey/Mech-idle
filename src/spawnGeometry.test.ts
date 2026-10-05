import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { ENEMY_BOUNDS, ARENA_ASPECT, ARENA_HALF_WIDTH, defaultSpawnGeometry, isFullyOffscreen, keepSpawnOffscreen, projectGround, spawnPoint, type SpawnKind } from './spawnGeometry';
import { arenaViewport, cameraSpawnGeometry, configureArenaCamera } from './viewport';
import { DT, createState, enemyStats, getStats, parseState, serializeState, setSpawnGeometry, startRun, step } from './game';
import { SceneView } from './scene';
import { MECH_SILHOUETTES } from './mechSilhouettes';

const dimensions = [[320, 568], [300, 600], [390, 844], [768, 1024], [1366, 768], [844, 390], [300, 1000], [2560, 1080]];
function viewport(width: number, height: number) {
  const camera = new THREE.OrthographicCamera(); configureArenaCamera(camera, width, height);
  return { camera, geometry: cameraSpawnGeometry(camera) };
}
function projectedCorners(point: { x: number; y: number }, kind: SpawnKind, camera: THREE.Camera) {
  const bounds = ENEMY_BOUNDS[kind], result: THREE.Vector3[] = [];
  for (const x of [-bounds.radius, bounds.radius]) for (const y of [bounds.minHeight, bounds.maxHeight]) for (const z of [-bounds.radius, bounds.radius]) result.push(new THREE.Vector3(point.x + x, y, point.y + z).project(camera));
  return result;
}
function fullyOutside(corners: THREE.Vector3[]) {
  return corners.every(p => p.x < -1) || corners.every(p => p.x > 1) || corners.every(p => p.y < -1) || corners.every(p => p.y > 1);
}

// Inspect real procedural meshes without constructing a WebGL renderer. Reducing
// the sampled vertices to their convex hull preserves every projection extremum.
function modelClouds() {
  const view = Object.create(SceneView.prototype) as any;
  view.scene = new THREE.Scene(); view.material = new THREE.MeshStandardMaterial(); view.glowMaterial = new THREE.MeshBasicMaterial();
  const clouds = {} as Record<SpawnKind, THREE.Vector3[]>;
  for (const [sceneKind, kind] of [['normal', 'ordinary'], ['fast', 'fast'], ['boss', 'boss']] as const) {
    const batch = view.buildMech(sceneKind), points: THREE.Vector3[] = [];
    for (let phase = 0; phase <= 64; phase++) {
      const amplitude = -1 + phase / 32, bob = Math.abs(amplitude) * .04;
      const parts = [[batch.body, 0, 0, 0, 0], [batch.glow, 0, 0, 0, 0], [batch.leftLeg, -batch.hips, .93, amplitude * .32, -.04], [batch.rightLeg, batch.hips, .93, -amplitude * .32, .04], [batch.leftArm, -batch.shoulders, 1.59, -amplitude * .32 * .65 - .12, -.10], [batch.rightArm, batch.shoulders, 1.59, amplitude * .32 * .65 - .12, .10]] as const;
      for (const [mesh, x, y, rx, rz] of parts) {
        const positions = mesh.geometry.getAttribute('position'), matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(1, 1, 1));
        for (let i = 0; i < positions.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix).multiplyScalar(batch.scale);
          point.y += .09 + bob * batch.scale; points.push(point);
        }
      }
    }
    const hull = new ConvexHull().setFromPoints(points), vertices = new Set<THREE.Vector3>();
    for (const face of hull.faces) {
      let edge = face.edge;
      do { vertices.add(edge.head().point); edge = edge.next; } while (edge !== face.edge);
    }
    clouds[kind] = [...vertices];
  }
  view.scene.traverse((object: THREE.Object3D) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
  view.material.dispose(); view.glowMaterial.dispose();
  return clouds;
}
const actualModels = modelClouds();
function projectedVisuals(point: { x: number; y: number }, kind: SpawnKind, camera: THREE.Camera) {
  const heading = Math.atan2(-point.x, -point.y), cosine = Math.cos(heading), sine = Math.sin(heading);
  const vertices = actualModels[kind].map(p => new THREE.Vector3(point.x + cosine * p.x + sine * p.z, p.y, point.y - sine * p.x + cosine * p.z));
  const scale = kind === 'boss' ? 1.48 : kind === 'fast' ? .77 : 1;
  // Include the entire billboard (even though a full-health spawn hides it), the
  // offset contact shadow, and the largest pulsing warning-ring radius.
  for (const x of [-1, 1]) for (const y of [-1, 1]) vertices.push(new THREE.Vector3(x * (kind === 'boss' ? 1.55 : .8) / 2, y * .035, 0).applyQuaternion(camera.quaternion).add(new THREE.Vector3(point.x, 2.32 * scale, point.y)));
  for (let i = 0; i < 64; i++) {
    const angle = i * Math.PI / 32;
    vertices.push(new THREE.Vector3(point.x + .15 + Math.cos(angle) * .66 * scale, .067, point.y + .15 + Math.sin(angle) * .66 * .75 * scale));
    vertices.push(new THREE.Vector3(point.x + Math.cos(angle) * .78, .075, point.y + Math.sin(angle) * .78));
  }
  return vertices.map(p => p.project(camera));
}
function edgeGap(points: THREE.Vector3[], sector: number, width: number, height: number) {
  const edge = Math.floor(sector / 3);
  return Math.min(...points.map(p => (edge === 0 ? p.x - 1 : edge === 1 ? p.y - 1 : edge === 2 ? -1 - p.x : -1 - p.y) * (edge % 2 ? height : width) / 2));
}

describe('fixed-field offscreen spawning and camera geometry', () => {
  it('default simulation projection exactly matches the real portrait camera', () => {
    const { geometry } = viewport(390, 844), expected = defaultSpawnGeometry();
    for (const axis of ['horizontal', 'vertical'] as const) for (const field of ['x', 'y', 'height', 'offset'] as const) expect(geometry[axis][field]).toBeCloseTo(expected[axis][field], 12);
  });
  it.each(dimensions)('every animated silhouette is just outside the contained field on %sx%s, including its first movement tick', (width, height) => {
    const { camera, geometry } = viewport(width, height), field = arenaViewport(width, height);
    for (const kind of ['ordinary', 'fast', 'boss'] as const) for (let sector = 0; sector < 12; sector++) for (const along of [0, .25, .5, .75, 1]) {
      const p = spawnPoint(geometry, kind, sector, along), distance = Math.hypot(p.x, p.y), movement = enemyStats(kind, 30).speed * DT;
      expect(isFullyOffscreen(p, geometry, kind)).toBe(true);
      const visual = projectedVisuals(p, kind, camera);
      expect(fullyOutside(visual)).toBe(true);
      // Normalize to a 390-wide field: about 2 px plus at most one movement tick.
      const gap = edgeGap(visual, sector, field.width, field.height) * 390 / field.width;
      expect(gap).toBeGreaterThanOrEqual(1.99);
      expect(gap).toBeLessThan(3.05);
      // A warning ring/HP bar can lead the body, but never by a large hidden gap.
      const bodyGap = edgeGap(visual.slice(0, actualModels[kind].length), sector, field.width, field.height) * 390 / field.width;
      expect(bodyGap).toBeGreaterThan(1.99);
      expect(bodyGap).toBeLessThan(8);
      const moved = { x: p.x * (1 - movement / distance), y: p.y * (1 - movement / distance) };
      const afterTick = projectedVisuals(moved, kind, camera);
      expect(fullyOutside(afterTick)).toBe(true);
      expect(edgeGap(afterTick, sector, field.width, field.height) * 390 / field.width).toBeGreaterThan(1.99);
      // All possible approach points are within the depth range: no near/far plane pop-in.
      for (const factor of [1, .9, .5, .1, 0]) for (const corner of projectedCorners({ x: p.x * factor, y: p.y * factor }, kind, camera)) expect(corner.z).toBeGreaterThan(-1), expect(corner.z).toBeLessThan(1);
    }
  });
  it.each([1, 1.5, 2, 3])('DPR %s cannot change logical spawn bounds or camera composition', dpr => {
    // DPR and physical dimensions change only the drawing buffer and contained rectangle.
    const css = { width: 390, height: 844 }, pixels = { width: css.width * dpr, height: css.height * dpr };
    expect(viewport(pixels.width / dpr, pixels.height / dpr).geometry).toEqual(viewport(css.width, css.height).geometry);
  });
  it('keeps pending and live units, RNG and timers unchanged on resize', () => {
    const small = viewport(390, 844).geometry, wide = viewport(1366, 768).geometry;
    let s = step(setSpawnGeometry(startRun(createState(), 811), small));
    s = step(s, 16); s = step(s, 40);
    const old = structuredClone(s.run!);
    s = setSpawnGeometry(s, wide);
    expect(s.run!.warnings).toEqual(old.warnings); expect(s.run!.enemies).toEqual(old.enemies); expect(s.run!.rngState).toBe(old.rngState); expect(s.run!.tick).toBe(old.tick);
    for (const w of s.run!.warnings) expect(isFullyOffscreen(w, wide, w.kind)).toBe(true);
    for (let i = 0; i < 2000 && s.run?.wave === 1; i++) {
      s = step(s);
      for (const event of s.events) if (event.type === 'spawn') expect(isFullyOffscreen(event, wide, event.kind)).toBe(true);
    }
  });
  it('rechecks legacy queued positions at materialization even when there was no resize callback', () => {
    const s = startRun(createState(), 11), r = s.run!;
    r.warnings = [{ id: `${r.id}:${r.nextEntityId++}`, kind: 'ordinary', x: 9, y: 0, remaining: DT, sector: 0 }];
    r.spawned = 1; r.spawnCooldown = 1;
    const n = step(s), spawn = n.events.find(e => e.type === 'spawn')!;
    expect(spawn.type).toBe('spawn');
    if (spawn.type === 'spawn') expect(isFullyOffscreen(spawn, n.run!.spawnGeometry!, spawn.kind)).toBe(true);
  });
  it('round-trips staged arrivals and RNG, including coordinates beyond the old radius10 limit', () => {
    let s = setSpawnGeometry(startRun(createState(), 2026), viewport(300, 1000).geometry);
    s = step(s, 160);
    expect(s.run!.warnings.some(w => w.remaining > .5)).toBe(true);
    expect(s.run!.warnings.some(w => Math.hypot(w.x, w.y) > 10)).toBe(true);
    const restored = parseState(serializeState(s))!;
    expect(restored).not.toBeNull(); expect(serializeState(restored)).toBe(serializeState(s));
    expect(serializeState(step(restored, 750))).toBe(serializeState(step(s, 750)));
  });
  it('keeps the real radius10 attack boundary independent of the viewport', () => {
    for (const [width, height] of dimensions) {
      let s = setSpawnGeometry(startRun(createState(), 5), viewport(width, height).geometry);
      const r = s.run!, stats = enemyStats('ordinary', 1); r.spawnCooldown = 1;
      r.enemies = [{ id: `${r.id}:${r.nextEntityId++}`, kind: 'ordinary', x: 10.001 + DT, y: 0, hp: 20, maxHp: 20, damage: stats.damage, speed: stats.speed, attackInterval: stats.attackInterval, attackCooldown: 0 }];
      s = step(s); expect(s.events.some(e => e.type === 'shot')).toBe(false);
      expect(getStats(s).range).toBe(10);
      s = step(s); expect(s.events.some(e => e.type === 'shot')).toBe(true);
    }
  });
  it('contains a fixed 9:16 field without stretching or exposing extra world', () => {
    for (const [width, height] of dimensions) {
      const field = arenaViewport(width, height);
      expect(field.width / field.height).toBeCloseTo(ARENA_ASPECT, 12);
      expect(field.x).toBeGreaterThanOrEqual(0); expect(field.y).toBeGreaterThanOrEqual(0);
      expect(field.x * 2 + field.width).toBeCloseTo(width, 12);
      expect(field.y * 2 + field.height).toBeCloseTo(height, 12);
      expect(viewport(width, height).geometry).toEqual(viewport(390, 844).geometry);
    }
    expect(arenaViewport(1366, 768)).toEqual({ x: 467, y: 0, width: 432, height: 768 });
  });
  it('has bit-identical spawns, staging, motion and save data for the same inputs on every device', () => {
    const run = (width: number, height: number) => step(setSpawnGeometry(startRun(createState(), 2026), viewport(width, height).geometry), 500);
    const expected = serializeState(run(390, 844));
    for (const [width, height] of dimensions) expect(serializeState(run(width, height))).toBe(expected);
  });
  it('can adapt a legacy wide projection while preserving live positions and RNG', () => {
    const oldGeometry = defaultSpawnGeometry();
    for (const field of ['x', 'y', 'height', 'offset'] as const) oldGeometry.horizontal[field] *= 2;
    let state = step(setSpawnGeometry(startRun(createState(), 812), oldGeometry), 40);
    const old = structuredClone(state.run!);
    state = setSpawnGeometry(state, viewport(390, 844).geometry);
    expect(state.run!.enemies).toEqual(old.enemies);
    expect(state.run!.rngState).toBe(old.rngState);
    expect(state.run!.tick).toBe(old.tick);
    for (const warning of state.run!.warnings) expect(isFullyOffscreen(warning, state.run!.spawnGeometry!, warning.kind)).toBe(true);
    expect(parseState(serializeState(state))).not.toBeNull();
  });
  it('does not move an already safely staged point', () => {
    const geometry = defaultSpawnGeometry(), point = spawnPoint(geometry, 'boss', 4, .5);
    expect(keepSpawnOffscreen(point, geometry, 'boss')).toBe(point);
  });
  it('projects the radius10 ring to roughly80% of portrait width with its center at the turret', () => {
    const { geometry } = viewport(390, 844);
    const right = geometry.horizontal;
    const radius = 10 * Math.hypot(right.x, right.y);
    expect(radius).toBeCloseTo(10 / ARENA_HALF_WIDTH, 12);
    expect(projectGround({ x: 0, y: 0 }, geometry).x).toBeCloseTo(0, 12);
  });
});

describe('procedural mech bounding contract', () => {
  it('keeps the compact hull conservative between authored walk samples at every heading', () => {
    const geometry = defaultSpawnGeometry();
    for (const kind of ['ordinary', 'fast', 'boss'] as const) for (let degrees = 0; degrees < 360; degrees += 2) {
      const angle = degrees * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle);
      for (const axis of [geometry.horizontal, geometry.vertical]) for (const sign of [-1, 1]) {
        const x = sign * (axis.x * cosine - axis.y * sine), z = sign * (axis.x * sine + axis.y * cosine), height = sign * axis.height;
        const actual = Math.max(...actualModels[kind].map(p => x * p.x + height * p.y + z * p.z));
        const compact = Math.max(...MECH_SILHOUETTES[kind].map(p => x * p[0] + height * p[1] + z * p[2]));
        expect(compact + .003 * Math.hypot(x, height, z)).toBeGreaterThanOrEqual(actual);
      }
    }
  });
  it('encloses actual animated vertices for all mech models, all gait phases and headings', () => {
    const view = Object.create(SceneView.prototype) as any;
    view.scene = new THREE.Scene(); view.material = new THREE.MeshStandardMaterial(); view.glowMaterial = new THREE.MeshBasicMaterial();
    for (const [sceneKind, kind] of [['normal', 'ordinary'], ['fast', 'fast'], ['boss', 'boss']] as const) {
      const batch = view.buildMech(sceneKind), bound = ENEMY_BOUNDS[kind];
      for (let phase = 0; phase < 16; phase++) {
        const gait = phase * Math.PI / 8, bob = Math.abs(Math.sin(gait)) * .04, walk = .32;
        const parts = [[batch.body, 0, 0, 0, 0], [batch.glow, 0, 0, 0, 0], [batch.leftLeg, -batch.hips, .93, Math.sin(gait) * walk, -.04], [batch.rightLeg, batch.hips, .93, -Math.sin(gait) * walk, .04], [batch.leftArm, -batch.shoulders, 1.59, -Math.sin(gait) * walk * .65 - .12, -.10], [batch.rightArm, batch.shoulders, 1.59, Math.sin(gait) * walk * .65 - .12, .10]] as const;
        for (const [mesh, x, y, rx, rz] of parts) {
          const positions = mesh.geometry.getAttribute('position'), matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(1, 1, 1));
          for (let i = 0; i < positions.count; i++) {
            const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix).multiplyScalar(batch.scale); p.y += .09 + bob * batch.scale;
            // Radial bound is heading-independent, so this covers every rotation.
            expect(Math.hypot(p.x, p.z)).toBeLessThan(bound.radius);
            expect(p.y).toBeGreaterThan(bound.minHeight); expect(p.y).toBeLessThan(bound.maxHeight);
          }
        }
      }
    }
    view.scene.traverse((o: THREE.Object3D) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    view.material.dispose(); view.glowMaterial.dispose();
  });
});
