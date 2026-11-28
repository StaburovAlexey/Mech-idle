import { armoredFrame } from './armored-frame';
import { statIcon } from './battle-ui';
import { COMBAT_UPGRADES, SHOP_MODULES, combatValueLabel, workshopCombatPrice, type ShopModule } from './combat-upgrades';
import { screenHeader, titleButton } from './title-ui';
import { workshopCombatCard } from './workshop-ui';

export const moduleShopMarkup = `
 ${screenHeader('МАГАЗИН')}
 ${armoredFrame('section','module-shop-rack',SHOP_MODULES.map(key=>workshopCombatCard(key,'shop',false)).join(''),'Модули за кристаллы')}
 ${titleButton('module-shop-back','Главное меню')}
`;

export function renderShopCard(button: HTMLButtonElement, key: ShopModule, level: number) {
 const purchased=level>0;
 button.setAttribute('aria-haspopup','dialog');
 button.setAttribute('aria-label',`${COMBAT_UPGRADES[key].title}. ${purchased?'Куплен':`Цена: ${workshopCombatPrice(key,0)} кристаллов`}. Подробнее`);
 button.querySelector('.workshop-current')!.textContent=purchased?'Куплен':'Подробнее';
 button.querySelector('.workshop-amount')!.textContent=purchased?'':String(workshopCombatPrice(key,0));
 button.querySelector('.workshop-currency')!.classList.toggle('hidden',purchased);
}

const descriptions: Record<ShopModule,string> = {
 scanner: 'Даёт приоритет стрелкам в радиусе огня при выборе новой цели. Уже захваченную цель турель не бросает.',
 pulse: 'Замедляет мехов в радиусе 4 вокруг турели на 40% на 1 секунду.',
 deflect: 'Гасит один вражеский снаряд, достигший турели. Не защищает от ударов ближнего боя.',
};
function effectLabel(key: ShopModule, level: number) {
 if (!level) return 'Выключен';
 return key === 'scanner' ? 'Включён' : `Раз в ${combatValueLabel(key,level)}`;
}
export function moduleDetailMarkup(key: ShopModule) {
 const item=COMBAT_UPGRADES[key];
 return `<div class="module-detail-layer">
  ${armoredFrame('section','module-detail-sheet',`
   <span class="module-detail-chain left" aria-hidden="true"></span><span class="module-detail-chain right" aria-hidden="true"></span>
   <div class="module-detail-content" role="dialog" aria-modal="true" aria-labelledby="module-detail-heading" aria-describedby="module-detail-description">
    <header class="module-detail-head">
     <span class="workshop-icon" aria-hidden="true">${statIcon(item.icon)}</span>
     <div><small>Модуль</small><h2 id="module-detail-heading">${item.title}</h2></div>
     <button type="button" id="module-detail-close" aria-label="Закрыть">×</button>
    </header>
    <p id="module-detail-description">${descriptions[key]}</p>
    <div class="module-detail-stats">
     <div><small>Сейчас</small><strong id="module-detail-current"></strong></div>
     <div id="module-detail-preview"><small>После покупки</small><strong>${effectLabel(key,1)}</strong></div>
    </div>
    <p class="module-detail-note" id="module-detail-note" role="status"></p>
    ${titleButton('module-detail-buy','Купить',true)}
   </div>
  `)}
 </div>`;
}

export function renderModuleDetail(root: HTMLElement, key: ShopModule, level: number, crystals: number, blocked: boolean) {
 const price=workshopCombatPrice(key,0), bought=level>0;
 root.querySelector('#module-detail-current')!.textContent=effectLabel(key,level);
 root.querySelector('#module-detail-preview')!.classList.toggle('hidden',bought);
 const locked=key==='scanner'?'Сканер не требует прокачки.':'Улучшай модуль за кристаллы в мастерской.';
 root.querySelector('#module-detail-note')!.textContent=bought?locked:
  crystals<price?`Не хватает кристаллов: ${price-crystals}.`:'Действует с начала каждого забега.';
 const button=root.querySelector<HTMLButtonElement>('#module-detail-buy')!;
 button.disabled=blocked||bought||crystals<price;
 button.querySelector('span')!.textContent=bought?'Куплен':`Купить за ◇ ${price}`;
}
