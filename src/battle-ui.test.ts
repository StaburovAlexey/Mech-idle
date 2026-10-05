// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { BattleMenuController, battleHudMarkup, battleMenuMarkup, bossBarMarkup, upgradeButtonsMarkup, STAT_LABELS, isInteractiveTarget } from './battle-ui';
import { STAT_KEYS } from './game';
import { PauseManager } from './persistence';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const css = readFileSync(`${process.cwd()}/src/style.css`, 'utf8');
// Inspect authored rules, including every responsive override. This deliberately
// does not claim CSS layout, rendered pixels, or actual browser asset loading.
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]+)\}/g)].map(match => ({
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
    expect([...document.querySelectorAll('.battle-resource')].length).toBe(4);
    for (const id of ['battle-wave', 'battle-hp', 'battle-hp-fill', 'battle-gold', 'battle-crystals']) {
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
    for (const suffix of ['close', 'return', 'pause', 'sound', 'help', 'save', 'abandon']) {
      expect(drawer.querySelector(`#battle-menu-${suffix}`)).not.toBeNull();
    }
    expect(document.querySelectorAll('button').length).toBe(7);
  });

  it('exports the same four complete upgrade controls used by the game and review fixture', () => {
    document.body.innerHTML = `<section id="upgrades">${upgradeButtonsMarkup()}</section>`;
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('#upgrades > button')];
    expect(buttons).toHaveLength(4);
    expect(buttons.map(button => button.dataset.stat)).toEqual([...STAT_KEYS]);
    for (const [index, button] of buttons.entries()) {
      const stat = STAT_KEYS[index];
      expect(button.id).toBe(`upgrade-${stat}`);
      expect(button.querySelector('.upgrade-title')?.textContent).toContain(STAT_LABELS[stat].title);
      for (const selector of ['.upgrade-top', '.upgrade-level', '.upgrade-data', '.upgrade-value', '.upgrade-price', '.upgrade-sub']) {
        expect(button.querySelectorAll(selector)).toHaveLength(1);
      }
    }
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
  it('reserves intrinsic top and bottom rows around a shrinkable middle scene', () => {
    expect(combinedRulesFor('.shell.in-battle')).toMatchObject({
      position: 'fixed', inset: '0', display: 'grid', height: '100dvh',
      'grid-template-rows': 'auto minmax(0,1fr) auto', 'min-height': '0', overflow: 'hidden',
    });
    for (const [selector, row] of [['.shell.in-battle .battle-hud', '1'], ['.shell.in-battle .workspace', '2'], ['.shell.in-battle .upgrades', '3']]) {
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

  it('keeps safe-area padding inside both reserved bars at every responsive override', () => {
    for (const [selector, edge] of [['.shell.in-battle .battle-hud', 'top'], ['.shell.in-battle .upgrades', 'bottom']]) {
      const rule = combinedRulesFor(selector);
      expect(rule[`padding-${edge}`]).toContain(`env(safe-area-inset-${edge})`);
      expect(rule['padding-left']).toContain('env(safe-area-inset-left)');
      expect(rule['padding-right']).toContain('env(safe-area-inset-right)');
    }
  });

  it('keeps boss and failure notices in normal flow so they enlarge the status row', () => {
    for (const selector of ['.shell.in-battle .battle-hud .boss-bar', '.shell.in-battle .battle-notice']) {
      expect(combinedRulesFor(selector)).toMatchObject({ 'grid-column': '1/-1', position: 'static', inset: 'auto', transform: 'none' });
    }
  });

  it('retains four upgrade columns even when mobile workshop layout uses two', () => {
    const battleUpgradeRules = rulesFor('.shell.in-battle .upgrades');
    expect(battleUpgradeRules.length).toBeGreaterThan(1);
    expect(battleUpgradeRules.filter(rule => rule['grid-template-columns']).length).toBeGreaterThan(1);
    for (const rule of battleUpgradeRules.filter(rule => rule['grid-template-columns'])) {
      expect(rule['grid-template-columns'].replace(/\s+/g, '')).toMatch(/^repeat\(4,minmax\(0,(?:1fr|\d+px)\)\)$/);
    }
  });

  it('hides workshop chrome and decorative arena panels in combat', () => {
    for (const selector of ['.topbar', '.panel', '.section-head', '.foot', '.arena-top', '.arena-bottom', '.floating-message']) {
      expect(combinedRulesFor(`.shell.in-battle ${selector}`).display, `battle hides ${selector}`).toBe('none');
    }
  });
});

describe('shipped original Kenney skins (asset and authored CSS checks)', () => {
  it('uses fixed-size original header artwork and thin rectangular screw surfaces', () => {
    for (const selector of ['.panel::before', '.modal::before']) {
      const header=combinedRulesFor(selector);
      expect(header.height).toBe('64px');
      expect(header['border-image']).toMatch(/button_square_header_large_rectangle_screws\.png['"]?\) 12 fill \/ 12px/);
      expect(header['pointer-events']).toBe('none');
    }
    expect(combinedRulesFor('.battle-resources').height).toBe('64px');
    expect(combinedRulesFor('.battle-menu-head').height).toBe('64px');
    for(const selector of ['.battle-resources::before','.battle-menu-head::before'])
      expect(combinedRulesFor(selector)['border-image']).toContain('button_square_header_large_rectangle_screws.png');
    expect(combinedRulesFor('.battle-menu-panel')['border-image']).toContain('panel_glass_screws.png');
    expect(combinedRulesFor('.battle-menu-panel').overflow).toBe('auto');
    expect(rulesFor('.battle-menu-panel::before')).toHaveLength(0);
    expect(combinedRulesFor('.upgrade')['border-image']).toMatch(/button_rectangle_depth_flat_grey\.png['"]?\) 8 fill \/ 4px/);
    expect(combinedRulesFor('.upgrade')).toMatchObject({background:'transparent',opacity:'1',filter:'none'});
    expect(css).not.toContain('panel_glass_notches.png');
    expect(css).not.toContain('button_rectangle_depth_border.png');
  });

  it('uses original neutral normal/hover/pressed faces and one blue primary action without fading', () => {
    expect(combinedRulesFor('.upgrade.affordable')['border-image-source']).toContain('/button_rectangle_depth_flat_grey.png');
    expect(combinedRulesFor('.upgrade:disabled')).toMatchObject({opacity:'1',filter:'none',background:'transparent'});
    expect(combinedRulesFor('.upgrade:disabled')['border-image-source']).toContain('/button_rectangle_flat_grey.png');
    expect(combinedRulesFor('.upgrade:hover:not(:disabled)')['border-image-source']).toContain('/button_rectangle_depth_gloss_grey.png');
    expect(combinedRulesFor('.upgrade:active:not(:disabled)')['border-image-source']).toContain('/button_rectangle_flat_grey.png');
    expect(combinedRulesFor('.main-button:not(.secondary)')['border-image-source']).toContain('/button_rectangle_depth_flat.png');
    expect(combinedRulesFor('.main-button:not(.secondary):hover:not(:disabled)')['border-image-source']).toContain('/button_rectangle_depth_gloss.png');
    expect(combinedRulesFor('.main-button:not(.secondary):active:not(:disabled)')['border-image-source']).toContain('/button_rectangle_flat.png');
  });

  it('keeps a compact two-column menu, a pack cross icon and 44px touch targets', () => {
    document.body.innerHTML=battleMenuMarkup;
    expect(document.querySelector('#battle-menu-close .kenney-close-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.battle-menu-panel > .hint')).toBeNull();
    expect(document.querySelector('#battle-menu-save')?.getAttribute('aria-label')).toContain('Сохранить забег');
    expect(combinedRulesFor('.battle-menu-panel .menu-actions')).toMatchObject({display:'grid','grid-template-columns':'repeat(2,minmax(0,1fr))'});
    expect(combinedRulesFor('.battle-menu-panel .menu-actions button')['min-height']).toBe('44px');
    expect(combinedRulesFor('.battle-menu-close')).toMatchObject({'min-width':'44px','min-height':'44px'});
    expect(combinedRulesFor('.battle-menu-panel #battle-menu-return')['grid-column']).toBe('1/-1');
    expect(combinedRulesFor('.kenney-close-icon').background).toContain('/icon_cross_red.png');
    expect(combinedRulesFor('.kenney-close-icon')).toMatchObject({width:'18px',height:'18px'});
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
      expect(record.source).toMatch(/^https:\/\/kenney\.nl\/assets\/ui-pack(?:-sci-fi)?$/);
      expect(record.original).toMatch(/^PNG\/(?:Extra|Blue|Red|Grey)\/Default\/.+\.png$/);
      expect(record.license).toBe('CC0-1.0');
      expect(createHash('sha256').update(readFileSync(`${assetRoot}${file}`)).digest('hex'), file).toBe(record.sha256);
    }
    // Pin the two primary visible faces so changing artwork and its manifest
    // together cannot silently replace the original source artwork.
    expect(manifest.find(record => record.file === 'kenney-sci-fi/panel_glass_screws.png')?.sha256).toBe('6059efb0bbff5597104ecaef460d120eb30e31b174a7556e6122cec70419cc94');
    expect(manifest.find(record => record.file === 'kenney-ui/button_rectangle_depth_flat.png')?.sha256).toBe('6c709a45aae0330ffff5b060d9f14cc2297839f664e0a4c9e516d90ad085ec0b');
    for (const pack of ['kenney-ui', 'kenney-sci-fi']) expect(readFileSync(`${assetRoot}${pack}/License.txt`, 'utf8')).toContain('Creative Commons Zero, CC0');
  });
});
