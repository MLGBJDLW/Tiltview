import type { PlayerAdapter, StageSize, UiAnchor } from '../types';
import { getFullscreenElement, queryFirst } from '../dom-utils';
import { ensurePositioned, genericAdapter } from './generic';

const VIDEO_SELECTORS = [
  '.bpx-player-video-wrap video',
  '.bilibili-player-video video',
  '#bilibili-player video',
  'video',
];

const STAGE_SELECTORS = [
  '.bpx-player-video-area',
  '.bpx-player-video-wrap',
  '.bilibili-player-video',
];

const PLAYER_SELECTORS = [
  '.bpx-player-container',
  '#bilibili-player',
  '.bilibili-player',
];

const CONTROL_BAR_SELECTORS = [
  '.bpx-player-control-bottom-right',
  '.bilibili-player-video-btn',
];

export const bilibiliAdapter: PlayerAdapter = {
  id: 'bilibili',
  name: 'Bilibili',

  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com');
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
    // Bilibili's own "mirror" feature writes a scale to `.bpx-player-video-wrap`;
    // transforming the <video> keeps the two independent.
    return video;
  },

  findStage(video: HTMLVideoElement): StageSize | null {
    const fullscreen = getFullscreenElement();
    if (fullscreen) {
      const rect = fullscreen.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }
    const stage = queryFirst<HTMLElement>(STAGE_SELECTORS);
    if (stage) {
      const rect = stage.getBoundingClientRect();
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
    const player = queryFirst<HTMLElement>(PLAYER_SELECTORS);
    if (!player) return null;
    ensurePositioned(player);
    const controlBar = queryFirst<HTMLElement>(CONTROL_BAR_SELECTORS);
    return { container: player, controlBar };
  },
};
