import { STAT_KEYS } from './game';
import { STAT_LABELS } from './battle-ui';
import { titleBank, titleBolts, titleButton, titleSeam } from './title-ui';

const icons = {
  damage: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  maxHp: '<path d="m12 3 8 3v5c0 5-3 8-8 10-5-2-8-5-8-10V6l8-3Zm0 4v10"/>',
  attackSpeed: '<path d="M2 13h5l3-8 4 14 3-6h5"/>',
  regen: '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>',
};

export const workshopMarkup = `
  <header class="workshop-head">
    <h1 class="title-logo" id="workshop-heading" tabindex="-1"><span>Мастерская</span></h1>
    ${titleBank}
  </header>
  <div class="workshop-hero" aria-hidden="true"></div>
  <section class="workshop-rack title-plate" aria-label="Постоянные улучшения">
    ${titleBolts}${titleSeam}
    ${STAT_KEYS.map(stat => `
      <article class="workshop-row" id="workshop-${stat}">
        <span class="workshop-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[stat]}</svg></span>
        <div class="workshop-data">
          <h2>${STAT_LABELS[stat].title}</h2>
          <div class="workshop-values"><span class="workshop-current"></span><strong class="workshop-next"></strong></div>
        </div>
        <div class="workshop-buy">
          <button type="button" class="title-button title-primary" data-workshop-stat="${stat}"><span></span></button>
          <span class="workshop-level"></span>
        </div>
      </article>`).join('')}
  </section>
  ${titleButton('workshop-back', 'Главное меню')}`;
