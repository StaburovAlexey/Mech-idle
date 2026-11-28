/** Sweep the existing VHS filter across one element; cleanup leaves the rest of the page untouched. */
export function trackVhs(element: HTMLElement, duration: number, loop = false, height = element.offsetHeight) {
  const band = document.querySelector('#boot-band');
  if (!band) return () => {};
  const started = performance.now();
  const strip = Math.min(96, Math.max(16, height * .58));
  band.setAttribute('height', String(strip));
  element.classList.add('boot-tracking');
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    element.classList.remove('boot-tracking');
    band.setAttribute('y', '-96');
  };
  const draw = (now: number) => {
    const elapsed = Math.max(0, now - started) / duration;
    if (!loop && elapsed >= 1) { stop(); return; }
    const progress = elapsed % 1;
    band.setAttribute('y', String(Math.round(-strip + progress * (height + strip + 16))));
    frame = requestAnimationFrame(draw);
  };
  draw(started);
  return stop;
}
