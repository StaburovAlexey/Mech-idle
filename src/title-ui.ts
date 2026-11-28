import { armoredFrame } from './armored-frame';

// Native controls stay separate from the decorative art and retain normal focus/disabled behavior.
export const titleButton = (id: string, label: string, primary = false) =>
  `<button type="button" class="title-button${primary ? ' title-primary' : ''}" id="${id}"><span>${label}</span></button>`;

const titleBank = '<div class="title-bank" role="group" aria-label="Кристаллы"><span aria-hidden="true">◇</span> <strong id="menu-crystals">0</strong></div>';
export const screenHeader = (title: string) => `
  <header class="screen-header">
    <h1 class="title-logo" id="screen-heading" tabindex="-1"><span>${title}</span></h1>
    ${titleBank}
  </header>`;
const bulb = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M12 23c0-5-5-6-5-12a9 9 0 0 1 18 0c0 6-5 7-5 12M12 25h8m-7 3h6m-3-5v-7m-4-3 4 3 4-3" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.1"/></svg>';

export const titleMarkup = `
  ${screenHeader('ОПЛОТ')}
  <div class="menu-announcement-slot"></div>
  ${armoredFrame('nav', 'title-console', `
    ${titleButton('start', 'Начать бой', true)}
    ${titleButton('resume', 'Продолжить', true)}
    ${titleButton('open-workshop', 'Мастерская')}
    ${titleButton('open-module-shop', 'Магазин')}
    ${titleButton('menu-help', 'Как играть')}
    <div class="title-vents" aria-hidden="true"><i></i><i></i><i></i></div>
  `, 'Главное меню')}
  ${armoredFrame('aside', 'title-tip', `
    <div class="title-bulb">${bulb}</div>
    <div><strong>Совет</strong><p id="menu-hint">Улучшай турель между боями.</p></div>
  `)}`;
