// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attackConfig, enemyStats, ENEMY_PROJECTILE_SPEED, createState, getStats, parseState, serializeState, startRun, STAT_KEYS, type GameState } from './game';
import { SAVE_KEY } from './persistence';
import type { SceneFrame } from './scene';

// These tests run the actual UI, game rules and local save repository. Only GPU,
// audio hardware, platform setup, tab ownership and frame scheduling are replaced.
const fakes = vi.hoisted(() => ({
  render: vi.fn(), ready: vi.fn(), soundToggle: vi.fn(), soundSuspend: vi.fn(), soundResume: vi.fn(),
  assets: undefined as Promise<boolean> | undefined,
  acquire: vi.fn<() => Promise<'acquired'|'busy'|'unavailable'>>(), release: vi.fn(),
  pause: null as null | { reasons: Set<string>; readonly paused: boolean },
}));
vi.mock('./scene', async () => {
  return { SceneView: class {
    readonly assetsReady = fakes.assets ?? Promise.resolve(true);
    prepare() {}
    constructor(root: HTMLElement) { root.append(document.createElement('canvas')); }
    render(frame: SceneFrame, delta: number) { fakes.render(frame, delta); }
    resize() {}
  }};
});
vi.mock('./boot', async importOriginal => ({
  ...await importOriginal<typeof import('./boot')>(),
  loadInterface: async () => {},
}));
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
    TabLock: class { acquire() { return fakes.acquire(); } release() { fakes.release(); } },
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
    expect(button(state?.run?'#resume':'#start').disabled).toBe(false);
    expect(frameCallback).not.toBeNull();
  });
}
function mockGateMotion() {
  const gates = element('.workshop-gates');
  const completion: Array<() => void> = [];
  for (const leaf of gates.children) {
    Object.defineProperty(leaf, 'animate', { value: vi.fn(() => ({
      finished: new Promise<void>(resolve => completion.push(resolve)), cancel: vi.fn(),
    })) });
  }
  return { gates, completion };
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
  vi.resetModules(); vi.clearAllMocks(); fakes.acquire.mockReset().mockResolvedValue('acquired');
  document.body.innerHTML = '<div id="app"></div>';
  document.body.className = '';
  localStorage.clear();
  frameCallback = null; now = 1000; fakes.pause = null; fakes.assets = undefined;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(window,'scrollTo').mockImplementation(() => {});
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
  removeListeners(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  document.body.innerHTML = ''; localStorage.clear();
});

describe('save protection at startup', () => {
  it('retries an occupied lock without reloading or losing a saved run', async () => {
    const run = fundedRun();
    const encoded = serializeState(run);
    localStorage.setItem(SAVE_KEY, encoded);
    fakes.acquire.mockResolvedValueOnce('busy');
    await import('./main');
    await vi.waitFor(() => expect(element('#modal-title').textContent).toBe('Защита сохранения'));
    expect(button('#start').disabled).toBe(true);
    expect(localStorage.getItem(SAVE_KEY)).toBe(encoded);
    closeModal();
    await vi.waitFor(() => expect(button('#resume').disabled).toBe(false));
    expect(localStorage.getItem(SAVE_KEY)).toBe(encoded);
    window.dispatchEvent(new Event('pagehide'));
    expect(fakes.release).toHaveBeenCalledOnce();
  });
  it('does not blame another tab when the browser denies the lock API', async () => {
    fakes.acquire.mockResolvedValueOnce('unavailable');
    await import('./main');
    await vi.waitFor(() => expect(element('#modal-body').textContent).toContain('Браузер не дал'));
    expect(button('#start').disabled).toBe(true);
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  });
});

describe('startup', () => {
  it.each([
    { ready: true, loadMs: 700 },
    { ready: true, loadMs: 4200 },
    { ready: false, loadMs: 700 },
  ])('waits for both three seconds and model readiness ($ready after $loadMs ms)', async ({ ready, loadMs }) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const page = new DOMParser().parseFromString(readFileSync('index.html', 'utf8'), 'text/html');
    document.body.append(page.querySelector('.boot-filter')!, page.querySelector('#boot')!);
    element('#app').inert = true;
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    let finish!: (ok: boolean) => void;
    fakes.assets = new Promise(resolve => { finish = resolve; });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await import('./main');
    expect(element('#app').inert).toBe(true);
    expect(element('#boot-status').textContent).toBe('ИНИЦИАЛИЗАЦИЯ СИСТЕМЫ');
    expect(document.querySelector('.menu-announcement')).toBeNull();
    expect(fakes.ready).not.toHaveBeenCalled();
    expect(frameCallback).toBeNull();
    now += loadMs;
    await vi.advanceTimersByTimeAsync(loadMs);
    expect(element('#app').inert).toBe(true);
    expect(fakes.ready).not.toHaveBeenCalled();
    finish(ready);
    await vi.advanceTimersByTimeAsync(0);
    if (ready) {
      if (loadMs < 3000) {
        now += 2999 - loadMs;
        await vi.advanceTimersByTimeAsync(2999 - loadMs);
        expect(element('#app').inert).toBe(true);
        expect(fakes.ready).not.toHaveBeenCalled();
        now++;
        await vi.advanceTimersByTimeAsync(1);
      }
      expect(fakes.ready).toHaveBeenCalledOnce();
      expect(document.querySelector('#boot')).toBeNull();
      expect(element('.menu-announcement strong').textContent).toBe('Новинка в магазине');
      expect(element('#app').inert).toBe(false);
      expect(frameCallback).not.toBeNull();
    } else {
      expect(button('#boot-retry').hidden).toBe(false);
      expect(element('#app').inert).toBe(true);
      expect(fakes.ready).not.toHaveBeenCalled();
      expect(frameCallback).toBeNull();
    }
    consoleError.mockRestore();
  });
});

describe('main menu', () => {
  it('queues two test announcements, preserves the queue across navigation, and never adds a shop badge', async () => {
    await boot();
    expect(element('.menu-announcement strong').textContent).toBe('Новинка в магазине');
    expect(document.querySelector('#open-module-shop i')).toBeNull();
    click('.menu-announcement-close');
    expect(element('.menu-announcement strong').textContent).toBe('Сообщение мастерской');
    expect(document.activeElement).toBe(button('.menu-announcement-close'));
    click('.menu-announcement-action');
    expect(element('#screen-heading').textContent).toBe('МАСТЕРСКАЯ');
    click('#workshop-back');
    expect(element('.menu-announcement-slot').hidden).toBe(false);
    expect(element('.menu-announcement-slot').childElementCount).toBe(0);
    expect(element('.title-tip').textContent).toContain('Совет');
  });

  it('leaves notifications dismissible when a saved run prevents opening workshop or shop', async () => {
    await boot(fundedRun());
    expect(button('.menu-announcement-action').disabled).toBe(true);
    click('.menu-announcement-close');
    expect(button('.menu-announcement-action').disabled).toBe(true);
    click('.menu-announcement-close');
    expect(element('.menu-announcement-slot').hidden).toBe(false);
    expect(element('.menu-announcement-slot').childElementCount).toBe(0);
    expect(document.activeElement).toBe(button('#resume'));
  });

  it('opens the workshop, purchases a permanent upgrade, and returns to the menu', async () => {
    const profile = createState(); profile.profile.crystals = 5;
    await boot(profile);
    expect(element('.shell').classList.contains('at-front-menu')).toBe(true);
    expect(element('nav.armored-frame')).toBe(element('.title-console'));
    key('1');
    click('#open-workshop');
    expect(element('.shell').classList.contains('at-workshop')).toBe(true);
    expect(document.activeElement).toBe(element('#screen-heading'));
    expect(element('section.armored-frame')).toBe(element('.workshop-rack'));
    expect(element('#menu-crystals').textContent).toBe('5');
    expect(element('#workshop-damage .workshop-next').textContent).toBe('→ 11 урона');
    advanceFrames();
    expect(fakes.render.mock.calls.at(-1)?.[0].phase).toBe('workshop');
    expect(fakes.render.mock.calls.at(-1)?.[1]).toBeGreaterThan(0);
    click('#workshop-damage .workshop-name');
    expect(element('#menu-crystals').textContent).toBe('2');
    expect(saved().profile.meta.damage).toBe(1);
    key('Escape');
    expect(element('.shell').classList.contains('at-front-menu')).toBe(true);
    expect(document.activeElement).toBe(button('#open-workshop'));
    click('#menu-help');
    expect(element('#modal-title').textContent).toBe('Как защитить оплот');
  });
  it('switches only after both metal gates close and restores focus when they reopen', async () => {
    await boot();
    const { gates, completion } = mockGateMotion();
    click('#open-workshop');
    click('#open-workshop');
    expect(gates.hidden).toBe(false);
    expect(element('.shell').inert).toBe(true);
    expect(completion).toHaveLength(2);
    completion[0]();
    await Promise.resolve();
    expect(element('.shell').classList.contains('at-front-menu')).toBe(true);
    completion[1]();
    await vi.waitFor(() => expect(completion).toHaveLength(4));
    expect(element('.shell').classList.contains('at-workshop')).toBe(true);
    expect(gates.hidden).toBe(false);
    completion[2](); completion[3]();
    await vi.waitFor(() => expect(gates.hidden).toBe(true));
    expect(element('.shell').inert).toBe(false);
    expect(document.activeElement).toBe(element('#screen-heading'));
  });
  it('shows next values and price without displaying upgrade levels', async () => {
    const profile = createState(); profile.profile.crystals = 0; profile.profile.meta.damage = 10;
    await boot(profile);
    click('#open-workshop');
    expect(button('[data-workshop-stat="damage"]').disabled).toBe(true);
    expect(element('[data-workshop-stat="damage"] .workshop-price').textContent).toBe('◇ 173');
    expect(element('[data-workshop-stat="damage"]').getAttribute('aria-label')).toContain('цена: 173');
    expect(element('#workshop-damage .workshop-next').textContent).toBe('→ 21 урона');
    expect(document.querySelector('.workshop-level')).toBeNull();
    expect(button('#workshop-damage').getAttribute('aria-label')).not.toContain('уровень');
    expect(button('#workshop-damage').querySelector('button')).toBeNull();
    for (const [stat, next] of [['maxHp', '→ 110 HP'], ['attackSpeed', '→ 1,1 /с'], ['regen', '→ 0,2 HP/с']]) {
      const purchase = button(`[data-workshop-stat="${stat}"]`);
      expect(purchase.disabled).toBe(true);
      expect(purchase.querySelector('.workshop-price')?.textContent).toBe('◇ 3');
      expect(element(`#workshop-${stat} .workshop-next`).textContent).toBe(next);
    }
  });
  it('animates the title independently while leaving a saved run paused', async () => {
    const initial = fundedRun();
    await boot(initial);
    advanceFrames(3);
    const [frame, delta] = fakes.render.mock.calls.at(-1)!;
    expect(frame.phase).toBe('title');
    expect(frame.paused).toBe(true);
    expect(frame.elapsed).toBe(initial.run!.time);
    expect(delta).toBeGreaterThan(0);
    expect(saved().run).toEqual(initial.run);
    click('#menu-help'); advanceFrames();
    expect(fakes.render.mock.calls.at(-1)![1]).toBe(0);
  });
  it('buys an improvement for crystals in the workshop and carries it into battle', async () => {
    const initial=createState(); initial.profile.crystals=10;
    await boot(initial); click('#open-workshop');
    expect(element('#workshop-list-attack').hasAttribute('hidden')).toBe(false);
    expect(element('#workshop-list-attack').querySelectorAll('button')).toHaveLength(5);
    expect(element('#workshop-list-defense').hasAttribute('hidden')).toBe(true);
    click('#workshop-tab-defense');
    expect(element('#workshop-list-attack').hasAttribute('hidden')).toBe(true);
    expect(element('#workshop-list-defense').querySelectorAll('button')).toHaveLength(3);
    click('#workshop-tab-repair');
    expect(element('#workshop-list-repair').querySelectorAll('button')).toHaveLength(3);
    click('#workshop-tab-modules');
    expect(element('#workshop-list-modules').querySelectorAll('button')).toHaveLength(2);
    click('#workshop-tab-attack');
    click('#workshop-critical');
    expect(saved().profile.enhancements?.critical).toBe(1);
    expect(saved().profile.crystals).toBe(4);
    expect(element('#workshop-critical .workshop-current').textContent).toBe('10%');
    click('#workshop-back'); click('#start');
    expect(saved().run?.enhancements?.levels.critical).toBe(1);
    expect(element('#upgrade-critical .upgrade-price').textContent).toBe('◈ 26');
    expect(element('#upgrade-critical .upgrade-value').textContent).toMatch(/^10%/);
  });

  it('previews shop modules without spending, buys once, and upgrades only in the workshop', async () => {
    const initial=createState();initial.profile.crystals=30;
    await boot(initial);click('#open-workshop');click('#workshop-tab-modules');
    expect(button('#workshop-pulse').disabled).toBe(true);
    expect(element('#workshop-pulse .workshop-current').textContent).toBe('Купи в магазине');
    click('#workshop-back');click('#open-module-shop');
    expect(element('#screen-heading').textContent).toBe('МАГАЗИН');
    expect(element('.module-shop-rack').querySelectorAll('button')).toHaveLength(3);
    advanceFrames(2);expect(fakes.render.mock.calls.at(-1)?.[0].phase).toBe('shop');
    expect(element('#shop-pulse .module-shop-more').textContent).toBe('Подробнее');
    expect(element('#shop-pulse .workshop-price').textContent).toBe('◇ 8');
    click('#shop-pulse');
    expect(element('#module-detail-heading').textContent).toBe('Импульс');
    expect(element('.shell').inert).toBe(true);
    advanceFrames(2);
    const [frame, delta] = fakes.render.mock.calls.at(-1)!;
    expect(frame).toMatchObject({phase:'shop',paused:true,elapsed:0});
    expect(delta).toBeGreaterThan(0);
    window.dispatchEvent(new Event('blur'));
    advanceFrames();
    expect(fakes.render.mock.calls.at(-1)![1]).toBe(0);
    window.dispatchEvent(new Event('focus'));
    expect(element('#module-detail-cooldown').textContent).toBe('10 с');
    expect(element('.module-detail-sheet').textContent).not.toMatch(/выключен|включён/i);
    expect(element('.module-detail-sheet').querySelectorAll('.module-detail-chain')).toHaveLength(2);
    expect(saved().profile.crystals).toBe(30);
    expect(button('#module-detail-buy').textContent).toBe('Купить за ◇ 8');
    click('#module-detail-buy');expect(saved().profile.crystals).toBe(22);
    expect(element('#shop-pulse').classList.contains('purchased')).toBe(true);
    expect(element('#shop-pulse .module-shop-ribbon').textContent).toBe('Куплено');
    expect(element('#shop-pulse .module-shop-more').textContent).toBe('Подробнее');
    expect(button('#module-detail-buy').disabled).toBe(true);
    click('#module-detail-close');expect(document.activeElement).toBe(button('#shop-pulse'));
    click('#shop-pulse');expect(button('#module-detail-buy').disabled).toBe(true);
    key('Escape',button('#module-detail-close'));
    click('#module-shop-back');expect(document.activeElement).toBe(button('#open-module-shop'));
    click('#open-workshop');click('#workshop-tab-modules');click('#workshop-pulse');
    expect(saved().profile.enhancements?.pulse).toBe(2);
    expect(saved().profile.crystals).toBe(10);
  });

  it('opens details with too few crystals but does not allow a purchase', async () => {
    const initial=createState();initial.profile.crystals=3;
    await boot(initial);click('#open-module-shop');click('#shop-scanner');
    expect(button('#module-detail-buy').disabled).toBe(true);
    expect(element('#module-detail-note').textContent).toContain('3');
    expect(saved().profile.crystals).toBe(3);
  });

  it('prioritizes the saved run and does not open a workshop during it', async () => {
    await boot(fundedRun());
    expect(button('#start').disabled).toBe(true);
    expect(button('#resume').disabled).toBe(false);
    expect(button('#open-workshop').disabled).toBe(true);
  });
});

describe('fullscreen battle actual UI flows', () => {
  it.each(['#start', '#resume'])('holds the battle until the shared gates reopen for %s', async trigger => {
    const profile = trigger === '#resume' ? fundedRun() : undefined;
    await boot(profile);
    const { gates, completion } = mockGateMotion();
    click(trigger);
    click(trigger);
    expect(completion).toHaveLength(2);
    expect(gates.hidden).toBe(false);
    expect(element('.shell').inert).toBe(true);
    completion[0]();
    await Promise.resolve();
    expect(hidden('#battle-hud')).toBe(true);
    completion[1]();
    await vi.waitFor(() => expect(hidden('#battle-hud')).toBe(false));
    const battleStart = profile?.run?.time ?? 0;
    advanceFrames(3);
    expect(elapsed()).toBe(battleStart);
    expect(fakes.pause!.paused).toBe(true);
    await vi.waitFor(() => expect(completion).toHaveLength(4));
    expect(gates.hidden).toBe(false);
    advanceFrames(3);
    expect(elapsed()).toBe(battleStart);
    completion[2](); completion[3]();
    await vi.waitFor(() => expect(gates.hidden).toBe(true));
    expect(element('.shell').inert).toBe(false);
    expect(document.activeElement).toBe(button('#battle-menu-toggle'));
    advanceFrames(3);
    expect(elapsed()).toBeGreaterThan(battleStart);
  });

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
    expect(document.querySelectorAll('#upgrades .upgrade').length).toBe(13);
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
    expect(upgrades.querySelectorAll('.upgrade')).toHaveLength(13);
    expect(hud.contains(upgrades)).toBe(false);
    expect(workspace.contains(upgrades)).toBe(false);
  });

  it('shows final-boss health inside the status row, retaining it through save and resume', async () => {
    const initial = fundedRun(), run = initial.run!;
    run.wave = 30; run.lastPaidWave = 29; run.earnedCrystals = 29; run.spawned = 1; run.nextEntityId = 2;
    run.enemies = [{ id: `${run.id}:1`, kind: 'boss', x: 0, y: 11, hp: 312, maxHp: 624, damage: 42, speed: 1.4, attackInterval: 2, attackCooldown: 0, attackPhase: 'approach', attackTime: 0, attackDuration: 0 }];
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

  it('forwards ranged attack poses and hostile projectiles, freezing both while the menu owns pause', async () => {
    const initial=fundedRun(),run=initial.run!,stats=enemyStats('ranged',6);
    run.wave=6;run.lastPaidWave=5;run.earnedCrystals=5;run.spawned=1;run.nextEntityId=3;
    run.enemies=[{id:`${run.id}:1`,kind:'ranged',x:7.5,y:0,hp:stats.maxHp,...stats,attackCooldown:0,attackPhase:'windup',attackTime:.2,attackDuration:attackConfig('ranged').windup}];
    // reward is config metadata, not a stored Enemy field.
    delete (run.enemies[0] as unknown as Record<string,unknown>).reward;
    run.enemyProjectiles=[{id:`${run.id}:2`,sourceId:`${run.id}:1`,x:4,y:0,damage:stats.damage,speed:ENEMY_PROJECTILE_SPEED}];
    await boot(initial);click('#resume');advanceFrames();
    const first=fakes.render.mock.calls.at(-1)![0] as SceneFrame;
    expect(first.enemies[0]).toMatchObject({kind:'ranged',attackPhase:'windup',attackDuration:.8});
    expect(first.enemyProjectiles).toHaveLength(1);expect(first.paused).toBe(false);
    openDrawer();advanceFrames(5);
    const frozen=fakes.render.mock.calls.at(-1)![0] as SceneFrame;
    expect(frozen.paused).toBe(true);expect(frozen.enemies).toEqual(first.enemies);expect(frozen.enemyProjectiles).toEqual(first.enemyProjectiles);
    click('#battle-menu-return');advanceFrames();
    const resumed=fakes.render.mock.calls.at(-1)![0] as SceneFrame;
    expect(resumed.paused).toBe(false);expect(resumed.enemyProjectiles![0].x).toBeLessThan(first.enemyProjectiles![0].x);
    expect(resumed.enemies[0].attackTime).toBeGreaterThan(first.enemies[0].attackTime!);
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
    for (const [tab, stats] of [['attack', ['damage', 'attackSpeed']], ['defense', ['maxHp']], ['repair', ['regen']]] as const) {
      click(`#battle-tab-${tab}`);
      for (const stat of stats) {
        expect(button(`#upgrade-${stat}`).closest('[role="tabpanel"]')?.hasAttribute('hidden')).toBe(false);
        click(`#upgrade-${stat}`);
      }
    }
    const after = saved(), stats = getStats(after);
    for (const stat of STAT_KEYS) {
      expect(stats[stat]).toBeGreaterThan(oldStats[stat]);
      expect(after.run!.activeLevels[stat]).toBe(1);
      expect(document.querySelector(`#upgrade-${stat} .upgrade-level`)).toBeNull();
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
    expect(button('#resume').disabled).toBe(false);
    expect(document.activeElement).toBe(button('#resume'));
    expect(button('#start').disabled).toBe(true);
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
    expect(button('#start').disabled).toBe(false);
    expect(document.activeElement).toBe(button('#start'));
    expect(button('#resume').disabled).toBe(true);
    expect(element('#menu-crystals').textContent).toBe('17');
    expect(fakes.pause?.reasons.has('battleMenu')).toBe(false);
    expect(fakes.pause?.reasons.has('dialog')).toBe(false);
  });
});
