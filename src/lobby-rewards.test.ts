import { describe, expect, it } from 'vitest';
import { buyMetaUpgrade,buyShopModule,buyWorkshopCombatUpgrade,createState,enemyStats,parseState,serializeState,startRun,step,waveConfig } from './game';
import { claimLobbyReward,emptyLobbyRewards,questProgress, rewardDay,VISIT_REWARDS } from './lobby-rewards';

describe('lobby rewards',()=>{
 it('pays seven separate local days, preserves missed visits and prevents duplicate/rollback claims',()=>{
  let state=createState();
  const day=rewardDay(new Date(2026,10,28,23,59));
  expect(rewardDay(new Date(2026,10,29,0,0))).toBe(day+1);
  for(let i=0;i<VISIT_REWARDS.length;i++){
   const t=day+i*3;
   const next=claimLobbyReward(state,'visit',t);
   expect(next).not.toBe(state);
   state=parseState(serializeState(next))!;
   expect(state.profile.rewards?.visits).toBe(i+1);
   expect(claimLobbyReward(state,'visit',t)).toBe(state);
   expect(claimLobbyReward(state,'visit',t-1)).toBe(state);
  }
  expect(state.profile).toMatchObject({crystals:20,scrap:9});
  expect(claimLobbyReward(state,'visit',day+99)).toBe(state);
 });
 it('leaves old saves readable, respects balance caps, and distinguishes a purchase from a workshop upgrade',()=>{
  const old=createState();
  expect(parseState(serializeState(old))).toEqual(old);
  old.profile.crystals=1e9;
  expect(claimLobbyReward(old,'visit',100)).toBe(old);
  expect(questProgress(buyShopModule(old,'pulse').profile,'workshop')).toBe(0);
  const upgraded=buyWorkshopCombatUpgrade(old,'critical');
  expect(questProgress(upgraded.profile,'workshop')).toBe(1);
  expect(claimLobbyReward(upgraded,'workshop',100).profile.crystals).toBe(upgraded.profile.crystals+2);
  const normal=buyMetaUpgrade(old,'damage');
  const rewarded=claimLobbyReward(normal,'workshop',100);
  expect(rewarded.profile.crystals).toBe(1e9-1);
  const restored=parseState(serializeState(rewarded))!;
  expect(claimLobbyReward(restored,'workshop',101)).toBe(restored);
 });
 it('counts earned waves and kills once from real simulation, including across battles',()=>{
  const fresh=createState();
  fresh.profile.rewards={...emptyLobbyRewards(),kills:48};
  let state=startRun(fresh,5);
  for(const n of [1,2]){
   const r=state.run!;
   const {reward:_,...stats}=enemyStats('ordinary',1),id=r.id+':'+r.nextEntityId++;
   r.enemies=[{...stats,id,kind:'ordinary',x:3,y:0,hp:1,attackCooldown:0,attackPhase:'approach',attackTime:0,attackDuration:0}];
   r.bullets=[{id:r.id+':'+r.nextEntityId++,targetId:id,x:3,y:0,speed:16,damage:10}];
   r.spawned=n;r.spawnCooldown=3;r.shotCooldown=1;
   state=step(state);
   expect(questProgress(state.profile,'kills')).toBe(48+n);
  }
  expect(questProgress(state.profile,'waves')).toBe(0);
  const run=state.run!;
  run.wave=5;run.lastPaidWave=4;run.earnedCrystals=4;run.spawned=waveConfig(5).count;
  state=step(state);
  expect(questProgress(state.profile,'waves')).toBe(5);
  const lobby={...state,run:null};
  const withWaves=claimLobbyReward(lobby,'waves',100);
  const withKills=claimLobbyReward(withWaves,'kills',100);
  expect(withKills.profile).toMatchObject({crystals:5,scrap:3,rewards:{claimed:['waves','kills']}});
  expect(startRun(withKills).profile.rewards?.kills).toBe(50);
 });
});
