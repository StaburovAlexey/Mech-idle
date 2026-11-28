import { trackVhs } from './vhs';

export const TITLE_TIPS = [
  'Улучшай турель между боями.',
  'Береги золото для ремонта.',
  'Покупай модули в магазине.',
  'Сохрани забег через меню боя.',
] as const;

const MATRIX_MS = 560;
const GLYPHS = '0101XYZКМФ#%+<>';

export function rotateTitleTips(panel: HTMLElement, ripple = () => true) {
  const copy = panel.querySelector<HTMLElement>('.title-tip-text')!;
  const tips = [...copy.querySelectorAll<HTMLElement>('p:not(.title-tip-code)')];
  const code = copy.querySelector<HTMLElement>('.title-tip-code')!;
  const solved = code.firstChild!;
  const scrambled = code.lastChild!;
  let current = 0;
  let frame = 0;
  let stopRipple = () => {};
  const stopScramble = () => {
    cancelAnimationFrame(frame);
    copy.classList.remove('scrambling');
    solved.textContent = scrambled.textContent = '';
  };
  const timer = window.setInterval(() => {
    if (document.hidden) return;
    tips[current].classList.remove('current');
    current = (current + 1) % tips.length;
    const next = tips[current];
    next.classList.add('current');
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    stopRipple();
    stopRipple = ripple() ? trackVhs(panel, 480) : () => {};
    const text = next.textContent ?? '';
    const start = performance.now();
    let lastPaint = -Infinity;
    copy.classList.add('scrambling');
    const draw = (now: number) => {
      const elapsed = now - start;
      if (elapsed >= MATRIX_MS) { stopScramble(); return; }
      if (now - lastPaint >= 38) {
        lastPaint = now;
        const fixed = Math.floor(text.length * Math.max(0, elapsed / MATRIX_MS));
        solved.textContent = text.slice(0, fixed);
        scrambled.textContent = text.slice(fixed).replace(/[\p{L}\p{N}]/gu, () =>
          GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
      }
      frame = requestAnimationFrame(draw);
    };
    draw(start);
  }, 5000);
  return () => {
    window.clearInterval(timer);
    stopRipple();
    stopScramble();
  };
}
