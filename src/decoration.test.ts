import { describe, expect, it, vi } from 'vitest';
import { createWastelandLayout, WASTELAND_LIMITS } from './decoration';
import { createState, serializeState, startRun, step } from './game';

describe('deterministic decorative wasteland layout', () => {
  it('repeats from its own seed without global randomness or any simulation state changes', () => {
    const state = startRun(createState(), 149), before = serializeState(state), expected = step(state, 90);
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Decoration must own its RNG'); });
    try {
      const first = createWastelandLayout();
      createWastelandLayout(423);
      expect(createWastelandLayout()).toEqual(first);
      expect(createWastelandLayout(149)).toEqual(createWastelandLayout(149));
      expect(createWastelandLayout(149)).not.toEqual(createWastelandLayout(150));
      expect(random).not.toHaveBeenCalled();
      expect(serializeState(state)).toBe(before);
      expect(step(state, 90)).toEqual(expected);
    } finally { random.mockRestore(); }
  });

  it.each([0, 1, 149, 0xffffffff])('keeps seed %s finite, low and inside bounded decoration budgets', seed => {
    const layout = createWastelandLayout(seed);
    for (const [values, cap] of [[layout.surfaces, WASTELAND_LIMITS.maxSurfaces], [layout.cracks, WASTELAND_LIMITS.maxCracks], [layout.rubble, WASTELAND_LIMITS.maxRubble], [layout.grass, WASTELAND_LIMITS.maxGrass]] as const) {
      expect(values.length).toBeGreaterThan(0);
      expect(values.length).toBeLessThanOrEqual(cap);
    }
    expect(new Set(layout.surfaces.map(surface => surface.kind))).toEqual(new Set(['dust', 'asphalt', 'scar', 'paint']));
    expect(new Set(layout.rubble.map(piece => piece.kind))).toEqual(new Set(['rust', 'concrete', 'stone']));
    for (const surface of layout.surfaces) {
      expect(surface.points.length).toBeGreaterThanOrEqual(3);
      expect(surface.height).toBeGreaterThan(WASTELAND_LIMITS.groundHeight);
      expect(surface.height).toBeLessThanOrEqual(WASTELAND_LIMITS.surfaceHeight);
      for (const point of surface.points) for (const coordinate of point) {
        expect(Number.isFinite(coordinate)).toBe(true);
        expect(Math.abs(coordinate)).toBeLessThan(65);
      }
    }
    for (const crack of layout.cracks) {
      expect(crack.width).toBeGreaterThan(0);
      expect(crack.width).toBeLessThan(.05);
      for (const coordinate of [...crack.from, ...crack.to]) {
        expect(Number.isFinite(coordinate)).toBe(true);
        expect(Math.abs(coordinate)).toBeLessThan(65);
      }
    }
    for (const piece of layout.rubble) {
      expect(Object.values(piece).filter(value => typeof value === 'number').every(Number.isFinite)).toBe(true);
      expect(piece.width).toBeGreaterThan(0); expect(piece.depth).toBeGreaterThan(0);
      expect(piece.height).toBeGreaterThan(0); expect(piece.height).toBeLessThanOrEqual(WASTELAND_LIMITS.rubbleHeight);
      // The enclosing circle guarantees every rotated corner stays outside.
      expect(Math.hypot(piece.x, piece.z) - Math.hypot(piece.width, piece.depth) / 2).toBeGreaterThanOrEqual(WASTELAND_LIMITS.raisedClearRadius);
    }
    for (const grass of layout.grass) {
      expect(Object.values(grass).every(Number.isFinite)).toBe(true);
      expect(grass.height).toBeGreaterThan(0); expect(grass.height).toBeLessThanOrEqual(WASTELAND_LIMITS.grassHeight);
      expect(Math.hypot(grass.x, grass.z) - grass.spread).toBeGreaterThanOrEqual(WASTELAND_LIMITS.raisedClearRadius);
    }
  });
});
