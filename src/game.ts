import { clampToSpawnCircle, onSpawnCircle, SPAWN_RADIUS, spawnPoint, validSpawnGeometry, WORLD_LIMIT, type SpawnGeometry } from './spawnGeometry';
/** Deterministic, fixed-step game simulation. No wall clock, browser, or renderer dependencies. */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const WAVE_COUNT = 30;
export const STAT_KEYS = ['damage', 'maxHp', 'attackSpeed', 'regen'] as const;
export type StatKey = typeof STAT_KEYS[number];
export type Levels = Record<StatKey, number>;
export type EnemyKind = 'ordinary' | 'fast' | 'boss';
export interface Profile { crystals: number; meta: Levels; runCounter: number }
export interface Stats { damage: number; maxHp: number; attackSpeed: number; regen: number; range: number }
export interface Enemy { id: string; kind: EnemyKind; x: number; y: number; hp: number; maxHp: number; damage: number; speed: number; attackInterval: number; attackCooldown: number }
export interface Bullet { id: string; targetId: string; x: number; y: number; damage: number; speed: number }
export interface Warning { id: string; kind: EnemyKind; x: number; y: number; remaining: number; sector: number }
export interface WaveConfig { count: number; interval: number; jitter: number; fastEvery: number; boss: boolean }
export interface Run {
  id: string; seed: number; rngState: number; wave: number; phase: 'combat' | 'interwave'; paused: boolean;
  time: number; tick: number; phaseTime: number; hp: number; gold: number; levels: Levels; activeLevels: Levels;
  enemies: Enemy[]; bullets: Bullet[]; warnings: Warning[]; spawned: number; spawnCooldown: number;
  shotCooldown: number; targetId: string | null; nextEntityId: number;
  lastSector: number; sectorStreak: number; paidKillIds: string[]; lastPaidWave: number;
  kills: number; earnedGold: number; earnedCrystals: number;
  spawnMode?: 'circle';
  /** Read only by the one-time migration of old viewport-based saves. */
  spawnGeometry?: SpawnGeometry; nextArrival?: number;
}
export interface RunResult { outcome: 'defeat' | 'victory'; runId: string; wave: number; completedWaves: number; kills: number; earnedGold: number; earnedCrystals: number; duration: number; finalStats: Stats }
export type GameEvent =
  | { type: 'warning' | 'spawn'; id: string; kind: EnemyKind; x: number; y: number }
  | { type: 'shot'; id: string; targetId: string; x: number; y: number; targetX: number; targetY: number }
  | { type: 'hit' | 'kill'; id: string; kind: EnemyKind; x: number; y: number; amount: number }
  | { type: 'turretHit' | 'heal'; amount: number }
  | { type: 'waveComplete' | 'waveStart'; wave: number }
  | { type: 'runEnded'; outcome: 'defeat' | 'victory' };
export interface GameState { version: 1; profile: Profile; run: Run | null; result: RunResult | null; events: GameEvent[] }
export const emptyLevels = (): Levels => ({ damage: 0, maxHp: 0, attackSpeed: 0, regen: 0 });
export const RUN_CAP = 15;
export const META_CAP = 10;
const START_PRICE: Record<StatKey, number> = { damage: 10, maxHp: 10, attackSpeed: 15, regen: 12 };
const BASE_ENEMIES = {
  ordinary: { hp: 20, damage: 10, speed: 1, attackInterval: 2, reward: 3 },
  fast: { hp: 12, damage: 7, speed: 1.8, attackInterval: 2, reward: 4 },
  boss: { hp: 624, damage: 42, speed: 0.7, attackInterval: 2, reward: 50 },
} as const;
const clone = <T>(value: T): T => structuredClone(value);
export function createProfile(): Profile { return { crystals: 0, meta: emptyLevels(), runCounter: 0 }; }
/** Creates the hangar state. Call startRun explicitly to launch. */
export function createState(): GameState { return { version: 1, profile: createProfile(), run: null, result: null, events: [] }; }
export function runPrice(stat: StatKey, level: number): number { return Math.ceil(START_PRICE[stat] * 1.45 ** level); }
export function metaPrice(_stat: StatKey, level: number): number { return Math.ceil(3 * 1.5 ** level); }
export function calculateStats(meta: Levels, levels: Levels = emptyLevels()): Stats {
  return {
    damage: 10 * (1 + .1 * meta.damage) * (1 + .2 * levels.damage),
    maxHp: 100 * (1 + .1 * meta.maxHp) * (1 + .2 * levels.maxHp),
    attackSpeed: (1 + .1 * meta.attackSpeed) * (1 + .1 * levels.attackSpeed),
    regen: .2 * meta.regen + .5 * levels.regen, range: 10,
  };
}
export function getStats(state: GameState, includePending = false): Stats {
  return calculateStats(state.profile.meta, state.run ? (includePending ? state.run.levels : state.run.activeLevels) : emptyLevels());
}
export function waveConfig(wave: number): WaveConfig {
  if (wave === 30) return { count: 1, interval: 1.5, jitter: .2, fastEvery: 0, boss: true };
  return { count: 6 + Math.floor((wave - 1) * .55), interval: 1.5, jitter: .2, fastEvery: wave >= 4 ? 4 : 0, boss: false };
}
export function enemyStats(kind: EnemyKind, wave: number) {
  const b = BASE_ENEMIES[kind];
  return { maxHp: kind === 'boss' ? b.hp : Math.ceil(b.hp * (100 + 10 * (wave - 1)) / 100), damage: kind === 'boss' ? b.damage : Math.ceil(b.damage * (100 + 6 * (wave - 1)) / 100), speed: b.speed, attackInterval: b.attackInterval, reward: b.reward };
}
export function startRun(state: GameState, seed = 1): GameState {
  if (state.run) return state;
  const next = clone(state);
  next.profile.runCounter += 1;
  const normalizedSeed = (Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 1) || 1;
  next.run = {
    id: `run-${next.profile.runCounter}-${normalizedSeed}`, seed: normalizedSeed, rngState: normalizedSeed, wave: 1,
    phase: 'combat', paused: false, time: 0, tick: 0, phaseTime: 0, hp: calculateStats(next.profile.meta).maxHp,
    gold: 0, levels: emptyLevels(), activeLevels: emptyLevels(), enemies: [], bullets: [], warnings: [], spawned: 0,
    spawnCooldown: 0, shotCooldown: 0, targetId: null, nextEntityId: 1,
    lastSector: -1, sectorStreak: 0, paidKillIds: [], lastPaidWave: 0, kills: 0, earnedGold: 0, earnedCrystals: 0,
    spawnMode: 'circle',
  };
  next.result = null;
  next.events = [{ type: 'waveStart', wave: 1 }];
  return next;
}
/** Activates purchased levels without healing, firing, or changing existing projectiles. */
function applyRunLevels(state: GameState): void {
  const r = state.run!;
  const oldSpeed = calculateStats(state.profile.meta, r.activeLevels).attackSpeed;
  const newSpeed = calculateStats(state.profile.meta, r.levels).attackSpeed;
  // Preserve the completed fraction of the current firing cycle, including while paused.
  if (oldSpeed !== newSpeed) r.shotCooldown *= oldSpeed / newSpeed;
  r.activeLevels = { ...r.levels };
}
/** Gold and all resulting stat changes are committed together, in any run phase. */
export function buyRunUpgrade(state: GameState, stat: StatKey): GameState {
  const run = state.run;
  if (!run || !STAT_KEYS.includes(stat) || run.levels[stat] >= RUN_CAP || run.gold < runPrice(stat, run.levels[stat])) return state;
  const next = clone(state), r = next.run!;
  r.gold -= runPrice(stat, r.levels[stat]);
  r.levels[stat]++;
  applyRunLevels(next);
  return next;
}
/** Permanent workshop purchases are available only between runs, so run base stats cannot change mid-combat. */
export function buyMetaUpgrade(state: GameState, stat: StatKey): GameState {
  if (state.run || !STAT_KEYS.includes(stat) || state.profile.meta[stat] >= META_CAP || state.profile.crystals < metaPrice(stat, state.profile.meta[stat])) return state;
  const next = clone(state);
  next.profile.crystals -= metaPrice(stat, next.profile.meta[stat]);
  next.profile.meta[stat]++;
  return next;
}
export function setPaused(state: GameState, paused: boolean): GameState {
  if (!state.run || state.run.paused === paused) return state;
  const next = clone(state); next.run!.paused = paused; next.events = []; return next;
}
function random(run: Run): number {
  let x = run.rngState >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  run.rngState = x >>> 0;
  return run.rngState / 0x100000000;
}
function newId(run: Run): string { return `${run.id}:${run.nextEntityId++}`; }
function queueSpawn(state: GameState): void {
  const r = state.run!, config = waveConfig(r.wave);
  let sector = Math.floor(random(r) * 12);
  if (sector === r.lastSector && r.sectorStreak >= 2) sector = (sector + 1 + Math.floor(random(r) * 11)) % 12;
  r.sectorStreak = sector === r.lastSector ? r.sectorStreak + 1 : 1;
  r.lastSector = sector;
  const kind: EnemyKind = config.boss ? 'boss' : config.fastEvery > 0 && (r.spawned + 1) % config.fastEvery === 0 ? 'fast' : 'ordinary';
  const point = spawnPoint((sector + random(r)) * Math.PI / 6);
  const warning: Warning = { id: newId(r), kind, ...point, remaining: .5, sector };
  r.warnings.push(warning);
  r.spawned++;
  r.spawnCooldown = config.interval + (random(r) * 2 - 1) * config.jitter;
  state.events.push({ type: 'warning', id: warning.id, kind, x: warning.x, y: warning.y });
}
function endRun(state: GameState, outcome: 'defeat' | 'victory'): void {
  const r = state.run!;
  state.result = { outcome, runId: r.id, wave: r.wave, completedWaves: r.lastPaidWave, kills: r.kills, earnedGold: r.earnedGold, earnedCrystals: r.earnedCrystals, duration: r.time, finalStats: getStats(state) };
  state.run = null;
  state.events.push({ type: 'runEnded', outcome });
}
function advanceTick(state: GameState): void {
  const r = state.run;
  if (!r || r.paused) return;
  r.tick++;
  r.time = r.tick * DT;
  r.phaseTime += DT;
  const stats = getStats(state);
  if (r.phase === 'interwave') {
    // Healing continues in the mandatory two-second rest; fractional healing is retained.
    heal(state, stats);
    if (r.phaseTime + 1e-9 >= 2) {
      r.wave++; r.phase = 'combat'; r.phaseTime = 0; r.spawned = 0; r.spawnCooldown = 0; r.shotCooldown = 0;
      state.events.push({ type: 'waveStart', wave: r.wave });
    }
    return;
  }
  // Existing warnings age before new ones are queued, guaranteeing the full 0.5s.
  for (const w of r.warnings) w.remaining -= DT;
  const ready = r.warnings.filter(w => w.remaining <= 1e-9);
  r.warnings = r.warnings.filter(w => w.remaining > 1e-9);
  for (const w of ready) {
    const s = enemyStats(w.kind, r.wave);
    r.enemies.push({ id: w.id, kind: w.kind, x: w.x, y: w.y, hp: s.maxHp, maxHp: s.maxHp, damage: s.damage, speed: s.speed, attackInterval: s.attackInterval, attackCooldown: 0 });
    state.events.push({ type: 'spawn', id: w.id, kind: w.kind, x: w.x, y: w.y });
  }
  r.spawnCooldown -= DT;
  if (r.spawned < waveConfig(r.wave).count && r.spawnCooldown <= 1e-9) queueSpawn(state);
  // Movement and melee damage happen before projectile deaths: simultaneous boss/turret death is defeat.
  for (const enemy of r.enemies) {
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - DT);
    const d = Math.hypot(enemy.x, enemy.y);
    if (d > 1.2) {
      const move = Math.min(enemy.speed * DT, d - 1.2);
      enemy.x -= enemy.x / d * move; enemy.y -= enemy.y / d * move;
    }
    if (Math.hypot(enemy.x, enemy.y) <= 1.2000001 && enemy.attackCooldown <= 1e-9) {
      r.hp -= enemy.damage;
      enemy.attackCooldown = enemy.attackInterval;
      state.events.push({ type: 'turretHit', amount: enemy.damage });
    }
  }
  const nearest = r.enemies.filter(e => e.hp > 0 && Math.hypot(e.x, e.y) <= stats.range)
    .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y) || Number(a.id.split(':').pop()) - Number(b.id.split(':').pop()))[0];
  r.targetId = nearest?.id ?? null;
  r.shotCooldown -= DT;
  if (!nearest) r.shotCooldown = Math.max(0, r.shotCooldown);
  if (nearest && r.shotCooldown <= 1e-9) {
    const bullet: Bullet = { id: newId(r), targetId: nearest.id, x: 0, y: 0, damage: stats.damage, speed: 16 };
    r.bullets.push(bullet); r.shotCooldown += 1 / stats.attackSpeed;
    state.events.push({ type: 'shot', id: bullet.id, targetId: nearest.id, x: 0, y: 0, targetX: nearest.x, targetY: nearest.y });
  }
  const surviving: Bullet[] = [];
  for (const bullet of r.bullets) {
    const target = r.enemies.find(e => e.id === bullet.targetId && e.hp > 0);
    if (!target) continue;
    const dx = target.x - bullet.x, dy = target.y - bullet.y, distance = Math.hypot(dx, dy);
    if (distance <= bullet.speed * DT + .12) {
      target.hp -= bullet.damage;
      state.events.push({ type: 'hit', id: target.id, kind: target.kind, x: target.x, y: target.y, amount: bullet.damage });
      if (target.hp <= 0 && !r.paidKillIds.includes(target.id)) {
        r.paidKillIds.push(target.id); r.kills++;
        const reward = BASE_ENEMIES[target.kind].reward;
        r.gold += reward; r.earnedGold += reward;
        state.events.push({ type: 'kill', id: target.id, kind: target.kind, x: target.x, y: target.y, amount: reward });
      }
    } else { bullet.x += dx / distance * bullet.speed * DT; bullet.y += dy / distance * bullet.speed * DT; surviving.push(bullet); }
  }
  r.enemies = r.enemies.filter(e => e.hp > 0);
  r.bullets = surviving.filter(b => r.enemies.some(e => e.id === b.targetId));
  if (r.targetId && !r.enemies.some(e => e.id === r.targetId)) r.targetId = null;
  if (r.hp <= 0) { endRun(state, 'defeat'); return; }
  heal(state, stats);
  if (r.spawned >= waveConfig(r.wave).count && r.enemies.length === 0 && r.warnings.length === 0) {
    if (r.lastPaidWave < r.wave) {
      state.profile.crystals++; r.earnedCrystals++; r.lastPaidWave = r.wave;
      state.events.push({ type: 'waveComplete', wave: r.wave });
    }
    r.bullets = []; r.targetId = null;
    if (r.wave === WAVE_COUNT) { endRun(state, 'victory'); return; }
    r.phase = 'interwave'; r.phaseTime = 0;
  }
}
function heal(state: GameState, stats: Stats): void {
  const r = state.run!;
  const amount = Math.min(stats.regen * DT, Math.max(0, stats.maxHp - r.hp));
  r.hp += amount;
  if (amount > 0) state.events.push({ type: 'heal', amount });
}
/** Advances exactly ticks/30 seconds. No offline progression or real-time catch-up exists. */
export function step(state: GameState, ticks = 1): GameState {
  if (!Number.isInteger(ticks) || ticks < 0 || ticks > 30000) throw new Error('Tick count must be an integer from 0 to 30000');
  const next = clone(state); next.events = [];
  for (let i = 0; i < ticks && next.run && !next.run.paused; i++) advanceTick(next);
  return next;
}

// Saves are complete immutable snapshots. Events are transient renderer notifications and are not replayed on load.
export function serializeState(state: GameState): string {
  const snapshot = clone(state); snapshot.events = [];
  if (!validateState(snapshot)) throw new Error('Refusing to save invalid game state');
  return JSON.stringify(snapshot);
}
export function parseState(json: string): GameState | null {
  try {
    const value: unknown = JSON.parse(json);
    if (!validateState(value)) return null;
    const state = clone(value);
    // Legacy v1 saves may contain already-paid upgrades awaiting a wave boundary.
    // Activate them once, preserving HP, currency, projectiles, and firing-cycle progress.
    if (state.run) applyRunLevels(state);
    state.events = [];
    if (state.run && state.run.spawnMode !== 'circle') migrateCircleSpawns(state.run);
    // Check the migrated shape too; malformed legacy data cannot become a new save.
    return validateState(state) ? state : null;
  } catch { return null; }
}
/** Remove the retired offscreen arrival schedule once, without replaying rewards.
 * Keep the oldest warning; recycle later unmaterialized slots through normal cadence.
 * Canceled warning IDs stay consumed, and neither RNG nor the reward ledger changes. */
function migrateCircleSpawns(run: Run): void {
  if (run.warnings.length) {
    const first = run.warnings.reduce((a, b) => Number(a.id.split(':').pop()) < Number(b.id.split(':').pop()) ? a : b);
    run.spawned -= run.warnings.length - 1;
    const point = onSpawnCircle(first);
    first.x = point.x; first.y = point.y; first.remaining = Math.min(.5, first.remaining);
    run.warnings = [first];
    // The next materialization follows this one by a normal interval, including
    // when the retained warning was already partly through its half-second timer.
    run.spawnCooldown = waveConfig(run.wave).interval + first.remaining - .5;
  }
  for (const entity of [...run.enemies, ...run.bullets]) {
    const point = clampToSpawnCircle(entity);
    entity.x = point.x; entity.y = point.y;
  }
  delete run.spawnGeometry; delete run.nextArrival;
  run.spawnMode = 'circle';
}
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, min = 0, max = 1e9): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const int = (v: unknown, min = 0, max = 1e9): v is number => num(v, min, max) && Number.isInteger(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 100;
const keys = (v: Record<string, any>, names: string[]) => Object.keys(v).length === names.length && names.every(n => Object.hasOwn(v, n));
function validLevels(v: unknown, cap: number): v is Levels { return object(v) && keys(v, [...STAT_KEYS]) && STAT_KEYS.every(k => int(v[k], 0, cap)); }
function validStats(v: unknown): v is Stats { return object(v) && keys(v, ['damage','maxHp','attackSpeed','regen','range']) && num(v.damage, 10, 80) && num(v.maxHp, 100, 800) && num(v.attackSpeed, 1, 5) && num(v.regen, 0, 9.5) && v.range === 10; }
export function validateState(value: unknown): value is GameState {
  if (!object(value) || !keys(value, ['version','profile','run','result','events']) || value.version !== 1 || !Array.isArray(value.events) || value.events.length !== 0) return false;
  const p = value.profile;
  if (!object(p) || !keys(p, ['crystals','meta','runCounter']) || !int(p.crystals) || !validLevels(p.meta, META_CAP) || !int(p.runCounter)) return false;
  if (value.result !== null) {
    const r = value.result;
    if (!object(r) || !keys(r, ['outcome','runId','wave','completedWaves','kills','earnedGold','earnedCrystals','duration','finalStats']) || !['defeat','victory'].includes(r.outcome) || !str(r.runId) || !int(r.wave,1,30) || !int(r.completedWaves,0,30) || !int(r.kills,0,1000) || !int(r.earnedGold,0,4000) || !int(r.earnedCrystals,0,30) || r.earnedCrystals !== r.completedWaves || !num(r.duration,0,1e7) || !validStats(r.finalStats) || (r.outcome === 'victory' && (r.wave !== 30 || r.completedWaves !== 30)) || (r.outcome === 'defeat' && r.completedWaves !== r.wave - 1)) return false;
  }
  if (value.run === null) return true;
  if (value.result !== null) return false;
  const r = value.run;
  if (!object(r) || !keys(r, ['id','seed','rngState','wave','phase','paused','time','tick','phaseTime','hp','gold','levels','activeLevels','enemies','bullets','warnings','spawned','spawnCooldown','shotCooldown','targetId','nextEntityId','lastSector','sectorStreak','paidKillIds','lastPaidWave','kills','earnedGold','earnedCrystals', ...(Object.hasOwn(r, 'spawnMode') ? ['spawnMode'] : []), ...(Object.hasOwn(r, 'spawnGeometry') ? ['spawnGeometry'] : []), ...(Object.hasOwn(r, 'nextArrival') ? ['nextArrival'] : [])])) return false;
  const circle = Object.hasOwn(r, 'spawnMode');
  if (circle && (r.spawnMode !== 'circle' || Object.hasOwn(r, 'spawnGeometry') || Object.hasOwn(r, 'nextArrival'))) return false;
  if (Object.hasOwn(r, 'spawnGeometry') !== Object.hasOwn(r, 'nextArrival')) return false;
  if (Object.hasOwn(r, 'spawnGeometry') && !validSpawnGeometry(r.spawnGeometry) || Object.hasOwn(r, 'nextArrival') && !num(r.nextArrival, 0, 1e7)) return false;
  if (!str(r.id) || r.id !== `run-${p.runCounter}-${r.seed}` || !int(r.seed,1,0xffffffff) || !int(r.rngState,1,0xffffffff) || !int(r.wave,1,30) || !['combat','interwave'].includes(r.phase) || typeof r.paused !== 'boolean' || !num(r.time,0,1e7) || !int(r.tick,0,3e8) || Math.abs(r.time-r.tick*DT)>1e-6 || !num(r.phaseTime,0,1e7) || !validLevels(r.levels,RUN_CAP) || !validLevels(r.activeLevels,RUN_CAP) || STAT_KEYS.some(k=>r.activeLevels[k]>r.levels[k])) return false;
  const stats = calculateStats(p.meta,r.activeLevels);
  if (!num(r.hp,Number.MIN_VALUE,stats.maxHp + 1e-6) || !int(r.gold,0,4000) || !int(r.spawned,0,waveConfig(r.wave).count) || !num(r.spawnCooldown,-1e7,1.71) || !num(r.shotCooldown,0,1.01) || !int(r.nextEntityId,1,100000) || !int(r.lastSector,-1,11) || !int(r.sectorStreak,0,2) || !int(r.lastPaidWave,0,29) || !int(r.kills,0,1000) || !int(r.earnedGold,0,4000) || !int(r.earnedCrystals,0,29) || r.lastPaidWave!==r.earnedCrystals || r.gold>r.earnedGold || r.lastPaidWave !== (r.phase === 'combat' ? r.wave-1 : r.wave) || (r.phase === 'interwave' && (r.wave===30 || r.phaseTime>=2.000001))) return false;
  if (!Array.isArray(r.enemies) || r.enemies.length>30 || !Array.isArray(r.warnings) || r.warnings.length>(circle ? 1 : 30) || r.warnings.length>r.spawned || !Array.isArray(r.bullets) || r.bullets.length>100 || !Array.isArray(r.paidKillIds) || r.paidKillIds.length!==r.kills || new Set(r.paidKillIds).size!==r.paidKillIds.length) return false;
  const validId = (id: unknown): id is string => str(id) && id.startsWith(`${r.id}:`) && /^[1-9]\d*$/.test(id.slice(r.id.length+1)) && int(Number(id.slice(r.id.length+1)),1,r.nextEntityId-1);
  const positionLimit = circle ? SPAWN_RADIUS + 1e-6 : r.spawnGeometry ? WORLD_LIMIT : 10.000001;
  const position = (e: Record<string, any>) => num(e.x,-positionLimit,positionLimit) && num(e.y,-positionLimit,positionLimit) && Math.hypot(e.x,e.y)<=positionLimit;
  const validKind = (kind: any) => ['ordinary','fast','boss'].includes(kind) && (r.wave===30 ? kind==='boss' : kind!=='boss') && (kind!=='fast'||r.wave>=4);
  if (!r.paidKillIds.every(validId)) return false;
  const ids = new Set<string>(r.paidKillIds);
  for (const e of r.enemies) {
    if (!object(e) || !keys(e,['id','kind','x','y','hp','maxHp','damage','speed','attackInterval','attackCooldown']) || !validId(e.id) || ids.has(e.id) || !validKind(e.kind) || !position(e)) return false;
    ids.add(e.id);
    const base = enemyStats(e.kind,r.wave);
    if (e.maxHp!==base.maxHp || e.damage!==base.damage || e.speed!==base.speed || e.attackInterval!==base.attackInterval || !num(e.hp,Number.MIN_VALUE,e.maxHp) || !num(e.attackCooldown,0,2)) return false;
  }
  for (const w of r.warnings) {
    if (!object(w) || !keys(w,['id','kind','x','y','remaining','sector']) || !validId(w.id) || ids.has(w.id) || !validKind(w.kind) || !position(w) || Math.hypot(w.x,w.y)<7.999999 || (circle && Math.abs(Math.hypot(w.x,w.y) - SPAWN_RADIUS)>1e-6) || !num(w.remaining,Number.MIN_VALUE,r.spawnGeometry ? 1e6 : .5) || !int(w.sector,0,11)) return false;
    ids.add(w.id);
  }
  for (const b of r.bullets) {
    if (!object(b) || !keys(b,['id','targetId','x','y','damage','speed']) || !validId(b.id) || ids.has(b.id) || !position(b) || !num(b.damage,10,stats.damage+1e-9) || b.speed!==16 || !r.enemies.some((e: Enemy)=>e.id===b.targetId)) return false;
    ids.add(b.id);
  }
  if (r.targetId!==null && !r.enemies.some((e: Enemy)=>e.id===r.targetId)) return false;
  if (r.phase==='interwave' && (r.enemies.length || r.warnings.length || r.bullets.length || r.spawned!==waveConfig(r.wave).count)) return false;
  return true;
}
