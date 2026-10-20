import {
  clampScale,
  type TransformState,
} from './geometry';

/**
 * Single source of truth for every user-facing action.
 *
 * v0.1.0 defined rotation/zoom/reset logic three times (popup, inline panel,
 * content script) and they drifted apart. Every surface now calls `runAction`.
 */

export type ActionId =
  | 'rotate-cw'
  | 'rotate-ccw'
  | 'rotate-0'
  | 'rotate-90'
  | 'rotate-180'
  | 'rotate-270'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-1'
  | 'zoom-1.5'
  | 'zoom-2'
  | 'zoom-3'
  | 'flip-h'
  | 'flip-v'
  | 'auto-fit'
  | 'reset-pan'
  | 'reset-all';

export interface ActionSpec {
  id: ActionId;
  label: string;
  /** Short inline label, for the compact floating panel. */
  short?: string;
  title: string;
  /** Category drives grouping in both UIs. */
  group: 'rotation' | 'zoom' | 'mirror' | 'view';
}

export const ACTIONS: readonly ActionSpec[] = [
  { id: 'rotate-ccw', label: '⟲ 90°', short: '⟲', title: 'Rotate 90° counter-clockwise', group: 'rotation' },
  { id: 'rotate-cw', label: '⟳ 90°', short: '⟳', title: 'Rotate 90° clockwise', group: 'rotation' },
  { id: 'rotate-0', label: '0°', title: 'Reset rotation to 0°', group: 'rotation' },
  { id: 'rotate-90', label: '90°', title: 'Rotate to 90°', group: 'rotation' },
  { id: 'rotate-180', label: '180°', title: 'Rotate to 180°', group: 'rotation' },
  { id: 'rotate-270', label: '270°', title: 'Rotate to 270°', group: 'rotation' },
  { id: 'zoom-in', label: '＋', short: '＋', title: 'Zoom in', group: 'zoom' },
  { id: 'zoom-out', label: '－', short: '－', title: 'Zoom out', group: 'zoom' },
  { id: 'zoom-1', label: '1x', title: 'Zoom to 1x', group: 'zoom' },
  { id: 'zoom-1.5', label: '1.5x', title: 'Zoom to 1.5x', group: 'zoom' },
  { id: 'zoom-2', label: '2x', title: 'Zoom to 2x', group: 'zoom' },
  { id: 'zoom-3', label: '3x', title: 'Zoom to 3x', group: 'zoom' },
  { id: 'flip-h', label: '↔ Mirror', short: '↔', title: 'Mirror horizontally', group: 'mirror' },
  { id: 'flip-v', label: '↕ Mirror', short: '↕', title: 'Mirror vertically', group: 'mirror' },
  { id: 'auto-fit', label: 'Auto-fit', title: 'Fill the player after rotating', group: 'view' },
  { id: 'reset-pan', label: 'Center', title: 'Recenter the video', group: 'view' },
  { id: 'reset-all', label: 'Reset', title: 'Reset every transform', group: 'view' },
];

const ACTION_BY_ID = new Map<ActionId, ActionSpec>(ACTIONS.map((a) => [a.id, a]));

export function getAction(id: ActionId): ActionSpec {
  const spec = ACTION_BY_ID.get(id);
  if (!spec) throw new Error(`Unknown action: ${id}`);
  return spec;
}

const ZOOM_FACTOR = 1.25;

export const ZOOM_PRESETS = [1, 1.5, 2, 3] as const;
export const ROTATION_PRESETS = [0, 90, 180, 270] as const;

/**
 * Apply an action to a state. Pure: returns a new state, never mutates.
 * `reset-all` returns the default state; callers decide whether mirror
 * preferences should survive (the UI uses `reset-view` for that).
 */
export function runAction(state: TransformState, id: ActionId): TransformState {
  switch (id) {
    case 'rotate-cw':
      return { ...state, rotation: (state.rotation + 90) % 360 };
    case 'rotate-ccw':
      return { ...state, rotation: (state.rotation + 270) % 360 };
    case 'rotate-0':
      return { ...state, rotation: 0 };
    case 'rotate-90':
      return { ...state, rotation: 90 };
    case 'rotate-180':
      return { ...state, rotation: 180 };
    case 'rotate-270':
      return { ...state, rotation: 270 };
    case 'zoom-in':
      return { ...state, scale: clampScale(state.scale * ZOOM_FACTOR) };
    case 'zoom-out':
      return { ...state, scale: clampScale(state.scale / ZOOM_FACTOR) };
    case 'zoom-1':
      return { ...state, scale: 1 };
    case 'zoom-1.5':
      return { ...state, scale: 1.5 };
    case 'zoom-2':
      return { ...state, scale: 2 };
    case 'zoom-3':
      return { ...state, scale: 3 };
    case 'flip-h':
      return { ...state, flipH: !state.flipH };
    case 'flip-v':
      return { ...state, flipV: !state.flipV };
    case 'auto-fit':
      return { ...state, autoFit: !state.autoFit };
    case 'reset-pan':
      return { ...state, translateX: 0, translateY: 0 };
    case 'reset-all':
      return {
        rotation: 0,
        scale: 1,
        translateX: 0,
        translateY: 0,
        flipH: false,
        flipV: false,
        autoFit: false,
      };
    default: {
      const exhaustive: never = id;
      throw new Error(`Unhandled action ${String(exhaustive)}`);
    }
  }
}

/** Is the button for this action currently "on"? */
export function isActionActive(state: TransformState, id: ActionId): boolean {
  switch (id) {
    case 'rotate-0':
      return state.rotation === 0;
    case 'rotate-90':
      return state.rotation === 90;
    case 'rotate-180':
      return state.rotation === 180;
    case 'rotate-270':
      return state.rotation === 270;
    case 'zoom-1':
      return Math.abs(state.scale - 1) < 0.01;
    case 'zoom-1.5':
      return Math.abs(state.scale - 1.5) < 0.01;
    case 'zoom-2':
      return Math.abs(state.scale - 2) < 0.01;
    case 'zoom-3':
      return Math.abs(state.scale - 3) < 0.01;
    case 'flip-h':
      return state.flipH;
    case 'flip-v':
      return state.flipV;
    case 'auto-fit':
      return state.autoFit;
    default:
      return false;
  }
}
