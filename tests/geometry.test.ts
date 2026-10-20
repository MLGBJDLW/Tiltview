import { describe, expect, it } from 'vitest';
import {
  MAX_SCALE,
  MIN_SCALE,
  buildTransformCSS,
  clampScale,
  computeAutoFitScale,
  effectiveScale,
  getDefaultState,
  isDefaultState,
  normalizeAngle,
  panBy,
  resetView,
  rotateBy,
  swapsAxes,
  zoomBy,
  type TransformState,
} from '../lib/geometry';

const state = (overrides: Partial<TransformState> = {}): TransformState => ({
  ...getDefaultState(),
  ...overrides,
});

describe('normalizeAngle', () => {
  it('keeps [0, 360) and wraps negatives', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(90)).toBe(90);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(-450)).toBe(270);
  });

  it('is defensive about NaN/Infinity', () => {
    expect(normalizeAngle(Number.NaN)).toBe(0);
    expect(normalizeAngle(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('clampScale', () => {
  it('clamps into the supported range', () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(100)).toBe(MAX_SCALE);
    expect(clampScale(2)).toBe(2);
  });
});

describe('swapsAxes', () => {
  it('detects portrait orientations', () => {
    expect(swapsAxes(0)).toBe(false);
    expect(swapsAxes(90)).toBe(true);
    expect(swapsAxes(180)).toBe(false);
    expect(swapsAxes(270)).toBe(true);
    expect(swapsAxes(-90)).toBe(true);
  });
});

describe('computeAutoFitScale', () => {
  it('returns exactly 1 when the media already fills the stage', () => {
    // Regression: v0.1.0 computed `stageH / stageW` (≈0.56 for 16:9) and
    // multiplied it into `scale`, so enabling auto-fit *shrank* the video.
    expect(computeAutoFitScale({ width: 1920, height: 1080 }, { width: 1920, height: 1080 }, 0)).toBeCloseTo(1, 6);
  });

  it('upscales to cover when the media is smaller than the stage', () => {
    // A 720p source in a 1080p player box must grow, never shrink.
    expect(computeAutoFitScale({ width: 1920, height: 1080 }, { width: 1280, height: 720 }, 0)).toBeCloseTo(1.5, 6);
  });

  it('scales a portrait media to cover a landscape stage when rotated', () => {
    // 1080x1920 vertical video rotated 90° becomes 1920x1080 wide.
    const fit = computeAutoFitScale({ width: 1280, height: 720 }, { width: 1080, height: 1920 }, 90);
    // Rotated bounding box 1920x1080 in a 1280x720 stage: cover = max(1280/1920, 720/1080) = 0.667
    expect(fit).toBeCloseTo(2 / 3, 5);
  });

  it('fills a portrait stage with a landscape video rotated 90°', () => {
    // v0.1.0 got this one right by accident; keep it pinned.
    const fit = computeAutoFitScale({ width: 720, height: 1280 }, { width: 1920, height: 1080 }, 90);
    expect(fit).toBeCloseTo(1280 / 1920, 5);
  });

  it('returns 1 for unknown or zero geometry', () => {
    expect(computeAutoFitScale(null, { width: 1920, height: 1080 }, 90)).toBe(1);
    expect(computeAutoFitScale({ width: 640, height: 360 }, null, 90)).toBe(1);
    expect(computeAutoFitScale({ width: 0, height: 0 }, { width: 10, height: 10 }, 0)).toBe(1);
    expect(computeAutoFitScale({ width: 640, height: 360 }, { width: 0, height: 0 }, 0)).toBe(1);
  });
});

describe('effectiveScale', () => {
  it('multiplies user zoom with auto-fit', () => {
    const s = state({ scale: 2, autoFit: true, rotation: 90 });
    const value = effectiveScale(s, { width: 720, height: 1280 }, { width: 1920, height: 1080 });
    expect(value).toBeCloseTo(2 * (1280 / 1920), 5);
  });

  it('ignores stage/media when autoFit is off', () => {
    const s = state({ scale: 1.5 });
    expect(effectiveScale(s, { width: 720, height: 1280 }, { width: 1920, height: 1080 })).toBe(1.5);
  });
});

describe('buildTransformCSS', () => {
  it('emits identity for the default state', () => {
    expect(buildTransformCSS(getDefaultState())).toBe('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)');
  });

  it('rotates clockwise in screen coordinates (y-down)', () => {
    // 90° clockwise: (1,0) -> (0,1), so a=0, b=1, c=-1, d=0.
    const css = buildTransformCSS(state({ rotation: 90 }));
    expect(css).toContain('matrix3d(0, 1, 0, 0, -1, 0, 0, 0');
  });

  /**
   * Regression: v0.1.0 emitted `translate(...) rotate(...)`, which applies the
   * translation *after* rotation in the element's own rotated frame. Dragging
   * right at 90° moved the picture up. Translation must be the outermost
   * operation, i.e. the last two matrix components, untouched by rotation.
   */
  it('keeps pan in screen space regardless of rotation', () => {
    for (const rotation of [0, 90, 180, 270, 37]) {
      const css = buildTransformCSS(state({ rotation, translateX: 100, translateY: -50, scale: 1 }));
      expect(css.endsWith(', 100, -50, 0, 1)')).toBe(true);
    }
  });

  it('applies flips as negative scale, not as separate transforms', () => {
    const css = buildTransformCSS(state({ flipH: true }));
    expect(css).toContain('matrix3d(-1, 0, 0, 0, 0, 1, 0, 0');
  });

  it('keeps combined mirror + rotation consistent', () => {
    // rotate(180)·flipV = [[cos·sx, -sin·sy], [sin·sx, cos·sy]]
    //                   = [[-1, -0], [0, 1]]  → an exact horizontal mirror.
    const css = buildTransformCSS(state({ rotation: 180, flipV: true }));
    expect(css).toBe('matrix3d(-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)');
  });

  it('rotate(180) + flipH + flipV cancels back to identity', () => {
    const css = buildTransformCSS(state({ rotation: 180, flipH: true, flipV: true }));
    expect(css).toBe('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)');
  });

  it('never emits -0', () => {
    const css = buildTransformCSS(state({ rotation: 90, flipH: true }));
    expect(css).not.toContain('-0,');
  });
});

describe('reducers', () => {
  it('rotateBy wraps around', () => {
    expect(rotateBy(state({ rotation: 270 }), 90).rotation).toBe(0);
    expect(rotateBy(state({ rotation: 0 }), -90).rotation).toBe(270);
  });

  it('panBy is additive and does not touch other fields', () => {
    const next = panBy(state({ rotation: 90, scale: 2 }), 10, -20);
    expect(next).toMatchObject({ rotation: 90, scale: 2, translateX: 10, translateY: -20 });
  });

  it('zoomBy without anchor preserves pan', () => {
    const next = zoomBy(state({ translateX: 30, translateY: 40 }), 2);
    expect(next.scale).toBe(2);
    expect(next.translateX).toBe(30);
    expect(next.translateY).toBe(40);
  });

  it('zoomBy clamps at the limits', () => {
    expect(zoomBy(state({ scale: MAX_SCALE }), 2).scale).toBe(MAX_SCALE);
    expect(zoomBy(state({ scale: MIN_SCALE }), 0.5).scale).toBe(MIN_SCALE);
  });

  it('zoomBy keeps the anchor point stationary', () => {
    const before = state({ scale: 1, translateX: -20, translateY: -10 });
    const anchor = { x: 100, y: 60 };
    const after = zoomBy(before, 2, anchor);
    // A point p under the anchor maps to anchor + (p - anchor) * ratio.
    const mapPoint = (p: number, t: number, a: number, ratio: number) => a + (p - a) * ratio;
    const ratio = after.scale / before.scale;
    expect(mapPoint(anchor.x, before.translateX, anchor.x, ratio)).toBeCloseTo(anchor.x, 6);
    expect(after.translateX).toBeCloseTo(anchor.x - (anchor.x - before.translateX) * ratio, 6);
    expect(after.translateY).toBeCloseTo(anchor.y - (anchor.y - before.translateY) * ratio, 6);
  });

  it('resetView keeps mirror preferences', () => {
    const next = resetView(state({ rotation: 90, scale: 3, translateX: 10, flipH: true, autoFit: true }));
    expect(next).toMatchObject({
      rotation: 0,
      scale: 1,
      translateX: 0,
      translateY: 0,
      autoFit: false,
      flipH: true,
      flipV: false,
    });
  });

  it('isDefaultState recognises the neutral state', () => {
    expect(isDefaultState(getDefaultState())).toBe(true);
    expect(isDefaultState(state({ scale: 1.0001 }))).toBe(false);
  });
});
