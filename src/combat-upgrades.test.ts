import { describe, expect, it } from 'vitest';
import { COMBAT_KEYS, combatUpgradePrice, workshopCombatPrice, isShopModule, type CombatUpgrade } from './combat-upgrades';
import { attackConfig, buyCombatUpgrade, buyWorkshopCombatUpgrade, buyShopModule, createState, DT, enemyStats, parseState, serializeState, startRun, step, TURRET_RANGE, type Enemy, type EnemyKind, type GameState } from './game';

function battle(wave = 6): GameState {
 const state = startRun(createState(), 1), run = state.run!;
 run.wave = wave; run.lastPaidWave = run.earnedCrystals = wave-1;
 run.gold = run.earnedGold = 1000; run.spawnCooldown = 1; run.shotCooldown = 1;
 return state;
}
function enemy(state: GameState, x: number, y = 0, kind: EnemyKind = 'ordinary'): Enemy {
 const run = state.run!, stats = enemyStats(kind,run.wave);
 const e: Enemy = {id:`${run.id}:${run.nextEntityId++}`,kind,x,y,...stats,hp:stats.maxHp,attackPhase:'approach',attackTime:0,attackDuration:0,attackCooldown:0};
 delete (e as Enemy & { reward?: number }).reward;
 run.enemies.push(e);
 return e;
}
function buy(state: GameState, ...keys: CombatUpgrade[]) {
 return keys.reduce((s,k)=>buyCombatUpgrade(s,k),state);
}
function firingAt(state: GameState, e: Enemy) {
 const r=state.run!;
 r.bullets.push({id:`${r.id}:${r.nextEntityId++}`,targetId:e.id,x:e.x-.15,y:e.y,damage:10,speed:16});
}
function rangedImpact(state: GameState, source: Enemy) {
 const r=state.run!;
 r.enemyProjectiles.push({id:`${r.id}:${r.nextEntityId++}`,sourceId:source.id,x:0,y:0,damage:source.damage,speed:6});
}
const reload=(state:GameState)=>parseState(serializeState(state))!;

describe('combat-only upgrades',()=>{
 it('charges exactly, preserves the old save shape until purchase, and persists all nine',()=>{
  const initial=battle();
  expect(reload(initial).run!.enhancements).toBeUndefined();
  expect(buyCombatUpgrade(createState(),'critical').run).toBeNull();
  const all=buy(initial,...COMBAT_KEYS),run=all.run!;
  expect(run.gold).toBe(initial.run!.gold-COMBAT_KEYS.reduce((n,k)=>n+combatUpgradePrice(k,0),0));
  expect(all.profile.meta).toEqual(initial.profile.meta);
  expect(reload(all).run!.enhancements?.levels).toEqual(Object.fromEntries(COMBAT_KEYS.map(k=>[k,1])));
  expect(buyCombatUpgrade(all,'scanner')).toBe(all);
  const next=buy(all,'critical');expect(next.run!.gold).toBe(run.gold-combatUpgradePrice('critical',1));
  next.run!.gold=0;expect(buyCombatUpgrade(next,'pulse')).toBe(next);
  const malformed=JSON.parse(serializeState(all));malformed.run.enhancements.pulseUntil=30;
  expect(parseState(JSON.stringify(malformed))).toBeNull();
 });

 it('spends crystals on all nine starting effects and stacks gold purchases only for the current run',()=>{
  const starting=createState();starting.profile.crystals=100;
  const hangar=COMBAT_KEYS.reduce((s,k)=>isShopModule(k)?buyShopModule(s,k):buyWorkshopCombatUpgrade(s,k),starting);
  expect(hangar.profile.crystals).toBe(100-COMBAT_KEYS.reduce((n,k)=>n+workshopCombatPrice(k,0),0));
  expect(hangar.profile.meta).toEqual(starting.profile.meta);
  expect(buyWorkshopCombatUpgrade(hangar,'scanner')).toBe(hangar);
  const run=startRun(reload(hangar),42);
  expect(run.run!.enhancements?.levels).toEqual(hangar.profile.enhancements);
  expect(buyWorkshopCombatUpgrade(run,'pierce')).toBe(run);
  run.run!.gold=run.run!.earnedGold=100;
  const n=buyCombatUpgrade(run,'pierce');
  expect(reload(n).run!.enhancements?.levels.pierce).toBe(2);
  expect(n.profile.enhancements?.pierce).toBe(1);
  expect(n.run!.gold).toBe(100-combatUpgradePrice('pierce',0));
  expect(buyCombatUpgrade(n,'scanner')).toBe(n);
  expect(startRun({...n,run:null},43).run!.enhancements?.levels.pierce).toBe(1);
 });

 it('allows one shop purchase and sends repeat upgrades to the workshop',()=>{
  const state=createState();state.profile.crystals=50;
  expect(buyWorkshopCombatUpgrade(state,'pulse')).toBe(state);
  const first=buyShopModule(state,'pulse');
  expect(first.profile.crystals).toBe(42);
  expect(first.profile.enhancements?.pulse).toBe(1);
  expect(buyShopModule(first,'pulse')).toBe(first);
  const second=buyWorkshopCombatUpgrade(reload(first),'pulse');
  expect(second.profile.crystals).toBe(30);
  expect(second.profile.enhancements?.pulse).toBe(2);
  expect(buyShopModule(second,'pulse')).toBe(second);
 });

 it('doubles a critical projectile and saves it in flight without changing damage in the workshop',()=>{
  const state=buy(battle(),'critical'),r=state.run!,victim=enemy(state,4);
  r.shotCooldown=0;
  const n=step(state);expect(n.run!.bullets[0]).toMatchObject({targetId:victim.id,damage:20});
  expect(n.events).toContainEqual({type:'upgradeProc',upgrade:'critical'});
  expect(reload(n).run!.bullets[0].damage).toBe(20);
 });

 it('pierces only the nearest aligned mech behind the target',()=>{
  const state=buy(battle(),'pierce'),target=enemy(state,4),second=enemy(state,5),third=enemy(state,6),side=enemy(state,5,1);
  firingAt(state,target);const n=step(state), hp=(e: Enemy)=>n.run!.enemies.find(x=>x.id===e.id)!.hp;
  expect(hp(second)).toBeCloseTo(second.hp-3.5);
  expect(hp(third)).toBe(third.hp);expect(hp(side)).toBe(side.hp);
 });

 it('applies splash only near impact and pays overlapping kills only once',()=>{
  const state=buy(battle(),'pierce','splash'),target=enemy(state,4),behind=enemy(state,5),side=enemy(state,4,1),far=enemy(state,4,2);
  behind.hp=1;side.hp=1;firingAt(state,target);
  const n=step(state);expect(n.events.filter(e=>e.type==='kill')).toHaveLength(2);
  expect(n.run!.paidKillIds).toEqual([behind.id,side.id]);
  expect(n.run!.enemies.find(e=>e.id===far.id)!.hp).toBe(far.hp);
  expect(reload(n).run!.gold).toBe(state.run!.gold+6);
 });

 it('blocks only one projectile per cooldown and persists cooldown across reload',()=>{
  const state=buy(battle(),'deflect'),source=enemy(state,TURRET_RANGE,0,'ranged');
  rangedImpact(state,source);
  const blocked=reload(step(state));
  expect(blocked.run!.hp).toBe(100);
  expect(blocked.run!.enhancements!.deflectReady).toBeCloseTo(8+DT);
  rangedImpact(blocked,source);
  expect(step(blocked).run!.hp).toBe(100-source.damage);
 });

 it('dampens a follow-up melee hit, not the first hit or a projectile',()=>{
  const state=buy(battle(),'dampen'),a=enemy(state,1.2),b=enemy(state,-1.2);
  for(const e of [a,b]){
   e.attackPhase='windup';e.attackDuration=attackConfig('ordinary').windup;e.attackTime=e.attackDuration-DT/2;
  }
  const n=step(state);expect(n.run!.hp).toBeCloseTo(100-a.damage-b.damage*.8);
  const source=enemy(n,TURRET_RANGE,0,'ranged');rangedImpact(n,source);
  expect(step(n).run!.hp).toBeCloseTo(n.run!.hp-source.damage);
 });

 it('emergency repair triggers once per wave after a nonlethal hit below 25%',()=>{
  const state=buy(battle(),'emergency'),source=enemy(state,TURRET_RANGE,0,'ranged');state.run!.hp=26;
  rangedImpact(state,source);const n=reload(step(state));
  expect(n.run!.hp).toBe(26-source.damage+12);
  n.run!.hp=22;rangedImpact(n,source);expect(step(n).run!.hp).toBe(22-source.damage);
  n.run!.hp=1;expect(step(n).result?.outcome).toBe('defeat');
 });

 it('repairs on the fifth kill after purchase, with a persistent counter',()=>{
  let state=buy(battle(1),'salvage');state.run!.hp=60;
  for(let i=0;i<5;i++){
   firingAt(state,enemy(state,5));state=step(state);
   if(i===3)state=reload(state);
  }
  expect(state.run!.enhancements!.salvageKills).toBe(0);
  expect(state.run!.hp).toBe(62);
  expect(state.events).toContainEqual({type:'upgradeProc',upgrade:'salvage'});
 });

 it('scanner prioritizes in-range ranged units on acquisition, never drops the current lock',()=>{
  const state=buy(battle(),'scanner'),closer=enemy(state,2),ranged=enemy(state,TURRET_RANGE,0,'ranged');
  expect(step(state).run!.targetId).toBe(ranged.id);
  state.run!.targetId=closer.id;expect(step(state).run!.targetId).toBe(closer.id);
  state.run!.targetId=null;ranged.x=TURRET_RANGE+.2;
  expect(step(state).run!.targetId).toBe(closer.id);
 });

 it('pulse slows nearby approaching enemies only, and cooldown survives reload',()=>{
  const state=buy(battle(),'pulse'),near=enemy(state,3),far=enemy(state,5);
  const n=step(state);
  expect(n.events).toContainEqual({type:'upgradeProc',upgrade:'pulse'});
  expect(n.run!.enemies[0].x).toBeCloseTo(near.x-near.speed*DT*.6);
  expect(n.run!.enemies[1].x).toBeCloseTo(far.x-far.speed*DT);
  const saved=reload(n);expect(saved.run!.enhancements?.pulseUntil).toBeCloseTo(1+DT);
  expect(step(saved).events).not.toContainEqual({type:'upgradeProc',upgrade:'pulse'});
 });
});
