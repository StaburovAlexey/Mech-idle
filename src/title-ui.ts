// Native controls stay separate from the decorative art and retain normal focus/disabled behavior.
const button = (id: string, label: string, primary = false) =>
  `<button type="button" class="title-button${primary ? ' title-primary' : ''}" id="${id}"><span>${label}</span></button>`;

const bolts = '<i></i>'.repeat(4);
const bulb = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M12 23c0-5-5-6-5-12a9 9 0 0 1 18 0c0 6-5 7-5 12M12 25h8m-7 3h6m-3-5v-7m-4-3 4 3 4-3" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.1"/></svg>';

export const titleMarkup = `
  <h1 class="title-logo"><span>ОПЛОТ</span></h1>
  <div class="title-bank" aria-label="Кристаллы"><span aria-hidden="true">◇</span> <strong id="menu-crystals">0</strong></div>
  <nav class="title-console title-plate" aria-label="Главное меню">
    <div class="title-bolts" aria-hidden="true">${bolts}</div>
    <div class="title-seam" aria-hidden="true"><i></i><i></i><i></i></div>
    ${button('start', 'Начать бой', true)}
    ${button('resume', 'Продолжить', true)}
    ${button('open-workshop', 'Мастерская')}
    ${button('menu-help', 'Как играть')}
  </nav>
  <aside class="title-tip title-plate">
    <div class="title-bolts" aria-hidden="true">${bolts}</div>
    <div class="title-bulb">${bulb}</div>
    <div><strong>Совет</strong><p id="menu-hint">Улучшай турель между боями.</p></div>
  </aside>`;
