import type { PlayerAdapter, StageSize, UiAnchor } from '../types';
import { deepQuerySelector, getFullscreenElement, queryFirst } from '../dom-utils';
import { ensurePositioned, genericAdapter } from './generic';

const VIDEO_SELECTORS = [
  'video.html5-main-video',
  '#movie_player video',
  'video.video-stream',
  'video',
];

const PLAYER_SELECTORS = ['#movie_player', '.html5-video-player'];

const CONTAINER_SELECTORS = [
  '#player-container-inner',
  '#player-container-outer',
  '.html5-video-container',
];

export const youtubeAdapter: PlayerAdapter = {
  id: 'youtube',
  name: 'YouTube',

  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return (
        hostname === 'youtube.com' ||
        hostname.endsWith('.youtube.com') ||
        hostname === 'youtu.be' ||
        hostname === 'youtube-nocookie.com' ||
        hostname.endsWith('.youtube-nocookie.com')
      );
    } catch {
      return false;
    }
  },

  findVideoElement(): HTMLVideoElement | null {
    const fullscreen = getFullscreenElement();
    if (fullscreen) {
      const inFullscreen = fullscreen.querySelector('video');
      if (inFullscreen) return inFullscreen;
    }
    return queryFirst<HTMLVideoElement>(VIDEO_SELECTORS) ?? genericAdapter.findVideoElement();
  },

  findTransformTarget(video: HTMLVideoElement): HTMLElement | null {
    // Always the <video>. YouTube rewrites #movie_player's own transform during
    // fullscreen transitions and control-bar animation, so mutating the player
    // wrapper is what caused the "video jumps back" reports in v0.1.0.
    return video;
  },

  findStage(video: HTMLVideoElement): StageSize | null {
    const fullscreen = getFullscreenElement();
    if (fullscreen) {
      const rect = fullscreen.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }
    const container =
      queryFirst<HTMLElement>(CONTAINER_SELECTORS) ?? deepQuerySelector<HTMLElement>('.html5-video-player');
    if (container) {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return { width: rect.width, height: rect.height };
      }
    }
    return genericAdapter.findStage(video);
  },

  findUiAnchor(video: HTMLVideoElement): UiAnchor | null {
    const fullscreen = getFullscreenElement();
    if (fullscreen) {
      return { container: fullscreen };
    }
    const player =
      queryFirst<HTMLElement>(PLAYER_SELECTORS) ??
      (video.closest('.html5-video-player') as HTMLElement | null);
    if (!player) return null;
    ensurePositioned(player);
    const controlBar = deepQuerySelector<HTMLElement>('.ytp-right-controls');
    // `.ytp-chrome-bottom` (progress bar + controls) is painted INSIDE
    // #movie_player and covers roughly the last 59px of it. Anchoring the panel
    // to the picture area keeps it clear of that chrome, mirroring what the
    // Bilibili adapter does for the danmaku bar.
    const safeArea =
      deepQuerySelector<HTMLElement>('.html5-video-container') ??
      deepQuerySelector<HTMLElement>('.ytp-player-content');
    return { container: player, controlBar, safeArea };
  },
};
