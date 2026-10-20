import { browser } from 'wxt/browser';
import { getDefaultState, type TransformState } from './geometry';

/**
 * Persistence.
 *
 * v0.1.0 kept state in a closure variable, so every SPA navigation, quality
 * switch, or ad break silently threw the user's view away. We key the saved
 * view by origin + path-ish key so:
 *   - reloading keeps your rotation,
 *   - visiting a different video on the same site gets its own memory,
 *   - unrelated sites never inherit each other's transforms.
 */

const STORAGE_KEY = 'tiltview:views:v1';
const SETTINGS_KEY = 'tiltview:settings:v1';

export interface SiteSettings {
  /** Global master switch, so users can turn the extension off entirely. */
  enabled: boolean;
  /** Show the inline control-bar button where a site exposes one. */
  showControlBarButton: boolean;
  /** Enable drag-to-pan on the video surface. */
  gesturesEnabled: boolean;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  enabled: true,
  showControlBarButton: true,
  gesturesEnabled: true,
};

type ViewMap = Record<string, TransformState>;

/** Coarse, stable key: origin + first path segment. */
export function viewKeyFor(url: string): string {
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    return segment ? `${parsed.origin}/${segment}` : parsed.origin;
  } catch {
    return 'unknown';
  }
}

function sanitizeState(value: unknown): TransformState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<TransformState>;
  const defaults = getDefaultState();
  const number = (input: unknown, fallback: number): number =>
    typeof input === 'number' && Number.isFinite(input) ? input : fallback;
  return {
    rotation: number(raw.rotation, defaults.rotation),
    scale: number(raw.scale, defaults.scale),
    translateX: number(raw.translateX, defaults.translateX),
    translateY: number(raw.translateY, defaults.translateY),
    flipH: Boolean(raw.flipH),
    flipV: Boolean(raw.flipV),
    autoFit: Boolean(raw.autoFit),
  };
}

export async function loadSettings(): Promise<SiteSettings> {
  try {
    const stored = await browser.storage.local.get(SETTINGS_KEY);
    const raw = stored?.[SETTINGS_KEY] as Partial<SiteSettings> | undefined;
    if (!raw) return { ...DEFAULT_SETTINGS };
    return {
      enabled: raw.enabled !== false,
      showControlBarButton: raw.showControlBarButton !== false,
      gesturesEnabled: raw.gesturesEnabled !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: SiteSettings): Promise<void> {
  try {
    await browser.storage.local.set({ [SETTINGS_KEY]: settings });
  } catch {
    /* storage may be unavailable in private mode; not fatal */
  }
}

export async function loadView(url: string): Promise<TransformState | null> {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const map = (stored?.[STORAGE_KEY] ?? {}) as ViewMap;
    return sanitizeState(map[viewKeyFor(url)]);
  } catch {
    return null;
  }
}

export async function saveView(url: string, state: TransformState): Promise<void> {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const map = (stored?.[STORAGE_KEY] ?? {}) as ViewMap;
    const key = viewKeyFor(url);
    map[key] = state;
    await browser.storage.local.set({ [STORAGE_KEY]: map });
  } catch {
    /* ignore */
  }
}

export async function clearView(url: string): Promise<void> {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const map = (stored?.[STORAGE_KEY] ?? {}) as ViewMap;
    delete map[viewKeyFor(url)];
    await browser.storage.local.set({ [STORAGE_KEY]: map });
  } catch {
    /* ignore */
  }
}
