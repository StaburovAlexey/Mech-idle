/** Loot randomness is isolated from enemy spawning and critical-hit rolls. */
export type PickupKind = 'parts' | 'scrap';
export interface Pickup { id: string; kind: PickupKind; x: number; y: number; born: number }
export const PICKUP_LAND_SECONDS = .65;

export function pickupDrop(seed: number, id: string): PickupKind | null {
 let n = (seed ^ Math.imul(Number(id.split(':').at(-1)), 0x9e3779b1)) >>> 0;
 n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
 n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
 const roll = ((n ^ (n >>> 16)) >>> 0) / 0x100000000;
 return roll < .15 ? 'parts' : roll < .30 ? 'scrap' : null;
}

export const pickupLanded = (pickup: Pickup, time: number) => time >= pickup.born + PICKUP_LAND_SECONDS - 1e-8;

export function pickupPose(pickup: Pickup, time: number, reduced = false) {
 const age = Math.max(0, time - pickup.born);
 const t = reduced ? 1 : Math.min(1, age / PICKUP_LAND_SECONDS);
 const length = Math.hypot(pickup.x, pickup.y);
 const offset = .7 * t;
 const x = pickup.x + (length ? pickup.x / length : 1) * offset;
 const z = pickup.y + (length ? pickup.y / length : 0) * offset;
 const jump = t < .78 ? .62 * Math.sin(Math.PI * t / .78) : .09 * Math.sin(Math.PI * (t - .78) / .22);
 return { x, z, height: Math.max(0, jump), yaw: reduced ? 0 : 2 * t + .95 * Math.max(0, age - PICKUP_LAND_SECONDS), tilt: .36 * Math.sin(2 * Math.PI * t) };
}
