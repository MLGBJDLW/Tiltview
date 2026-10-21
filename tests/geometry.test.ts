import { describe, expect, it } from 'vitest';
import {
  MAX_SCALE,
  MIN_SCALE,
  buildTransformCSS,
  clampScale,
  computeAutoFitScale,
  displayedMediaSize,
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
  it('shrinks a rotated landscape picture so it stays fully visible', () => {
    // The exact Bilibili geometry behind the report: a 978x550 player showing a
    // 978x550 picture. Rotated 90° the box becomes 550x978, which overflows
    // vertically (bottom 932 vs player 718). Contain must scale it down.
    const fit = computeAutoFitScale({ width: 978, height: 550 }, { width: 978, height: 550 }, 90);
    expect(fit).toBeCloseTo(550 / 978, 5);
    // Resulting box: 550*fit wide, 978*fit tall → fits inside 978x550.
    expect(978 * fit).toBeCloseTo(550, 3);
    expect(550 * fit).toBeLessThanOrEqual(978);
  });

  it('leaves an unrotated picture alone', () => {
    // Contain at 0° for a media that already matches the stage is a no-op, so
    // auto-fit being on by default never resizes an untouched video.
    expect(computeAutoFitScale({ width: 1920, height: 1080 }, { width: 1920, height: 1080 }, 0)).toBeCloseTo(1, 6);
  });

  it('scales a small media up to the stage while staying inside it', () => {
    // A 720p source in a 1080p player box: contain = min(1.5, 1.5) = 1.5, which
    // fills the player exactly. Enlarging is fine — it never exceeds the stage.
    const fit = computeAutoFitScale({ width: 1920, height: 1080 }, { width: 1280, height: 720 }, 0);
    expect(fit).toBeCloseTo(1.5, 6);
    expect(1280 * fit).toBeLessThanOrEqual(1920);
    expect(720 * fit).toBeLessThanOrEqual(1080);
  });

  it('fits a portrait media rotated into a landscape stage', () => {
    // 1080x1920 vertical video rotated 90° becomes 1920x1080 wide.
    const fit = computeAutoFitScale({ width: 1280, height: 720 }, { width: 1080, height: 1920 }, 90);
    // Rotated box 1920x1080 into 1280x720: contain = min(1280/1920, 720/1080) = 0.667.
    expect(fit).toBeCloseTo(2 / 3, 5);
  });

  it('fits a landscape video rotated into a portrait stage', () => {
    const fit = computeAutoFitScale({ width: 720, height: 1280 }, { width: 1920, height: 1080 }, 90);
    // Rotated box 1080x1920 into 720x1280: contain = min(720/1080, 1280/1920) = 0.667.
    expect(fit).toBeCloseTo(2 / 3, 5);
  });

  it('returns 1 for unknown or zero geometry', () => {
    expect(computeAutoFitScale(null, { width: 1920, height: 1080 }, 90)).toBe(1);
    expect(computeAutoFitScale({ width: 640, height: 360 }, null, 90)).toBe(1);
    expect(computeAutoFitScale({ width: 0, height: 0 }, { width: 10, height: 10 }, 0)).toBe(1);
    expect(computeAutoFitScale({ width: 640, height: 360 }, { width: 0, height: 0 }, 0)).toBe(1);
  });
});

describe('displayedMediaSize', () => {
  it('reports what contain actually paints (Bilibili 640x360 in a 978x550 box)', () => {
    // The exact geometry that made auto-fit zoom past the player edges: the
    // element and the stream are both ~16:9, so contain paints essentially the
    // whole element box and the cover factor must be ~1 at 0°, not 978/640.
    const displayed = displayedMediaSize({ width: 978, height: 550 }, { width: 640, height: 360 });
    expect(displayed).not.toBeNull();
    // 978/550 (1.7782) and 640/360 (1.7778) differ by a hair, so contain fits to
    // the width and leaves <1px of vertical slack.
    expect(displayed!.width).toBeCloseTo(978, 0);
    expect(displayed!.height).toBeCloseTo(550, 0);
    const fit = computeAutoFitScale({ width: 978, height: 550 }, displayed, 0);
    expect(fit).toBeGreaterThanOrEqual(1);
    expect(fit).toBeLessThan(1.01);
  });

  it('letterboxes a mismatched aspect ratio instead of stretching', () => {
    // 4:3 stream in a 16:9 box: contain fills height, leaves pillarboxes.
    const displayed = displayedMediaSize({ width: 1000, height: 562 }, { width: 640, height: 480 });
    expect(displayed!.height).toBeCloseTo(562, 1);
    expect(displayed!.width).toBeCloseTo((640 / 480) * 562, 1);
    expect(displayed!.width).toBeLessThan(1000);
  });

  it('stays in display space when the stream is larger than the element', () => {
    // 1920x1080 stream rendered into a 960x540 element: contain scales 0.5.
    const displayed = displayedMediaSize({ width: 960, height: 540 }, { width: 1920, height: 1080 });
    expect(displayed!.width).toBeCloseTo(960, 4);
    expect(displayed!.height).toBeCloseTo(540, 4);
  });

  it('falls back to intrinsic pixels when the element has no box yet', () => {
    const displayed = displayedMediaSize({ width: 0, height: 0 }, { width: 1280, height: 720 });
    expect(displayed).toEqual({ width: 1280, height: 720 });
  });

  it('falls back to the element box before metadata loads', () => {
    const displayed = displayedMediaSize({ width: 800, height: 450 }, null);
    expect(displayed).toEqual({ width: 800, height: 450 });
  });

  it('returns null when neither is known', () => {
    expect(displayedMediaSize(null, null)).toBeNull();
    expect(displayedMediaSize({ width: 0, height: 0 }, { width: 0, height: 0 })).toBeNull();
  });
});

describe('effectiveScale', () => {
  it('multiplies user zoom with auto-fit', () => {
    const s = state({ scale: 2, autoFit: true, rotation: 90 });
    const value = effectiveScale(s, { width: 720, height: 1280 }, { width: 1920, height: 1080 });
    expect(value).toBeCloseTo(2 * (1280 / 1920), 5);
  });

  it('ignores stage/media when autoFit is off', () => {
    const s = state({ scale: 1.5, autoFit: false });
    expect(effectiveScale(s, { width: 720, height: 1280 }, { width: 1920, height: 1080 })).toBe(1.5);
  });

  it('is exactly 1 at 0° for a media that already fills the stage', () => {
    // Auto-fit must be a no-op before any rotation, otherwise enabling it by
    // default would silently resize every untouched video.
    const s = state({ autoFit: true, rotation: 0, scale: 1 });
    const value = effectiveScale(s, { width: 978, height: 550 }, { width: 978, height: 550 });
    expect(value).toBeCloseTo(1, 6);
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
    const next = resetView(state({ rotation: 90, scale: 3, translateX: 10, flipH: true, autoFit: false }));
    expect(next).toMatchObject({
      rotation: 0,
      scale: 1,
      translateX: 0,
      translateY: 0,
      // Reset restores the default, which keeps auto-fit on.
      autoFit: true,
      flipH: true,
      flipV: false,
    });
  });

  it('isDefaultState recognises the neutral state', () => {
    expect(isDefaultState(getDefaultState())).toBe(true);
    expect(isDefaultState(state({ scale: 1.0001 }))).toBe(false);
  });
});
