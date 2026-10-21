import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  getAction,
  isActionActive,
  runAction,
  type ActionId,
} from '../lib/actions';
import { MAX_SCALE, MIN_SCALE, getDefaultState, type TransformState } from '../lib/geometry';

const state = (overrides: Partial<TransformState> = {}): TransformState => ({
  ...getDefaultState(),
  ...overrides,
});

describe('action catalogue', () => {
  it('has unique ids', () => {
    const ids = ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every action has a label and a title', () => {
    for (const spec of ACTIONS) {
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.title.length).toBeGreaterThan(0);
    }
  });

  it('exposes every id through getAction', () => {
    for (const spec of ACTIONS) {
      expect(getAction(spec.id)).toBe(spec);
    }
  });
});

describe('runAction', () => {
  it('is pure', () => {
    const before = state();
    runAction(before, 'rotate-cw');
    expect(before).toEqual(getDefaultState());
  });

  it('rotates in both directions with wraparound', () => {
    expect(runAction(state(), 'rotate-cw').rotation).toBe(90);
    expect(runAction(state({ rotation: 270 }), 'rotate-cw').rotation).toBe(0);
    expect(runAction(state(), 'rotate-ccw').rotation).toBe(270);
    expect(runAction(state({ rotation: 0 }), 'rotate-ccw').rotation).toBe(270);
  });

  it('absolute rotation presets are idempotent', () => {
    for (const deg of [0, 90, 180, 270] as const) {
      const id = `rotate-${deg}` as ActionId;
      expect(runAction(state({ rotation: 45 }), id).rotation).toBe(deg);
      expect(runAction(runAction(state(), id), id).rotation).toBe(deg);
    }
  });

  it('zoom steps multiply and clamp', () => {
    const zoomedIn = runAction(state(), 'zoom-in');
    expect(zoomedIn.scale).toBeGreaterThan(1);
    expect(runAction(zoomedIn, 'zoom-out').scale).toBeCloseTo(1, 6);
    expect(runAction(state({ scale: MAX_SCALE }), 'zoom-in').scale).toBe(MAX_SCALE);
    expect(runAction(state({ scale: MIN_SCALE }), 'zoom-out').scale).toBe(MIN_SCALE);
  });

  it('zoom presets set absolute values', () => {
    const presets = ACTIONS.filter(
      (a) => a.group === 'zoom' && a.id !== 'zoom-in' && a.id !== 'zoom-out',
    );
    expect(presets).toHaveLength(4);
    for (const spec of presets) {
      const value = Number.parseFloat(spec.id.replace('zoom-', ''));
      expect(Number.isFinite(value)).toBe(true);
      expect(runAction(state({ scale: 1.13 }), spec.id).scale).toBe(value);
    }
  });

  it('mirror actions toggle independently', () => {
    let s = runAction(state(), 'flip-h');
    expect(s.flipH).toBe(true);
    expect(s.flipV).toBe(false);
    s = runAction(s, 'flip-v');
    expect(s).toMatchObject({ flipH: true, flipV: true });
    s = runAction(s, 'flip-h');
    expect(s).toMatchObject({ flipH: false, flipV: true });
  });

  it('auto-fit toggles', () => {
    // Default is ON (a rotated picture must stay inside the player), so the
    // action turns it off and back on.
    expect(runAction(state(), 'auto-fit').autoFit).toBe(false);
    expect(runAction(state({ autoFit: false }), 'auto-fit').autoFit).toBe(true);
  });

  it('reset-pan only clears translation', () => {
    const next = runAction(state({ rotation: 90, scale: 2, translateX: 5, translateY: 6 }), 'reset-pan');
    expect(next).toMatchObject({ rotation: 90, scale: 2, translateX: 0, translateY: 0 });
  });

  it('reset-all clears everything', () => {
    const next = runAction(
      state({ rotation: 90, scale: 3, translateX: 5, translateY: 6, flipH: true, flipV: true, autoFit: true }),
      'reset-all',
    );
    expect(next).toEqual(getDefaultState());
  });
});

describe('isActionActive', () => {
  it('reflects rotation presets', () => {
    const s = state({ rotation: 180 });
    expect(isActionActive(s, 'rotate-180')).toBe(true);
    expect(isActionActive(s, 'rotate-90')).toBe(false);
  });

  it('tolerates float noise for zoom presets', () => {
    expect(isActionActive(state({ scale: 1.999999 }), 'zoom-2')).toBe(true);
    // 2.01 differs from 2 by 0.01, which is exactly the tolerance boundary;
    // use a clearly different value to keep the test unambiguous.
    expect(isActionActive(state({ scale: 2.05 }), 'zoom-2')).toBe(false);
  });

  it('reflects mirror and auto-fit flags', () => {
    const s = state({ flipH: true, autoFit: true });
    expect(isActionActive(s, 'flip-h')).toBe(true);
    expect(isActionActive(s, 'flip-v')).toBe(false);
    expect(isActionActive(s, 'auto-fit')).toBe(true);
  });
});
