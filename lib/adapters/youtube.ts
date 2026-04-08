import type { PlayerAdapter } from '../types';
import { deepQuerySelector } from '../dom-utils';

const HOSTNAMES = ['youtube.com', 'youtu.be', 'www.youtube.com', 'm.youtube.com'];
const VIDEO_SELECTORS = 'video.html5-main-video, video.video-stream, #movie_player video';

export const youtubeAdapter: PlayerAdapter = {
  name: 'YouTube',

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
    const video = this.findVideoElement();
    if (!video) return null;

    const player = deepQuerySelector<HTMLElement>('#movie_player');
    return player ?? video;
  },

  findPlayerContainer(): HTMLElement | null {
    return deepQuerySelector<HTMLElement>('#player-container-inner')
      ?? deepQuerySelector<HTMLElement>('#player-container-outer');
  },

  findPlayerOverlayParent(): HTMLElement | null {
    return deepQuerySelector<HTMLElement>('#movie_player');
  },

  findControlBarRight(): HTMLElement | null {
    return deepQuerySelector<HTMLElement>('.ytp-right-controls');
  },
};
