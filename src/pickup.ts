/** Loot randomness is isolated from enemy spawning and critical-hit rolls. */
export type PickupKind = 'parts' | 'scrap';
export interface Pickup { id: string; kind: PickupKind; x: number; y: number; born: number }
export const PICKUP_LAND_SECONDS = .65;
export const PICKUP_LIFETIME_SECONDS = 10;

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
 time >= pickup.born + PICKUP_LAND_SECONDS + PICKUP_LIFETIME_SECONDS - 1e-8;

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

/** Before landing, each piece hops individually. Only settled nearby loot is grouped. */
export function groupPickups(items: readonly Pickup[], time: number) {
 const piles: Pickup[][] = [];
 const airborne: Pickup[] = [];
 for (const item of items) {
  if (pickupExpired(item,time)) continue;
  if (!pickupLanded(item,time)) {airborne.push(item);continue;}
  const pile = piles.find(([anchor]) => Math.hypot(anchor.x-item.x,anchor.y-item.y) <= 2.6);
  if (pile) pile.push(item);
  else piles.push([item]);
 }
 return {piles,airborne};
}
