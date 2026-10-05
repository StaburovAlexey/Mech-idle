import { describe, it, expect } from 'vitest';
import { SPAWN_RADIUS, WORLD_LIMIT, type SpawnGeometry } from './spawnGeometry';
import {
  DT, STAT_KEYS, createState, startRun, step, setPaused, buyRunUpgrade, buyMetaUpgrade,
  runPrice, metaPrice, getStats, enemyStats, waveConfig, serializeState, parseState,
  type GameState, type Enemy, type StatKey,
} from './game';

function legacyGeometry(): SpawnGeometry {
  return { horizontal: { x: .1, y: 0, height: 0, offset: 0 }, vertical: { x: 0, y: .1, height: .03, offset: 0 } };
}

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
  it.each([false, true])('applies all four stats atomically at purchase, including with paused=%s', paused => {
    const original = funded(100);
    original.run!.paused = paused; original.run!.hp = 47.125; original.run!.shotCooldown = .6;
    const before = serializeState(original);
    let s = original;
    for (const k of STAT_KEYS) {
      const gold = s.run!.gold, cost = runPrice(k, s.run!.levels[k]);
      s = buyRunUpgrade(s, k);
      expect(s.run!.gold).toBe(gold - cost);
      expect(s.run!.levels[k]).toBe(1); expect(s.run!.activeLevels[k]).toBe(1);
      expect(getStats(s)).toEqual(getStats(s, true));
    }
    expect(getStats(s)).toEqual({ damage: 12, maxHp: 120, attackSpeed: 1.1, regen: .5, range: 10 });
    expect(s.run!.gold).toBe(53); expect(s.run!.earnedGold).toBe(100);
    expect(s.run!.hp).toBe(47.125); expect(s.run!.paused).toBe(paused);
    expect(s.run!.tick).toBe(0); expect(s.run!.rngState).toBe(original.run!.rngState);
    expect(s.run!.shotCooldown).toBeCloseTo(.6 / 1.1, 12);
    expect(serializeState(original)).toBe(before);
    expect(serializeState(parseState(serializeState(s))!)).toBe(serializeState(s));
  });
  it('applies all interwave purchases immediately and keeps them at the next wave', () => {
    let s = clearAtNextTick(funded());
    s.run!.hp = 61;
    for (const k of STAT_KEYS) s = buyRunUpgrade(s, k);
    const upgraded = { damage: 12, maxHp: 120, attackSpeed: 1.1, regen: .5, range: 10 };
    expect(getStats(s)).toEqual(upgraded); expect(s.run!.hp).toBe(61);
    expect(s.run!.phaseTime).toBe(0); expect(s.run!.activeLevels).toEqual(s.run!.levels);
    s = step(s, 59); expect(s.run?.phase).toBe('interwave');
    s = step(s); expect(s.run?.wave).toBe(2); expect(s.run?.phase).toBe('combat');
    expect(getStats(s)).toEqual(upgraded); expect(s.run!.hp).toBeCloseTo(62, 10);
  });
  it('permanent levels charge crystals, apply multiplicatively, and cannot be bought mid-run', () => {
    let s = createState(); s.profile.crystals = 100;
    for (const k of STAT_KEYS) s = buyMetaUpgrade(s, k);
    expect(s.profile.crystals).toBe(88);
    s = startRun(s, 1);
    expect(s.run?.hp).toBeCloseTo(110);
    expect(getStats(s)).toEqual({ damage: 11, maxHp: 110.00000000000001, attackSpeed: 1.1, regen: .2, range: 10 });
    expect(buyMetaUpgrade(s, 'damage')).toBe(s);
    s.run!.gold = 100; s = buyRunUpgrade(s, 'damage');
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

describe('immediate upgrade timing', () => {
  it.each([100, 37.25])('raises max HP without healing current HP %s', hp => {
    const s = funded(); s.run!.hp = hp; s.run!.shotCooldown = .7;
    const upgraded = buyRunUpgrade(s, 'maxHp');
    expect(getStats(upgraded).maxHp).toBe(120); expect(upgraded.run!.hp).toBe(hp);
    expect(upgraded.run!.shotCooldown).toBe(.7);
    expect(step(upgraded).run!.hp).toBe(hp);
  });
  it('starts fractional regeneration on the next unpaused tick and retains it across reload', () => {
    let s = funded(); s.run!.hp = 50.125;
    s = buyRunUpgrade(setPaused(s, true), 'regen');
    expect(getStats(s).regen).toBe(.5); expect(s.run!.hp).toBe(50.125);
    expect(serializeState(step(s, 30000))).toBe(serializeState(s));
    s = step(setPaused(s, false));
    expect(s.run!.hp).toBeCloseTo(50.125 + .5 * DT, 12);
    const loaded = parseState(serializeState(s))!;
    expect(loaded.run!.hp).toBe(s.run!.hp);
    expect(step(loaded).run!.hp).toBeCloseTo(50.125 + 2 * .5 * DT, 12);
  });
  it.each([0, 3])('rescales only the remaining shot cycle with meta speed level %s', metaSpeed => {
    let s = funded(); s.profile.meta.attackSpeed = metaSpeed;
    s.run!.enemies = [enemy(s, 'ordinary', 8)]; s.run!.spawned = waveConfig(1).count;
    const oldSpeed = getStats(s).attackSpeed;
    s.run!.shotCooldown = .6 / oldSpeed;
    const before = s.run!.shotCooldown;
    s = buyRunUpgrade(s, 'attackSpeed');
    const speed = getStats(s).attackSpeed, remaining = before * oldSpeed / speed;
    expect(s.run!.shotCooldown).toBeCloseTo(remaining, 12);
    expect(s.run!.shotCooldown * speed).toBeCloseTo(.6, 12);
    expect(s.run!.bullets).toHaveLength(0); expect(s.events.some(e => e.type === 'shot')).toBe(false);
    const ticksUntilShot = Math.ceil(remaining / DT);
    s = step(s, ticksUntilShot - 1);
    expect(s.events.some(e => e.type === 'shot')).toBe(false); expect(s.run!.bullets).toHaveLength(0);
    s = step(s);
    expect(s.events.filter(e => e.type === 'shot')).toHaveLength(1);
    expect(s.run!.shotCooldown).toBeCloseTo(remaining - ticksUntilShot * DT + 1 / speed, 12);
  });
  it('preserves firing-cycle progress through repeated paused purchases without a free burst', () => {
    let s = funded(); s.run!.shotCooldown = .8;
    s.run!.enemies = [enemy(s, 'ordinary', 8)]; s.run!.spawned = waveConfig(1).count;
    s = setPaused(s, true);
    for (let i = 0; i < 4; i++) s = buyRunUpgrade(s, 'attackSpeed');
    expect(s.run!.shotCooldown).toBeCloseTo(.8 / 1.4, 12);
    expect(s.run!.bullets).toHaveLength(0);
    const json = serializeState(s);
    s = parseState(json)!;
    expect(serializeState(s)).toBe(json); expect(serializeState(step(s, 30000))).toBe(json);
    s = step(setPaused(s, false), 17);
    expect(s.events.some(e => e.type === 'shot')).toBe(false);
    s = step(s); expect(s.events.filter(e => e.type === 'shot')).toHaveLength(1);
  });
  it('keeps an already-ready shot ready, without firing as a side effect of purchase', () => {
    const s = funded(); s.run!.enemies = [enemy(s, 'ordinary', 8)];
    const upgraded = buyRunUpgrade(s, 'attackSpeed');
    expect(upgraded.run!.shotCooldown).toBe(0); expect(upgraded.run!.bullets).toHaveLength(0);
    expect(step(upgraded).events.filter(e => e.type === 'shot')).toHaveLength(1);
  });
  it('uses new damage for the next shot while in-flight projectiles retain their captured damage', () => {
    let s = funded(); s.run!.enemies = [enemy(s, 'ordinary', 8)]; s.run!.spawned = waveConfig(1).count;
    s = step(s);
    const bullet = structuredClone(s.run!.bullets[0]), remaining = s.run!.shotCooldown;
    expect(bullet.damage).toBe(10);
    s = buyRunUpgrade(s, 'damage');
    expect(getStats(s).damage).toBe(12); expect(s.run!.bullets[0]).toEqual(bullet);
    expect(s.run!.shotCooldown).toBe(remaining);
    s = parseState(serializeState(s))!;
    expect(s.run!.bullets[0]).toEqual(bullet);
    s = step(s, 20);
    expect(s.events.find(e => e.type === 'hit')).toMatchObject({ amount: 10 });
    expect(s.run!.enemies[0].hp).toBe(10);
    s = step(s, 10);
    expect(s.events.filter(e => e.type === 'shot')).toHaveLength(1);
    expect(s.run!.bullets[0].damage).toBe(12);
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
  it('shows a warning on the radius12 circle for half a second before the mech walks', () => {
    let s = step(startRun(createState(), 77));
    expect(s.run?.warnings).toHaveLength(1); expect(s.run?.enemies).toHaveLength(0);
    const w = s.run!.warnings[0]; expect(Math.hypot(w.x, w.y)).toBeCloseTo(SPAWN_RADIUS, 12); expect(w.remaining).toBe(.5);
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
  it.each([
    ['combat', false], ['combat', true], ['interwave', false], ['interwave', true],
  ] as const)('activates already-paid legacy v1 upgrades safely during %s with paused=%s', (phase, paused) => {
    let legacy = funded(300);
    for (const k of STAT_KEYS) legacy = buyRunUpgrade(legacy, k);
    if (phase === 'interwave') legacy = clearAtNextTick(legacy);
    else {
      legacy.run!.enemies = [enemy(legacy, 'ordinary', 8)];
      legacy.run!.spawned = waveConfig(1).count;
      legacy = step(legacy);
      expect(legacy.run!.bullets[0].damage).toBe(12);
    }
    legacy = setPaused(legacy, paused);
    const r = legacy.run!;
    r.hp = 47.125; r.shotCooldown = .51;
    // Reproduce the old release: currency spent and levels purchased, activation still pending.
    for (const k of STAT_KEYS) { r.gold -= runPrice(k, r.levels[k]); r.levels[k]++; }
    const json = serializeState(legacy), loaded = parseState(json)!;
    expect(loaded).not.toBeNull(); expect(loaded.version).toBe(1);
    expect(getStats(loaded)).toEqual({ damage: 14, maxHp: 140, attackSpeed: 1.2, regen: 1, range: 10 });
    const expected = structuredClone(legacy); expected.events = [];
    expected.run!.activeLevels = { ...r.levels }; expected.run!.shotCooldown *= 1.1 / 1.2;
    expect(loaded).toEqual(expected);
    expect(loaded.run!.gold).toBe(183); expect(loaded.run!.earnedGold).toBe(300);
    expect(loaded.run!.hp).toBe(47.125); expect(loaded.run!.paused).toBe(paused);
    expect(loaded.run!.bullets).toEqual(r.bullets);
    const migrated = serializeState(loaded);
    expect(serializeState(parseState(migrated)!)).toBe(migrated);
    expect(serializeState(parseState(json)!)).toBe(migrated);
    expect(serializeState(legacy)).toBe(json);
    expect(step(setPaused(loaded, false)).run!.hp).toBeCloseTo(47.125 + DT, 12);
  });
  it('validates legacy saves before activating upgrades, so migration cannot legitimize invalid HP or projectiles', () => {
    const legacy = funded(); legacy.run!.enemies = [enemy(legacy, 'ordinary', 8)];
    const withBullet = step(legacy);
    withBullet.run!.levels.maxHp = 1; withBullet.run!.levels.damage = 1;
    const json = serializeState(withBullet), invalidHp = JSON.parse(json), invalidBullet = JSON.parse(json);
    invalidHp.run.hp = 110; invalidBullet.run.bullets[0].damage = 12;
    expect(parseState(JSON.stringify(invalidHp))).toBeNull();
    expect(parseState(JSON.stringify(invalidBullet))).toBeNull();
    expect(parseState(json)).not.toBeNull();
  });
  it('loads original v1 saves onto the circle without changing RNG or nearby live entities', () => {
    const original = startRun(createState(), 100), r = original.run!;
    r.enemies = [enemy(original, 'ordinary', 7)];
    r.warnings = [{ id: `${r.id}:${r.nextEntityId++}`, kind: 'ordinary', x: 9, y: 0, remaining: .4, sector: 0 }];
    r.spawned = 2;
    delete r.spawnMode; delete r.spawnGeometry; delete r.nextArrival;
    const loaded = parseState(serializeState(original))!;
    expect(loaded).not.toBeNull(); expect(loaded.run!.enemies).toEqual(r.enemies);
    expect(loaded.run!.rngState).toBe(r.rngState);
    expect(loaded.run!.warnings[0]).toMatchObject({ x: 12, y: 0, remaining: .4 });
    expect(loaded.run!.spawnMode).toBe('circle'); expect(loaded.run!.spawnGeometry).toBeUndefined();
    expect(parseState(serializeState(loaded))).not.toBeNull();
  });
  it.each([false, true])('removes long legacy staging once, preserving state and exact wave rewards with paused=%s', paused => {
    const legacy = startRun(createState(), 771), r = legacy.run!;
    delete r.spawnMode; r.spawnGeometry = legacyGeometry(); r.nextArrival = 130;
    legacy.profile.meta.damage = 10; legacy.profile.meta.attackSpeed = 10;
    r.paused = paused; r.hp = 76.25; r.phaseTime = 18; r.tick = 540; r.time = 18;
    const paid = `${r.id}:${r.nextEntityId++}`;
    r.paidKillIds = [paid]; r.kills = 1; r.gold = 3; r.earnedGold = 3;
    const near = enemy(legacy, 'ordinary', 7, 10), far = enemy(legacy, 'ordinary', 40);
    near.attackCooldown = .75; far.attackCooldown = 1.25;
    r.enemies = [near, far]; r.targetId = near.id; r.shotCooldown = .4;
    const bullet = { id: `${r.id}:${r.nextEntityId++}`, targetId: near.id, x: 5, y: 0, damage: 20, speed: 16 };
    r.bullets = [bullet];
    const warnings = [20, 50, 80].map((remaining, sector) => ({ id: `${r.id}:${r.nextEntityId++}`, kind: 'ordinary' as const, x: 20 + sector, y: -30, remaining, sector }));
    r.warnings = [warnings[2], warnings[0], warnings[1]]; r.spawned = 6;
    const before = serializeState(legacy), restored = parseState(before)!;
    expect(restored).not.toBeNull(); const migrated = restored.run!;
    expect(migrated.paused).toBe(paused); expect(migrated.hp).toBe(76.25);
    expect(migrated.tick).toBe(540); expect(migrated.time).toBe(18); expect(migrated.phaseTime).toBe(18);
    expect(migrated.rngState).toBe(r.rngState); expect(migrated.nextEntityId).toBe(r.nextEntityId);
    expect(migrated.enemies[0]).toEqual(near);
    expect(migrated.enemies[1]).toEqual({ ...far, x: 12, y: 0 });
    expect(migrated.bullets).toEqual([bullet]); expect(migrated.targetId).toBe(near.id); expect(migrated.shotCooldown).toBe(.4);
    expect(migrated.gold).toBe(3); expect(migrated.earnedGold).toBe(3); expect(migrated.paidKillIds).toEqual([paid]);
    expect(migrated.warnings).toHaveLength(1); expect(migrated.warnings[0]).toMatchObject({ id: warnings[0].id, kind: 'ordinary', remaining: .5 });
    expect(Math.hypot(migrated.warnings[0].x, migrated.warnings[0].y)).toBeCloseTo(12, 12);
    expect(migrated.warnings[0].x / migrated.warnings[0].y).toBeCloseTo(warnings[0].x / warnings[0].y, 12);
    expect(migrated.spawned).toBe(4); expect(migrated.spawnCooldown).toBe(1.5);
    expect(migrated.spawnGeometry).toBeUndefined(); expect(migrated.nextArrival).toBeUndefined(); expect(restored.events).toEqual([]);
    const migratedJson = serializeState(restored);
    expect(serializeState(parseState(migratedJson)!)).toBe(migratedJson);
    expect(serializeState(parseState(before)!)).toBe(migratedJson);
    expect(serializeState(legacy)).toBe(before);
    let playing = setPaused(restored, false), spawnTimes: number[] = [], spawnIds: string[] = [];
    while (playing.run!.phase === 'combat' && playing.run!.tick < 3000) {
      playing = step(playing);
      for (const event of playing.events) if (event.type === 'spawn') { spawnTimes.push(playing.run!.tick); spawnIds.push(event.id); }
      expect(playing.run!.warnings.every(w => w.remaining <= .5)).toBe(true);
    }
    expect(playing.run!.phase).toBe('interwave'); expect(playing.run!.spawned).toBe(6);
    expect(spawnTimes).toHaveLength(3); expect((spawnTimes[1] - spawnTimes[0]) * DT).toBeCloseTo(1.5, 12);
    expect(spawnIds).toContain(warnings[0].id); expect(spawnIds).not.toContain(warnings[1].id); expect(spawnIds).not.toContain(warnings[2].id);
    expect(spawnIds.slice(1).every(id => Number(id.split(':').pop()) >= r.nextEntityId)).toBe(true);
    expect(playing.run!.kills).toBe(6); expect(new Set(playing.run!.paidKillIds).size).toBe(6);
    expect(playing.run!.gold).toBe(18); expect(playing.run!.earnedGold).toBe(18);
    expect(playing.profile.crystals).toBe(1); expect(playing.run!.earnedCrystals).toBe(1);
    expect(step(parseState(serializeState(playing))!, 30).profile.crystals).toBe(1);
  });
  it('migrates a long-staged final boss and awards only its50 gold and final crystal', () => {
    const legacy = startRun(createState(), 314), r = legacy.run!;
    delete r.spawnMode; r.spawnGeometry = legacyGeometry(); r.nextArrival = 140;
    r.wave = 30; r.lastPaidWave = 29; r.earnedCrystals = 29; legacy.profile.crystals = 29;
    legacy.profile.meta.damage = 10; legacy.profile.meta.attackSpeed = 10;
    r.levels.damage = 15; r.activeLevels.damage = 15; r.levels.attackSpeed = 15; r.activeLevels.attackSpeed = 15;
    const id = `${r.id}:${r.nextEntityId++}`;
    r.warnings = [{ id, kind: 'boss', x: 0, y: -50, remaining: 100, sector: 9 }]; r.spawned = 1;
    const migrated = parseState(serializeState(legacy))!;
    expect(migrated.run!.warnings).toEqual([{ id, kind: 'boss', x: 0, y: -12, remaining: .5, sector: 9 }]);
    expect(migrated.run!.spawned).toBe(1); expect(migrated.run!.earnedCrystals).toBe(29);
    const final = step(migrated, 600);
    expect(final.result).toMatchObject({ outcome: 'victory', wave: 30, completedWaves: 30, kills: 1, earnedGold: 50, earnedCrystals: 30 });
    expect(final.profile.crystals).toBe(30); expect(final.run).toBeNull();
    const restored = parseState(serializeState(final))!;
    expect(serializeState(step(restored, 600))).toBe(serializeState(restored));
  });
  it('clamps distant legacy projectiles along their existing direction without changing their damage or target', () => {
    const legacy = startRun(createState(), 41), r = legacy.run!;
    delete r.spawnMode; r.spawnGeometry = legacyGeometry(); r.nextArrival = 35;
    const target = enemy(legacy, 'ordinary', 30); r.enemies = [target]; r.spawned = 1;
    const bullet = { id: `${r.id}:${r.nextEntityId++}`, targetId: target.id, x: 18, y: 24, damage: 10, speed: 16 };
    r.bullets = [bullet];
    const loaded = parseState(serializeState(legacy))!;
    expect(loaded.run!.bullets[0]).toMatchObject({ id: bullet.id, targetId: bullet.targetId, damage: 10, speed: 16 });
    expect(Math.hypot(loaded.run!.bullets[0].x, loaded.run!.bullets[0].y)).toBeCloseTo(12, 12);
    expect(loaded.run!.bullets[0].x / loaded.run!.bullets[0].y).toBeCloseTo(.75, 12);
    expect(loaded.run!.spawnCooldown).toBe(r.spawnCooldown); expect(loaded.run!.rngState).toBe(r.rngState);
  });
  it('migrates an already-paid interwave save without replaying its crystal or changing the rest timer', () => {
    const legacy = clearAtNextTick(startRun(createState(), 13)), r = legacy.run!;
    delete r.spawnMode; r.spawnGeometry = legacyGeometry(); r.nextArrival = 100;
    r.phaseTime = 1; r.tick = 400; r.time = r.tick * DT;
    const loaded = parseState(serializeState(legacy))!;
    expect(loaded.profile.crystals).toBe(1); expect(loaded.run!.phaseTime).toBe(1);
    expect(loaded.run!.earnedCrystals).toBe(1); expect(loaded.run!.lastPaidWave).toBe(1);
    const continued = step(loaded, 30);
    expect(continued.run!.wave).toBe(2); expect(continued.profile.crystals).toBe(1);
  });
  it('rejects malformed legacy projection data before removing retired fields', () => {
    const legacy = startRun(createState()); delete legacy.run!.spawnMode;
    legacy.run!.spawnGeometry = legacyGeometry(); legacy.run!.nextArrival = 100;
    const valid = JSON.parse(serializeState(legacy));
    const reject = (mutate: (s: any) => void) => { const s = structuredClone(valid); mutate(s); expect(parseState(JSON.stringify(s))).toBeNull(); };
    reject(s => s.run.spawnGeometry.horizontal.extra = true);
    reject(s => s.run.spawnGeometry.horizontal.x = 0);
    reject(s => s.run.spawnGeometry.horizontal.offset = .6);
    reject(s => s.run.nextArrival = -1);
    reject(s => delete s.run.nextArrival);
    reject(s => s.run.spawnMode = 'circle');
    const loaded = parseState(JSON.stringify(valid))!;
    expect(loaded.run!.spawnMode).toBe('circle');
    expect(loaded.run!.spawnGeometry).toBeUndefined(); expect(loaded.run!.nextArrival).toBeUndefined();
  });
  it('rejects circle saves containing long waits, distant units, or unknown spawn modes', () => {
    const valid = JSON.parse(serializeState(step(startRun(createState(), 1))));
    const reject = (mutate: (s: any) => void) => { const s = structuredClone(valid); mutate(s); expect(parseState(JSON.stringify(s))).toBeNull(); };
    reject(s => s.run.warnings[0].remaining = .6);
    reject(s => s.run.spawned = 0);
    reject(s => { s.run.warnings[0].x = 11; s.run.warnings[0].y = 0; });
    reject(s => { s.run.warnings[0].x = 13; s.run.warnings[0].y = 0; });
    reject(s => s.run.spawnMode = 'screen');
    reject(s => s.run.nextArrival = 100);
  });
  it('rejects malformed, extra-field, non-finite, out-of-bounds and duplicate saves', () => {
    expect(parseState('{bad')).toBeNull(); expect(parseState('null')).toBeNull();
    const fixture = startRun(createState(), 66); fixture.run!.enemies = [enemy(fixture, 'ordinary', 8)];
    const valid = JSON.parse(serializeState(step(fixture)));
    const reject = (mutate: (s: any) => void) => { const s = structuredClone(valid); mutate(s); expect(parseState(JSON.stringify(s))).toBeNull(); };
    reject(s => s.profile.crystals = -1); reject(s => s.profile.meta.damage = 11);
    reject(s => s.run.hp = Infinity); reject(s => s.run.rngState = 0); reject(s => s.run.wave = 31);
    reject(s => s.run.levels.damage = 16); reject(s => s.run.extra = true); reject(s => s.run.enemies.push(s.run.enemies[0]));
    reject(s => s.run.enemies[0].kind = 'boss'); reject(s => s.run.enemies[0].x = WORLD_LIMIT + 1); reject(s => s.run.bullets[0].targetId = 'missing');
    reject(s => { s.run.kills = 2; s.run.paidKillIds = ['same', 'same']; });
  });
  it.each([1, 3, 17, 42, 2026])('known zero-meta strategy wins all30waves on seed %s', seed => {
    const s = play(seed, seed === 42);
    expect(s.result?.outcome).toBe('victory'); expect(s.result?.completedWaves).toBe(30);
    expect(s.profile.crystals).toBe(30); expect(s.result?.earnedCrystals).toBe(30); expect(s.run).toBeNull();
    expect(parseState(serializeState(s))?.result?.outcome).toBe('victory');
    expect(s.result!.duration).toBeLessThan(20 * 60);
  }, 20000);
});
