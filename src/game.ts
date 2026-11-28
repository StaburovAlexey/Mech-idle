import { emptyLobbyRewards, validLobbyRewards, type LobbyRewardProgress } from './lobby-rewards';
import { legacyPickupDrops, MAX_PICKUP_PILES, pickupQuantity, pickupDrops, pickupExpired, pickupLanded, pickupSource, type Pickup } from './pickup';
import { COMBAT_UPGRADES, combatEffect, combatUpgradePrice, createEnhancements, moduleCost, isScrapModule, isShopModule, type CombatEnhancements, type CombatUpgrade, type CombatUpgradeLevels, type ShopModule } from './combat-upgrades';
import { PORTAL_RISE_SECONDS } from './portalTiming';
import { clampToSpawnCircle, onSpawnCircle, SPAWN_RADIUS, spawnPoint, validSpawnGeometry, WORLD_LIMIT, type SpawnGeometry } from './spawnGeometry';
/** Deterministic, fixed-step game simulation. No wall clock, browser, or renderer dependencies. */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const WAVE_COUNT = 30;
export const STAT_KEYS = ['damage', 'maxHp', 'attackSpeed', 'regen'] as const;
export type StatKey = typeof STAT_KEYS[number];
export type Levels = Record<StatKey, number>;
export type EnemyKind = 'ordinary' | 'fast' | 'ranged' | 'boss';
export type AttackPhase = 'approach' | 'windup' | 'strike' | 'recovery';
export interface Profile { crystals: number; scrap?: number; meta: Levels; runCounter: number; enhancements?: CombatUpgradeLevels; rewards?: LobbyRewardProgress }
export interface Stats { damage: number; maxHp: number; attackSpeed: number; regen: number; range: number }
export interface Enemy { id: string; kind: EnemyKind; x: number; y: number; hp: number; maxHp: number; damage: number; speed: number; attackInterval: number; attackCooldown: number; attackPhase: AttackPhase; attackTime: number; attackDuration: number; emergingUntil?: number }
export interface Bullet { id: string; targetId: string; x: number; y: number; damage: number; speed: number }
/** Fixed target at the turret origin. A fired bolt survives its source's death. */
export interface EnemyProjectile { id: string; sourceId: string; x: number; y: number; damage: number; speed: number }
export interface Warning { id: string; kind: EnemyKind; x: number; y: number; remaining: number; sector: number }
export interface WaveConfig { count: number; interval: number; jitter: number; fastEvery: number; rangedEvery: number; burstSize: number; boss: boolean }
export interface Run {
  id: string; seed: number; rngState: number; wave: number; phase: 'combat' | 'interwave'; paused: boolean;
  time: number; tick: number; phaseTime: number; hp: number; gold: number; levels: Levels; activeLevels: Levels;
  enemies: Enemy[]; bullets: Bullet[]; enemyProjectiles: EnemyProjectile[]; warnings: Warning[]; spawned: number; spawnCooldown: number;
  shotCooldown: number; targetId: string | null; nextEntityId: number;
  lastSector: number; sectorStreak: number; paidKillIds: string[]; lastPaidWave: number;
  kills: number; earnedGold: number; earnedCrystals: number;
  enhancements?: CombatEnhancements;
  pickups?: Pickup[];
  collectedLoot?: LootTotal;
  spawnMode?: 'circle';
  combatMode?: 'telegraphed';
  /** Read only by the one-time migration of old viewport-based saves. */
  spawnGeometry?: SpawnGeometry; nextArrival?: number;
}
type LootTotal = { parts: number; scrap: number };
export interface RunResult { outcome: 'defeat' | 'victory'; runId: string; wave: number; completedWaves: number; kills: number; earnedGold: number; earnedCrystals: number; duration: number; finalStats: Stats; collectedLoot?: LootTotal; rewardPending?: true }
export type GameEvent =
  | { type: 'warning' | 'spawn'; id: string; kind: EnemyKind; x: number; y: number }
  | { type: 'shot'; id: string; targetId: string; x: number; y: number; targetX: number; targetY: number }
  | { type: 'enemyWindup'; id: string; kind: EnemyKind; x: number; y: number }
  | { type: 'enemyStrike'; id: string; kind: EnemyKind; x: number; y: number; hitIndex: number }
  | { type: 'enemyShot'; id: string; sourceId: string; x: number; y: number; targetX: number; targetY: number }
  | { type: 'hit' | 'kill'; id: string; kind: EnemyKind; x: number; y: number; amount: number }
  | { type: 'turretHit' | 'heal'; amount: number }
  | { type: 'upgradeProc'; upgrade: CombatUpgrade }
  | { type: 'waveComplete' | 'waveStart'; wave: number }
  | { type: 'runEnded'; outcome: 'defeat' | 'victory' };
export interface GameState { version: 1; profile: Profile; run: Run | null; result: RunResult | null; events: GameEvent[] }
export const emptyLevels = (): Levels => ({ damage: 0, maxHp: 0, attackSpeed: 0, regen: 0 });
const START_PRICE: Record<StatKey, number> = { damage: 10, maxHp: 10, attackSpeed: 15, regen: 12 };
const FIRST_WAVE = { ordinary: 1, fast: 4, ranged: 6 } as const;
// Keep the original HP values for validating saves from before the rebalance.
const BASE_ENEMIES = {
  ordinary: { hp: 20, damage: 10, speed: 1, attackInterval: 2, reward: 3 },
  fast: { hp: 12, damage: 7, speed: 1.8, attackInterval: 2, reward: 4 },
  ranged: { hp: 14, damage: 5, speed: 1, attackInterval: 3.2, reward: 4 },
  boss: { hp: 624, damage: 42, speed: 0.7, attackInterval: 2, reward: 50 },
} as const;
// Accommodates every live unit in an old wave while bounding new spawn queues.
export const MAX_ENEMIES = 24;
export const MAX_SPAWN_GROUP = 7;
export const TURRET_RANGE = 7.5;
export const ESCORT_SPAWN_RADIUS = 10.45;
export const MAX_ENEMY_PROJECTILES = 32;
export const ENEMY_PROJECTILE_SPEED = 6;
export const RANGED_MUZZLE_OFFSET = 1.6;
export interface AttackConfig { range: number; windup: number; strike: number; recovery: number; hitOffsets: readonly number[] }
const ATTACKS: Record<EnemyKind, AttackConfig> = {
  ordinary: { range: 1.2, windup: .45, strike: .2, recovery: 1.35, hitOffsets: [0] },
  fast: { range: 1.2, windup: .3, strike: .2, recovery: 1.5, hitOffsets: [0] },
  boss: { range: 1.2, windup: .75, strike: .55, recovery: .7, hitOffsets: [0, .3] },
  ranged: { range: TURRET_RANGE, windup: .8, strike: .2, recovery: 2.2, hitOffsets: [0] },
};
/** Simulation and rig animation share the exact strike times. */
export function attackConfig(kind: EnemyKind): Readonly<AttackConfig> { return ATTACKS[kind]; }
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
    regen: .2 * meta.regen + .5 * levels.regen, range: TURRET_RANGE,
  };
}
export function getStats(state: GameState, includePending = false): Stats {
  return calculateStats(state.profile.meta, state.run ? (includePending ? state.run.levels : state.run.activeLevels) : emptyLevels());
}
const classicWaveCount = (wave: number) => 6 + Math.floor((wave - 1) * .55);
export function waveConfig(wave: number): WaveConfig {
  if (wave === 30) return { count: 1, interval: 1.5, jitter: .2, fastEvery: 0, rangedEvery: 0, burstSize: 1, boss: true };
  const interval = wave === 1 ? 1.25 : wave < 5 ? 2.15 : wave < 10 ? 1.95 : wave < 20 ? 1.70 : 1.45;
  const normalGroup = wave < 5 ? 3 : wave < 10 ? 4 : wave < 16 ? 5 : 6;
  const burstSize = Math.min(MAX_SPAWN_GROUP, normalGroup + (wave % 5 === 0 ? 1 : 0));
  return { count: 3 * classicWaveCount(wave), interval, jitter: .2, fastEvery: wave >= FIRST_WAVE.fast ? 4 : 0, rangedEvery: wave >= FIRST_WAVE.ranged ? 5 : 0, burstSize, boss: false };
}
const MAX_RUN_KILLS = Array.from({ length: WAVE_COUNT }, (_, i) => waveConfig(i + 1).count).reduce((a, b) => a + b, 0);
const MAX_RUN_GOLD = Math.max(4000, (MAX_RUN_KILLS - 1) * BASE_ENEMIES.fast.reward + BASE_ENEMIES.boss.reward);
export function enemyStats(kind: EnemyKind, wave: number) {
  const b = BASE_ENEMIES[kind];
  return { maxHp: kind === 'boss' ? b.hp : 10 + Math.max(0, wave - FIRST_WAVE[kind]), damage: kind === 'boss' ? b.damage : Math.ceil(b.damage * (100 + 6 * (wave - 1)) / 100), speed: 2 * b.speed, attackInterval: b.attackInterval, reward: b.reward };
}
export function startRun(state: GameState, seed = 1): GameState {
  if (state.run) return state;
  const next = clone(state);
  next.profile.runCounter += 1;
  const normalizedSeed = (Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 1) || 1;
  next.run = {
    id: `run-${next.profile.runCounter}-${normalizedSeed}`, seed: normalizedSeed, rngState: normalizedSeed, wave: 1,
    phase: 'combat', paused: false, time: 0, tick: 0, phaseTime: 0, hp: calculateStats(next.profile.meta).maxHp,
    gold: 0, levels: emptyLevels(), activeLevels: emptyLevels(), enemies: [], bullets: [], enemyProjectiles: [], warnings: [], spawned: 0,
    spawnCooldown: 0, shotCooldown: 0, targetId: null, nextEntityId: 1,
    lastSector: -1, sectorStreak: 0, paidKillIds: [], lastPaidWave: 0, kills: 0, earnedGold: 0, earnedCrystals: 0,
    spawnMode: 'circle', combatMode: 'telegraphed',
    ...(next.profile.enhancements ? { enhancements: { ...createEnhancements(), levels: { ...next.profile.enhancements } } } : {}),
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
  if (!run || !STAT_KEYS.includes(stat) || run.gold < runPrice(stat, run.levels[stat])) return state;
  const next = clone(state), r = next.run!;
  r.gold -= runPrice(stat, r.levels[stat]);
  r.levels[stat]++;
  applyRunLevels(next);
  return next;
}
/** Combat-only purchases are separate from the permanent workshop stat schema. */
export function buyCombatUpgrade(state: GameState, key: CombatUpgrade): GameState {
  const run = state.run;
  if (!run || !Object.hasOwn(COMBAT_UPGRADES, key) || isScrapModule(key)) return state;
  const level = run.enhancements?.levels[key] ?? 0;
  if (key === 'scanner' && level > 0) return state;
  const price = combatUpgradePrice(key, level - (state.profile.enhancements?.[key] ?? 0));
  if (run.gold < price) return state;
  const next = clone(state), r = next.run!;
  const enhancements = r.enhancements ??= createEnhancements();
  enhancements.levels[key] = level + 1;
  r.gold -= price;
  next.events = [];
  return next;
}

function buyPermanentCombatUpgrade(state: GameState, key: CombatUpgrade): GameState {
  if (state.run || !Object.hasOwn(COMBAT_UPGRADES, key)) return state;
  const level = state.profile.enhancements?.[key] ?? 0;
  const cost = moduleCost(key, level);
  if (state.profile.crystals < cost.parts || (state.profile.scrap ?? 0) < cost.scrap) return state;
  const next = clone(state);
  (next.profile.enhancements ??= {})[key] = level + 1;
  next.profile.crystals -= cost.parts;
  if (cost.scrap) next.profile.scrap = (state.profile.scrap ?? 0) - cost.scrap;
  next.events = [];
  return next;
}

export function buyWorkshopCombatUpgrade(state: GameState, key: CombatUpgrade): GameState {
  if (isShopModule(key) && !state.profile.enhancements?.[key]) return state;
  const next=buyPermanentCombatUpgrade(state,key);
  if(next!==state)(next.profile.rewards??=emptyLobbyRewards()).workshop=true;
  return next;
}

export function buyShopModule(state: GameState, key: ShopModule): GameState {
  if (!isShopModule(key) || state.profile.enhancements?.[key]) return state;
  return buyPermanentCombatUpgrade(state,key);
}

function effect(run: Run, key: CombatUpgrade): number {
  return combatEffect(key, run.enhancements?.levels[key] ?? 0);
}
function proc(state: GameState, upgrade: CombatUpgrade): void {
  state.events.push({ type: 'upgradeProc', upgrade });
}
function restoreHull(state: GameState, amount: number, maxHp = getStats(state).maxHp): void {
  const run = state.run!;
  const healed = Math.min(amount, maxHp - run.hp);
  if (run.hp <= 0 || healed <= 0) return;
  run.hp += healed;
  state.events.push({ type: 'heal', amount: healed });
}
function damageHull(state: GameState, amount: number, melee: boolean): void {
  const run = state.run!, upgrades = run.enhancements;
  amount *= 1-effect(run,melee?'hullArmor':'boltScreen');
  if (melee && upgrades) {
    const mitigation = effect(run, 'dampen');
    if (mitigation > 0) {
      if (run.time < upgrades.dampenUntil) amount *= 1 - mitigation;
      else upgrades.dampenUntil = run.time + 1.2;
    }
  }
  run.hp -= amount;
  state.events.push({ type: 'turretHit', amount });
  const emergency = effect(run, 'emergency');
  if (upgrades && emergency > 0 && upgrades.emergencyWave !== run.wave && run.hp > 0) {
    const maxHp = getStats(state).maxHp;
    if (run.hp < maxHp * .25) {
      upgrades.emergencyWave = run.wave;
      restoreHull(state, maxHp * emergency, maxHp);
      proc(state, 'emergency');
    }
  }
}

/** Permanent workshop purchases are available only between runs, so run base stats cannot change mid-combat. */
export function buyMetaUpgrade(state: GameState, stat: StatKey): GameState {
  if (state.run || !STAT_KEYS.includes(stat) || state.profile.crystals < metaPrice(stat, state.profile.meta[stat])) return state;
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
  const remaining = config.count - r.spawned;
  // Give a fresh turret time to afford upgrades before the first pairs.
  const warmup = r.wave === 1 && r.spawned < 5;
  const group = warmup ? 1 : config.burstSize;
  // Fold the tail into full groups instead of leaving one foe when avoidable.
  const minGroup = Math.min(3, group);
  const size = group === 1 ? 1 : remaining <= Math.min(MAX_SPAWN_GROUP, group + minGroup - 1) ? remaining : Math.min(group, remaining - minGroup);
  if (r.enemies.length + r.warnings.length + size > MAX_ENEMIES) return;
  let sector = Math.floor(random(r) * 12);
  if (sector === r.lastSector && r.sectorStreak >= 2) sector = (sector + 1 + Math.floor(random(r) * 11)) % 12;
  const offset = random(r);
  const kinds: EnemyKind[] = Array.from({ length: size }, (_, i) => {
    const ordinal = r.spawned + i + 1;
    return config.boss ? 'boss' : config.fastEvery > 0 && ordinal % config.fastEvery === 0 ? 'fast'
      : config.rangedEvery > 0 && ordinal % config.rangedEvery === 0 ? 'ranged' : 'ordinary';
  });
  const sectors = kinds.map((_, i) => (sector + Math.floor(i * 12 / size)) % 12);
  const escorts = new Map<number, number>();
  const available = kinds.map((kind, i) => kind === 'ordinary' ? i : -1).filter(i => i >= 0);
  available.push(...kinds.map((kind, i) => kind === 'fast' ? i : -1).filter(i => i >= 0));
  for (let i = 0; i < size; i++) {
    if (kinds[i] !== 'ranged') continue;
    // Escort slots come from this very batch. Do not grow the wave budget or make a lone ranged tail.
    if (!available.length) { kinds[i] = 'ordinary'; continue; }
    for (const angle of [-.115, .115]) {
      const index = available.shift();
      if (index === undefined) break;
      kinds[index] = 'ordinary';
      escorts.set(index, (sectors[i] + offset) * Math.PI / 6 + angle);
    }
  }
  for (let i = 0; i < size; i++) {
    const spawnSector = sectors[i];
    r.sectorStreak = spawnSector === r.lastSector ? r.sectorStreak + 1 : 1;
    r.lastSector = spawnSector;
    const escort = escorts.get(i);
    const angle = escort ?? (spawnSector + offset) * Math.PI / 6;
    const point = spawnPoint(angle, escort === undefined ? SPAWN_RADIUS : ESCORT_SPAWN_RADIUS);
    const kind = kinds[i];
    const warning: Warning = { id: newId(r), kind, ...point, remaining: .5, sector: Math.floor(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 6)) };
    r.warnings.push(warning); r.spawned++;
    state.events.push({ type: 'warning', id: warning.id, kind, x: warning.x, y: warning.y });
  }
  // Pace the actual batches, so larger squads don't introduce longer empty gaps.
  r.spawnCooldown = (r.wave === 1 && !warmup ? 2.05 : config.interval) + (random(r) * 2 - 1) * config.jitter;
}

function enterAttackPhase(state: GameState, enemy: Enemy, phase: AttackPhase, duration: number): void {
  enemy.attackPhase = phase; enemy.attackTime = 0; enemy.attackDuration = duration;
  enemy.attackCooldown = phase === 'recovery' ? duration : 0;
  if (phase === 'windup') state.events.push({ type: 'enemyWindup', id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y });
  if (phase === 'strike') strike(state, enemy, 0);
}
function strike(state: GameState, enemy: Enemy, hitIndex: number): void {
  const r = state.run!;
  state.events.push({ type: 'enemyStrike', id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y, hitIndex });
  if (enemy.kind === 'ranged') {
    // A saturated pool skips this shot; no queued shot can fire later without a telegraph.
    if (r.enemyProjectiles.length >= MAX_ENEMY_PROJECTILES) return;
    const distance = Math.hypot(enemy.x, enemy.y), scale = Math.max(0, distance - RANGED_MUZZLE_OFFSET) / (distance || 1);
    const projectile: EnemyProjectile = { id: newId(r), sourceId: enemy.id, x: enemy.x * scale, y: enemy.y * scale, damage: enemy.damage, speed: ENEMY_PROJECTILE_SPEED };
    r.enemyProjectiles.push(projectile);
    state.events.push({ type: 'enemyShot', id: projectile.id, sourceId: enemy.id, x: projectile.x, y: projectile.y, targetX: 0, targetY: 0 });
  } else {
    const amount = enemy.damage / attackConfig(enemy.kind).hitOffsets.length;
    damageHull(state, amount, true);
  }
}
function advanceEnemy(state: GameState, enemy: Enemy): void {
  if (enemy.emergingUntil !== undefined) {
    if (state.run!.time + 1e-9 < enemy.emergingUntil) return;
    delete enemy.emergingUntil;
  }
  const config = attackConfig(enemy.kind), d = Math.hypot(enemy.x, enemy.y);
  if (enemy.attackPhase === 'approach') {
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - DT);
    if (d > config.range) {
      const slowed = (state.run!.enhancements?.pulseUntil ?? 0) > state.run!.time && d <= 4;
      const move = Math.min(enemy.speed * (slowed ? .6 : 1) * DT, d - config.range);
      enemy.x -= enemy.x / d * move; enemy.y -= enemy.y / d * move;
    }
    if (Math.hypot(enemy.x, enemy.y) <= config.range + 1e-7) {
      if (enemy.attackCooldown > 1e-9) enterAttackPhase(state, enemy, 'recovery', enemy.attackCooldown);
      else enterAttackPhase(state, enemy, 'windup', config.windup);
    }
    return;
  }
  let remaining = DT;
  while (remaining > 1e-9) {
    const prior = enemy.attackTime, elapsed = Math.min(remaining, enemy.attackDuration - prior);
    enemy.attackTime += elapsed; remaining -= elapsed;
    if (enemy.attackPhase === 'strike') {
      for (let i = 1; i < config.hitOffsets.length; i++) {
        if (prior < config.hitOffsets[i] - 1e-9 && enemy.attackTime >= config.hitOffsets[i] - 1e-9) strike(state, enemy, i);
      }
    }
    if (enemy.attackPhase === 'recovery') enemy.attackCooldown = Math.max(0, enemy.attackDuration - enemy.attackTime);
    if (enemy.attackTime < enemy.attackDuration - 1e-9) break;
    if (enemy.attackPhase === 'windup') enterAttackPhase(state, enemy, 'strike', config.strike);
    else if (enemy.attackPhase === 'strike') enterAttackPhase(state, enemy, 'recovery', config.recovery);
    else enterAttackPhase(state, enemy, 'windup', config.windup);
  }
}

function advanceEnemyProjectiles(state: GameState): void {
  const r = state.run!, surviving: EnemyProjectile[] = [];
  for (const projectile of r.enemyProjectiles) {
    const distance = Math.hypot(projectile.x, projectile.y);
    if (distance <= projectile.speed * DT + .15) {
      const upgrades = r.enhancements, cooldown = effect(r, 'deflect');
      if (upgrades && cooldown > 0 && r.time >= upgrades.deflectReady) {
        upgrades.deflectReady = r.time + cooldown;
        proc(state, 'deflect');
      } else damageHull(state, projectile.damage, false);
    } else {
      projectile.x -= projectile.x / distance * projectile.speed * DT;
      projectile.y -= projectile.y / distance * projectile.speed * DT;
      surviving.push(projectile);
    }
  }
  r.enemyProjectiles = surviving;
}
function damageEnemy(state: GameState, enemy: Enemy, damage: number): void {
  const run = state.run!;
  if (enemy.hp <= 0) return;
  enemy.hp -= damage;
  state.events.push({ type: 'hit', id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y, amount: damage });
  if (enemy.hp > 0 || run.paidKillIds.includes(enemy.id)) return;
  run.paidKillIds.push(enemy.id); run.kills++;
  const rewards=state.profile.rewards??=emptyLobbyRewards();
  rewards.kills=Math.min(50,Math.max(rewards.kills+1,run.kills));
  const reward = BASE_ENEMIES[enemy.kind].reward;
  run.gold += reward; run.earnedGold += reward;
  state.events.push({ type: 'kill', id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y, amount: reward });
  if (new Set(run.pickups?.map(item=>pickupSource(item.id))).size < MAX_PICKUP_PILES) {
    const {lootDetector=0,lootExtractor=0} = run.enhancements?.levels ?? {};
    pickupDrops(run.seed, enemy.id, lootDetector).forEach((kind, index) => {
      (run.pickups ??= []).push({ id: index ? enemy.id + ':bonus' : enemy.id, kind, x: enemy.x, y: enemy.y, born: run.time,
        quantity:pickupQuantity(run.seed,enemy.id,kind,lootExtractor) });
    });
  }
  const salvage = effect(run, 'salvage');
  if (salvage > 0 && run.enhancements && ++run.enhancements.salvageKills === 5) {
    run.enhancements.salvageKills = 0;
    restoreHull(state, salvage);
    proc(state, 'salvage');
  }
}

/** Consume exactly the landed pieces captured at click time, once, in one update. */
export function collectPickups(state: GameState, ids: readonly string[]): GameState {
  const run = state.run;
  if (!run || run.paused || !run.pickups?.length || !ids.length) return state;
  const source = pickupSource(ids[0]);
  if (ids.some(id => pickupSource(id) !== source)) return state;
  const selected = new Set(ids);
  const pickups = run.pickups.filter(item => selected.has(item.id) && pickupLanded(item, run.time) && !pickupExpired(item, run.time));
  if (pickups.length !== selected.size) return state;
  const parts = pickups.reduce((n,item) => n + (item.kind==='parts' ? item.quantity??1 : 0),0);
  const scrap = pickups.reduce((n,item) => n + (item.kind==='scrap' ? item.quantity??1 : 0),0);
  if (state.profile.crystals + parts > 1e9 || (state.profile.scrap ?? 0) + scrap > 1e9) return state;
  const next = clone(state);
  next.events = [];
  next.run!.pickups = run.pickups.filter(item => !selected.has(item.id));
  next.run!.collectedLoot={parts:(run.collectedLoot?.parts??0)+parts,scrap:(run.collectedLoot?.scrap??0)+scrap};
  next.profile.crystals += parts;
  if (scrap) next.profile.scrap = (state.profile.scrap ?? 0) + scrap;
  return next;
}

function hitWithBullet(state: GameState, target: Enemy, bullet: Bullet, dx: number, dy: number): void {
  const run = state.run!, pierce = effect(run, 'pierce'), splash = effect(run, 'splash');
  const tracking = target.kind==='fast' ? effect(run,'fastTracker') : 0;
  const finishing = target.hp<=target.maxHp*.5 ? effect(run,'finisher') : 0;
  damageEnemy(state,target,bullet.damage*(1+tracking+finishing));
  if (!pierce && !splash) return;
  const others = run.enemies.filter(e => e !== target && e.hp > 0 && e.emergingUntil === undefined);
  if (pierce > 0) {
    // Pick one nearby unit behind the target along the last flight segment.
    if (Math.hypot(dx, dy) < 1e-6) { dx = target.x; dy = target.y; }
    const direction = Math.hypot(dx, dy);
    let closest: Enemy | undefined, best = 2.4;
    if (direction > 1e-6) for (const e of others) {
      const x = e.x - target.x, y = e.y - target.y;
      const forward = (x * dx + y * dy) / direction, cross = Math.abs(x * dy - y * dx) / direction;
      if (forward > 0 && forward < best && cross <= .55) { closest = e; best = forward; }
    }
    if (closest) damageEnemy(state, closest, bullet.damage * pierce);
  }
  if (splash > 0) for (const e of others) {
    if (Math.hypot(e.x - target.x, e.y - target.y) <= 1.4) damageEnemy(state, e, bullet.damage * splash);
  }
}

function endRun(state: GameState, outcome: 'defeat' | 'victory'): void {
  const r = state.run!;
  state.result = { outcome, runId: r.id, wave: r.wave, completedWaves: r.lastPaidWave, kills: r.kills, earnedGold: r.earnedGold, earnedCrystals: r.earnedCrystals, duration: r.time, finalStats: getStats(state), collectedLoot: r.collectedLoot ?? {parts:0,scrap:0}, rewardPending:true };
  state.run = null;
  state.events.push({ type: 'runEnded', outcome });
}
export function runRewards(result: RunResult): LootTotal {
  return {parts:result.earnedCrystals+(result.collectedLoot?.parts??0),scrap:result.collectedLoot?.scrap??0};
}

/** The normal payout is already banked; consume the pending result once, adding only a confirmed ad bonus. */
export function claimRunReward(state: GameState, runId: string, adBonus = false): GameState {
  const result=state.result;
  if(state.run||!result?.rewardPending||result.runId!==runId)return state;
  const profile={...state.profile};
  if(adBonus){
    const {parts,scrap}=runRewards(result);
    if(profile.crystals+parts>1e9||(profile.scrap??0)+scrap>1e9)return state;
    profile.crystals+=parts;
    if(scrap)profile.scrap=(profile.scrap??0)+scrap;
  }
  return {...state,profile,result:null,events:[]};
}

function advanceTick(state: GameState): void {
  const r = state.run;
  if (!r || r.paused) return;
  r.tick++;
  r.time = r.tick * DT;
  if (r.pickups?.some(item => pickupExpired(item, r.time))) {
    r.pickups = r.pickups.filter(item => !pickupExpired(item, r.time));
  }
  r.phaseTime += DT;
  const stats = getStats(state);
  if (r.phase === 'interwave') {
    // Healing continues in the mandatory two-second rest; fractional healing is retained.
    heal(state, stats);
    if (r.phaseTime + 1e-9 >= 2) {
      restoreHull(state,stats.maxHp * effect(r,'waveRegen'),stats.maxHp);
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
    r.enemies.push({ id: w.id, kind: w.kind, x: w.x, y: w.y, hp: s.maxHp, maxHp: s.maxHp, damage: s.damage, speed: s.speed, attackInterval: s.attackInterval, attackCooldown: 0, attackPhase: 'approach', attackTime: 0, attackDuration: 0, emergingUntil: r.time + PORTAL_RISE_SECONDS });
    state.events.push({ type: 'spawn', id: w.id, kind: w.kind, x: w.x, y: w.y });
  }
  r.spawnCooldown -= DT;
  if (r.spawned < waveConfig(r.wave).count && r.spawnCooldown <= 1e-9) queueSpawn(state);
  // Resolve already-fired bolts, then animation strikes, before friendly projectile deaths.
  // New bolts begin traveling next tick. Simultaneous boss/turret death remains defeat.
  advanceEnemyProjectiles(state);
  const upgrades = r.enhancements, pulse = effect(r, 'pulse');
  if (upgrades && pulse > 0 && r.time >= upgrades.pulseReady &&
      r.enemies.some(e => e.hp > 0 && e.emergingUntil === undefined && e.attackPhase === 'approach' && Math.hypot(e.x, e.y) <= 4)) {
    upgrades.pulseReady = r.time + pulse;
    upgrades.pulseUntil = r.time + 1;
    proc(state, 'pulse');
  }
  for (const enemy of r.enemies) advanceEnemy(state, enemy);
  const canAim = (e: Enemy) => e.hp > 0 && e.emergingUntil === undefined;
  const inRange = (e: Enemy) => Math.hypot(e.x, e.y) <= stats.range + 1e-7;
  const prioritizeRanged = effect(r, 'scanner') > 0;
  const target = r.enemies.find(e => e.id === r.targetId && canAim(e)) ??
    r.enemies.filter(e => canAim(e) && inRange(e))
      .sort((a, b) => (prioritizeRanged ? Number(b.kind === 'ranged') - Number(a.kind === 'ranged') : 0) || Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y) || Number(a.id.split(':').pop()) - Number(b.id.split(':').pop()))[0];
  r.targetId = target?.id ?? null;
  r.shotCooldown -= DT;
  if (!target || !inRange(target)) r.shotCooldown = Math.max(0, r.shotCooldown);
  else if (r.shotCooldown <= 1e-9) {
    const chance = effect(r, 'critical'), critical = chance > 0 && random(r) < chance;
    const bullet: Bullet = { id: newId(r), targetId: target.id, x: 0, y: 0, damage: stats.damage * (critical ? 2 : 1), speed: 16 };
    if (critical) proc(state, 'critical');
    r.bullets.push(bullet); r.shotCooldown = Math.max(0, r.shotCooldown + 1 / stats.attackSpeed);
    state.events.push({ type: 'shot', id: bullet.id, targetId: target.id, x: 0, y: 0, targetX: target.x, targetY: target.y });
  }
  const surviving: Bullet[] = [];
  for (const bullet of r.bullets) {
    const target = r.enemies.find(e => e.id === bullet.targetId && e.hp > 0);
    if (!target) continue;
    const dx = target.x - bullet.x, dy = target.y - bullet.y, distance = Math.hypot(dx, dy);
    if (distance <= bullet.speed * DT + .12) {
      hitWithBullet(state, target, bullet, dx, dy);
    } else { bullet.x += dx / distance * bullet.speed * DT; bullet.y += dy / distance * bullet.speed * DT; surviving.push(bullet); }
  }
  r.enemies = r.enemies.filter(e => e.hp > 0);
  r.bullets = surviving.filter(b => r.enemies.some(e => e.id === b.targetId));
  if (r.targetId && !r.enemies.some(e => e.id === r.targetId)) r.targetId = null;
  if (r.hp <= 0) { endRun(state, 'defeat'); return; }
  heal(state, stats);
  if (r.spawned >= waveConfig(r.wave).count && r.enemies.length === 0 && r.warnings.length === 0 && r.enemyProjectiles.length === 0) {
    if (r.lastPaidWave < r.wave) {
      state.profile.crystals++; r.earnedCrystals++; r.lastPaidWave = r.wave;
      const rewards=state.profile.rewards??=emptyLobbyRewards();
      rewards.waves=Math.max(rewards.waves,Math.min(r.wave,5));
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
    if (!validateState(value, true)) return null;
    const state = clone(value);
    // Legacy v1 saves may contain already-paid upgrades awaiting a wave boundary.
    // Activate them once, preserving HP, currency, projectiles, and firing-cycle progress.
    if (state.run) applyRunLevels(state);
    state.events = [];
    if (state.run && state.run.spawnMode !== 'circle') migrateCircleSpawns(state.run);
    if (state.run && state.run.combatMode !== 'telegraphed') migrateTelegraphedCombat(state.run);
    if (state.run) {
      // Old saves retain their positions, rewards and already-completed waves.
      const run = state.run;
      for (const enemy of run.enemies) {
        const stats = enemyStats(enemy.kind, run.wave);
        enemy.speed = stats.speed;
        if (enemy.maxHp !== stats.maxHp) {
          enemy.hp = enemy.hp / enemy.maxHp * stats.maxHp;
          enemy.maxHp = stats.maxHp;
        }
      }
      if (run.phase === 'interwave') run.spawned = waveConfig(run.wave).count;
    }
    // Check the migrated shape too; malformed legacy data cannot become a new save.
    return validateState(state) ? state : null;
  } catch { return null; }
}
/** Old cooldowns resume as recovery, never as a strike or an already-fired bolt. */
function migrateTelegraphedCombat(run: Run): void {
  for (const enemy of run.enemies) {
    const recovering = enemy.attackCooldown > 0 && Math.hypot(enemy.x, enemy.y) <= attackConfig(enemy.kind).range + 1e-7;
    enemy.attackPhase = recovering ? 'recovery' : 'approach';
    enemy.attackTime = 0; enemy.attackDuration = recovering ? enemy.attackCooldown : 0;
  }
  run.enemyProjectiles = [];
  run.combatMode = 'telegraphed';
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
function validLevels(v: unknown): v is Levels { return object(v) && keys(v, [...STAT_KEYS]) && STAT_KEYS.every(k => Number.isSafeInteger(v[k]) && v[k] >= 0); }
function validCombatLevels(v: unknown): v is CombatUpgradeLevels {
 return object(v) && Object.entries(v).every(([key, level]) =>
   Object.hasOwn(COMBAT_UPGRADES, key) && int(level, 1, key === 'scanner' ? 1 : 256));
}
function validLootTotal(v: unknown): v is LootTotal { return object(v) && keys(v,['parts','scrap']) && int(v.parts,0,MAX_RUN_KILLS*3) && int(v.scrap,0,MAX_RUN_KILLS*3); }
function validStats(v: unknown): v is Stats { return object(v) && keys(v, ['damage','maxHp','attackSpeed','regen','range']) && num(v.damage, 10, Number.MAX_VALUE) && num(v.maxHp, 100, Number.MAX_VALUE) && num(v.attackSpeed, 1, Number.MAX_VALUE) && num(v.regen, 0, Number.MAX_VALUE) && (v.range === TURRET_RANGE || v.range === 10); }
export function validateState(value: unknown, allowLegacy = false): value is GameState {
  if (!object(value) || !keys(value, ['version','profile','run','result','events']) || value.version !== 1 || !Array.isArray(value.events) || value.events.length !== 0) return false;
  const p = value.profile;
  if (!object(p) || !keys(p, ['crystals','meta','runCounter', ...(Object.hasOwn(p,'scrap') ? ['scrap'] : []), ...(Object.hasOwn(p,'enhancements') ? ['enhancements'] : []), ...(Object.hasOwn(p,'rewards') ? ['rewards'] : [])]) || (Object.hasOwn(p,'rewards')&&!validLobbyRewards(p.rewards)) || !int(p.crystals) || (Object.hasOwn(p,'scrap') && !int(p.scrap)) || !validLevels(p.meta) || !int(p.runCounter) || (Object.hasOwn(p,'enhancements') && !validCombatLevels(p.enhancements))) return false;
  if (value.result !== null) {
    const r = value.result;
    if (!object(r) || !keys(r, ['outcome','runId','wave','completedWaves','kills','earnedGold','earnedCrystals','duration','finalStats', ...(Object.hasOwn(r,'collectedLoot') ? ['collectedLoot'] : []), ...(Object.hasOwn(r,'rewardPending') ? ['rewardPending'] : [])]) || (Object.hasOwn(r,'collectedLoot') && !validLootTotal(r.collectedLoot)) || (Object.hasOwn(r,'rewardPending') && (r.rewardPending!==true || !Object.hasOwn(r,'collectedLoot'))) || !['defeat','victory'].includes(r.outcome) || !str(r.runId) || !int(r.wave,1,30) || !int(r.completedWaves,0,30) || !int(r.kills,0,MAX_RUN_KILLS) || !int(r.earnedGold,0,MAX_RUN_GOLD) || !int(r.earnedCrystals,0,30) || r.earnedCrystals !== r.completedWaves || !num(r.duration,0,1e7) || !validStats(r.finalStats) || (r.outcome === 'victory' && (r.wave !== 30 || r.completedWaves !== 30)) || (r.outcome === 'defeat' && r.completedWaves !== r.wave - 1)) return false;
  }
  if (value.run === null) return true;
  if (value.result !== null) return false;
  const r = value.run;
  if (!object(r) || !keys(r, ['id','seed','rngState','wave','phase','paused','time','tick','phaseTime','hp','gold','levels','activeLevels','enemies','bullets','warnings','spawned','spawnCooldown','shotCooldown','targetId','nextEntityId','lastSector','sectorStreak','paidKillIds','lastPaidWave','kills','earnedGold','earnedCrystals', ...(Object.hasOwn(r, 'combatMode') ? ['combatMode','enemyProjectiles'] : []), ...(Object.hasOwn(r, 'spawnMode') ? ['spawnMode'] : []), ...(Object.hasOwn(r, 'enhancements') ? ['enhancements'] : []), ...(Object.hasOwn(r, 'pickups') ? ['pickups'] : []), ...(Object.hasOwn(r,'collectedLoot') ? ['collectedLoot'] : []), ...(Object.hasOwn(r, 'spawnGeometry') ? ['spawnGeometry'] : []), ...(Object.hasOwn(r, 'nextArrival') ? ['nextArrival'] : [])])) return false;
  if (Object.hasOwn(r,'collectedLoot') && !validLootTotal(r.collectedLoot)) return false;
  const telegraphed = Object.hasOwn(r, 'combatMode');
  if (telegraphed && (r.combatMode !== 'telegraphed' || !Array.isArray(r.enemyProjectiles) || r.enemyProjectiles.length > MAX_ENEMY_PROJECTILES)) return false;
  const circle = Object.hasOwn(r, 'spawnMode');
  if (circle && (r.spawnMode !== 'circle' || Object.hasOwn(r, 'spawnGeometry') || Object.hasOwn(r, 'nextArrival'))) return false;
  if (Object.hasOwn(r, 'spawnGeometry') !== Object.hasOwn(r, 'nextArrival')) return false;
  if (Object.hasOwn(r, 'spawnGeometry') && !validSpawnGeometry(r.spawnGeometry) || Object.hasOwn(r, 'nextArrival') && !num(r.nextArrival, 0, 1e7)) return false;
  if (!str(r.id) || r.id !== `run-${p.runCounter}-${r.seed}` || !int(r.seed,1,0xffffffff) || !int(r.rngState,1,0xffffffff) || !int(r.wave,1,30) || !['combat','interwave'].includes(r.phase) || typeof r.paused !== 'boolean' || !num(r.time,0,1e7) || !int(r.tick,0,3e8) || Math.abs(r.time-r.tick*DT)>1e-6 || !num(r.phaseTime,0,1e7) || !validLevels(r.levels) || !validLevels(r.activeLevels) || STAT_KEYS.some(k=>r.activeLevels[k]>r.levels[k])) return false;
  if (Object.hasOwn(r, 'enhancements')) {
    const u = r.enhancements;
    if (!object(u) || !keys(u, ['levels','deflectReady','dampenUntil','emergencyWave','salvageKills','pulseReady','pulseUntil']) ||
        !validCombatLevels(u.levels) ||
        !num(u.deflectReady, 0, r.time + 8 + 1e-8) || !num(u.dampenUntil, 0, r.time + 1.2 + 1e-8) ||
        !int(u.emergencyWave, 0, r.wave) || !int(u.salvageKills, 0, 4) ||
        !num(u.pulseReady, 0, r.time + 10 + 1e-8) || !num(u.pulseUntil, 0, r.time + 1 + 1e-8)) return false;
  }
  if (p.enhancements && (Object.keys(p.enhancements) as CombatUpgrade[]).some(key =>
      (r.enhancements?.levels[key] ?? 0) < p.enhancements[key]!)) return false;
  const stats = calculateStats(p.meta,r.activeLevels);
  if (!num(r.hp,Number.MIN_VALUE,stats.maxHp + 1e-6) || !int(r.gold,0,MAX_RUN_GOLD) || !int(r.spawned,0,waveConfig(r.wave).count) || !num(r.spawnCooldown,-1e7,telegraphed ? 7.71 : 1.71) || !num(r.shotCooldown,0,1.01) || !int(r.nextEntityId,1,100000) || !int(r.lastSector,-1,11) || !int(r.sectorStreak,0,2) || !int(r.lastPaidWave,0,29) || !int(r.kills,0,MAX_RUN_KILLS) || !int(r.earnedGold,0,MAX_RUN_GOLD) || !int(r.earnedCrystals,0,29) || r.lastPaidWave!==r.earnedCrystals || r.gold>r.earnedGold || r.lastPaidWave !== (r.phase === 'combat' ? r.wave-1 : r.wave) || (r.phase === 'interwave' && (r.wave===30 || r.phaseTime>=2.000001))) return false;
  if (!Array.isArray(r.enemies) || r.enemies.length>30 || !Array.isArray(r.warnings) || r.warnings.length>(circle ? telegraphed ? MAX_SPAWN_GROUP : 1 : 30) || r.warnings.length>r.spawned || !Array.isArray(r.bullets) || r.bullets.length>100 || !Array.isArray(r.paidKillIds) || r.paidKillIds.length!==r.kills || new Set(r.paidKillIds).size!==r.paidKillIds.length) return false;
  if (telegraphed && circle && r.enemies.length + r.warnings.length > MAX_ENEMIES) return false;
  const validId = (id: unknown): id is string => str(id) && id.startsWith(`${r.id}:`) && /^[1-9]\d*$/.test(id.slice(r.id.length+1)) && int(Number(id.slice(r.id.length+1)),1,r.nextEntityId-1);
  const positionLimit = circle ? SPAWN_RADIUS + 1e-6 : r.spawnGeometry ? WORLD_LIMIT : 10.000001;
  const position = (e: Record<string, any>) => num(e.x,-positionLimit,positionLimit) && num(e.y,-positionLimit,positionLimit) && Math.hypot(e.x,e.y)<=positionLimit;
  const validKind = (kind: any) => (telegraphed ? ['ordinary','fast','ranged','boss'] : ['ordinary','fast','boss']).includes(kind) && (r.wave===30 ? kind==='boss' : kind!=='boss') && (kind==='boss'||r.wave>=FIRST_WAVE[kind as keyof typeof FIRST_WAVE]);
  if (!r.paidKillIds.every(validId)) return false;
  if (Object.hasOwn(r, 'pickups')) {
    if (!Array.isArray(r.pickups) || r.pickups.length > r.kills * 2) return false;
    const pending = new Set<string>(), paid = new Set(r.paidKillIds);
    for (const d of r.pickups) {
      if (!object(d) || !keys(d, ['id','kind','x','y','born',...(Object.hasOwn(d,'quantity')?['quantity']:[])]) || !str(d.id) || pending.has(d.id) ||
          !position(d) || !num(d.born, 0, r.time)) return false;
      const source = pickupSource(d.id), bonus = source !== d.id;
      if (!paid.has(source)) return false;
      const modern = Object.hasOwn(d,'quantity');
      const [primary, secondary] = modern ? pickupDrops(r.seed, source, r.enhancements?.levels.lootDetector) : legacyPickupDrops(r.seed, source);
      const kind = bonus ? secondary : primary;
      if (!kind || kind !== d.kind || (modern && d.quantity!==pickupQuantity(r.seed,source,kind,r.enhancements?.levels.lootExtractor??0))) return false;
      pending.add(d.id);
    }
  }
  const ids = new Set<string>(r.paidKillIds);
  for (const e of r.enemies) {
    if (!object(e) || !keys(e,['id','kind','x','y','hp','maxHp','damage','speed','attackInterval','attackCooldown', ...(telegraphed ? ['attackPhase','attackTime','attackDuration'] : []), ...(Object.hasOwn(e,'emergingUntil') ? ['emergingUntil'] : [])]) || !validId(e.id) || ids.has(e.id) || !validKind(e.kind) || !position(e)) return false;
    if (Object.hasOwn(e,'emergingUntil') && (!telegraphed || !circle || e.attackPhase !== 'approach' ||
      !num(e.emergingUntil, r.time, r.time + PORTAL_RISE_SECONDS + 1e-8))) return false;
    ids.add(e.id);
    const base = enemyStats(e.kind,r.wave);
    const legacyMaxHp = e.kind === 'boss' ? base.maxHp : Math.ceil(BASE_ENEMIES[e.kind as EnemyKind].hp * (100 + 10 * (r.wave - 1)) / 100);
    if ((e.maxHp!==base.maxHp && (!allowLegacy || e.maxHp!==legacyMaxHp)) || e.damage!==base.damage || (e.speed!==base.speed && (!allowLegacy || e.speed!==BASE_ENEMIES[e.kind as EnemyKind].speed)) || e.attackInterval!==base.attackInterval || !num(e.hp,Number.MIN_VALUE,e.maxHp) || !num(e.attackCooldown,0,base.attackInterval)) return false;
    if (e.kind === 'ranged' && Math.hypot(e.x,e.y) < attackConfig('ranged').range - 1e-6) return false;
    if (telegraphed) {
      const attack = attackConfig(e.kind);
      if (!['approach','windup','strike','recovery'].includes(e.attackPhase) || !num(e.attackTime,0,base.attackInterval) || !num(e.attackDuration,0,base.attackInterval)) return false;
      if (e.attackPhase === 'approach') {
        if (e.attackTime !== 0 || e.attackDuration !== 0) return false;
      } else {
        if (Math.hypot(e.x,e.y) > attack.range + 1e-6 || e.attackDuration <= 0 || e.attackTime >= e.attackDuration) return false;
        if (e.attackPhase === 'recovery') {
          if (Math.abs(e.attackCooldown - (e.attackDuration - e.attackTime)) > 1e-7) return false;
        } else if (e.attackCooldown !== 0 || e.attackDuration !== attack[e.attackPhase as 'windup' | 'strike']) return false;
      }
    }
  }
  for (const w of r.warnings) {
    if (!object(w) || !keys(w,['id','kind','x','y','remaining','sector']) || !validId(w.id) || ids.has(w.id) || !validKind(w.kind) || !position(w) || Math.hypot(w.x,w.y)<7.999999 || (circle && Math.abs(Math.hypot(w.x,w.y) - SPAWN_RADIUS)>1e-6 && !(w.kind === 'ordinary' && telegraphed && r.wave >= 6 && Math.abs(Math.hypot(w.x,w.y) - ESCORT_SPAWN_RADIUS) <= 1e-6)) || !num(w.remaining,Number.MIN_VALUE,r.spawnGeometry ? 1e6 : .5) || !int(w.sector,0,11)) return false;
    ids.add(w.id);
  }
  for (const b of r.bullets) {
    if (!object(b) || !keys(b,['id','targetId','x','y','damage','speed']) || !validId(b.id) || ids.has(b.id) || !position(b) || !num(b.damage,10,stats.damage * (r.enhancements?.levels.critical ? 2 : 1) + 1e-9) || b.speed!==16 || !r.enemies.some((e: Enemy)=>e.id===b.targetId)) return false;
    ids.add(b.id);
  }
  const sourceIds = new Set<string>();
  for (const p of telegraphed ? r.enemyProjectiles : []) {
    if (!object(p) || !keys(p,['id','sourceId','x','y','damage','speed']) || !validId(p.id) || ids.has(p.id) || !validId(p.sourceId) || p.id === p.sourceId || sourceIds.has(p.sourceId) || !position(p) || Math.hypot(p.x,p.y) > attackConfig('ranged').range - RANGED_MUZZLE_OFFSET + 1e-6 || p.damage !== enemyStats('ranged',r.wave).damage || p.speed !== ENEMY_PROJECTILE_SPEED || r.wave < 6 || r.wave === 30) return false;
    if (!r.enemies.some((e: Enemy)=>e.id===p.sourceId && e.kind==='ranged') && !r.paidKillIds.includes(p.sourceId)) return false;
    ids.add(p.id); sourceIds.add(p.sourceId);
  }
  if (r.targetId!==null && !r.enemies.some((e: Enemy)=>e.id===r.targetId)) return false;
  if (r.phase==='interwave' && (r.enemies.length || r.warnings.length || r.bullets.length || (telegraphed && r.enemyProjectiles.length) || (r.spawned!==waveConfig(r.wave).count && (!allowLegacy || r.spawned!==classicWaveCount(r.wave))))) return false;
  return true;
}
