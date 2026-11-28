/** Keep one logical frame, fitting it inside the phone safe area or desktop window. */
export function bindGameFrame(stage: HTMLElement) {
  const viewport = stage.parentElement!;
  const fit = () => {
    const scale = Math.min(viewport.clientWidth / stage.clientWidth, viewport.clientHeight / stage.clientHeight);
    if (scale > 0) stage.style.setProperty('--game-scale', String(scale));
  };
  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(viewport);
}
const stage = document.querySelector<HTMLElement>('#game-stage');
if (stage) bindGameFrame(stage);
