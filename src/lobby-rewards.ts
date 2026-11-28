import type { GameState, Profile } from './game';

export const VISIT_REWARDS = [
 {parts:2,scrap:0}, {parts:3,scrap:0}, {parts:0,scrap:2},
 {parts:4,scrap:0}, {parts:0,scrap:3}, {parts:5,scrap:0}, {parts:6,scrap:4},
] as const;
export const QUESTS = [
 {id:'waves', title:'Отбей 5 волн за один бой', unit:'волн', target:5, parts:4, scrap:0},
 {id:'kills', title:'Уничтожь 50 мехов', unit:'мехов · за все бои', target:50, parts:0, scrap:3},
 {id:'workshop', title:'Улучши турель в мастерской', unit:'улучшение', target:1, parts:2, scrap:0},
] as const;
export type QuestId = typeof QUESTS[number]['id'];
export type LobbyRewardId = 'visit' | QuestId;
export interface LobbyRewardProgress {
 visits: number; lastDay: number | null;
 waves: number; kills: number; workshop: boolean; claimed: QuestId[];
}
export const emptyLobbyRewards = ():LobbyRewardProgress => ({visits:0,lastDay:null,waves:0,kills:0,workshop:false,claimed:[]});
// A local calendar date, independent of the length of the day at daylight-saving changes.
export const rewardDay = (now = new Date()) => Math.floor(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())/86_400_000);
export function visitAvailable(progress:LobbyRewardProgress,day:number) {
 return progress.visits<VISIT_REWARDS.length&&(progress.lastDay===null||day>progress.lastDay);
}
export function questProgress(profile:Profile,id:QuestId):number {
 const progress=profile.rewards;
 if(id==='workshop')return Number(Boolean(progress?.workshop||Object.values(profile.meta).some(level=>level>0)));
 return progress?.[id]??0;
}
export function questReady(profile:Profile,quest:typeof QUESTS[number]) {
 return !profile.rewards?.claimed.includes(quest.id)&&questProgress(profile,quest.id)>=quest.target;
}
export function claimLobbyReward(state:GameState,id:LobbyRewardId,day:number):GameState {
 if(state.result?.rewardPending||!Number.isSafeInteger(day)||day<0||day>100_000_000)return state;
 const old=state.profile.rewards??emptyLobbyRewards();
 let reward:{parts:number;scrap:number};
 if(id==='visit'){
  if(!visitAvailable(old,day))return state;
  reward=VISIT_REWARDS[old.visits];
 }else{
  const quest=QUESTS.find(q=>q.id===id);
  if(!quest||!questReady(state.profile,quest))return state;
  reward=quest;
 }
 const parts=state.profile.crystals+reward.parts,scrap=(state.profile.scrap??0)+reward.scrap;
 if(parts>1e9||scrap>1e9)return state;
 const rewards=id==='visit'
  ? {...old,visits:old.visits+1,lastDay:day}
  : {...old,claimed:[...old.claimed,id]};
 return {...state,profile:{...state.profile,crystals:parts,scrap,rewards},events:[]};
}

export function validLobbyRewards(value:unknown):value is LobbyRewardProgress {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const r=value as LobbyRewardProgress;
 const whole=(n:number,max:number)=>Number.isInteger(n)&&n>=0&&n<=max;
 return Object.keys(r).length===6&&whole(r.visits,VISIT_REWARDS.length)
  &&(r.visits===0?r.lastDay===null:r.lastDay!==null&&whole(r.lastDay,100_000_000))
  &&whole(r.waves,5)&&whole(r.kills,50)&&typeof r.workshop==='boolean'
  &&Array.isArray(r.claimed)&&new Set(r.claimed).size===r.claimed.length
  &&r.claimed.every(id=>QUESTS.some(q=>q.id===id));
}
