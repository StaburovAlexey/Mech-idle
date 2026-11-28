import { armoredScrollMarkup } from './armored-scroll';
import { priceMarkup, priceText } from './currency-ui';
import { armoredFrame } from './armored-frame';
import { statIcon } from './battle-ui';
import { COMBAT_UPGRADES, SHOP_MODULES, combatValueLabel, moduleCost, isScrapModule, type ShopModule } from './combat-upgrades';
import { screenHeader, titleButton } from './title-ui';
function shopCard(key: ShopModule) {
 const {title,icon}=COMBAT_UPGRADES[key];
 return `<button class="workshop-row module-shop-card" type="button" id="shop-${key}" aria-haspopup="dialog">
  <span class="workshop-icon" aria-hidden="true">${statIcon(icon)}</span>
  <span class="workshop-data"><span class="workshop-name">${title}</span><span class="module-shop-more">Подробнее</span></span>
  <span class="workshop-price">${priceMarkup(moduleCost(key,0))}</span>
  <span class="module-shop-ribbon" aria-hidden="true">Куплено</span>
 </button>`;
}

export const moduleShopMarkup = `
 ${screenHeader('МАГАЗИН')}
 ${armoredFrame('section','module-shop-rack',armoredScrollMarkup(`<div class="module-shop-list" role="region" aria-label="Список модулей" tabindex="0">${SHOP_MODULES.map(shopCard).join('')}</div>`))}
 ${titleButton('module-shop-back','Главное меню')}
`;

export function renderShopCard(button: HTMLButtonElement, key: ShopModule, level: number) {
 const purchased=level>0;
 button.classList.toggle('purchased',purchased);
 button.setAttribute('aria-label',`${COMBAT_UPGRADES[key].title}. ${purchased?'Куплено':`Цена: ${priceText(moduleCost(key,0))}`}. Подробнее`);
}

const descriptions: Partial<Record<ShopModule,string>> = {
 scanner: 'Даёт приоритет стрелкам в радиусе огня при выборе новой цели. Уже захваченную цель турель не бросает.',
 pulse: 'Замедляет мехов в радиусе 4 вокруг турели на 40% на 1 секунду.',
 lootDetector: 'Повышает шанс появления добычи с каждого врага. На арене не больше трёх кучек одновременно.',
 lootExtractor: 'Повышает шанс получить ×2 или ×3 единицы каждого выпавшего ресурса. Не меняет шанс выпадения.',
 deflect: 'Гасит один вражеский снаряд, достигший турели. Не защищает от ударов ближнего боя.',
};
const detailLabels: Partial<Record<ShopModule,string>> = {
 lootDetector:'Шанс выпадения', lootExtractor:'Шансы ×1 / ×2 / ×3',
 hullArmor:'Снижение урона в ближнем бою', boltScreen:'Снижение урона от снарядов',
 fastTracker:'Бонус урона по быстрым мехам', finisher:'Бонус урона по ослабленным врагам',
 waveRegen:'Восстановление от максимума корпуса',
};
export function moduleDetailContent(key: ShopModule) {
 const item=COMBAT_UPGRADES[key];
 return {
  title:item.title,subtitle:'Модуль',leading:`<span class="workshop-icon" aria-hidden="true">${statIcon(item.icon)}</span>`,
  headingId:'module-detail-heading',closeId:'module-detail-close',descriptionId:'module-detail-description',
  body:`<p id="module-detail-description" class="chain-panel-description">${descriptions[key]??item.description}</p>
    ${key==='scanner'?'':`<div class="module-detail-stats"><div><small>${detailLabels[key]??'Перезарядка'}</small><strong id="module-detail-cooldown"></strong></div></div>`}
    <p class="module-detail-note" id="module-detail-note" role="status"></p>
    ${titleButton('module-detail-buy','Купить',true)}`,
 };
}
export function renderModuleDetail(root: HTMLElement, key: ShopModule, level: number, crystals: number, blocked: boolean, scrap = 0) {
 const cost=moduleCost(key,0), bought=level>0;
 const cooldown=root.querySelector('#module-detail-cooldown');
 if(cooldown)cooldown.textContent=combatValueLabel(key,Math.max(1,level));
 const locked=key==='scanner'?'Сканер не требует прокачки.':isScrapModule(key)?'Улучшай за обломки и детали в мастерской.':'Улучшай модуль за детали в мастерской.';
 const missing={parts:Math.max(0,cost.parts-crystals),scrap:Math.max(0,cost.scrap-scrap)};
 const short=priceText(missing);
 root.querySelector('#module-detail-note')!.textContent=bought?locked:
  short?(cost.scrap?`Не хватает: ${short}.`:`Не хватает деталей: ${missing.parts}.`):'Действует с начала каждого забега.';
 const button=root.querySelector<HTMLButtonElement>('#module-detail-buy')!;
 button.disabled=blocked||bought||!!short;
 const caption=bought?'Куплено':`Купить за ${priceText(cost)}`;
 button.setAttribute('aria-label',caption);
 const label=button.querySelector('span')!;
 if(label.dataset.label!==caption) {
  label.dataset.label=caption;
  label.innerHTML=bought?'Куплено':`Купить за ${priceMarkup(cost)}`;
 }
}
