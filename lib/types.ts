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
