import { COMBAT_KEYS, COMBAT_UPGRADES, combatValueLabel, workshopCombatPrice, type CombatUpgrade } from './combat-upgrades';
import { STAT_KEYS, type StatKey } from './game';
import { STAT_LABELS, statIcon } from './battle-ui';
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

export function renderWorkshopCombatUpgrade(button: HTMLButtonElement, key: CombatUpgrade, level: number, crystals: number, blocked: boolean) {
 const {title,description}=COMBAT_UPGRADES[key], price=workshopCombatPrice(key,level), owned=price===Infinity;
 const current=combatValueLabel(key,level), next=combatValueLabel(key,level+1), coins=price.toLocaleString('ru-RU');
 button.disabled=blocked||owned||crystals<price;
 button.querySelector('.workshop-current')!.textContent=current;
 button.querySelector('.workshop-next')!.textContent=owned?'':`→ ${next}`;
 button.querySelector('.workshop-amount')!.textContent=owned?'':coins;
 button.querySelector('.workshop-currency')!.classList.toggle('hidden',owned);
 button.setAttribute('aria-label',`${title}. ${description}. ${owned?current:`Сейчас: ${current}. После покупки: ${next}. Цена: ${coins} кристаллов.`}`);
}

export const workshopMarkup = `
  ${screenHeader('МАСТЕРСКАЯ')}
  <div class="workshop-hero" aria-hidden="true"></div>
  ${armoredFrame('section', 'workshop-rack', `
    <div class="workshop-tabs" role="tablist" aria-label="Улучшения мастерской">
      <button type="button" role="tab" id="workshop-tab-base" aria-controls="workshop-list-base" aria-selected="true">Основные</button>
      <button type="button" role="tab" id="workshop-tab-special" aria-controls="workshop-list-special" aria-selected="false" tabindex="-1">Особые</button>
    </div>
    <div class="workshop-list" role="tabpanel" id="workshop-list-base" aria-labelledby="workshop-tab-base">
      ${STAT_KEYS.map(stat=>workshopCard(stat, STAT_LABELS[stat].title, stat, 'data-workshop-stat')).join('')}
    </div>
    <div class="workshop-list workshop-special" role="tabpanel" id="workshop-list-special" aria-labelledby="workshop-tab-special" tabindex="0" hidden>
      ${COMBAT_KEYS.map(key=>{
        const item=COMBAT_UPGRADES[key];
        return workshopCard(key,item.title,item.icon,'data-workshop-combat',item.description);
      }).join('')}
    </div>
  `, 'Постоянные улучшения')}
  ${titleButton('workshop-back', 'Главное меню')}`;
