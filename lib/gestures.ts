import { panBy, zoomBy, type TransformState } from './geometry';

/**
 * Pointer gestures on the video surface.
 *
 * Design notes:
 * - Listeners run in the *capture* phase and stop propagation while a gesture
 *   is in progress, otherwise YouTube/Twitch/Bilibili hijack the drag for
 *   scrub/speed-up and the video never moves.
 * - Nothing is prevented until the gesture is unambiguous (pointer moved past a
 *   small threshold, or wheel with a zoom modifier), so ordinary clicks to
 *   play/pause keep working untouched.
 * - `apply` is called synchronously so the picture follows the cursor; the
 *   content script disables the CSS transition while dragging.
 */

const DRAG_THRESHOLD_PX = 4;
const ZOOM_STEP = 1.12;

export interface GestureOptions {
  /** Element that receives pointer/wheel events; usually the <video>. */
  getSurface: () => HTMLElement | null;
  getState: () => TransformState;
  /** Commit a new state (already merged). */
  apply: (next: TransformState, phase: 'start' | 'move' | 'end') => void;
  /** Wheel zoom needs the modifier, otherwise the page keeps scrolling. */
  isEnabled: () => boolean;
  onDoubleClickReset: () => void;
}

export class GestureController {
  private opts: GestureOptions;
  private surface: HTMLElement | null = null;

  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private startTranslate = { x: 0, y: 0 };
  private dragging = false;

  constructor(options: GestureOptions) {
    this.opts = options;
  }

  attach(surface: HTMLElement | null): void {
    if (this.surface === surface) return;
    this.detach();
    if (!surface) return;
    this.surface = surface;

    surface.addEventListener('pointerdown', this.onPointerDown, true);
    surface.addEventListener('pointermove', this.onPointerMove, true);
    surface.addEventListener('pointerup', this.onPointerUp, true);
    surface.addEventListener('pointercancel', this.onPointerUp, true);
    surface.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    surface.addEventListener('dblclick', this.onDoubleClick, true);
  }

  detach(): void {
    const surface = this.surface;
    if (!surface) return;
    surface.removeEventListener('pointerdown', this.onPointerDown, true);
    surface.removeEventListener('pointermove', this.onPointerMove, true);
    surface.removeEventListener('pointerup', this.onPointerUp, true);
    surface.removeEventListener('pointercancel', this.onPointerUp, true);
    surface.removeEventListener('wheel', this.onWheel, true);
    surface.removeEventListener('dblclick', this.onDoubleClick, true);
    this.surface = null;
    this.pointerId = null;
    this.dragging = false;
  }

  destroy(): void {
    this.detach();
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.opts.isEnabled()) return;
    if (event.button !== 0) return;
    if (isInteractiveTarget(event.target)) return;
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    const state = this.opts.getState();
    this.startTranslate = { x: state.translateX, y: state.translateY };
    this.dragging = false;
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.opts.isEnabled()) return;
    if (this.pointerId === null || event.pointerId !== this.pointerId) return;

    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;

    if (!this.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      this.dragging = true;
      event.stopPropagation();
      event.preventDefault();
      this.opts.apply(this.opts.getState(), 'start');
    }

    event.stopPropagation();
    event.preventDefault();

    // Absolute positioning from the gesture start avoids drift accumulation.
    const base: TransformState = {
      ...this.opts.getState(),
      translateX: this.startTranslate.x,
      translateY: this.startTranslate.y,
    };
    const next = panBy(base, dx, dy);
    this.opts.apply(next, 'move');
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.pointerId === null || event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    if (this.dragging) {
      this.dragging = false;
      event.stopPropagation();
      this.opts.apply(this.opts.getState(), 'end');
    }
  };

  private onWheel = (event: WheelEvent): void => {
    if (!this.opts.isEnabled()) return;
    // Plain wheel must keep scrolling the page; require Ctrl/Cmd like every
    // map/gallery UI, and also accept Alt for one-handed use.
    const zoomModifier = event.ctrlKey || event.metaKey || event.altKey;
    if (!zoomModifier) return;
    if (isInteractiveTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();

    const surface = this.surface;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    const anchor = {
      x: event.clientX - (rect.left + rect.width / 2),
      y: event.clientY - (rect.top + rect.height / 2),
    };
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    this.opts.apply(zoomBy(this.opts.getState(), factor, anchor), 'end');
  };

  private onDoubleClick = (event: MouseEvent): void => {
    if (!this.opts.isEnabled()) return;
    if (isInteractiveTarget(event.target)) return;
    event.stopPropagation();
    event.preventDefault();
    this.opts.onDoubleClickReset();
  };
}

/** Never steal gestures from real controls drawn over the video. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, a, input, select, textarea, [role="button"], [role="slider"], [contenteditable="true"]',
    ),
  );
}
