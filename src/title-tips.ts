import { trackVhs } from './vhs';

export const TITLE_TIPS = [
  'Улучшай турель между боями.',
  'Береги золото для ремонта.',
  'Покупай модули в магазине.',
  'Сохрани забег через меню боя.',
] as const;

export function rotateTitleTips(panel: HTMLElement) {
  const tips = [...panel.querySelectorAll<HTMLElement>('.title-tip-text p')];
  let current = 0;
  let stop = () => {};
  const timer = window.setInterval(() => {
    if (document.hidden) return;
    tips[current].classList.remove('current');
    current = (current + 1) % tips.length;
    tips[current].classList.add('current');
    stop();
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      stop = trackVhs(panel, 480);
  }, 5000);
  return () => { window.clearInterval(timer); stop(); };
}
