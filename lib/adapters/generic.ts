import type { PlayerAdapter } from '../types';
import { deepQuerySelectorAll } from '../dom-utils';

export const genericAdapter: PlayerAdapter = {
  name: 'Generic',

  canHandle(_url: string): boolean {
    return true;
  },

  findVideoElement(): HTMLVideoElement | null {
    const videos = deepQuerySelectorAll<HTMLVideoElement>('video');
    if (videos.length === 0) return null;
    if (videos.length === 1) return videos[0];

    // Return the largest video by area
    let largest: HTMLVideoElement | null = null;
    let maxArea = 0;
    for (const video of videos) {
      const area = video.videoWidth * video.videoHeight || video.clientWidth * video.clientHeight;
      if (area > maxArea) {
        maxArea = area;
        largest = video;
      }
    }
    return largest ?? videos[0];
  },

  findTransformTarget(): HTMLElement | null {
    return this.findVideoElement();
  },

  findPlayerContainer(): HTMLElement | null {
    const video = this.findVideoElement();
    return video?.parentElement ?? null;
  },

  findPlayerOverlayParent(): HTMLElement | null {
    const video = this.findVideoElement();
    return video?.parentElement ?? null;
  },

  findControlBarRight(): HTMLElement | null {
    return null;
  },
};
