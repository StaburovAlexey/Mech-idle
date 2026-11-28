// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { titleMarkup } from './title-ui';
import { rotateTitleTips, TITLE_TIPS } from './title-tips';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('cycles through the original tip and three new ones every five seconds, stopping on exit', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  document.body.innerHTML = titleMarkup;
  const panel = document.querySelector<HTMLElement>('.title-tip')!;
  const current = () => panel.querySelector('.current')?.textContent;
  const stop = rotateTitleTips(panel);

  for (const tip of TITLE_TIPS) {
    expect(current()).toBe(tip);
    vi.advanceTimersByTime(4999);
    expect(current()).toBe(tip);
    vi.advanceTimersByTime(1);
  }
  expect(current()).toBe(TITLE_TIPS[0]);
  expect(panel.classList.contains('boot-tracking')).toBe(false);
  stop();
  vi.advanceTimersByTime(5000);
  expect(current()).toBe(TITLE_TIPS[0]);
});

it('scrambles only the visual text before resolving it left to right', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  document.body.innerHTML = titleMarkup;
  const panel = document.querySelector<HTMLElement>('.title-tip')!;
  const code = panel.querySelector('.title-tip-code')!;
  const stop = rotateTitleTips(panel);

  vi.advanceTimersByTime(5000);
  expect(code.getAttribute('aria-hidden')).toBe('true');
  expect(panel.querySelector('.current')?.textContent).toBe(TITLE_TIPS[1]);
  expect(code.firstChild?.textContent).toBe('');
  expect(code.lastChild?.textContent).not.toBe(TITLE_TIPS[1]);
  expect(code.textContent).toHaveLength(TITLE_TIPS[1].length);

  vi.advanceTimersByTime(300);
  const solved = code.firstChild?.textContent ?? '';
  expect(solved.length).toBeGreaterThan(0);
  expect(solved.length).toBeLessThan(TITLE_TIPS[1].length);
  expect(TITLE_TIPS[1].startsWith(solved)).toBe(true);

  vi.advanceTimersByTime(300);
  expect(code.textContent).toBe('');
  expect(panel.querySelector('.scrambling')).toBeNull();

  vi.advanceTimersByTime(4400);
  expect(panel.querySelector('.scrambling')).not.toBeNull();
  stop();
  expect(panel.querySelector('.scrambling')).toBeNull();
});
