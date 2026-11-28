import * as THREE from 'three';

export const CITY_YAW = Math.atan2(14, 17) - .20;
// Long windward slopes, tight leeward faces. Keep all crests outside the spawn ring.
const drifts = [
  [-6.2, 13.55, 5.8, 3.1, 1.45], [7.1, 13.5, 5.0, 2.8, 1.65],
  [-5.5, -16.2, 7.2, 4.2, 2.05], [5.7, -21.6, 7.3, 4.8, 1.95],
  [-13.1, -14.9, 5.4, 4.2, 1.5], [12.9, -15.6, 5.9, 4.5, 1.6],
  [-15.0, 2.4, 3.5, 6.2, 1.3], [15.2, -.7, 3.5, 6.4, 1.28],
] as const;
const DUNE_START = 13.15, DUNE_FULL = 15.25;
const LEE_WIDTH = .53;
const CREST_CURVE = .19;
const CREST_SKEW = .22;

export function sandHeight(x: number, z: number) {
  let rise = 0;
  for (const [cx, cz, wx, wz, h] of drifts) {
    const u = (x - cx) / wx;
    const v = (z - cz + (x - cx) * CREST_SKEW) / wz + CREST_CURVE * u * u;
    const face = v < 0 ? v / LEE_WIDTH : v;
    rise += h * Math.exp(-u * u - face * face);
  }
  return .053 + THREE.MathUtils.smoothstep(Math.hypot(x, z), DUNE_START, DUNE_FULL) * rise;
}

/** Same height field in the warning shader. Vertices are passed as world X/Z. */
export const sandHeightGLSL = `
  float dune(vec2 q, vec2 origin, vec2 size, float h) {
    vec2 p = q - origin;
    float u = p.x / size.x;
    float v = (p.y + p.x * ${CREST_SKEW}) / size.y + ${CREST_CURVE} * u * u;
    float face = v < 0.0 ? v / ${LEE_WIDTH} : v;
    return h * exp(-u * u - face * face);
  }
  float groundHeight(vec2 world) {
    const float c = ${Math.cos(CITY_YAW).toFixed(8)}, s = ${Math.sin(CITY_YAW).toFixed(8)};
    vec2 q = vec2(c * world.x - s * world.y, s * world.x + c * world.y);
    float rise = ${drifts.map(([x,z,w,d,h]) => `dune(q, vec2(${x.toFixed(3)}, ${z.toFixed(3)}), vec2(${w.toFixed(3)}, ${d.toFixed(3)}), ${h.toFixed(3)})`).join(' + ')};
    return .053 + smoothstep(${DUNE_START}, ${DUNE_FULL}, length(q)) * rise;
  }
`;
