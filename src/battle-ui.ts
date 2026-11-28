import { titleButton } from './title-ui';
import { chainPanelSheet } from './chain-panel';
import { currencyCounter, currencyIcon } from './currency-ui';
import { armoredScrollMarkup, bindArmoredScrollbars } from './armored-scroll';
import { COMBAT_UPGRADES, COMBAT_KEYS, combatValueLabel, combatUpgradePrice, type CombatUpgrade } from './combat-upgrades';
import { armoredFrame } from './armored-frame';
import type { PauseManager } from './persistence';
import {STAT_KEYS,type StatKey} from './game';

const statIcons = {
  damage: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  maxHp: '<path d="m12 3 8 3v5c0 5-3 8-8 10-5-2-8-5-8-10V6l8-3Zm0 4v10"/>',
  attackSpeed: '<path d="M2 13h5l3-8 4 14 3-6h5"/>',
  regen: '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>',
};
export const statIcon = (stat: StatKey) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${statIcons[stat]}</svg>`;

export const STAT_LABELS:Record<StatKey,{title:string,unit:string}>={damage:{title:'Сила атаки',unit:'урона'},maxHp:{title:'Бронекорпус',unit:'HP'},attackSpeed:{title:'Темп стрельбы',unit:'/с'},regen:{title:'Ремонт',unit:'HP/с'}};
export const SHORT_STAT_LABELS:Record<StatKey,string>={damage:'Урон',maxHp:'Корпус',attackSpeed:'Темп',regen:'Ремонт'};
function upgradeCard(id: string, title: string, short: string, icon: StatKey, extra = '') {
 return `<button class="upgrade" aria-label="${title}" type="button" ${extra} id="upgrade-${id}"><span class="battle-card-icon" aria-hidden="true">${statIcon(icon)}</span><div class="upgrade-top"><span class="upgrade-title"><span class="stat-label-full">${title}</span><span class="stat-label-short" aria-hidden="true">${short}</span></span></div><div class="upgrade-data"><span class="upgrade-value"></span><span class="upgrade-price">${currencyIcon('gold')}<span class="upgrade-cost"></span></span></div><div class="upgrade-sub"></div></button>`;
}
export function upgradeButtonsMarkup(stats: readonly StatKey[] = STAT_KEYS) {
 return stats.map(stat=>upgradeCard(stat,STAT_LABELS[stat].title,SHORT_STAT_LABELS[stat],stat,`data-stat="${stat}"`)).join('');
}
function combatUpgradeCard(key: CombatUpgrade) {
 const o = COMBAT_UPGRADES[key];
 return upgradeCard(key,o.title,o.title,o.icon,`data-combat-upgrade="${key}"`);
}

export function renderCombatUpgrade(button: HTMLButtonElement, key: CombatUpgrade, level: number, gold: number, blocked: boolean, permanent = 0) {
 const { title, description } = COMBAT_UPGRADES[key];
 const price = key==='scanner'&&level>0 ? Infinity : combatUpgradePrice(key,level-permanent), owned=price===Infinity;
 const current=combatValueLabel(key,level), next=combatValueLabel(key,level+1), coins=price.toLocaleString('ru-RU');
 button.disabled = blocked || owned || gold < price;
 button.classList.toggle('affordable',!button.disabled);
 const value = button.querySelector('.upgrade-value')!;
 const text = owned ? current : !level ? next : `${current} → ${next}`;
 if (value.textContent !== text) value.textContent = text;
 const priceLabel = button.querySelector('.upgrade-price')!;
 priceLabel.classList.toggle('hidden',owned);
 const cost = priceLabel.querySelector('.upgrade-cost')!, costText = owned ? '' : coins;
 if (cost.textContent !== costText) cost.textContent = costText;
 button.title = description;
 button.setAttribute('aria-label',`${title}. ${description}. ${owned?current:`Сейчас: ${current}. После покупки: ${next}. Цена: ${coins} золота.`}`);
}

export const UPGRADE_CATEGORIES: { id: string; label: string; icon: string; stats: StatKey[] }[] = [
 {id:'attack',label:'Атака',icon:statIcon('damage'),stats:['damage','attackSpeed']},
 {id:'defense',label:'Защита',icon:statIcon('maxHp'),stats:['maxHp']},
 {id:'repair',label:'Ремонт',icon:statIcon('regen'),stats:['regen']},
 {id:'modules',label:'Модули',icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5M12 12v9"/></svg>',stats:[]},
];

export const battleUpgradeDockMarkup = `
 <div class="battle-upgrade-tabs" role="tablist" aria-label="Категории улучшений">
  ${UPGRADE_CATEGORIES.map(({id,label,icon},i)=>`<button type="button" class="battle-upgrade-tab" role="tab" id="battle-tab-${id}" aria-controls="battle-upgrades-${id}" aria-selected="${i===0}" tabindex="${i===0?0:-1}"><span aria-hidden="true">${icon}</span>${label}</button>`).join('')}
 </div>
 ${armoredFrame('section','battle-upgrade-rack',UPGRADE_CATEGORIES.map(({id,stats},i)=>armoredScrollMarkup(`
  <div class="battle-upgrade-list" role="tabpanel" id="battle-upgrades-${id}" aria-labelledby="battle-tab-${id}" tabindex="0"${i===0?'':' hidden'}>
   ${upgradeButtonsMarkup(stats)}${COMBAT_KEYS.filter(key=>COMBAT_UPGRADES[key].category===id).map(combatUpgradeCard).join('')}
  </div>`)).join(''),'Боевые улучшения')}
`;

export function bindUpgradeTabs(dock: HTMLElement) {
 const tabs=[...dock.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
 const panels=[...dock.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
 const scrollbars=bindArmoredScrollbars(dock);
 function select(index: number) {
  tabs.forEach((tab,i)=>{
   tab.tabIndex=i===index?0:-1;
   tab.setAttribute('aria-selected',String(i===index));
   panels[i].hidden=i!==index;
  });
  scrollbars.refresh();
 }
 tabs.forEach((tab,i)=>{
  tab.onclick=()=>select(i);
  tab.onkeydown=event=>{
   const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:
    event.key==='ArrowLeft'?(i+tabs.length-1)%tabs.length:event.key==='ArrowRight'?(i+1)%tabs.length:-1;
   if(index<0)return;
   event.preventDefault();select(index);tabs[index].focus();
  };
 });
 select(0);
 return scrollbars.dispose;
}

export const bossBarMarkup=`<div id="boss" class="boss-bar hidden"><b>КОЛОСС / ТЯЖЁЛЫЙ МЕХ</b><div class="boss-track"><div class="boss-fill" id="boss-fill"></div></div></div>`;

/** Owns only the battle drawer pause. Never removes hidden or dialog pauses. */
export class BattleMenuController {
 open=false;
 constructor(private readonly pause:PauseManager){}
 show(){this.open=true;this.pause.add('battleMenu');}
 close(){this.open=false;this.pause.remove('battleMenu');}
 toggle(){this.open?this.close():this.show();}
}

export const battleHudMarkup = `<div class="battle-resources" aria-label="Ресурсы и состояние турели">
 <div class="battle-resource wave"><span>Волна</span><strong id="battle-wave">1 / 30</strong></div>
 ${currencyCounter('gold','battle-gold','battle-resource gold')}
 ${currencyCounter('parts','battle-parts','battle-resource parts')}
 ${currencyCounter('scrap','battle-scrap','battle-resource scrap')}
 <div class="battle-resource health" role="group" aria-label="Здоровье корпуса"><svg class="battle-hp-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21 3.7 13a5.4 5.4 0 0 1 7.7-7.6l.6.6.6-.6a5.4 5.4 0 0 1 7.7 7.6Z"/></svg><div class="health-track" aria-hidden="true"><div class="health-fill" id="battle-hp-fill"></div></div><strong id="battle-hp">100 / 100</strong></div>
 <button type="button" class="battle-menu-toggle" id="battle-menu-toggle" aria-label="Открыть меню боя" aria-haspopup="dialog" aria-expanded="false" aria-controls="battle-menu-overlay"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="m10 2-.6 2.5-2 .9-2.4-1.1-2 3.4 2 1.7v2.2l-2 1.7 2 3.4 2.4-1.1 2 .9.6 2.5h4l.6-2.5 2-.9 2.4 1.1 2-3.4-2-1.7V9.4l2-1.7-2-3.4-2.4 1.1-2-.9L14 2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" transform="translate(0 1.5)"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button></div><div id="battle-notice" class="battle-notice hidden" role="status"></div>`;

export const battleMenuMarkup = chainPanelSheet(`<section class="battle-menu-panel chain-panel-content" role="dialog" aria-modal="true" aria-labelledby="battle-menu-title" tabindex="-1">
 <h2 id="battle-menu-title">Меню боя</h2>
 <div class="menu-actions">
  ${titleButton('battle-menu-return','Вернуться в бой',true)}
  ${titleButton('battle-menu-sound','Звук: выключен')}
  ${titleButton('battle-menu-save','Сохранить и выйти',false,'Сохранить и выйти в главное меню')}
  ${titleButton('battle-menu-abandon','Завершить забег')}
 </div>
</section>`);

export function isInteractiveTarget(target:EventTarget|null):boolean {
 return target instanceof HTMLElement && !!target.closest('button,input,select,textarea,a,[contenteditable],[role=tabpanel]');
}
