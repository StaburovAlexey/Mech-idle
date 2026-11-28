import { currencyIcon } from './currency-ui';
import { armoredFrame } from './armored-frame';
import { statIcon } from './battle-ui';
import { COMBAT_UPGRADES, SHOP_MODULES, combatValueLabel, workshopCombatPrice, type ShopModule } from './combat-upgrades';
import { screenHeader, titleButton } from './title-ui';
function shopCard(key: ShopModule) {
 const {title,icon}=COMBAT_UPGRADES[key];
 return `<button class="workshop-row module-shop-card" type="button" id="shop-${key}" aria-haspopup="dialog">
  <span class="workshop-icon" aria-hidden="true">${statIcon(icon)}</span>
  <span class="workshop-data"><span class="workshop-name">${title}</span><span class="module-shop-more">Подробнее</span></span>
  <span class="workshop-price"><span class="workshop-currency" aria-hidden="true">${currencyIcon('parts')}</span> ${workshopCombatPrice(key,0)}</span>
  <span class="module-shop-ribbon" aria-hidden="true">Куплено</span>
 </button>`;
}

export const moduleShopMarkup = `
 ${screenHeader('МАГАЗИН')}
 ${armoredFrame('section','module-shop-rack',SHOP_MODULES.map(shopCard).join(''),'Модули за детали')}
 ${titleButton('module-shop-back','Главное меню')}
`;

export function renderShopCard(button: HTMLButtonElement, key: ShopModule, level: number) {
 const purchased=level>0;
 button.classList.toggle('purchased',purchased);
 button.setAttribute('aria-label',`${COMBAT_UPGRADES[key].title}. ${purchased?'Куплено':`Цена: ${workshopCombatPrice(key,0)} деталей`}. Подробнее`);
}

const descriptions: Record<ShopModule,string> = {
 scanner: 'Даёт приоритет стрелкам в радиусе огня при выборе новой цели. Уже захваченную цель турель не бросает.',
 pulse: 'Замедляет мехов в радиусе 4 вокруг турели на 40% на 1 секунду.',
 deflect: 'Гасит один вражеский снаряд, достигший турели. Не защищает от ударов ближнего боя.',
};
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
    ${key==='scanner'?'':`<div class="module-detail-stats"><div><small>Перезарядка</small><strong id="module-detail-cooldown"></strong></div></div>`}
    <p class="module-detail-note" id="module-detail-note" role="status"></p>
    ${titleButton('module-detail-buy','Купить',true)}
   </div>
  `)}
 </div>`;
}

export function renderModuleDetail(root: HTMLElement, key: ShopModule, level: number, crystals: number, blocked: boolean) {
 const price=workshopCombatPrice(key,0), bought=level>0;
 const cooldown=root.querySelector('#module-detail-cooldown');
 if(cooldown)cooldown.textContent=combatValueLabel(key,Math.max(1,level));
 const locked=key==='scanner'?'Сканер не требует прокачки.':'Улучшай модуль за детали в мастерской.';
 root.querySelector('#module-detail-note')!.textContent=bought?locked:
  crystals<price?`Не хватает деталей: ${price-crystals}.`:'Действует с начала каждого забега.';
 const button=root.querySelector<HTMLButtonElement>('#module-detail-buy')!;
 button.disabled=blocked||bought||crystals<price;
 const caption=bought?'Куплено':`Купить за ${price} деталей`;
 button.setAttribute('aria-label',caption);
 const label=button.querySelector('span')!;
 if(label.dataset.label!==caption) {
  label.dataset.label=caption;
  label.innerHTML=bought?'Куплено':`Купить за ${currencyIcon('parts')} ${price}`;
 }
}
