import { bindUpgradeTabs } from './battle-ui';
import { currencyIcon } from './currency-ui';
import type { Profile } from './game';
import { emptyLobbyRewards, QUESTS, questProgress, VISIT_REWARDS, visitAvailable, type LobbyRewardId } from './lobby-rewards';
import './lobby-rewards.css';

const calendar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4m-7 8 2 2 4-4"/></svg>';
const checklist = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 11l1 1 2-3m2 2h3m-8 6 1 1 2-3m2 2h3"/></svg>';
const tab=(id:string,text:string,icon:string,active:boolean)=>`<button class="battle-upgrade-tab" type="button" role="tab" id="rewards-tab-${id}" aria-controls="rewards-${id}" aria-selected="${active}" tabindex="${active?0:-1}"><span aria-hidden="true">${icon}</span>${text}${active?'':'<b class="reward-count" hidden></b>'}</button>`;
export const lobbyRewardsMarkup=`<div class="lobby-rewards">
 <div class="reward-tabs" role="tablist" aria-label="Категории наград">${tab('visits','За вход',calendar,true)}${tab('quests','Задания',checklist,false)}</div>
 <section id="rewards-visits" role="tabpanel" aria-labelledby="rewards-tab-visits"></section>
 <section id="rewards-quests" role="tabpanel" aria-labelledby="rewards-tab-quests" hidden></section>
 <p class="reward-feedback" role="status"></p>
</div>`;
const label = (kind:'parts'|'scrap', amount:number)=>kind==='parts'
 ? `${amount} ${amount===1?'деталь':amount<5?'детали':'деталей'}`
 : `${amount} ${amount===1?'обломок':amount<5?'обломка':'обломков'}`;
function amounts(row:{parts:number;scrap:number}) {
 return (['parts','scrap'] as const).filter(kind=>row[kind]).map(kind=>
  `<span class="reward-value" aria-label="${label(kind,row[kind])}">${currencyIcon(kind)}+${row[kind]}</span>`).join('');
}
const button=(id:LobbyRewardId,text:string,disabled:boolean)=>`<button class="title-button title-primary" type="button" data-lobby-reward="${id}"${disabled?' disabled':''}><span>${text}</span></button>`;

export function bindLobbyRewards(root:HTMLElement, refreshLayout:()=>void, claim:(id:LobbyRewardId)=>void) {
 const visits=root.querySelector<HTMLElement>('#rewards-visits')!,quests=root.querySelector<HTMLElement>('#rewards-quests')!;
 const badge=root.querySelector<HTMLElement>('.reward-count')!,feedback=root.querySelector<HTMLElement>('.reward-feedback')!;
 const dispose=bindUpgradeTabs(root,refreshLayout);
 root.addEventListener('click',event=>{
  const action=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-lobby-reward]');
  if(!action||action.disabled)return;
  claim(action.dataset.lobbyReward as LobbyRewardId);
 });
 let lastProfile:Profile|undefined,lastDay:number|undefined,lastBlocked:boolean|undefined;
 return {
  dispose,
  report:(message:string)=>{feedback.textContent=message;refreshLayout();},
  focusTab:()=>root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({preventScroll:true}),
  render(profile:Profile,day:number,blocked:boolean) {
   if(profile===lastProfile&&day===lastDay&&blocked===lastBlocked)return;
   lastProfile=profile;lastDay=day;lastBlocked=blocked;
   const progress=profile.rewards??emptyLobbyRewards(),available=visitAvailable(progress,day);
   const complete=progress.visits===VISIT_REWARDS.length;
   visits.innerHTML=`<section class="reward-section">
    <h3>Семь посещений</h3><p class="reward-copy">Забирай одну награду в день.</p>
    <div class="reward-cells">${VISIT_REWARDS.map((reward,i)=>{
     const today=i===progress.visits&&available,done=i<progress.visits;
     return `<div class="reward-day${i===6?' last':''}${today?' today':''}${done?' done':''}"><span>День ${i+1}${done?' · ✓':today?' · Сегодня':i===6?' · Бонус':''}</span><div>${amounts(reward)}</div></div>`;
    }).join('')}</div>
   </section>
   ${button('visit',complete?'Все награды получены':available?`Забрать награду дня ${progress.visits+1}`:'Сегодня уже получено',blocked||!available)}
   <p class="reward-foot">Получено: ${progress.visits} из ${VISIT_REWARDS.length}</p>`;
   let ready=0;
   quests.innerHTML=`<p class="quest-list-note">Задания не сгорают. Забирай награды, когда выполнишь условия.</p>
    <div class="quest-list">${QUESTS.map(q=>{
     const current=questProgress(profile,q.id),done=progress.claimed.includes(q.id),canClaim=!done&&current>=q.target;
     if(canClaim)ready++;
     const fraction=Math.min(100,100*current/q.target);
     return `<article class="quest${canClaim?' is-ready':''}"><h3>${q.title}</h3><p class="reward-copy">${current} / ${q.target} ${q.unit}</p>
      <div class="quest-progress" aria-hidden="true"><i style="width:${fraction}%"></i></div>
      <div class="quest-info"><div class="reward-amounts">${amounts(q)}</div>${canClaim?button(q.id,'Забрать',blocked):`<span class="quest-status">${done?'✓ Получено':'В процессе'}</span>`}</div></article>`;
    }).join('')}</div>`;
   badge.textContent=String(ready);badge.hidden=!ready;
   if(ready)badge.setAttribute('aria-label',`Наград к получению: ${ready}`);
   refreshLayout();
  },
 };
}
