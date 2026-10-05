import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { arenaViewport, configureArenaCamera } from './viewport';
import { clampToSpawnCircle, onSpawnCircle, SPAWN_RADIUS, spawnPoint } from './spawnGeometry';
import { DT, createState, enemyStats, getStats, parseState, serializeState, startRun, step, waveConfig, type EnemyKind } from './game';

function waveState(wave: number, seed = 2026) {
  const s = startRun(createState(), seed), r = s.run!;
  r.wave = wave; r.lastPaidWave = wave - 1; r.earnedCrystals = wave - 1; s.profile.crystals = wave - 1;
  return s;
}

describe('fixed world-space circle spawning', () => {
  it('uses the same radius for every direction without any camera input', () => {
    expect(SPAWN_RADIUS).toBe(12);
    for (let degrees = 0; degrees < 360; degrees++) {
      const angle = degrees * Math.PI / 180, point = spawnPoint(angle);
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(12, 12);
      expect(point.x).toBeCloseTo(Math.cos(angle) * 12, 12);
      expect(point.y).toBeCloseTo(Math.sin(angle) * 12, 12);
    }
  });
  it.each([1, 4, 29, 30])('queues and materializes every wave%s type at exactly radius12 with only a half-second warning', wave => {
    let s = waveState(wave);
    const warningTicks = new Map<string, number>(), counts: Record<EnemyKind, number> = { ordinary: 0, fast: 0, boss: 0 };
    for (let tick = 1; tick <= 1100 && s.run?.phase === 'combat'; tick++) {
      s = step(s);
      for (const event of s.events) {
        if (event.type !== 'warning' && event.type !== 'spawn') continue;
        expect(Math.hypot(event.x, event.y)).toBeCloseTo(12, 12);
        if (event.type === 'warning') warningTicks.set(event.id, tick);
        else {
          counts[event.kind]++;
          expect(tick - warningTicks.get(event.id)!).toBe(15);
          const live = s.run?.enemies.find(e => e.id === event.id);
          if (live) {
            expect(live.speed).toBe(enemyStats(event.kind, wave).speed);
            expect(Math.hypot(live.x, live.y)).toBeCloseTo(12 - live.speed * DT, 12);
          }
        }
      }
      for (const warning of s.run?.warnings ?? []) expect(warning.remaining).toBeGreaterThan(0), expect(warning.remaining).toBeLessThanOrEqual(.5);
      expect(s.run?.warnings.length ?? 0).toBeLessThanOrEqual(1);
      expect(s.run?.nextArrival).toBeUndefined(); expect(s.run?.spawnGeometry).toBeUndefined();
      // Keep this a spawn-contract test regardless of later-wave combat difficulty.
      if (s.run) s.run.hp = getStats(s).maxHp;
      if (Object.values(counts).reduce((a, b) => a + b, 0) === waveConfig(wave).count) break;
    }
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(waveConfig(wave).count);
    if (wave === 30) expect(counts).toEqual({ ordinary: 0, fast: 0, boss: 1 });
    else expect(counts.fast).toBe(wave >= 4 ? Math.floor(waveConfig(wave).count / 4) : 0);
  });
  it('randomizes full-circle opening angles instead of preferring camera edges', () => {
    const sectors = new Set<number>(), angles = new Set<number>();
    for (let seed = 1; seed <= 256; seed++) {
      const s = step(startRun(createState(), seed * 7919)), w = s.run!.warnings[0];
      sectors.add(w.sector); angles.add(Math.atan2(w.y, w.x));
      const angle = (Math.atan2(w.y, w.x) + Math.PI * 2) % (Math.PI * 2);
      expect(Math.floor(angle / (Math.PI / 6))).toBe(w.sector);
    }
    expect(sectors.size).toBe(12); expect(angles.size).toBe(256);
  });
  it('keeps warning and actual spawn cadence at1.5±.2 seconds even when fast units catch up', () => {
    let s = waveState(4), warnings: number[] = [], spawns: number[] = [];
    for (let tick = 1; tick < 500; tick++) {
      s = step(s);
      if (s.events.some(e => e.type === 'warning')) warnings.push(tick);
      if (s.events.some(e => e.type === 'spawn')) spawns.push(tick);
    }
    expect(warnings).toHaveLength(waveConfig(4).count); expect(spawns).toHaveLength(warnings.length);
    expect(spawns.map((t, i) => t - warnings[i])).toEqual(warnings.map(() => 15));
    for (let i = 1; i < spawns.length; i++) {
      expect((spawns[i] - spawns[i - 1]) * DT).toBeGreaterThanOrEqual(1.3);
      expect((spawns[i] - spawns[i - 1]) * DT).toBeLessThanOrEqual(1.7 + 1e-9);
    }
  });
  it('round-trips circle positions and half-second warnings with byte-identical seeded continuation', () => {
    const original = step(waveState(4, 8181), 140);
    const restored = parseState(serializeState(original))!;
    expect(restored).not.toBeNull(); expect(serializeState(restored)).toBe(serializeState(original));
    expect(serializeState(step(restored, 450))).toBe(serializeState(step(original, 450)));
    expect(serializeState(step(waveState(4, 8181), 140))).toBe(serializeState(original));
    expect(serializeState(step(waveState(4, 8182), 140))).not.toBe(serializeState(original));
  });
  it('produces byte-identical gameplay at320×568,390×844,1280×720 and through camera resizes', () => {
    const sizes = [[320, 568], [390, 844], [1280, 720]];
    const run = (width: number, height: number) => {
      const camera = new THREE.OrthographicCamera(), field = arenaViewport(width, height);
      configureArenaCamera(camera, field.width, field.height);
      let s = waveState(4, 2026);
      for (let i = 0; i < 500; i++) {
        s = step(s);
        if (i === 150) {
          const rotated = arenaViewport(height, width);
          configureArenaCamera(camera, rotated.width, rotated.height);
        }
      }
      return serializeState(s);
    };
    const expected = run(390, 844);
    for (const [width, height] of sizes) expect(run(width, height)).toBe(expected);
  });
  it('keeps the actual attack boundary at radius10', () => {
    let s = startRun(createState(), 5);
    const r = s.run!, stats = enemyStats('ordinary', 1); r.spawnCooldown = 1;
    r.enemies = [{ id: `${r.id}:${r.nextEntityId++}`, kind: 'ordinary', x: 10.001 + DT, y: 0, hp: 20, maxHp: 20, damage: stats.damage, speed: stats.speed, attackInterval: stats.attackInterval, attackCooldown: 0 }];
    s = step(s); expect(s.events.some(e => e.type === 'shot')).toBe(false);
    expect(getStats(s).range).toBe(10);
    s = step(s); expect(s.events.some(e => e.type === 'shot')).toBe(true);
  });
  it('normalizes old directions and clamps only distant positions', () => {
    expect(onSpawnCircle({ x: 0, y: 9 })).toEqual({ x: 0, y: 12 });
    const diagonal = onSpawnCircle({ x: -30, y: -40 });
    expect(diagonal.x).toBeCloseTo(-7.2, 12); expect(diagonal.y).toBeCloseTo(-9.6, 12);
    const nearby = { x: 3, y: 4 }, boundary = { x: 0, y: 12 };
    expect(clampToSpawnCircle(nearby)).toBe(nearby); expect(clampToSpawnCircle(boundary)).toBe(boundary);
    expect(clampToSpawnCircle({ x: 30, y: 40 })).toEqual(onSpawnCircle({ x: 30, y: 40 }));
  });
});
