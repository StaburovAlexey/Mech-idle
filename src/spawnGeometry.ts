/** A single world-space spawn circle, independent of the camera or device. */
export interface SpawnPoint { x: number; y: number }
export const SPAWN_RADIUS = 12;
/** Old viewport-based saves allowed distant units; validated only for migration. */
export const WORLD_LIMIT = 100000;

export function spawnPoint(angle: number): SpawnPoint {
  return { x: Math.cos(angle) * SPAWN_RADIUS, y: Math.sin(angle) * SPAWN_RADIUS };
}
/** Preserve an old approach direction while bringing its warning onto the circle. */
export function onSpawnCircle(point: SpawnPoint): SpawnPoint {
  const distance = Math.hypot(point.x, point.y);
  if (distance === 0) return { x: SPAWN_RADIUS, y: 0 };
  return { x: point.x / distance * SPAWN_RADIUS, y: point.y / distance * SPAWN_RADIUS };
}
/** Already-near live units and projectiles never jump during save migration. */
export function clampToSpawnCircle(point: SpawnPoint): SpawnPoint {
  return Math.hypot(point.x, point.y) > SPAWN_RADIUS ? onSpawnCircle(point) : point;
}

/** Retired v1 camera data is accepted only after strict validation, then removed.
 * These types and checks are not used to calculate new spawn positions. */
export interface ProjectionAxis { x: number; y: number; height: number; offset: number }
export interface SpawnGeometry { horizontal: ProjectionAxis; vertical: ProjectionAxis }
export function validSpawnGeometry(value: unknown): value is SpawnGeometry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as SpawnGeometry;
  if (Object.keys(v).sort().join(',') !== 'horizontal,vertical') return false;
  for (const a of [v.horizontal, v.vertical]) {
    if (!a || typeof a !== 'object' || Array.isArray(a) || Object.keys(a).sort().join(',') !== 'height,offset,x,y') return false;
    if (![a.x, a.y, a.height, a.offset].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100)) return false;
    if (Math.abs(a.offset) > .5) return false;
  }
  const det = v.horizontal.x * v.vertical.y - v.horizontal.y * v.vertical.x;
  return Math.abs(det) >= 1e-10 && Math.abs(det) <= 100;
}
