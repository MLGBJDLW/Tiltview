import type { PlayerAdapter } from '../types';
import { deepQuerySelector } from '../dom-utils';

const HOSTNAMES = ['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'];
const VIDEO_SELECTORS = '.bilibili-player-video video, .bpx-player-video-wrap video, video';

export const bilibiliAdapter: PlayerAdapter = {
  name: 'Bilibili',

  canHandle(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return HOSTNAMES.some((h) => hostname === h || hostname.endsWith('.' + h));
    } catch {
      return false;
    }
  },

  findVideoElement(): HTMLVideoElement | null {
    return deepQuerySelector<HTMLVideoElement>(VIDEO_SELECTORS);
  },

  findTransformTarget(): HTMLElement | null {
    return deepQuerySelector<HTMLElement>('.bpx-player-video-wrap')
      ?? deepQuerySelector<HTMLElement>('.bilibili-player-video')
      ?? this.findVideoElement();
  },

  findPlayerContainer(): HTMLElement | null {
    return deepQuerySelector<HTMLElement>('.bpx-player-container')
      ?? deepQuerySelector<HTMLElement>('#bilibili-player');
  },

  findPlayerOverlayParent(): HTMLElement | null {
    return deepQuerySelector<HTMLElement>('.bpx-player-video-area');
  },

  findControlBarRight(): HTMLElement | null {
    return deepQuerySelector<HTMLElement>('.bpx-player-control-bottom-right');
  },
};
