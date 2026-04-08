import type { PlayerAdapter } from '../types';
import { youtubeAdapter } from './youtube';
import { twitchAdapter } from './twitch';
import { bilibiliAdapter } from './bilibili';
import { genericAdapter } from './generic';

const adapters: PlayerAdapter[] = [
  youtubeAdapter,
  twitchAdapter,
  bilibiliAdapter,
  genericAdapter,
];

export function getAdapter(url: string): PlayerAdapter {
  for (const adapter of adapters) {
    if (adapter.canHandle(url)) {
      return adapter;
    }
  }
  return genericAdapter;
}
