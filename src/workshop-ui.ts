import { STAT_KEYS } from './game';
import { STAT_LABELS } from './battle-ui';
import { screenHeader, titleButton } from './title-ui';
import { armoredFrame } from './armored-frame';

const icons = {
  damage: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  maxHp: '<path d="m12 3 8 3v5c0 5-3 8-8 10-5-2-8-5-8-10V6l8-3Zm0 4v10"/>',
  attackSpeed: '<path d="M2 13h5l3-8 4 14 3-6h5"/>',
  regen: '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>',
};

export const workshopMarkup = `
  ${screenHeader('МАСТЕРСКАЯ')}
  <div class="workshop-hero" aria-hidden="true"></div>
  ${armoredFrame('section', 'workshop-rack', `
    ${STAT_KEYS.map(stat => `
      <button type="button" class="workshop-row" id="workshop-${stat}" data-workshop-stat="${stat}">
        <span class="workshop-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[stat]}</svg></span>
        <span class="workshop-data">
          <span class="workshop-name">${STAT_LABELS[stat].title}</span>
          <span class="workshop-values"><span class="workshop-current"></span><strong class="workshop-next"></strong></span>
        </span>
        <span class="workshop-price"><span class="workshop-currency" aria-hidden="true">◇</span> <span class="workshop-amount"></span></span>
      </button>`).join('')}
  `, 'Постоянные улучшения')}
  ${titleButton('workshop-back', 'Главное меню')}`;
