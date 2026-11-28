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
