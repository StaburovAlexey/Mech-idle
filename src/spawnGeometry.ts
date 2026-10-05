import { MECH_SILHOUETTES } from './mechSilhouettes';

/** Projection of world (x, ground-z, height) to normalized device coordinates.
 * Renderer supplies the actual camera projection; simulation remains DOM/Three-free. */
export interface ProjectionAxis { x: number; y: number; height: number; offset: number }
export interface SpawnGeometry { horizontal: ProjectionAxis; vertical: ProjectionAxis }
export type SpawnKind = 'ordinary' | 'fast' | 'boss';
export interface SpawnPoint { x: number; y: number }
export const WORLD_LIMIT = 100000;
export const ARENA_ASPECT = 9 / 16;
export const ARENA_HALF_WIDTH = 12.35;
// Two pixels in the canonical 390-wide composition, independent of the device.
const EDGE_CLEARANCE = 4 * ARENA_HALF_WIDTH / 390;
const FIRST_TICK_MOVEMENT = .06;
const ANIMATION_SUPPORT_ERROR = .003;
/** Conservative animated bounds, including limbs, contact shadow, HP bar and bob.
 * These enclose every orientation of the procedural models in scene.ts. */
export const ENEMY_BOUNDS = {
  ordinary: { radius: 1.25, minHeight: -.2, maxHeight: 2.65 },
  fast: { radius: 1, minHeight: -.2, maxHeight: 2.1 },
  boss: { radius: 1.95, minHeight: -.2, maxHeight: 3.75 },
} as const;
export const WARNING_BOUNDS = { radius: .8, minHeight: 0, maxHeight: .1 };

/** One fixed 9:16 field on every device; the renderer contains it in the canvas. */
export function defaultSpawnGeometry(): SpawnGeometry {
  const cx = 14, cy = 21.6, cz = 17, ground = Math.hypot(cx, cz), full = Math.hypot(ground, cy);
  const halfWidth = ARENA_HALF_WIDTH, halfHeight = halfWidth / ARENA_ASPECT;
  return {
    horizontal: { x: cz / ground / halfWidth, y: -cx / ground / halfWidth, height: 0, offset: 0 },
    vertical: { x: -cx * cy / ground / full / halfHeight, y: -cz * cy / ground / full / halfHeight, height: ground / full / halfHeight, offset: -.4 * ground / full / halfHeight },
  };
}
export function validSpawnGeometry(value: unknown): value is SpawnGeometry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as SpawnGeometry;
  if (Object.keys(v).sort().join(',') !== 'horizontal,vertical') return false;
  for (const a of [v.horizontal, v.vertical]) {
    if (!a || typeof a !== 'object' || Object.keys(a).sort().join(',') !== 'height,offset,x,y') return false;
    if (![a.x, a.y, a.height, a.offset].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100)) return false;
    if (Math.abs(a.offset) > .5) return false;
  }
  const det = v.horizontal.x * v.vertical.y - v.horizontal.y * v.vertical.x;
  return Math.abs(det) >= 1e-10 && Math.abs(det) <= 100;
}
export function sameSpawnGeometry(a: SpawnGeometry, b: SpawnGeometry): boolean {
  return (['horizontal', 'vertical'] as const).every(k => (['x', 'y', 'height', 'offset'] as const).every(p => a[k][p] === b[k][p]));
}
export function projectGround(point: SpawnPoint, geometry: SpawnGeometry, height = 0): SpawnPoint {
  const project = (a: ProjectionAxis) => a.x * point.x + a.y * point.y + a.height * height + a.offset;
  return { x: project(geometry.horizontal), y: project(geometry.vertical) };
}
function fromScreen(x: number, y: number, g: SpawnGeometry): SpawnPoint {
  const h = g.horizontal, v = g.vertical, a = x - h.offset, b = y - v.offset;
  const det = h.x * v.y - h.y * v.x;
  return { x: (a * v.y - h.y * b) / det, y: (h.x * b - a * v.x) / det };
}
function extent(axis: ProjectionAxis, kind: SpawnKind, direction: -1 | 1, point: SpawnPoint, horizontal: boolean): number {
  const distance = Math.hypot(point.x, point.y), cosine = -point.y / distance, sine = -point.x / distance;
  const x = -direction * (axis.x * cosine - axis.y * sine), z = -direction * (axis.x * sine + axis.y * cosine), height = -direction * axis.height;
  const axisLength = Math.hypot(axis.x, axis.y, axis.height), groundLength = Math.hypot(axis.x, axis.y);
  let body = -Infinity;
  for (const vertex of MECH_SILHOUETTES[kind]) body = Math.max(body, x * vertex[0] + height * vertex[1] + z * vertex[2]);
  const scale = kind === 'boss' ? 1.48 : kind === 'fast' ? .77 : 1;
  // HP bars face the camera; the contact shadow is an offset ground ellipse.
  const hp = height * 2.32 * scale + axisLength * (horizontal ? (kind === 'boss' ? 1.55 : .8) / 2 : .035);
  const shadow = Math.hypot(axis.x * .66 * scale, axis.y * .66 * .75 * scale) - direction * ((axis.x + axis.y) * .15 + axis.height * .067);
  const warning = groundLength * .78 + height * .075;
  return Math.max(body + ANIMATION_SUPPORT_ERROR * axisLength, hp, shadow, warning)
    + FIRST_TICK_MOVEMENT * groundLength + EDGE_CLEARANCE * axisLength;
}
/** Twelve equally selected edge segments, randomized along each segment. The entire
 * animated unit is just outside one contained-field edge, including at corners. */
export function spawnPoint(geometry: SpawnGeometry, kind: SpawnKind, sector: number, along: number): SpawnPoint {
  const edge = Math.floor(sector / 3), position = ((sector % 3 + .08 + along * .84) / 3) * 2 - 1;
  const horizontal = edge % 2 === 0, direction = edge < 2 ? 1 : -1, axis = horizontal ? geometry.horizontal : geometry.vertical;
  const pointAt = (outside: number) => horizontal ? fromScreen(direction * outside, position, geometry) : fromScreen(position, direction * outside, geometry);
  // Heading changes slightly as the edge point moves. Solve against its actual
  // inward-facing silhouette instead of a radius-sized square around the unit.
  let low = 1, high = 2;
  while (high < 1 + extent(axis, kind, direction, pointAt(high), horizontal)) high *= 2;
  for (let i = 0; i < 32; i++) {
    const middle = (low + high) / 2;
    if (middle >= 1 + extent(axis, kind, direction, pointAt(middle), horizontal)) high = middle;
    else low = middle;
  }
  return pointAt(high);
}
export function isFullyOffscreen(point: SpawnPoint, geometry: SpawnGeometry, kind: SpawnKind): boolean {
  const p = projectGround(point, geometry);
  return p.x >= 1 + extent(geometry.horizontal, kind, 1, point, true) - 1e-9 || p.x <= -1 - extent(geometry.horizontal, kind, -1, point, true) + 1e-9 || p.y >= 1 + extent(geometry.vertical, kind, 1, point, false) - 1e-9 || p.y <= -1 - extent(geometry.vertical, kind, -1, point, false) + 1e-9;
}
/** Adapt legacy queued positions without changing their radial approach. Ordinary
 * resizes now keep identical geometry and never move pending or live units. */
export function keepSpawnOffscreen(point: SpawnPoint, geometry: SpawnGeometry, kind: SpawnKind): SpawnPoint {
  if (isFullyOffscreen(point, geometry, kind)) return point;
  const candidates: number[] = [];
  for (const axis of [geometry.horizontal, geometry.vertical]) {
    const projected = axis.x * point.x + axis.y * point.y;
    if (Math.abs(projected) < 1e-12) continue;
    const direction = projected > 0 ? 1 : -1;
    candidates.push((direction * (1 + extent(axis, kind, direction, point, axis === geometry.horizontal)) - axis.offset) / projected);
  }
  const factor = Math.max(1, Math.min(...candidates.filter(n => n > 0)));
  return { x: point.x * factor, y: point.y * factor };
}
