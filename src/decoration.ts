/** Static visual dressing, deliberately independent from the simulation's RNG. */
export type GroundPoint = readonly [x: number, z: number];
export interface GroundSurface {
  kind: 'dust' | 'asphalt' | 'scar' | 'paint';
  points: GroundPoint[];
  height: number;
  color: number;
}
export interface GroundCrack { from: GroundPoint; to: GroundPoint; width: number }
export interface WastelandRubble {
  kind: 'concrete' | 'rust' | 'stone';
  x: number; z: number; width: number; depth: number; height: number; rotation: number; color: number;
}
export interface DryGrass { x: number; z: number; height: number; spread: number; rotation: number }
export interface WastelandLayout {
  surfaces: GroundSurface[];
  cracks: GroundCrack[];
  rubble: WastelandRubble[];
  grass: DryGrass[];
}
export const WASTELAND_LIMITS = {
  groundHeight: .048,
  surfaceHeight: .061,
  raisedClearRadius: 10.8,
  rubbleHeight: .32,
  grassHeight: .46,
  maxSurfaces: 210,
  maxCracks: 360,
  maxRubble: 90,
  maxGrass: 45,
} as const;

function randomSequence(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = Math.imul(state ^ state >>> 15, state | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

/** One continuous, traversable wasteland; the decoration never supplies colliders. */
export function createWastelandLayout(seed = 0x57415354): WastelandLayout {
  const random = randomSequence(seed);
  const between = (a: number, b: number) => a + random() * (b - a);
  const pick = (colors: number[]) => colors[Math.floor(random() * colors.length)];
  const layout: WastelandLayout = { surfaces: [], cracks: [], rubble: [], grass: [] };
  const roadAngle = .22, c = Math.cos(roadAngle), s = Math.sin(roadAngle);
  const roadPoint = (x: number, z: number): GroundPoint => [c * x + s * z - 2.4, -s * x + c * z + 1.5];
  const polygon = (x: number, z: number, width: number, depth: number, sides: number): GroundPoint[] =>
    Array.from({ length: sides }, (_, i) => {
      const a = i * Math.PI * 2 / sides;
      const r = between(.65, 1);
      return [x + Math.cos(a) * width * r, z + Math.sin(a) * depth * r];
    });

  // Broad wind-blown soil stains. Irregular islands, never tiles or a radial pad.
  for (let i = 0; i < 58; i++) {
    layout.surfaces.push({ kind: 'dust', points: polygon(between(-38, 38), between(-43, 43), between(2, 6.5), between(1.2, 4.5), 7), height: .049 + i * .000015, color: pick([0x8b846e, 0x999077, 0x898570, 0xa0967b]) });
  }

  // An old road runs through and beyond the visible field, with torn shoulders.
  const left: GroundPoint[] = [], right: GroundPoint[] = [];
  const leftShoulder: GroundPoint[] = [], rightShoulder: GroundPoint[] = [];
  for (let z = -58; z <= 58; z += 4) {
    const bend = Math.sin(z * .09) * .45;
    const lx = -3.65 + bend + between(-.45, .40), rx = 3.65 + bend + between(-.40, .45);
    left.push(roadPoint(lx, z)); right.push(roadPoint(rx, z));
    leftShoulder.push(roadPoint(lx - between(.25, 1.0), z));
    rightShoulder.push(roadPoint(rx + between(.25, .9), z));
  }
  layout.surfaces.push({ kind: 'dust', points: [...leftShoulder, ...rightShoulder.reverse()], height: .051, color: 0x746f5e });
  layout.surfaces.push({ kind: 'asphalt', points: [...left, ...right.reverse()], height: .053, color: 0x5c635c });

  // Weathered resurfacing and earthen potholes break the road into natural scars.
  for (let i = 0; i < 34; i++) {
    const points = polygon(between(-2.8, 2.8), between(-52, 52), between(.25, 1.8), between(.3, 2.7), 6).map(([x, z]) => roadPoint(x, z));
    layout.surfaces.push({ kind: i % 4 === 0 ? 'scar' : 'asphalt', points, height: .054 + i * .000035, color: i % 4 === 0 ? pick([0x88806a, 0x777361]) : pick([0x555d56, 0x62675e, 0x686b60]) });
  }

  // Broken ochre center paint is intentionally a different visual language to range.
  for (let z = -53; z < 54; z += 3.15) {
    if (random() < .2) continue;
    for (const side of [-1, 1]) {
      const x = side * .13 + Math.sin(z * .09) * .45;
      const length = between(.65, 1.65), w = between(.042, .065);
      layout.surfaces.push({ kind: 'paint', points: [roadPoint(x - w, z), roadPoint(x + w, z + .08), roadPoint(x + w * .7, z + length), roadPoint(x - w, z + length - .12)], height: .060, color: pick([0xa49661, 0xb0a274, 0x94885b]) });
    }
  }

  // Fine branching fissures cross both dirt and asphalt. They are paint-flat.
  for (let i = 0; i < 45; i++) {
    const onRoad = i < 25;
    let point: GroundPoint = onRoad ? roadPoint(between(-3.2, 3.2), between(-43, 43)) : [between(-25, 25), between(-31, 31)];
    let angle = between(0, Math.PI * 2);
    const segments = 3 + i % 4;
    for (let j = 0; j < segments; j++) {
      angle += between(-.7, .7);
      const length = between(.32, .9);
      const next: GroundPoint = [point[0] + Math.cos(angle) * length, point[1] + Math.sin(angle) * length];
      layout.cracks.push({ from: point, to: next, width: between(.018, .043) });
      if (j === 1 || j === 3) {
        const branch = angle + (j === 1 ? 1 : -1) * between(.7, 1.35);
        layout.cracks.push({ from: next, to: [next[0] + Math.cos(branch) * .48, next[1] + Math.sin(branch) * .48], width: .018 });
      }
      point = next;
    }
  }

  // Asymmetric little wreck sites, well clear of the central firing-radius paint.
  // Everything is lower than a mech's ankles/knees, so approaches remain legible.
  const sites: GroundPoint[] = [[-12, -4], [-5, -15], [10, -10], [15, 5], [4, 19], [-15, 12], [20, -13], [-12, -25], [12, 26], [-23, -5]];
  for (const [sx, sz] of sites) {
    for (let i = 0; i < 7; i++) {
      const x = sx + between(-2.2, 2.2), z = sz + between(-1.6, 1.6);
      const kind = i === 0 || i === 3 ? 'rust' : i < 5 ? 'concrete' : 'stone';
      const width = kind === 'rust' ? between(.7, 1.6) : between(.24, .95);
      const depth = kind === 'rust' ? between(.4, .95) : between(.25, .85);
      // Keep every corner, not just the center, outside the open central area.
      if (Math.hypot(x, z) - Math.hypot(width, depth) / 2 < WASTELAND_LIMITS.raisedClearRadius) continue;
      layout.rubble.push({ kind, x, z, width, depth, height: kind === 'rust' ? between(.035, .065) : between(.10, WASTELAND_LIMITS.rubbleHeight), rotation: between(0, Math.PI * 2), color: kind === 'rust' ? pick([0x795139, 0x815e43, 0x695546]) : kind === 'concrete' ? pick([0x8b8c7b, 0x9c9986, 0x777e72]) : pick([0x727867, 0x7f806c]) });
    }
    for (let i = 0; i < 4; i++) {
      const x = sx + between(-3, 3), z = sz + between(-2.7, 2.7), spread = between(.13, .27);
      if (Math.hypot(x, z) - spread < WASTELAND_LIMITS.raisedClearRadius) continue;
      layout.grass.push({ x, z, height: between(.24, WASTELAND_LIMITS.grassHeight), spread, rotation: between(0, Math.PI * 2) });
    }
  }
  return layout;
}
