import type { PlayerAdapter, StageSize, UiAnchor } from '../types';
import { deepQuerySelector, getFullscreenElement, queryFirst } from '../dom-utils';

/**
 * Generic adapter: works on any site with an HTML5 <video>.
 *
 * A single shared instance cannot keep state (the same script runs per page),
 * but each method is pure lookup, so sharing is safe.
 */
export const genericAdapter: PlayerAdapter = {
  id: 'generic',
  name: 'Generic',

  canHandle(): boolean {
    return true;
  },

  findVideoElement(): HTMLVideoElement | null {
    const videos = Array.from(document.querySelectorAll('video')).filter(
      (video) =>
        video.isConnected &&
        (video.videoWidth > 0 || video.readyState > 0 || hasArea(video)),
    );
    if (videos.length === 0) {
      // Fall back to any video at all, even before metadata loads.
      return document.querySelector('video');
    }
    if (videos.length === 1) return videos[0];

    const fullscreen = getFullscreenElement();
    if (fullscreen) {
      const inFullscreen = videos.find((v) => fullscreen.contains(v));
      if (inFullscreen) return inFullscreen;
    }

    return videos.reduce((best, video) =>
      visibleArea(video) > visibleArea(best) ? video : best,
    );
  },

  findTransformTarget(video: HTMLVideoElement): HTMLElement | null {
    return video;
  },

  findStage(video: HTMLVideoElement): StageSize | null {
    const fullscreen = getFullscreenElement();
    if (fullscreen && fullscreen.contains(video)) {
      return sizeOf(fullscreen);
    }
    const parent = video.parentElement;
    if (parent) {
      const size = sizeOf(parent);
      if (size.width > 0 && size.height > 0) return size;
    }
    return sizeOf(video);
  },

  findUiAnchor(video: HTMLVideoElement): UiAnchor | null {
    const fullscreen = getFullscreenElement();
    if (fullscreen) {
      return { container: fullscreen };
    }
    const container =
      (video.parentElement as HTMLElement | null) ?? null;
    if (!container) return null;
    ensurePositioned(container);
    return { container };
  },
};

function sizeOf(element: Element): StageSize {
  const rect = element.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

function visibleArea(video: HTMLVideoElement): number {
  const rect = video.getBoundingClientRect();
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function hasArea(video: HTMLVideoElement): boolean {
  const rect = video.getBoundingClientRect();
  return rect.width >= 32 && rect.height >= 32;
}

export function ensurePositioned(element: HTMLElement): void {
  if (getComputedStyle(element).position === 'static') {
    element.style.position = 'relative';
  }
}

/** Shared helper for site adapters that need a control-bar anchor. */
export function findControlBar(
  selectors: readonly string[],
): HTMLElement | null {
  return queryFirst<HTMLElement>(selectors);
}

export { deepQuerySelector };
