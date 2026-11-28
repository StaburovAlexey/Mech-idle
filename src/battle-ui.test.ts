// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { BattleMenuController, battleHudMarkup, battleMenuMarkup, bossBarMarkup, battleUpgradeDockMarkup, bindUpgradeTabs, upgradeButtonsMarkup, STAT_LABELS, isInteractiveTarget } from './battle-ui';
import { STAT_KEYS } from './game';
import { PauseManager } from './persistence';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const css = readFileSync(`${process.cwd()}/src/style.css`, 'utf8');
// Inspect authored rules, including every responsive override. This deliberately
// does not claim CSS layout, rendered pixels, or actual browser asset loading.
const chainCss = readFileSync(`${process.cwd()}/src/chain-panel.css`, 'utf8');
const rules = [...(css + '\n' + chainCss).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]+)\}/g)].map(match => ({
  selectors: match[1].split(',').map(selector => selector.trim().replace(/\s+/g, ' ')),
  declarations: Object.fromEntries(match[2].split(';').filter(value => value.trim()).map(value => {
    const colon = value.indexOf(':');
    return [value.slice(0, colon).trim(), value.slice(colon + 1).trim()];
  })),
}));
const rulesFor = (selector: string) => rules.filter(rule => rule.selectors.includes(selector)).map(rule => rule.declarations);
const combinedRulesFor = (selector: string): Record<string, string> => Object.assign({}, ...rulesFor(selector));

afterEach(() => { document.body.innerHTML = ''; });

describe('battle drawer owns only its own pause reason', () => {
  it('pauses on open and resumes on close when no other reason exists', () => {
    const pause = new PauseManager(), menu = new BattleMenuController(pause);
    expect(menu.open).toBe(false);
    expect(pause.paused).toBe(false);
    menu.show();
    expect(menu.open).toBe(true);
    expect([...pause.reasons]).toEqual(['battleMenu']);
    menu.close();
    expect(menu.open).toBe(false);
    expect(pause.paused).toBe(false);
  });

  it.each(['user', 'hidden', 'dialog', 'platformAd', 'menu'])(
    'does not clear an existing %s pause when closed or toggled repeatedly', reason => {
      const pause = new PauseManager(), menu = new BattleMenuController(pause);
      pause.add(reason);
      menu.show(); menu.show(); menu.close(); menu.close();
      expect([...pause.reasons]).toEqual([reason]);
      menu.toggle(); menu.toggle();
      expect(menu.open).toBe(false);
      expect([...pause.reasons]).toEqual([reason]);
      expect(pause.paused).toBe(true);
    },
  );

  it('preserves reasons added while open and permits an independent reason to be removed', () => {
    const pause = new PauseManager(), menu = new BattleMenuController(pause);
    pause.add('user'); menu.show(); pause.add('hidden'); pause.add('dialog'); pause.remove('user');
    expect(pause.paused).toBe(true);
    menu.close();
    expect([...pause.reasons]).toEqual(['hidden', 'dialog']);
    pause.remove('dialog'); expect(pause.paused).toBe(true);
    pause.remove('hidden'); expect(pause.paused).toBe(false);
  });
});

describe('battle controls and keyboard target semantics', () => {
  it('shows only wave, HP and resources plus one menu trigger in the compact HUD', () => {
    document.body.innerHTML = battleHudMarkup;
    expect([...document.querySelectorAll('.battle-resource')].length).toBe(5);
    for (const id of ['battle-wave', 'battle-hp', 'battle-hp-fill', 'battle-gold', 'battle-parts','battle-scrap']) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBe(1);
    expect(buttons[0].id).toBe('battle-menu-toggle');
    expect(buttons[0].getAttribute('aria-haspopup')).toBe('dialog');
    expect(buttons[0].getAttribute('aria-expanded')).toBe('false');
    expect(buttons[0].getAttribute('aria-controls')).toBe('battle-menu-overlay');
  });

  it('keeps all secondary controls inside a labelled modal drawer', () => {
    document.body.innerHTML = battleMenuMarkup;
    const drawer = document.querySelector('[role="dialog"]')!;
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(drawer.getAttribute('aria-labelledby')!)?.textContent).toBeTruthy();
    for (const suffix of ['return', 'settings', 'save', 'abandon']) {
      expect(drawer.querySelector(`#battle-menu-${suffix}`)).not.toBeNull();
    }
    expect(drawer.querySelectorAll('#battle-menu-actions button')).toHaveLength(4);
  });

  it('exports the same four complete upgrade controls used by the game and review fixture', () => {
    document.body.innerHTML = `<section id="upgrades">${upgradeButtonsMarkup()}</section>`;
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('#upgrades > button')];
    expect(buttons).toHaveLength(4);
    expect(buttons.map(button => button.dataset.stat)).toEqual([...STAT_KEYS]);
    for (const [index, button] of buttons.entries()) {
      const stat = STAT_KEYS[index];
      expect(button.id).toBe(`upgrade-${stat}`);
      expect(button.getAttribute('aria-label')).toBe(STAT_LABELS[stat].title);
      expect(button.querySelector('.upgrade-title')?.textContent).toContain(STAT_LABELS[stat].title);
      for (const selector of ['.upgrade-top', '.upgrade-data', '.upgrade-value', '.upgrade-price', '.upgrade-sub']) {
        expect(button.querySelectorAll(selector)).toHaveLength(1);
      }
    }
  });

  it('switches labelled upgrade categories by click and keyboard without cloning or losing cards', () => {
    document.body.innerHTML = `<section id="dock">${battleUpgradeDockMarkup}</section>`;
    const dock = document.getElementById('dock')!;
    bindUpgradeTabs(dock);
    const tabs = [...dock.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const visible = () => [...dock.querySelectorAll('[role="tabpanel"]:not([hidden])')];
    expect(visible().map(panel => panel.id)).toEqual(['battle-upgrades-attack']);
    expect([...dock.querySelectorAll('.upgrade[data-stat]')].map(card => (card as HTMLElement).dataset.stat).sort()).toEqual([...STAT_KEYS].sort());
    tabs[1].click();
    expect(visible()[0].querySelector('#upgrade-maxHp')).not.toBeNull();
    tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(visible()[0].querySelector('#upgrade-regen')).not.toBeNull();
    expect(document.activeElement).toBe(tabs[2]);
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['false','false','true','false']);
    tabs[3].click();
    expect(visible()[0].querySelectorAll('.upgrade')).toHaveLength(2);
    expect(visible()[0].querySelector('#upgrade-scanner')).not.toBeNull();
  });

  it('keeps the boss and notice in the status component without adding secondary controls', () => {
    document.body.innerHTML = `<div id="battle-hud">${battleHudMarkup}${bossBarMarkup}</div>`;
    const hud = document.getElementById('battle-hud')!;
    expect(hud.querySelector('#boss')?.parentElement).toBe(hud);
    expect(hud.querySelector('#battle-notice')?.parentElement).toBe(hud);
    expect(hud.querySelector('#battle-notice')?.getAttribute('role')).toBe('status');
    expect(hud.querySelectorAll('button')).toHaveLength(1);
  });

  it.each([
    '<button><span id="target">Label</span></button>',
    '<input id="target">', '<select id="target"></select>', '<textarea id="target"></textarea>',
    '<a href="#"><span id="target">Link</span></a>', '<div contenteditable><span id="target">Text</span></div>',
  ])('ignores game shortcuts inside interactive markup: %s', markup => {
    document.body.innerHTML = markup;
    expect(isInteractiveTarget(document.getElementById('target'))).toBe(true);
  });

  it('accepts noninteractive game targets and safely rejects missing or non-element targets', () => {
    document.body.innerHTML = '<div id="arena"><canvas></canvas></div>';
    expect(isInteractiveTarget(document.querySelector('canvas'))).toBe(false);
    expect(isInteractiveTarget(document)).toBe(false);
    expect(isInteractiveTarget(null)).toBe(false);
  });
});

describe('battle layout stylesheet contract (static, not a browser layout measurement)', () => {
  it('reserves control rows while the scene spans the transparent gaps', () => {
    expect(combinedRulesFor('.shell.in-battle')).toMatchObject({
      position: 'fixed', inset: '0', display: 'grid', height: '100cqh',
      'grid-template-rows': 'auto minmax(0,1fr) auto', 'min-height': '0', overflow: 'hidden',
    });
    for (const [selector, row] of [['.shell.in-battle .battle-hud', '1'], ['.shell.in-battle .workspace', '1/-1'], ['.shell.in-battle .upgrades', '3']]) {
      expect(combinedRulesFor(selector)).toMatchObject({ 'grid-row': row, 'grid-column': '1' });
      for (const rule of rulesFor(selector)) {
        if (rule.position) expect(['static', 'relative']).toContain(rule.position);
        for (const property of ['top', 'right', 'bottom', 'left', 'inset', 'transform']) {
          if (rule[property]) expect(['auto', 'none']).toContain(rule[property]);
        }
      }
    }
    expect(combinedRulesFor('.shell.in-battle .workspace')).toMatchObject({
      'min-height': '0', 'min-width': '0', height: '100%', overflow: 'hidden',
    });
    expect(combinedRulesFor('.shell.in-battle .arena-wrap')).toMatchObject({
      position: 'relative', height: '100%', 'min-height': '0', 'max-height': 'none', border: '0', 'border-radius': '0',
    });
  });

  it('keeps safe areas outside the logical game rather than shifting HUD positions', () => {
    const frame = readFileSync(`${process.cwd()}/src/game-frame.css`, 'utf8');
    for (const edge of ['top','right','bottom','left']) {
      expect(frame).toContain(`env(safe-area-inset-${edge})`);
      expect(css).not.toContain(`env(safe-area-inset-${edge})`);
    }
  });

  it('keeps boss and failure notices in normal flow so they enlarge the status row', () => {
    for (const selector of ['.shell.in-battle .battle-hud .boss-bar', '.shell.in-battle .battle-notice']) {
      expect(combinedRulesFor(selector)).toMatchObject({ 'grid-column': '1/-1', position: 'static', inset: 'auto', transform: 'none' });
    }
  });

  it('hides workshop chrome and decorative arena panels in combat', () => {
    for (const selector of ['.topbar', '.panel', '.section-head', '.foot', '.arena-top', '.arena-bottom', '.floating-message']) {
      expect(combinedRulesFor(`.shell.in-battle ${selector}`).display, `battle hides ${selector}`).toBe('none');
    }
  });
});

describe('DRIFTWORKS skin and asset provenance', () => {
  it('keeps the resource row compact and uses the pack plate as a nine-slice surface', () => {
    expect(combinedRulesFor('.battle-resources')).toMatchObject({height:'64px','border-image':'var(--dw-plate) 14 fill / 7px stretch'});
    expect(combinedRulesFor('.battle-resources::before').display).toBe('none');
  });

  it('uses the pack button for all four interactive states and keeps the primary action distinct', () => {
    expect(combinedRulesFor('.upgrade')['border-image']).toBe('var(--dw-button) 12 fill / 7px stretch');
    expect(combinedRulesFor('.panel.menu-panel .menu-actions .main-button').color).toBe('var(--dw-amber)');
    for(const [variable,file] of [['button','normal'],['hover','hover'],['pressed','pressed'],['disabled','disabled']]){
      expect(combinedRulesFor(':root')[`--dw-${variable}`]).toContain(`btn_standard_${file}.png`);
    }
  });

  it('reuses title controls and keeps the chained sheet scrollable with 44px touch targets', () => {
    document.body.innerHTML=battleMenuMarkup;
    expect(document.querySelector('#battle-menu-close')).toBeNull();
    expect(combinedRulesFor('.battle-menu-panel h2')['text-align']).toBe('center');
    expect(document.querySelector('#battle-menu-return')?.classList.contains('title-primary')).toBe(true);
    expect(document.querySelectorAll('.chain-panel-sheet .chain-panel-content button.title-button > span')).toHaveLength(6);
    expect(combinedRulesFor('.chain-panel-content').overflow).toBe('auto');
    expect(combinedRulesFor('.battle-menu-panel .title-button')['min-height']).toBe('44px');
  });

  it('has every CSS-referenced sprite present, licensed and byte-identical to its provenance hash', () => {
    const assetRoot = `${process.cwd()}/public/assets/ui/`;
    const manifest = JSON.parse(readFileSync(`${assetRoot}manifest.json`, 'utf8')) as { file: string; source: string; original: string; license: string; sha256: string }[];
    const referencedFiles = new Set([...css.matchAll(/url\(['"]?\/assets\/ui\/([^'"\)]+)['"]?\)/g)].map(match => match[1]));
    expect(referencedFiles.size).toBeGreaterThanOrEqual(8);
    for (const file of referencedFiles) {
      const records = manifest.filter(record => record.file === file);
      expect(records, file).toHaveLength(1);
      const record = records[0];
      if (file.startsWith('driftworks/')) {
        expect(record.source).toMatch(/^https:\/\/victorgabrielf\.itch\.io\/driftworks-free-/);
        expect(record.original).toMatch(/^(?:ui\/png|icons\/svg)\/.+\.(?:png|svg)$/);
        expect(record.license).toBe('DRIFTWORKS Standard Royalty-Free');
      } else {
        expect(record.source).toMatch(/^https:\/\/kenney\.nl\/assets\/ui-pack(?:-sci-fi)?$/);
        expect(record.original).toMatch(/^PNG\/(?:Extra|Blue|Red|Grey)\/Default\/.+\.png$/);
        expect(record.license).toBe('CC0-1.0');
      }
      expect(createHash('sha256').update(readFileSync(`${assetRoot}${file}`)).digest('hex'), file).toBe(record.sha256);
    }
    expect(manifest.find(record => record.file === 'driftworks/plate_large.png')?.sha256).toBe('1fdef20dbf84deaefa5e1ada54ab7c905bb747975e62c627839c75a1cba22234');
    expect(manifest.find(record => record.file === 'driftworks/btn_standard_normal.png')?.sha256).toBe('b27713539c455cb0e7425f5ea44877831fdd2c1a8f821b7925020aff6d3342bd');
    expect(readFileSync(`${assetRoot}driftworks/LICENSE.txt`, 'utf8')).toContain('personal or commercial');
    for (const pack of ['kenney-ui', 'kenney-sci-fi']) expect(readFileSync(`${assetRoot}${pack}/License.txt`, 'utf8')).toContain('Creative Commons Zero, CC0');
  });
});
