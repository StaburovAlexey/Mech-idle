import { currencyIcon, priceText, priceMarkup } from './currency-ui';
import { armoredScrollMarkup } from './armored-scroll';
import { WORKSHOP_KEYS, COMBAT_UPGRADES, combatValueLabel, moduleCost, isScrapModule, isShopModule, type CombatUpgradeLevels, type CombatUpgrade } from './combat-upgrades';
import type { StatKey } from './game';
import { STAT_LABELS, statIcon, UPGRADE_CATEGORIES } from './battle-ui';
import { screenHeader, titleButton } from './title-ui';
import { armoredFrame } from './armored-frame';

function workshopCard(id: string, name: string, icon: StatKey, attribute: string, description = '', mixed = false) {
 return `<button type="button" class="workshop-row" id="workshop-${id}" ${attribute}="${id}">
    <span class="workshop-icon" aria-hidden="true">${statIcon(icon)}</span>
    <span class="workshop-data">
      <span class="workshop-name">${name}</span>
      ${description ? `<span class="workshop-description">${description}</span>` : ''}
      <span class="workshop-values"><span class="workshop-current"></span><strong class="workshop-next"></strong></span>
    </span>
    <span class="workshop-price">${mixed?'':`<span class="workshop-currency" aria-hidden="true">${currencyIcon('parts')}</span> <span class="workshop-amount"></span>`}</span>
  </button>`;
}

function workshopCombatCard(key: CombatUpgrade) {
 const {title,icon,description}=COMBAT_UPGRADES[key];
 return workshopCard(key,title,icon,'data-workshop-combat',description,isScrapModule(key));
}

export function renderWorkshopCombatUpgrade(button: HTMLButtonElement, key: CombatUpgrade, level: number, crystals: number, blocked: boolean, scrap = 0) {
 const {title,description}=COMBAT_UPGRADES[key], cost=moduleCost(key,level), owned=cost.parts===Infinity;
 const current=combatValueLabel(key,level), next=combatValueLabel(key,level+1);
 button.disabled=blocked||owned||crystals<cost.parts||scrap<cost.scrap;
 button.querySelector('.workshop-current')!.textContent=current;
 button.querySelector('.workshop-next')!.textContent=owned?'':`→ ${next}`;
 if(isScrapModule(key)){
  const price = button.querySelector<HTMLElement>('.workshop-price')!;
  price.classList.add('mixed-price');
  const key=owned?'':priceText(cost);
  if(price.dataset.value!==key){price.dataset.value=key;price.innerHTML=key?priceMarkup(cost):'';}
 }else{
  button.querySelector('.workshop-amount')!.textContent=owned?'':cost.parts.toLocaleString('ru-RU');
  button.querySelector('.workshop-currency')!.classList.toggle('hidden',owned);
 }
 button.setAttribute('aria-label',`${title}. ${description}. ${owned?current:`Сейчас: ${current}. После покупки: ${next}. Цена: ${priceText(cost)}.`}`);
}

export function visibleWorkshopKeys(levels: CombatUpgradeLevels = {}) {
 return WORKSHOP_KEYS.filter(key=>!isShopModule(key)||(levels[key]??0)>0);
}

export function workshopMarkup(levels?: CombatUpgradeLevels) {
 const keys=visibleWorkshopKeys(levels);
 return `
  ${screenHeader('МАСТЕРСКАЯ')}
  <div class="workshop-hero" aria-hidden="true"></div>
  ${armoredFrame('section', 'workshop-rack', `
    <div class="workshop-tabs" role="tablist" aria-label="Улучшения мастерской">
      ${UPGRADE_CATEGORIES.map(({id,label},i)=>`<button type="button" role="tab" id="workshop-tab-${id}" aria-controls="workshop-list-${id}" aria-selected="${i===0}" tabindex="${i===0?0:-1}">${label}</button>`).join('')}
    </div>
    ${UPGRADE_CATEGORIES.map(({id,stats},i)=>armoredScrollMarkup(`
      <div class="workshop-list" role="tabpanel" id="workshop-list-${id}" aria-labelledby="workshop-tab-${id}" tabindex="0"${i===0?'':' hidden'}>
        ${stats.map(stat=>workshopCard(stat,STAT_LABELS[stat].title,stat,'data-workshop-stat')).join('')}
        ${keys.filter(key=>COMBAT_UPGRADES[key].category===id).map(key=>workshopCombatCard(key)).join('')}
        ${id==='modules'&&!keys.some(key=>COMBAT_UPGRADES[key].category===id)?'<p class="workshop-empty">Купленные в магазине модули появятся здесь.</p>':''}
      </div>`)).join('')}
  `, 'Постоянные улучшения')}
  ${titleButton('workshop-back', 'Главное меню')}`;
}
