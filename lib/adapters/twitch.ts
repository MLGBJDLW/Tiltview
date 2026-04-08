import type { PlayerAdapter } from '../types';
import { deepQuerySelector } from '../dom-utils';

const HOSTNAMES = ['twitch.tv', 'www.twitch.tv', 'm.twitch.tv'];
const VIDEO_SELECTORS = 'video[playsinline], .video-player__container video, video';

export const twitchAdapter: PlayerAdapter = {
  name: 'Twitch',

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
    return deepQuerySelector<HTMLElement>('.video-player__container') ?? this.findVideoElement();
  },

  findPlayerContainer(): HTMLElement | null {
    return deepQuerySelector<HTMLElement>('.video-player')
      ?? deepQuerySelector<HTMLElement>('[data-a-target="video-player"]');
  },

  findPlayerOverlayParent(): HTMLElement | null {
    return deepQuerySelector<HTMLElement>('.video-player__container');
  },

  findControlBarRight(): HTMLElement | null {
    return deepQuerySelector<HTMLElement>('.player-controls__right-control-group');
  },
};
