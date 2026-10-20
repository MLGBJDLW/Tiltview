import type { PlayerAdapter, StageSize, UiAnchor } from '../types';
import { getFullscreenElement, queryFirst } from '../dom-utils';
import { ensurePositioned, genericAdapter } from './generic';

const VIDEO_SELECTORS = [
  '[data-a-target="video-player"] video',
  '.video-player video',
  '.video-player__container video',
  'video',
];

const PLAYER_SELECTORS = [
  '[data-a-target="video-player"]',
  '.video-player',
  '.video-player__container',
];

const CONTROL_BAR_SELECTORS = [
  '.player-controls__right-control-group',
  '[data-a-target="player-controls"] .player-controls__right-control-group',
];

export const twitchAdapter: PlayerAdapter = {
  id: 'twitch',
  name: 'Twitch',

  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return hostname === 'twitch.tv' || hostname.endsWith('.twitch.tv');
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
    // Twitch uses the wrapper for its own letterbox logic; transform the video.
    return video;
  },

  findStage(video: HTMLVideoElement): StageSize | null {
    const fullscreen = getFullscreenElement();
    if (fullscreen) {
      const rect = fullscreen.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }
    const container =
      video.closest('.video-player__container') ??
      queryFirst<HTMLElement>(PLAYER_SELECTORS);
    if (container) {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return { width: rect.width, height: rect.height };
      }
    }
    return genericAdapter.findStage(video);
  },

  findUiAnchor(_video: HTMLVideoElement): UiAnchor | null {
    const fullscreen = getFullscreenElement();
    if (fullscreen) {
      return { container: fullscreen };
    }
    const player =
      queryFirst<HTMLElement>(PLAYER_SELECTORS) ??
      (_video.closest('.video-player__container') as HTMLElement | null);
    if (!player) return null;
    ensurePositioned(player);
    const controlBar = queryFirst<HTMLElement>(CONTROL_BAR_SELECTORS);
    return { container: player, controlBar };
  },
};
