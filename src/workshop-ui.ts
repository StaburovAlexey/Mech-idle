import { STAT_KEYS } from './game';
import { STAT_LABELS, statIcon } from './battle-ui';
import { screenHeader, titleButton } from './title-ui';
import { armoredFrame } from './armored-frame';

export const workshopMarkup = `
  ${screenHeader('МАСТЕРСКАЯ')}
  <div class="workshop-hero" aria-hidden="true"></div>
  ${armoredFrame('section', 'workshop-rack', `
    ${STAT_KEYS.map(stat => `
      <button type="button" class="workshop-row" id="workshop-${stat}" data-workshop-stat="${stat}">
        <span class="workshop-icon" aria-hidden="true">${statIcon(stat)}</span>
        <span class="workshop-data">
          <span class="workshop-name">${STAT_LABELS[stat].title}</span>
          <span class="workshop-values"><span class="workshop-current"></span><strong class="workshop-next"></strong></span>
        </span>
        <span class="workshop-price"><span class="workshop-currency" aria-hidden="true">◇</span> <span class="workshop-amount"></span></span>
      </button>`).join('')}
  `, 'Постоянные улучшения')}
  ${titleButton('workshop-back', 'Главное меню')}`;
