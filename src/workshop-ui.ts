import { armoredScrollMarkup } from './armored-scroll';
import { COMBAT_KEYS, COMBAT_UPGRADES, combatValueLabel, workshopCombatPrice, isShopModule, type CombatUpgrade } from './combat-upgrades';
import type { StatKey } from './game';
import { STAT_LABELS, statIcon, UPGRADE_CATEGORIES } from './battle-ui';
import { screenHeader, titleButton } from './title-ui';
import { armoredFrame } from './armored-frame';

function workshopCard(id: string, name: string, icon: StatKey, attribute: string, description = '') {
 return `<button type="button" class="workshop-row" id="workshop-${id}" ${attribute}="${id}">
    <span class="workshop-icon" aria-hidden="true">${statIcon(icon)}</span>
    <span class="workshop-data">
      <span class="workshop-name">${name}</span>
      ${description ? `<span class="workshop-description">${description}</span>` : ''}
      <span class="workshop-values"><span class="workshop-current"></span><strong class="workshop-next"></strong></span>
    </span>
    <span class="workshop-price"><span class="workshop-currency" aria-hidden="true">◇</span> <span class="workshop-amount"></span></span>
  </button>`;
}

function workshopCombatCard(key: CombatUpgrade) {
 const {title,icon,description}=COMBAT_UPGRADES[key];
 return workshopCard(key,title,icon,'data-workshop-combat',description);
}

export function renderWorkshopCombatUpgrade(button: HTMLButtonElement, key: CombatUpgrade, level: number, crystals: number, blocked: boolean) {
 const {title,description}=COMBAT_UPGRADES[key], price=workshopCombatPrice(key,level), owned=price===Infinity;
 const locked=isShopModule(key)&&!level;
 const current=locked?'Купи в магазине':combatValueLabel(key,level), next=combatValueLabel(key,level+1), coins=price.toLocaleString('ru-RU');
 button.disabled=blocked||owned||locked||crystals<price;
 button.querySelector('.workshop-current')!.textContent=current;
 button.querySelector('.workshop-next')!.textContent=owned||locked?'':`→ ${next}`;
 button.querySelector('.workshop-amount')!.textContent=owned||locked?'':coins;
 button.querySelector('.workshop-currency')!.classList.toggle('hidden',owned||locked);
 button.setAttribute('aria-label',`${title}. ${description}. ${owned||locked?current:`Сейчас: ${current}. После покупки: ${next}. Цена: ${coins} кристаллов.`}`);
}

export const workshopMarkup = `
  ${screenHeader('МАСТЕРСКАЯ')}
  <div class="workshop-hero" aria-hidden="true"></div>
  ${armoredFrame('section', 'workshop-rack', `
    <div class="workshop-tabs" role="tablist" aria-label="Улучшения мастерской">
      ${UPGRADE_CATEGORIES.map(({id,label},i)=>`<button type="button" role="tab" id="workshop-tab-${id}" aria-controls="workshop-list-${id}" aria-selected="${i===0}" tabindex="${i===0?0:-1}">${label}</button>`).join('')}
    </div>
    ${UPGRADE_CATEGORIES.map(({id,stats},i)=>armoredScrollMarkup(`
      <div class="workshop-list" role="tabpanel" id="workshop-list-${id}" aria-labelledby="workshop-tab-${id}" tabindex="0"${i===0?'':' hidden'}>
        ${stats.map(stat=>workshopCard(stat,STAT_LABELS[stat].title,stat,'data-workshop-stat')).join('')}
        ${COMBAT_KEYS.filter(key=>COMBAT_UPGRADES[key].category===id).map(key=>workshopCombatCard(key)).join('')}
      </div>`)).join('')}
  `, 'Постоянные улучшения')}
  ${titleButton('workshop-back', 'Главное меню')}`;
