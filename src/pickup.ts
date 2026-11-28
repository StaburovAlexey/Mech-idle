/** Loot randomness is isolated from enemy spawning and critical-hit rolls. */
export type PickupKind = 'parts' | 'scrap';
export interface Pickup { id: string; kind: PickupKind; x: number; y: number; born: number }
export const PICKUP_LAND_SECONDS = .65;
export const PICKUP_LIFETIME_SECONDS = 10;
const PICKUP_FADE_SECONDS = .7;
const pickupExpiresAt = (pickup: Pickup) => pickup.born + PICKUP_LAND_SECONDS + PICKUP_LIFETIME_SECONDS;

export const PICKUP_KINDS = ['parts', 'scrap'] as const;

export function pickupDrops(seed: number, id: string): PickupKind[] {
 let n = (seed ^ Math.imul(Number(id.split(':').at(-1)), 0x9e3779b1)) >>> 0;
 n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
 n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
 const roll = ((n ^ (n >>> 16)) >>> 0) / 0x100000000;
 // Preserve the original 30% total and all existing primary drops in saved runs.
 if (roll < .025) return ['parts','scrap'];
 if (roll < .15) return ['parts'];
 if (roll < .175) return ['scrap','parts'];
 return roll < .30 ? ['scrap'] : [];
}

export const pickupLanded = (pickup: Pickup, time: number) => time >= pickup.born + PICKUP_LAND_SECONDS - 1e-8;

export const pickupExpired = (pickup: Pickup, time: number) =>
 time >= pickupExpiresAt(pickup) - 1e-8;

export function pickupVisibility(pickup: Pickup, time: number) {
 const remaining = Math.min(1,Math.max(0,(pickupExpiresAt(pickup)-time)/PICKUP_FADE_SECONDS));
 return remaining * remaining * (3-2*remaining);
}

export function pickupPose(pickup: Pickup, time: number, reduced = false) {
 const age = Math.max(0, time - pickup.born);
 const t = reduced ? 1 : Math.min(1, age / PICKUP_LAND_SECONDS);
 const length = Math.hypot(pickup.x, pickup.y);
 const offset = .7 * t;
 const dx = length ? pickup.x / length : 1, dz = length ? pickup.y / length : 0;
 const spread = (pickup.kind === 'parts' ? -.27 : .27) * t;
 const x = pickup.x + dx * offset - dz * spread;
 const z = pickup.y + dz * offset + dx * spread;
 const jump = t < .78 ? .62 * Math.sin(Math.PI * t / .78) : .09 * Math.sin(Math.PI * (t - .78) / .22);
 return { x, z, height: Math.max(0, jump), yaw: reduced ? 0 : 2 * t + .95 * Math.max(0, age - PICKUP_LAND_SECONDS), tilt: .36 * Math.sin(2 * Math.PI * t) };
}

/** Bonus drops share their source enemy with the unsuffixed primary pickup. */
export const pickupSource = (id: string) => id.endsWith(':bonus') ? id.slice(0,-6) : id;

/** Before landing, each piece hops individually. Group landed drops only by source enemy. */
export function groupPickups(items: readonly Pickup[], time: number) {
 const piles = new Map<string,Pickup[]>();
 const airborne: Pickup[] = [];
 for (const item of items) {
  if (pickupExpired(item,time)) continue;
  if (!pickupLanded(item,time)) {airborne.push(item);continue;}
  const source = pickupSource(item.id), pile = piles.get(source);
  if (pile) pile.push(item);
  else piles.set(source,[item]);
 }
 return {piles:[...piles.values()],airborne};
}
