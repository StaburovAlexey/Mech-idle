// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createState, getStats, parseState, serializeState, startRun, STAT_KEYS, type GameState } from './game';
import { SAVE_KEY } from './persistence';
import type { SceneFrame } from './scene';

// These tests run the actual UI, game rules and local save repository. Only GPU,
// audio hardware, platform setup, tab ownership and frame scheduling are replaced.
const fakes = vi.hoisted(() => ({
  render: vi.fn(), ready: vi.fn(), soundToggle: vi.fn(), soundSuspend: vi.fn(), soundResume: vi.fn(),
  pause: null as null | { reasons: Set<string>; readonly paused: boolean },
}));
vi.mock('./scene', async () => {
  return { SceneView: class {
    constructor(root: HTMLElement) { root.append(document.createElement('canvas')); }
    render(frame: SceneFrame, delta: number) { fakes.render(frame, delta); }
    resize() {}
  }};
});
vi.mock('./audio', () => ({
  Sound: class {
    enabled = false;
    toggle() { fakes.soundToggle(); this.enabled = !this.enabled; return this.enabled; }
    play() {}
    suspend() { fakes.soundSuspend(); }
    resume() { fakes.soundResume(); }
  },
}));
vi.mock('./platform', () => ({
  LocalPlatformAdapter: class {
    async init() {}
    gameReady() { fakes.ready(); }
  },
}));
vi.mock('./persistence', async importOriginal => {
  const actual = await importOriginal<typeof import('./persistence')>();
  return {
    ...actual,
    PauseManager: class extends actual.PauseManager {
      constructor() { super(); fakes.pause = this; }
    },
    TabLock: class { async acquire() { return true; } release() {} },
  };
});

const element = <T extends HTMLElement = HTMLElement>(selector: string) => {
  const result = document.querySelector<T>(selector);
  expect(result, `missing ${selector}`).not.toBeNull();
  return result!;
};
const button = (selector: string) => element<HTMLButtonElement>(selector);
const click = (selector: string) => button(selector).click();
const hidden = (selector: string) => element(selector).classList.contains('hidden');
const key = (value: string, target: EventTarget = document.body, options: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
};
const saved = () => {
  const result = parseState(localStorage.getItem(SAVE_KEY)!);
  expect(result).not.toBeNull();
  return result!;
};
function fundedRun(): GameState {
  const state = createState();
  state.profile.crystals = 17;
  state.profile.meta = { damage: 2, maxHp: 1, attackSpeed: 1, regen: 1 };
  const run = startRun(state, 73);
  run.run!.gold = 200; run.run!.earnedGold = 200;
  return run;
}
let frameCallback: FrameRequestCallback | null;
let now: number;
let removeListeners: () => void;
function advanceFrames(count = 1) {
  for (let i = 0; i < count; i++) {
    const next = frameCallback;
    expect(next).not.toBeNull();
    frameCallback = null;
    now += 100;
    next!(now);
  }
}
const elapsed = () => {
  const value = (fakes.render.mock.calls.at(-1)![0] as SceneFrame).elapsed;
  expect(value).toEqual(expect.any(Number));
  return value!;
};
async function boot(state?: GameState) {
  if (state) localStorage.setItem(SAVE_KEY, serializeState(state));
  await import('./main');
  await vi.waitFor(() => {
    expect(fakes.ready).toHaveBeenCalledOnce();
    expect(button('#start').disabled).toBe(false);
    expect(frameCallback).not.toBeNull();
  });
}
function openDrawer() {
  button('#battle-menu-toggle').focus();
  click('#battle-menu-toggle');
  expect(hidden('#battle-menu-overlay')).toBe(false);
}
function closeModal(index = 0) {
  const actions = document.querySelectorAll<HTMLButtonElement>('#modal-root button');
  expect(actions.length).toBeGreaterThan(index);
  actions[index].click();
}

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  document.body.innerHTML = '<div id="app"></div>';
  document.body.className = '';
  localStorage.clear();
  frameCallback = null; now = 1000; fakes.pause = null;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frameCallback = callback; return 1;
  }));
  const windowAdd = vi.spyOn(window, 'addEventListener');
  const documentAdd = vi.spyOn(document, 'addEventListener');
  removeListeners = () => {
    for (const [type, listener, options] of windowAdd.mock.calls) window.removeEventListener(type, listener, options);
    for (const [type, listener, options] of documentAdd.mock.calls) document.removeEventListener(type, listener, options);
  };
});
afterEach(() => {
  removeListeners(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  document.body.innerHTML = ''; localStorage.clear();
});

describe('fullscreen battle actual UI flows', () => {
  it('New Run swaps the workshop for a compact battle HUD and exactly four upgrade buttons', async () => {
    await boot();
    expect(element('.shell').classList.contains('in-battle')).toBe(false);
    expect(hidden('#battle-hud')).toBe(true);
    click('#start');
    expect(element('.shell').classList.contains('in-battle')).toBe(true);
    expect(document.body.classList.contains('battle-active')).toBe(true);
    expect(hidden('#battle-hud')).toBe(false);
    expect(document.activeElement).toBe(button('#battle-menu-toggle'));
    expect(hidden('#battle-menu-overlay')).toBe(true);
    expect(element('#panel').children.length).toBe(0);
    expect(document.querySelectorAll('#arena canvas').length).toBe(1);
    expect(document.querySelectorAll('#upgrades > button').length).toBe(4);
    expect(element('#battle-wave').textContent).toBe('1 / 30');
    expect(element('#battle-hp').textContent).toBe('100 / 100');
    expect(element('#battle-gold').textContent).toBe('0');
    expect(element('#battle-crystals').textContent).toBe('0');
    expect(saved().profile.runCounter).toBe(1);
  });

  it('puts the resource HUD, scene workspace and upgrades in separate sibling layout regions', async () => {
    await boot(); click('#start');
    const shell = element('.shell'), hud = element('#battle-hud'), workspace = element('.workspace'), upgrades = element('#upgrades');
    for (const region of [hud, workspace, upgrades]) expect(region.parentElement).toBe(shell);
    expect(element('.arena-wrap').parentElement).toBe(workspace);
    expect(element('#arena').parentElement).toBe(element('.arena-wrap'));
    expect(element('#arena canvas').parentElement).toBe(element('#arena'));
    expect(hud.querySelectorAll('.battle-resources > .battle-resource')).toHaveLength(4);
    for (const selector of ['#battle-wave', '#battle-hp', '#battle-gold', '#battle-crystals', '#battle-menu-toggle', '#boss', '#battle-notice']) {
      expect(hud.contains(element(selector)), `${selector} belongs to the reserved status row`).toBe(true);
      expect(workspace.contains(element(selector)), `${selector} must not cover the arena`).toBe(false);
    }
    expect(upgrades.querySelectorAll(':scope > .upgrade')).toHaveLength(4);
    expect(hud.contains(upgrades)).toBe(false);
    expect(workspace.contains(upgrades)).toBe(false);
  });

  it('shows final-boss health inside the status row, retaining it through save and resume', async () => {
    const initial = fundedRun(), run = initial.run!;
    run.wave = 30; run.lastPaidWave = 29; run.earnedCrystals = 29; run.spawned = 1; run.nextEntityId = 2;
    run.enemies = [{ id: `${run.id}:1`, kind: 'boss', x: 0, y: 11, hp: 312, maxHp: 624, damage: 42, speed: .7, attackInterval: 2, attackCooldown: 0 }];
    await boot(initial); click('#resume');
    expect(element('#battle-wave').textContent).toBe('30 / 30');
    expect(element('#boss').parentElement).toBe(element('#battle-hud'));
    expect(hidden('#boss')).toBe(false);
    expect(element('#boss-fill').style.width).toBe('50%');
    openDrawer(); click('#battle-menu-save');
    expect(hidden('#boss')).toBe(true);
    click('#resume');
    expect(hidden('#boss')).toBe(false);
    expect(element('#boss-fill').style.width).toBe('50%');
    expect(saved().run!.enemies).toEqual(initial.run!.enemies);
  });

  it('reports save failure in the reserved status row without inserting an arena overlay', async () => {
    await boot();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage quota exhausted', 'QuotaExceededError'); });
    click('#start');
    const notice = element('#battle-notice');
    expect(hidden('#battle-hud')).toBe(false);
    expect(hidden('#battle-notice')).toBe(false);
    expect(notice.parentElement).toBe(element('#battle-hud'));
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.textContent).toContain('Не удалось сохранить прогресс');
    expect(notice.textContent).toBe(element('#notice').textContent);
    expect(element('.workspace').contains(notice)).toBe(false);
    expect(element('.shell').classList.contains('in-battle')).toBe(true);
  });

  it('menu open pauses real simulation, makes background inert, and restores focus and progression on close', async () => {
    await boot(); click('#start'); advanceFrames(3);
    const before = elapsed();
    expect(before).toBeGreaterThan(0);
    openDrawer();
    expect(fakes.pause?.reasons.has('battleMenu')).toBe(true);
    expect(button('#battle-menu-toggle').getAttribute('aria-expanded')).toBe('true');
    for (const selector of ['#battle-hud', '#upgrades', '.arena-wrap']) expect(element(selector).inert).toBe(true);
    expect(document.activeElement).toBe(button('#battle-menu-close'));
    advanceFrames(10); expect(elapsed()).toBe(before);
    click('#battle-menu-return');
    expect(hidden('#battle-menu-overlay')).toBe(true);
    expect(button('#battle-menu-toggle').getAttribute('aria-expanded')).toBe('false');
    for (const selector of ['#battle-hud', '#upgrades', '.arena-wrap']) expect(element(selector).inert).toBe(false);
    expect(document.activeElement).toBe(button('#battle-menu-toggle'));
    advanceFrames(3); expect(elapsed()).toBeGreaterThan(before);
  });

  it('closing via Escape from a focused menu button preserves an existing user pause', async () => {
    await boot(); click('#start'); advanceFrames(2);
    key(' '); expect(fakes.pause?.reasons.has('user')).toBe(true);
    const before = elapsed();
    openDrawer();
    button('#battle-menu-sound').focus();
    expect(key('Escape', document.activeElement!).defaultPrevented).toBe(true);
    expect(hidden('#battle-menu-overlay')).toBe(true);
    expect(fakes.pause?.reasons.has('user')).toBe(true);
    expect(hidden('#paused')).toBe(false);
    advanceFrames(8); expect(elapsed()).toBe(before);
    click('#unpause'); advanceFrames(3);
    expect(elapsed()).toBeGreaterThan(before);
  });

  it('manual pause controls never resume while the drawer remains open', async () => {
    await boot(); click('#start'); advanceFrames(2); openDrawer();
    const before = elapsed();
    click('#battle-menu-pause');
    expect(fakes.pause?.reasons.has('user')).toBe(true);
    expect(element('#battle-menu-return').textContent).toBe('Закрыть меню');
    click('#battle-menu-return'); advanceFrames(3);
    expect(elapsed()).toBe(before);
    openDrawer(); click('#battle-menu-pause');
    expect(fakes.pause?.reasons.has('user')).toBe(false);
    expect(fakes.pause?.reasons.has('battleMenu')).toBe(true);
    advanceFrames(3); expect(elapsed()).toBe(before);
    click('#battle-menu-return'); advanceFrames(3);
    expect(elapsed()).toBeGreaterThan(before);
  });

  it('Escape opens the menu from a focused upgrade and repeat/modified hotkeys do not fire', async () => {
    await boot(fundedRun()); click('#resume');
    button('#upgrade-damage').focus();
    key('Escape', document.activeElement!, { repeat: true });
    key('Escape', document.activeElement!, { ctrlKey: true });
    expect(hidden('#battle-menu-overlay')).toBe(true);
    key('Escape', document.activeElement!);
    expect(hidden('#battle-menu-overlay')).toBe(false);
    click('#battle-menu-close');
    expect(document.activeElement).toBe(button('#upgrade-damage'));
    key('1', document.activeElement!);
    expect(saved().run!.levels.damage).toBe(0);
  });

  it('traps Tab and Shift+Tab, closes only on the backdrop, and supports repeated menu cycles', async () => {
    await boot(); click('#start'); openDrawer();
    const first = button('#battle-menu-close'), last = button('#battle-menu-abandon');
    first.focus();
    expect(key('Tab', first, { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    key('Tab', last); expect(document.activeElement).toBe(first);
    element('.battle-menu-panel').click();
    expect(hidden('#battle-menu-overlay')).toBe(false);
    element('#battle-menu-overlay').click();
    expect(hidden('#battle-menu-overlay')).toBe(true);
    for (let i = 0; i < 3; i++) {
      key('Escape'); expect(hidden('#battle-menu-overlay')).toBe(false);
      key('Escape', button('#battle-menu-close')); expect(hidden('#battle-menu-overlay')).toBe(true);
      expect(fakes.pause?.paused).toBe(false);
    }
  });

  it('blocks click-through and purchase hotkeys while the menu is open, then permits a real purchase', async () => {
    await boot(fundedRun()); click('#resume');
    const before = saved();
    openDrawer();
    expect(button('#upgrade-damage').disabled).toBe(true);
    click('#upgrade-damage');
    // Forced dispatch additionally exercises the handler guard; browsers enforce inert themselves.
    button('#upgrade-damage').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    key('1'); key('2'); key('3'); key('4'); key(' ');
    expect(saved().run!.gold).toBe(before.run!.gold);
    expect(saved().run!.levels).toEqual(before.run!.levels);
    expect(fakes.pause?.reasons.has('user')).toBe(false);
    click('#battle-menu-close');
    click('#upgrade-damage');
    expect(saved().run!.gold).toBe(before.run!.gold - 10);
    expect(saved().run!.levels.damage).toBe(1);
    expect(saved().run!.activeLevels.damage).toBe(1);
  });

  it('all four battle purchases update stats and HUD immediately without refilling health', async () => {
    const initial = fundedRun();
    await boot(initial); click('#resume');
    expect(element('#battle-hp').textContent).toMatch(/^110 \/ /);
    const oldStats = getStats(initial);
    for (const stat of STAT_KEYS) click(`#upgrade-${stat}`);
    const after = saved(), stats = getStats(after);
    for (const stat of STAT_KEYS) {
      expect(stats[stat]).toBeGreaterThan(oldStats[stat]);
      expect(after.run!.activeLevels[stat]).toBe(1);
      expect(element(`#upgrade-${stat} .upgrade-level`).textContent).toBe('1/15');
      expect(element(`#upgrade-${stat} .upgrade-value`).textContent).toContain(
        Number.isInteger(stats[stat]) ? String(stats[stat]) : stats[stat].toFixed(1).replace('.', ','),
      );
    }
    expect(after.run!.gold).toBe(153);
    expect(after.run!.hp).toBe(initial.run!.hp);
    expect(element('#battle-gold').textContent).toBe('153');
    expect(element('#battle-hp').textContent).toMatch(/^110 \/ 132/);
    expect(after.run!.wave).toBe(1);
    expect(after.run!.tick).toBe(0);
    expect(element('#upgrades').textContent).not.toContain('ждёт');
    expect(element('#upgrades').textContent).not.toContain('Заказано');
  });

  it('toggles sound and handles nested help without losing the menu pause or inert background', async () => {
    await boot(fundedRun()); click('#resume'); advanceFrames(2); openDrawer();
    click('#battle-menu-sound');
    expect(fakes.soundToggle).toHaveBeenCalledOnce();
    expect(element('#battle-menu-sound').textContent).toContain('включён');
    expect(fakes.soundSuspend).toHaveBeenCalled();
    button('#battle-menu-help').focus(); click('#battle-menu-help');
    expect(element('.shell').inert).toBe(true);
    expect(fakes.pause?.reasons.has('dialog')).toBe(true);
    const before = elapsed();
    advanceFrames(4); expect(elapsed()).toBe(before);
    expect(key('Tab', document.activeElement!).defaultPrevented).toBe(true);
    expect(element('#modal-root').contains(document.activeElement)).toBe(true);
    key('1');
    expect(saved().run!.levels.damage).toBe(0);
    closeModal();
    expect(element('.shell').inert).toBe(false);
    expect(element('#battle-hud').inert).toBe(true);
    expect(element('#upgrades').inert).toBe(true);
    expect(fakes.pause?.reasons.has('dialog')).toBe(false);
    expect(fakes.pause?.reasons.has('battleMenu')).toBe(true);
    expect(document.activeElement).toBe(button('#battle-menu-help'));
    advanceFrames(3); expect(elapsed()).toBe(before);
    click('#battle-menu-help'); key('Escape', document.activeElement!);
    expect(element('#modal-root').children.length).toBe(0);
    expect(hidden('#battle-menu-overlay')).toBe(false);
    expect(element('.shell').inert).toBe(false);
    expect(fakes.pause?.reasons.has('battleMenu')).toBe(true);
    click('#battle-menu-return'); advanceFrames(3); expect(elapsed()).toBeGreaterThan(before);
  });

  it('menu close cannot resume a document-hidden pause', async () => {
    await boot(); click('#start'); advanceFrames(2); openDrawer();
    const before = elapsed();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    click('#battle-menu-close'); advanceFrames(5);
    expect(fakes.pause?.reasons.has('hidden')).toBe(true);
    expect(elapsed()).toBe(before);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange')); advanceFrames(3);
    expect(elapsed()).toBeGreaterThan(before);
  });

  it('menu close cannot resume a window-focus pause', async () => {
    await boot(); click('#start'); advanceFrames(2); openDrawer();
    const before = elapsed();
    window.dispatchEvent(new Event('blur'));
    click('#battle-menu-close'); advanceFrames(4);
    expect(fakes.pause?.reasons.has('focus')).toBe(true);
    expect(elapsed()).toBe(before);
    window.dispatchEvent(new Event('focus')); advanceFrames(3);
    expect(elapsed()).toBeGreaterThan(before);
  });

  it('save and exit keeps the run and returns to the same battle without workshop spending', async () => {
    const initial = fundedRun();
    await boot(initial); click('#resume'); openDrawer(); click('#battle-menu-save');
    expect(element('.shell').classList.contains('in-battle')).toBe(false);
    expect(document.body.classList.contains('battle-active')).toBe(false);
    expect(hidden('#battle-menu-overlay')).toBe(true);
    expect(hidden('#battle-hud')).toBe(true);
    expect(hidden('#resume')).toBe(false);
    expect(document.activeElement).toBe(button('#resume'));
    expect(hidden('#start')).toBe(true);
    expect(button('#upgrade-damage').disabled).toBe(true);
    expect(saved().run).toEqual(initial.run);
    expect(saved().profile).toEqual(initial.profile);
    click('#resume');
    expect(element('.shell').classList.contains('in-battle')).toBe(true);
    expect(element('#battle-gold').textContent).toBe('200');
    expect(fakes.pause?.paused).toBe(false);
    expect(saved().run!.id).toBe(initial.run!.id);
  });

  it('save and exit does not erase a manual pause when the saved run is resumed', async () => {
    await boot(); click('#start'); advanceFrames(2); openDrawer();
    click('#battle-menu-pause'); click('#battle-menu-save');
    expect(fakes.pause?.reasons.has('user')).toBe(true);
    click('#resume');
    expect(hidden('#paused')).toBe(false);
    expect(document.activeElement).toBe(button('#unpause'));
    const before = elapsed();
    advanceFrames(4); expect(elapsed()).toBe(before);
    click('#unpause'); advanceFrames(3); expect(elapsed()).toBeGreaterThan(before);
  });

  it('abandon cancel retains the run and confirm removes only run progress, preserving crystals and meta', async () => {
    const initial = fundedRun();
    await boot(initial); click('#resume'); openDrawer();
    button('#battle-menu-abandon').focus(); click('#battle-menu-abandon');
    expect(element('#modal-title').textContent).toContain('Завершить');
    expect(element('.shell').inert).toBe(true);
    key('Escape', document.activeElement!);
    expect(element('#modal-root').children.length).toBe(0);
    expect(saved().run).toEqual(initial.run);
    expect(hidden('#battle-menu-overlay')).toBe(false);
    expect(fakes.pause?.reasons.has('battleMenu')).toBe(true);
    click('#battle-menu-abandon'); closeModal(0);
    expect(saved().run).toEqual(initial.run);
    expect(hidden('#battle-menu-overlay')).toBe(false);
    expect(document.activeElement).toBe(button('#battle-menu-abandon'));
    expect(fakes.pause?.reasons.has('battleMenu')).toBe(true);
    click('#battle-menu-abandon'); closeModal(1);
    expect(saved().run).toBeNull();
    expect(saved().profile).toEqual(initial.profile);
    expect(element('.shell').classList.contains('in-battle')).toBe(false);
    expect(element('.shell').inert).toBe(false);
    expect(hidden('#battle-menu-overlay')).toBe(true);
    expect(hidden('#start')).toBe(false);
    expect(document.activeElement).toBe(button('#start'));
    expect(hidden('#resume')).toBe(true);
    expect(element('#menu-crystals').textContent).toBe('17');
    expect(fakes.pause?.reasons.has('battleMenu')).toBe(false);
    expect(fakes.pause?.reasons.has('dialog')).toBe(false);
  });
});
