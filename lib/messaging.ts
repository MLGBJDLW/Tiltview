import type { TransformState } from './geometry';

/**
 * Message protocol between popup / background / content script.
 * Every reply carries `ok` so callers can distinguish "page not ready" from
 * "state was applied".
 */

export type CommandType =
  | 'rotate-cw'
  | 'rotate-ccw'
  | 'zoom-in'
  | 'zoom-out'
  | 'reset-transform'
  | 'reset-view'
  | 'toggle-autofit'
  | 'toggle-flip-h'
  | 'toggle-flip-v'
  | 'toggle-panel'
  | 'toggle-enabled';

export interface ContentStatus {
  ok: boolean;
  state: TransformState;
  hasVideo: boolean;
  adapter: string;
  siteEnabled: boolean;
  error?: string;
}

export type ContentRequest =
  | { type: 'getState' }
  | { type: 'setState'; payload: Partial<TransformState> }
  | { type: 'reset' }
  | { type: 'command'; command: CommandType }
  | { type: 'setSiteEnabled'; enabled: boolean }
  | { type: 'togglePanel' };

export type ContentResponse =
  | ({ type: 'state' } & ContentStatus)
  | { type: 'error'; error: string };

export const MESSAGE_SOURCE = 'tiltview';

/** Commands the manifest can emit; shared by background and content. */
export const KNOWN_COMMANDS = [
  'rotate-cw',
  'rotate-ccw',
  'zoom-in',
  'zoom-out',
  'reset-transform',
  'reset-view',
  'toggle-autofit',
  'toggle-flip-h',
  'toggle-flip-v',
  'toggle-panel',
] as const;

export function isContentRequest(value: unknown): value is ContentRequest {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === 'getState' ||
    type === 'setState' ||
    type === 'reset' ||
    type === 'command' ||
    type === 'setSiteEnabled' ||
    type === 'togglePanel'
  );
}
