import { describe, it, expect } from 'vitest';
import {
  DT, STAT_KEYS, createState, startRun, step, setPaused, buyRunUpgrade, buyMetaUpgrade,
  runPrice, metaPrice, getStats, enemyStats, waveConfig, serializeState, parseState,
  type GameState, type Enemy, type StatKey,
} from './game';

function funded(gold = 1000): GameState {
  const s = startRun(createState(), 123); s.run!.gold = gold; s.run!.earnedGold = gold; return s;
}
function enemy(state: GameState, kind: Enemy['kind'] = 'ordinary', x = 3, hp?: number): Enemy {
  const r = state.run!, stats = enemyStats(kind, r.wave);
  return { id: `${r.id}:${r.nextEntityId++}`, kind, x, y: 0, hp: hp ?? stats.maxHp, maxHp: stats.maxHp, damage: stats.damage, speed: stats.speed, attackInterval: stats.attackInterval, attackCooldown: 0 };
}
function clearAtNextTick(s: GameState): GameState {
  const r = s.run!; r.enemies = []; r.bullets = []; r.warnings = []; r.spawned = waveConfig(r.wave).count; return step(s);
}
function play(seed: number, checkpoint = false): GameState {
  let s = startRun(createState(), seed), oldWave = 0;
  while (s.run && s.run.tick < 100000) {
    const r = s.run;
    // Deterministic zero-meta strategy: alternate damage/speed and add regeneration every four waves.
    const key: StatKey = r.levels.regen < Math.floor(r.wave / 4) ? 'regen' : r.levels.damage < r.levels.attackSpeed + 1 ? 'damage' : 'attackSpeed';
    s = buyRunUpgrade(s, key);
    s = step(s);
    if (checkpoint && s.run && s.run.wave !== oldWave) {
      oldWave = s.run.wave;
      const loaded = parseState(serializeState(s)); expect(loaded).not.toBeNull(); s = loaded!;
    }
  }
  return s;
}

describe('stat and economy rules', () => {
  it('starts full HP with zero temporary economy and exact base stats', () => {
    const s = startRun(createState(), 17);
    expect(s.run?.hp).toBe(100); expect(s.run?.gold).toBe(0);
    expect(getStats(s)).toEqual({ damage: 10, maxHp: 100, attackSpeed: 1, regen: 0, range: 10 });
    expect(STAT_KEYS.every(k => s.run?.levels[k] === 0)).toBe(true);
  });
  it('uses exact exponential ceil prices and never overdrafts', () => {
    expect(runPrice('damage', 0)).toBe(10); expect(runPrice('maxHp', 1)).toBe(15);
    expect(runPrice('attackSpeed', 2)).toBe(Math.ceil(15 * 1.45 ** 2));
    expect(runPrice('regen', 4)).toBe(Math.ceil(12 * 1.45 ** 4));
    expect(metaPrice('damage', 0)).toBe(3); expect(metaPrice('regen', 2)).toBe(7);
    const s = funded(9); expect(buyRunUpgrade(s, 'damage')).toBe(s);
    const ready = funded(10), purchased = buyRunUpgrade(ready, 'damage');
    expect(purchased.run?.gold).toBe(0); expect(ready.run?.gold).toBe(10);
    expect(buyRunUpgrade(purchased, 'damage')).toBe(purchased);
  });
  it('queues all four run stats until the next completed-wave boundary', () => {
    let s = funded();
    for (const k of STAT_KEYS) s = buyRunUpgrade(s, k);
    expect(getStats(s)).toEqual({ damage: 10, maxHp: 100, attackSpeed: 1, regen: 0, range: 10 });
    expect(getStats(s, true)).toEqual({ damage: 12, maxHp: 120, attackSpeed: 1.1, regen: .5, range: 10 });
    s = clearAtNextTick(s);
    expect(s.run?.phase).toBe('interwave');
    expect(getStats(s)).toEqual(getStats(s, true));
    expect(s.run?.hp).toBe(100); // max-HP upgrade gives capacity, never a heal
  });
  it('interwave purchases activate only after the following combat wave', () => {
    let s = clearAtNextTick(funded());
    s = buyRunUpgrade(s, 'damage');
    expect(getStats(s).damage).toBe(10);
    s = step(s, 59); expect(s.run?.phase).toBe('interwave');
    s = step(s); expect(s.run?.wave).toBe(2); expect(s.run?.phase).toBe('combat');
    expect(getStats(s).damage).toBe(10);
    s = clearAtNextTick(s); expect(getStats(s).damage).toBe(12);
  });
  it('permanent levels charge crystals, apply multiplicatively, and cannot be bought mid-run', () => {
    let s = createState(); s.profile.crystals = 100;
    for (const k of STAT_KEYS) s = buyMetaUpgrade(s, k);
    expect(s.profile.crystals).toBe(88);
    s = startRun(s, 1);
    expect(s.run?.hp).toBeCloseTo(110);
    expect(getStats(s)).toEqual({ damage: 11, maxHp: 110.00000000000001, attackSpeed: 1.1, regen: .2, range: 10 });
    expect(buyMetaUpgrade(s, 'damage')).toBe(s);
    s.run!.gold = 100; s = buyRunUpgrade(s, 'damage'); s = clearAtNextTick(s);
    expect(getStats(s).damage).toBeCloseTo(13.2);
  });
  it('enforces independent level caps and insufficient crystal checks', () => {
    let s = funded(100000); s.run!.levels.damage = 15;
    expect(buyRunUpgrade(s, 'damage')).toBe(s);
    const hangar = createState(); expect(buyMetaUpgrade(hangar, 'regen')).toBe(hangar);
    hangar.profile.crystals = 100000; hangar.profile.meta.damage = 10;
    expect(buyMetaUpgrade(hangar, 'damage')).toBe(hangar);
  });
});

describe('deterministic combat and timing', () => {
  it('uses exact enemy growth, first fast wave4, and only one exact boss on wave30', () => {
    expect(waveConfig(1)).toEqual({ count: 6, interval: 1.5, jitter: .2, fastEvery: 0, boss: false });
    expect(waveConfig(3).fastEvery).toBe(0); expect(waveConfig(4).fastEvery).toBe(4);
    expect(enemyStats('ordinary', 1)).toEqual({ maxHp: 20, damage: 10, speed: 1, attackInterval: 2, reward: 3 });
    expect(enemyStats('fast', 4)).toEqual({ maxHp: 16, damage: 9, speed: 1.8, attackInterval: 2, reward: 4 });
    expect(enemyStats('ordinary', 29).maxHp).toBe(76);
    expect(enemyStats('ordinary', 19).maxHp).toBe(56); // no floating-point ceil-to57 drift
    expect(waveConfig(30).count).toBe(1);
    expect(enemyStats('boss', 30)).toEqual({ maxHp: 624, damage: 42, speed: .7, attackInterval: 2, reward: 50 });
  });
  it('warns for exactly half a second before spawn, at radius8–10', () => {
    let s = step(startRun(createState(), 77));
    expect(s.run?.warnings).toHaveLength(1); expect(s.run?.enemies).toHaveLength(0);
    const w = s.run!.warnings[0]; expect(Math.hypot(w.x, w.y)).toBeGreaterThanOrEqual(8); expect(Math.hypot(w.x, w.y)).toBeLessThanOrEqual(10);
    s = step(s, 14); expect(s.run?.enemies).toHaveLength(0);
    s = step(s); expect(s.run?.warnings).toHaveLength(0); expect(s.events.some(e => e.type === 'spawn' && e.id === w.id)).toBe(true);
  });
  it('first-wave spacing stays within1.5±.2 seconds and sector streak never exceeds2', () => {
    let s = startRun(createState(), 999), ticks: number[] = [];
    for (let i = 0; i < 400; i++) {
      s = step(s);
      if (s.events.some(e => e.type === 'warning')) ticks.push(s.run!.tick);
      expect(s.run?.sectorStreak ?? 0).toBeLessThanOrEqual(2);
    }
    expect(ticks).toHaveLength(6);
    for (let i = 1; i < ticks.length; i++) expect((ticks[i] - ticks[i-1]) * DT).toBeGreaterThanOrEqual(1.3);
    for (let i = 1; i < ticks.length; i++) expect((ticks[i] - ticks[i-1]) * DT).toBeLessThanOrEqual(1.7 + 1e-9);
  });
  it('selects nearest automatically, ties by stable numeric ID, and bullets travel at16', () => {
    const s = startRun(createState(), 1), r = s.run!;
    r.spawnCooldown = 99;
    const a = enemy(s, 'ordinary', 8), b = enemy(s, 'ordinary', 4), c = enemy(s, 'ordinary', -4);
    r.enemies = [a, c, b];
    const n = step(s);
    expect(n.events.find(e => e.type === 'shot')).toMatchObject({ targetId: b.id });
    expect(n.run!.bullets[0].x).toBeCloseTo(16 / 30);
    expect(n.run!.enemies[1].hp).toBe(20);
  });
  it('does not attack beyond range10', () => {
    const s = startRun(createState(), 1); s.run!.spawnCooldown = 99;
    s.run!.enemies = [enemy(s, 'ordinary', 11)];
    expect(step(s).events.some(e => e.type === 'shot')).toBe(false);
  });
  it('single-hit bullets award each enemy exactly once', () => {
    const s = startRun(createState(), 1), r = s.run!, e = enemy(s, 'ordinary', 3, 5);
    r.enemies = [e]; r.spawnCooldown = 99; r.shotCooldown = 1;
    r.bullets = [1,2].map(() => ({ id: `${r.id}:${r.nextEntityId++}`, targetId: e.id, x: 3, y: 0, damage: 10, speed: 16 }));
    const n = step(s); expect(n.run?.gold).toBe(3); expect(n.run?.kills).toBe(1); expect(n.run?.paidKillIds).toEqual([e.id]);
    expect(n.run?.bullets).toHaveLength(0); expect(step(n, 20).run?.gold).toBe(3);
  });
  it('uses contact radius1.2 and a two-second melee interval', () => {
    const s = startRun(createState(), 1), e = enemy(s, 'ordinary', 1.2);
    s.run!.enemies = [e]; s.run!.spawnCooldown = 99; s.run!.shotCooldown = 99;
    const first = step(s); expect(first.run?.hp).toBe(90);
    const waiting = step(first, 59); expect(waiting.run?.hp).toBe(90);
    expect(step(waiting).run?.hp).toBe(80);
  });
  it('heals continuously with fractional HP, including interwave, without banking at fullHP', () => {
    let s = startRun(createState(), 1);
    s.run!.levels.regen = 1; s.run!.activeLevels.regen = 1; s.run!.hp = 50;
    s = step(s); expect(s.run?.hp).toBeCloseTo(50 + .5 / 30, 10);
    s = step(s, 14); expect(s.run?.hp).toBeCloseTo(50.25, 10);
    s = clearAtNextTick(s); const hp = s.run!.hp; s = step(s, 30); expect(s.run?.hp).toBeCloseTo(hp + .5, 8);
    s.run!.hp = 100; s = step(s, 20); s.run!.hp = 90; s = step(s); expect(s.run?.hp).toBeCloseTo(90 + .5 / 30, 10);
  });
  it('pause freezes combat, healing, timers, RNG and warnings', () => {
    let s = step(startRun(createState(), 987), 3); s.run!.levels.regen = 1; s.run!.activeLevels.regen = 1; s.run!.hp = 50;
    s = setPaused(s, true); const before = serializeState(s);
    expect(serializeState(step(s, 30000))).toBe(before);
    expect(step(setPaused(s, false)).run!.tick).toBe(s.run!.tick + 1);
  });
});

describe('boundaries, outcomes, and persistence', () => {
  it('awards one crystal per completed wave and deduplicates boundary processing', () => {
    let s = clearAtNextTick(startRun(createState(), 1));
    expect(s.profile.crystals).toBe(1); expect(s.run?.lastPaidWave).toBe(1);
    s = step(s, 30); expect(s.profile.crystals).toBe(1);
  });
  it('death is resolved before regeneration and wave-clear', () => {
    const s = startRun(createState(), 1); s.run!.hp = 10; s.run!.activeLevels.regen = 15; s.run!.levels.regen = 15;
    s.run!.enemies = [enemy(s, 'ordinary', 1.2)];
    const n = step(s); expect(n.result?.outcome).toBe('defeat'); expect(n.profile.crystals).toBe(0);
  });
  it('simultaneous boss/turret death is defeat with no wave30crystal', () => {
    const s = startRun(createState(), 1), r = s.run!; s.profile.crystals = 29;
    r.wave = 30; r.lastPaidWave = 29; r.earnedCrystals = 29; r.hp = 42; r.spawned = 1;
    const boss = enemy(s, 'boss', 1.2, 1); r.enemies = [boss]; r.shotCooldown = 1;
    r.bullets = [{ id: `${r.id}:${r.nextEntityId++}`, targetId: boss.id, x: 1.2, y: 0, damage: 10, speed: 16 }];
    const n = step(s); expect(n.result?.outcome).toBe('defeat'); expect(n.result?.completedWaves).toBe(29);
    expect(n.profile.crystals).toBe(29); expect(n.result?.earnedGold).toBe(50); expect(n.run).toBeNull();
  });
  it('defeat clears temporary gold/levels/entities, preserves permanent progress, and restart refills HP', () => {
    const s = funded(); s.profile.meta.damage = 2; s.profile.meta.maxHp = 1; s.profile.crystals = 7;
    s.run!.hp = 1; s.run!.levels.damage = 3; s.run!.activeLevels.damage = 3; s.run!.enemies = [enemy(s, 'ordinary', 1.2)];
    const n = step(s); expect(n.run).toBeNull(); expect(n.profile.crystals).toBe(7); expect(n.profile.meta.damage).toBe(2);
    const restart = startRun(n, 2); expect(restart.run?.gold).toBe(0); expect(restart.run?.levels.damage).toBe(0);
    expect(restart.run?.hp).toBeCloseTo(110); expect(restart.run?.enemies).toHaveLength(0); expect(restart.result).toBeNull();
  });
  it('round-trips full RNG, projectiles, purchases and paused state without offline advancement', () => {
    let s = step(startRun(createState(), 8181), 47); s = setPaused(s, true);
    const json = serializeState(s), saved = parseState(json)!;
    expect(saved).not.toBeNull(); expect(serializeState(saved)).toBe(json);
    expect(saved.run?.tick).toBe(s.run?.tick); expect(saved.run?.rngState).toBe(s.run?.rngState);
    expect(serializeState(step(setPaused(saved, false), 130))).toBe(serializeState(step(setPaused(s, false), 130)));
  });
  it('rejects malformed, extra-field, non-finite, out-of-bounds and duplicate saves', () => {
    expect(parseState('{bad')).toBeNull(); expect(parseState('null')).toBeNull();
    const valid = JSON.parse(serializeState(step(startRun(createState(), 66), 17)));
    const reject = (mutate: (s: any) => void) => { const s = structuredClone(valid); mutate(s); expect(parseState(JSON.stringify(s))).toBeNull(); };
    reject(s => s.profile.crystals = -1); reject(s => s.profile.meta.damage = 11);
    reject(s => s.run.hp = Infinity); reject(s => s.run.rngState = 0); reject(s => s.run.wave = 31);
    reject(s => s.run.levels.damage = 16); reject(s => s.run.extra = true); reject(s => s.run.enemies.push(s.run.enemies[0]));
    reject(s => s.run.enemies[0].kind = 'boss'); reject(s => s.run.bullets[0].targetId = 'missing');
    reject(s => { s.run.kills = 2; s.run.paidKillIds = ['same', 'same']; });
  });
  it.each([1, 3, 17, 42, 2026])('known zero-meta strategy wins all30waves on seed %s', seed => {
    const s = play(seed, seed === 42);
    expect(s.result?.outcome).toBe('victory'); expect(s.result?.completedWaves).toBe(30);
    expect(s.profile.crystals).toBe(30); expect(s.result?.earnedCrystals).toBe(30); expect(s.run).toBeNull();
    expect(parseState(serializeState(s))?.result?.outcome).toBe('victory');
  }, 20000);
});
