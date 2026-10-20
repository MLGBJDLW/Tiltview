import type { PlayerAdapter } from '../types';
import { genericAdapter } from './generic';
import { youtubeAdapter } from './youtube';
import { twitchAdapter } from './twitch';
import { bilibiliAdapter } from './bilibili';

/**
 * Order matters: the first adapter whose `canHandle` returns true wins, and
 * `genericAdapter` claims everything, so it must stay last.
 */
export const adapters: readonly PlayerAdapter[] = [
  youtubeAdapter,
  twitchAdapter,
  bilibiliAdapter,
  genericAdapter,
];

export function getAdapter(url: string): PlayerAdapter {
  for (const adapter of adapters) {
    if (adapter.canHandle(url)) return adapter;
  }
  return genericAdapter;
}

export { genericAdapter, youtubeAdapter, twitchAdapter, bilibiliAdapter };
