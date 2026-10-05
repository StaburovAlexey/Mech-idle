// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { BattleMenuController, battleHudMarkup, battleMenuMarkup, isInteractiveTarget } from './battle-ui';
import { PauseManager } from './persistence';
import { readFileSync } from 'node:fs';
const css = readFileSync(`${process.cwd()}/src/style.css`, 'utf8');

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
  const compact = css.replace(/\s+/g, '');
  it('uses fixed, borderless viewport combat and safe-area-aware top and bottom overlays', () => {
    expect(compact).toMatch(/\.shell\.in-battle\{[^}]*position:fixed;inset:0;[^}]*height:100dvh;/);
    expect(compact).toMatch(/\.shell\.in-battle\.arena-wrap\{[^}]*position:fixed;inset:0;[^}]*border:0;border-radius:0;/);
    expect(compact).toMatch(/\.shell\.in-battle\.battle-hud\{[^}]*top:[^;]*env\(safe-area-inset-top\)/);
    expect(compact).toMatch(/\.shell\.in-battle\.upgrades\{[^}]*bottom:[^;]*env\(safe-area-inset-bottom\)/);
    expect(compact).toContain('env(safe-area-inset-left)');
    expect(compact).toContain('env(safe-area-inset-right)');
  });

  it('retains four upgrade columns even when mobile workshop layout uses two', () => {
    const battleUpgradeRules = [...compact.matchAll(/\.shell\.in-battle\.upgrades\{([^}]+)\}/g)].map(match => match[1]);
    expect(battleUpgradeRules.length).toBeGreaterThan(1);
    expect(battleUpgradeRules.filter(rule => rule.includes('grid-template-columns:')).length).toBeGreaterThan(1);
    for (const rule of battleUpgradeRules.filter(rule => rule.includes('grid-template-columns:'))) {
      expect(rule).toContain('grid-template-columns:repeat(4,minmax(0,1fr))');
    }
  });

  it('hides workshop chrome and decorative arena panels in combat', () => {
    for (const selector of ['.topbar', '.panel', '.section-head', '.foot', '.arena-top', '.arena-bottom']) {
      const rule = [...compact.matchAll(/([^{}]+)\{([^{}]+)\}/g)]
        .find(match => match[1].split(',').includes(`.shell.in-battle${selector}`) && match[2].includes('display:none'));
      expect(rule, `battle hides ${selector}`).toBeDefined();
    }
  });
});
