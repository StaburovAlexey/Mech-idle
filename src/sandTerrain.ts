import * as THREE from 'three';

export const CITY_YAW = Math.atan2(14, 17) - .20;
const drifts = [
  [-6.15, 12.6, 3.0, 1.65, .49], [6.9, 12.3, 2.9, 1.65, .52],
  [-5.5, -15.65, 5.3, 2.75, .73], [5.7, -20.6, 4.9, 3.1, .84],
  [-12.7, -14.2, 3.8, 3.0, .52], [11.85, -14.25, 4.4, 3.05, .65],
  [-14.2, 1.5, 2.35, 6.0, .34], [14.65, -.7, 2.95, 5.6, .37],
] as const;

export function sandHeight(x: number, z: number) {
  let rise = 0;
  for (const [cx, cz, wx, wz, h] of drifts) {
    const u = (x - cx) / wx, v = (z - cz + (x - cx) * .2) / wz;
    rise += h * Math.exp(-u * u - v * v);
  }
  return .053 + THREE.MathUtils.smoothstep(Math.hypot(x, z), 12.2, 13.6) * rise;
}

/** Same height field in the warning shader. Vertices are passed as world X/Z. */
export const sandHeightGLSL = `
  float dune(vec2 q, vec2 origin, vec2 size, float h) {
    vec2 p = q - origin;
    p.y += p.x * .2;
    p /= size;
    return h * exp(-dot(p, p));
  }
  float groundHeight(vec2 world) {
    const float c = ${Math.cos(CITY_YAW).toFixed(8)}, s = ${Math.sin(CITY_YAW).toFixed(8)};
    vec2 q = vec2(c * world.x - s * world.y, s * world.x + c * world.y);
    float rise = ${drifts.map(([x,z,w,d,h]) => `dune(q, vec2(${x.toFixed(3)}, ${z.toFixed(3)}), vec2(${w.toFixed(3)}, ${d.toFixed(3)}), ${h.toFixed(3)})`).join(' + ')};
    return .053 + smoothstep(12.2, 13.6, length(q)) * rise;
  }
`;
