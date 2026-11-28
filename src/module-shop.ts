import { armoredFrame } from './armored-frame';
import { screenHeader, titleButton } from './title-ui';
import { workshopCombatCard } from './workshop-ui';

export const SHOP_MODULES = ['scanner', 'pulse', 'deflect'] as const;
export const moduleShopMarkup = `
 ${screenHeader('МАГАЗИН')}
 ${armoredFrame('section','module-shop-rack',SHOP_MODULES.map(key=>workshopCombatCard(key,'shop',false)).join(''),'Модули за кристаллы')}
 ${titleButton('module-shop-back','Главное меню')}
`;
