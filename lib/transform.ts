import {
  buildTransformCSS,
  getDefaultState,
  isDefaultState,
  type MediaSize,
  type StageSize,
  type TransformState,
} from './geometry';

/**
 * Applies a TransformState to a real element.
 *
 * Differences from v0.1.0:
 * - The previous inline `transform` is captured once and restored verbatim, so
 *   sites that rely on their own transforms are not permanently broken.
 * - `overflow` overrides are recorded in a single set and restored exactly,
 *   instead of being re-saved on every frame (which leaked and left ancestors
 *   permanently `overflow: visible`).
 */

interface SavedInline {
  transform: string;
  transformOrigin: string;
  willChange: string;
  transition: string;
}

interface OverflowOverride {
  element: HTMLElement;
  original: string;
  priority: string;
}

const FADE = 'transform 120ms ease-out';

export class TransformApplier {
  private target: HTMLElement | null = null;
  private saved: SavedInline | null = null;
  private overflowOverrides: OverflowOverride[] = [];

  get currentTarget(): HTMLElement | null {
    return this.target;
  }

  apply(
    element: HTMLElement,
    state: TransformState,
    stage?: StageSize | null,
    media?: MediaSize | null,
  ): void {
    if (this.target && this.target !== element) {
      this.release();
    }

    if (!this.saved) {
      this.saved = {
        transform: element.style.transform,
        transformOrigin: element.style.transformOrigin,
        willChange: element.style.willChange,
        transition: element.style.transition,
      };
      element.style.transformOrigin = 'center center';
      element.style.willChange = 'transform';
      element.style.transition = FADE;
    }
    this.target = element;

    if (isDefaultState(state)) {
      element.style.transform = this.saved.transform;
      element.style.transition = this.saved.transition;
    } else {
      element.style.transform = buildTransformCSS(state, stage, media);
    }

    // A neutral state must not keep the host page's overflow mutated. v0.1.0
    // had this same leak: once an ancestor was opened up it stayed open.
    if (isDefaultState(state)) {
      this.restoreOverflow();
    } else {
      this.syncOverflow(element, TransformApplier.shouldClip(state));
    }
  }

  /**
   * Whether ancestors should clip the transformed element.
   *
   * Only when auto-fit is OFF. With auto-fit ON the picture is deliberately
   * sized to land exactly on the player box, so clipping would turn a sub-pixel
   * rounding difference into a visibly cut edge — the opposite of "fit". Letting
   * it overflow visibly costs nothing there, because the geometry already keeps
   * it inside.
   */
  private static shouldClip(state: TransformState): boolean {
    return !state.autoFit;
  }

  /** Drop the transition so live drags track the cursor exactly. */
  setInteractive(element: HTMLElement, interactive: boolean): void {
    if (!this.saved) return;
    element.style.transition = interactive ? 'none' : FADE;
  }

  release(): void {
    if (this.target && this.saved) {
      this.target.style.transform = this.saved.transform;
      this.target.style.transformOrigin = this.saved.transformOrigin;
      this.target.style.willChange = this.saved.willChange;
      this.target.style.transition = this.saved.transition;
    }
    this.restoreOverflow();
    this.target = null;
    this.saved = null;
  }

  private syncOverflow(element: HTMLElement, clip: boolean): void {
    if (clip) {
      // Clipping mode: only the immediate parent needs to be hidden. Any
      // ancestors we opened in the previous (non-clipping) mode must be put back,
      // otherwise switching auto-fit off would leave the stack permanently open
      // and the clip would have no effect.
      this.restoreOverflow();
      const parent = element.parentElement;
      if (parent) {
        this.pushOverride(parent);
        parent.style.setProperty('overflow', 'hidden');
      }
      return;
    }

    // Without clipping, rotated content must be allowed to paint outside the
    // player box, otherwise 90°/270° rotations get chopped off. This also has to
    // undo a `hidden` recorded by a previous clipping pass, which is why the
    // override map is keyed by element rather than append-only.
    let ancestor: HTMLElement | null = element.parentElement;
    let depth = 0;
    while (ancestor && depth < 6) {
      const computed = getComputedStyle(ancestor);
      if (computed.overflow !== 'visible') {
        if (!this.isOverridden(ancestor)) this.pushOverride(ancestor);
        ancestor.style.setProperty('overflow', 'visible');
      }
      ancestor = ancestor.parentElement;
      depth += 1;
    }
  }

  private pushOverride(element: HTMLElement): void {
    this.overflowOverrides.push({
      element,
      original: element.style.getPropertyValue('overflow'),
      priority: element.style.getPropertyPriority('overflow'),
    });
  }

  private isOverridden(element: HTMLElement): boolean {
    return this.overflowOverrides.some((entry) => entry.element === element);
  }

  private restoreOverflow(): void {
    for (const entry of this.overflowOverrides) {
      if (!entry.element.isConnected) continue;
      if (entry.original) {
        entry.element.style.setProperty('overflow', entry.original, entry.priority);
      } else {
        entry.element.style.removeProperty('overflow');
      }
    }
    this.overflowOverrides = [];
  }
}

export { getDefaultState };
