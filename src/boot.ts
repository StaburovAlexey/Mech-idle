import { trackVhs } from './vhs';

const MIN_BOOT_MS = 3000;
const delay = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));

const uiImages = [
  'title/sand-city.webp', 'workshop/outdoor-workshop.webp', 'shared/armored-frame.svg',
  'kenney-sci-fi/panel_glass_screws.png', 'kenney-sci-fi/button_square_header_large_rectangle_screws.png',
  'kenney-sci-fi/bar_shadow_round_outline_small.png', 'kenney-sci-fi/bar_round_gloss_small.png',
  'kenney-sci-fi/bar_round_gloss_small_red.png', 'kenney-ui/icon_cross_red.png',
  ...['flat', 'flat_grey', 'depth_flat', 'depth_flat_grey', 'depth_gloss', 'depth_gloss_grey'].map(name => `kenney-ui/button_rectangle_${name}.png`),
  ...['plate_large', 'btn_standard_normal', 'btn_standard_hover', 'btn_standard_pressed', 'btn_standard_disabled', 'hazard_strip', 'gauge_frame', 'gauge_fill_hull'].map(name => `driftworks/${name}.png`),
  ...['play', 'settings', 'info', 'close', 'attack', 'hull_plate', 'thruster', 'medkit'].map(name => `driftworks/${name}.svg`),
];

export function loadInterface() {
  return Promise.all([
    document.fonts.load('800 16px "JetBrains Mono"', 'ОПЛОТ'),
    ...uiImages.map(path => {
      const image = new Image();
      image.src = import.meta.env.BASE_URL + 'assets/ui/' + path;
      return image.decode();
    }),
  ]);
}

export async function waitForBoot(assets: Promise<unknown>) {
  let timer: number | undefined;
  try {
    await Promise.race([assets, new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error('Asset load timed out')), 45_000);
    })]);
  } finally {
    window.clearTimeout(timer);
  }
}

export function bootScreen(app: HTMLElement) {
  const boot = document.querySelector<HTMLElement>('#boot');
  if (!boot) return;
  const display = boot.querySelector<HTMLElement>('#boot-display')!;
  const beam = boot.querySelector<HTMLElement>('#boot-beam')!;
  const motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !!display.animate;
  const started = performance.now();
  let stop = () => {};
  const animate = (element: HTMLElement, keyframes: Keyframe[], duration: number) =>
    element.animate(keyframes, { duration, fill:'both' });

  if (motion) stop = trackVhs(display, 1180, true);

  return {
    fail(message: string) {
      stop();
      display.hidden = false;
      boot.dataset.phase = 'error';
      boot.querySelector('#boot-status')!.textContent = message;
      const retry = boot.querySelector<HTMLButtonElement>('#boot-retry')!;
      retry.hidden = false;
      retry.onclick = () => location.reload();
      retry.focus();
    },
    async reveal(onShow: () => void) {
      // Assets may take longer; only wait out the remainder on a fast load.
      const remaining = MIN_BOOT_MS - (performance.now() - started);
      if (remaining > 0) await delay(remaining);
      if (motion) {
        stop();
        const darken = animate(display, [
          { transform:'scale(1)', filter:'brightness(1)' },
          { transform:'scale(.88,.003)', filter:'brightness(.65)', easing:'ease-in' },
        ], 300);
        await darken.finished;
        const off = animate(beam, [
          { transform:'scaleX(.93)', opacity:.86 }, { transform:'scaleX(0)', opacity:0 },
        ], 135);
        display.hidden = true;
        darken.cancel();
        await off.finished;
        off.cancel();
        await delay(105);
      }

      onShow();
      boot.dataset.phase = 'menu';
      if (motion) {
        const origin = `50% ${window.innerHeight / 2}px`;
        const light = animate(beam, [
          { transform:'scaleX(0)', opacity:0 }, { transform:'scaleX(1)', opacity:.8 },
        ], 130);
        const hold = animate(app, [{ transformOrigin:origin, transform:'scale(.93,.003)', opacity:0 }], 1000);
        await light.finished;
        hold.cancel();
        const open = animate(app, [
          { transformOrigin:origin, transform:'scale(.93,.004)', opacity:.58, easing:'cubic-bezier(.18,.69,.23,1)' },
          { transformOrigin:origin, transform:'none', opacity:1 },
        ], 380);
        const fade = animate(beam, [{ transform:'scaleX(1)', opacity:.8 }, { transform:'scaleX(1)', opacity:0 }], 125);
        light.cancel();
        await open.finished;
        open.cancel();
        fade.cancel();
        const title = app.querySelector<HTMLElement>('.shell')!;
        stop = trackVhs(title, 780, false, window.innerHeight);
        await delay(780);
        stop();
      }
      boot.remove();
    },
  };
}
