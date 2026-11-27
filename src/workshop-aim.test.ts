import { describe, expect, it } from 'vitest';
import { workshopAim } from './workshop-aim';

describe('workshop turret idle', () => {
  it('scans slowly, acquires quickly in both directions, then loops without jumping', () => {
    const speed = (t: number) => (workshopAim(t + .02) - workshopAim(t)) / .02;
    expect(speed(1.3)).toBeGreaterThan(0);
    expect(speed(2.84)).toBeGreaterThan(10 * speed(1.3));
    expect(workshopAim(3.2)).toEqual(workshopAim(3.4));
    expect(speed(4.9)).toBeLessThan(0);
    expect(speed(6.39)).toBeLessThan(10 * speed(4.9));
    expect(workshopAim(7.1)).toBe(workshopAim(0));
  });
});
