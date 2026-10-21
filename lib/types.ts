import type { MediaSize, StageSize, TransformState } from './geometry';

export type { TransformState, MediaSize, StageSize };

/** A render surface that the floating UI can attach to. */
export interface UiAnchor {
  /** Element the UI is appended into (player container or fullscreen root). */
  container: HTMLElement;
  /**
   * Optional control-bar slot. When present the UI renders an inline button
   * there; otherwise it renders a standalone floating tab.
   */
  controlBar?: HTMLElement | null;
  /**
   * Optional sub-region of `container` that is actually the picture area.
   *
   * Some players append chrome *inside* the container they expose: Bilibili's
   * `.bpx-player-container` is 596px tall while `.bpx-player-video-area` (the
   * picture) is only 550px — the extra 46px is the danmaku input bar. Anchoring
   * the panel to `container` with `bottom: 64px` therefore parks it on top of
   * that input, hiding part of the panel.
   *
   * When present the UI is positioned relative to this box instead, so it can
   * never overlap the player's own controls.
   */
  safeArea?: HTMLElement | null;
}

export interface PlayerAdapter {
  /** Stable id, used as a storage key for per-site settings. */
  id: string;
  /** Human readable name shown in the popup. */
  name: string;
  /** Does this adapter own the given URL? */
  canHandle(url: string): boolean;
  /** The <video> element to observe. */
  findVideoElement(): HTMLVideoElement | null;
  /**
   * The element to transform. Usually the video itself, because transforming
   * a wrapper on real sites fights with the player's own layout logic.
   */
  findTransformTarget(video: HTMLVideoElement): HTMLElement | null;
  /** The box the video is displayed in; drives auto-fit geometry. */
  findStage(video: HTMLVideoElement): StageSize | null;
  /** Where the floating UI should mount. */
  findUiAnchor(video: HTMLVideoElement): UiAnchor | null;
}

export interface TransformGeometry {
  /** Size of the box that clips the video (the player). */
  stage: StageSize | null;
  /** Intrinsic size of the media, preferring videoWidth/Height. */
  media: MediaSize | null;
  /** The <video> element or wrapper we transform. */
  target: HTMLElement | null;
}
