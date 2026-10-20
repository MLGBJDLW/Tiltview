// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { TransformApplier } from '../lib/transform';
import { getDefaultState, type TransformState } from '../lib/geometry';

const state = (overrides: Partial<TransformState> = {}): TransformState => ({
  ...getDefaultState(),
  ...overrides,
});

function buildFixture(): { outer: HTMLDivElement; player: HTMLDivElement; video: HTMLVideoElement } {
  const outer = document.createElement('div');
  outer.style.overflow = 'hidden';
  const player = document.createElement('div');
  outer.appendChild(player);
  const video = document.createElement('video');
  player.appendChild(video);
  document.body.append(outer);
  return { outer, player, video };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('TransformApplier', () => {
  it('writes a matrix transform for a non-default state', () => {
    const { video } = buildFixture();
    const applier = new TransformApplier();
    applier.apply(video, state({ rotation: 90, scale: 2 }));
    expect(video.style.transform).toContain('matrix3d(');
    expect(video.style.transformOrigin).toBe('center center');
  });

  it('restores the original inline transform on release', () => {
    const { video } = buildFixture();
    video.style.transform = 'translateZ(0)';
    const applier = new TransformApplier();
    applier.apply(video, state({ rotation: 90 }));
    expect(video.style.transform).not.toBe('translateZ(0)');
    applier.release();
    expect(video.style.transform).toBe('translateZ(0)');
  });

  it('clears the transform when the state returns to default', () => {
    const { video } = buildFixture();
    const applier = new TransformApplier();
    applier.apply(video, state({ rotation: 90 }));
    applier.apply(video, getDefaultState());
    expect(video.style.transform).toBe('');
  });

  /**
   * Regression: v0.1.0 built a fresh Map on every call and overwrote the
   * previous one, so the first overridden ancestor was never restored and
   * stayed `overflow: visible` for the rest of the page's life.
   */
  it('restores every overridden ancestor overflow exactly once', () => {
    const { outer, player, video } = buildFixture();
    player.style.overflow = 'hidden';
    const applier = new TransformApplier();

    // Many frames, as happens during a drag.
    for (let i = 0; i < 25; i += 1) {
      applier.apply(video, state({ rotation: 90, translateX: i }));
    }
    // Rotated content needs its clipping ancestors opened up.
    expect(outer.style.overflow).toBe('visible');
    expect(player.style.overflow).toBe('visible');

    applier.release();
    expect(outer.style.overflow).toBe('hidden');
    expect(player.style.overflow).toBe('hidden');
  });

  it('leaves ancestors untouched when the inline value was empty', () => {
    const { outer, video } = buildFixture();
    outer.style.removeProperty('overflow');
    // jsdom reports overflow from inline styles; make the computed value visible.
    outer.style.overflow = 'visible';
    const applier = new TransformApplier();
    applier.apply(video, state({ rotation: 90 }));
    applier.release();
    expect(outer.style.overflow).toBe('visible');
  });

  it('clips the parent when auto-fit is enabled', () => {
    const { player, video } = buildFixture();
    const applier = new TransformApplier();
    applier.apply(video, state({ rotation: 90, autoFit: true }));
    expect(player.style.overflow).toBe('hidden');
    applier.release();
    // Original inline value was empty → property removed, not set to "hidden".
    expect(player.style.getPropertyValue('overflow')).toBe('');
  });

  it('releases the previous target when re-targeting', () => {
    const { player, video } = buildFixture();
    const second = document.createElement('video');
    player.appendChild(second);
    const applier = new TransformApplier();
    applier.apply(video, state({ rotation: 90 }));
    const firstTransform = video.style.transform;
    applier.apply(second, state({ rotation: 180 }));
    expect(applier.currentTarget).toBe(second);
    expect(second.style.transform).toContain('matrix3d(');
    expect(firstTransform).toContain('matrix3d(');
    expect(video.style.transform).toBe('');
  });

  it('setInteractive toggles the transition without touching the matrix', () => {
    const { video } = buildFixture();
    const applier = new TransformApplier();
    applier.apply(video, state({ rotation: 90 }));
    const matrix = video.style.transform;
    applier.setInteractive(video, true);
    expect(video.style.transition).toBe('none');
    expect(video.style.transform).toBe(matrix);
    applier.setInteractive(video, false);
    expect(video.style.transition).toContain('transform');
  });
});
