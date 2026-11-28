import gold from './assets/currency/gold.svg';
import parts from './assets/currency/parts.svg';
import scrap from './assets/currency/scrap.svg';

const icons = {gold,parts,scrap};
export const currencyLabels = {gold:'Золото',parts:'Детали',scrap:'Обломки'};
type Currency = keyof typeof icons;

export const currencyIcon = (kind:Currency) =>
 `<img class="currency-icon" data-currency-icon="${kind}" src="${icons[kind]}" width="18" height="18" alt="" aria-hidden="true" draggable="false">`;

export const currencyCounter = (kind:Currency,id:string,classes:string) =>
 `<div class="${classes}" role="group" aria-label="${currencyLabels[kind]}">${currencyIcon(kind)}<span class="currency-label" aria-hidden="true">${currencyLabels[kind]}</span><strong id="${id}">0</strong></div>`;

export const currencyBank = (prefix:string) =>
 `<div class="title-bank">${currencyCounter('parts',prefix+'-parts','title-balance')}${currencyCounter('scrap',prefix+'-scrap','title-balance')}</div>`;

type Price = {parts:number;scrap:number};
export const priceText = ({parts,scrap}:Price) =>
 [parts && parts.toLocaleString('ru-RU')+' деталей',scrap && scrap.toLocaleString('ru-RU')+' обломков'].filter(Boolean).join(' + ');
export const priceMarkup = (cost:Price) => (['parts','scrap'] as const).filter(kind=>cost[kind]>0)
 .map(kind=>`<span class="currency-price-line">${currencyIcon(kind)} ${cost[kind].toLocaleString('ru-RU')}</span>`).join('');
