import { getAdapter } from '@/lib/adapters';
import type { PlayerAdapter } from '@/lib/types';
import {
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  getDefaultState,
  type MediaSize,
  type StageSize,
  type TransformState,
} from '@/lib/geometry';
import { runAction, type ActionId } from '@/lib/actions';
import {
  isContentRequest,
  type ContentRequest,
  type ContentResponse,
} from '@/lib/messaging';
import { createFloatingPanel, type PanelHandle } from '@/lib/floating-panel';
import { createControlBarButton, type ControlBarButtonHandle } from '@/lib/control-bar-button';
import { GestureController } from '@/lib/gestures';
import { loadSettings, loadView, saveView, type SiteSettings } from '@/lib/storage';
import { TransformApplier } from '@/lib/transform';
import { getFullscreenElement, invalidateShadowCache } from '@/lib/dom-utils';

/**
 * Content-script controller.
 *
 * Replaces the v0.1.0 approach of two page-wide MutationObservers running deep
 * shadow queries on every mutation. Here:
 *  - a single debounced scheduler coalesces DOM churn into one "reconcile",
 *  - a cheap 1s interval retries while no video exists (cheaper and far less
 *    noisy than observing the whole document),
 *  - state survives video switches on the same page,
 *  - everything is torn down cleanly when the site is disabled.
 */

const RECONCILE_DEBOUNCE_MS = 180;
const IDLE_POLL_MS = 1000;
const SAVE_DEBOUNCE_MS = 400;

export interface ControllerHooks {
  onAdapterChange?: (name: string) => void;
}

export class TiltviewController {
  private adapter: PlayerAdapter;
  private state: TransformState = getDefaultState();
  private settings: SiteSettings = {
    enabled: true,
    showControlBarButton: true,
    gesturesEnabled: true,
  };

  private video: HTMLVideoElement | null = null;
  private stage: StageSize | null = null;
  private media: MediaSize | null = null;

  private applier = new TransformApplier();
  private panel: PanelHandle | null = null;
  private controlButton: ControlBarButtonHandle | null = null;
  private gestures: GestureController;

  private observer: MutationObserver | null = null;
  private reconcileTimer: number | null = null;
  private idleTimer: number | null = null;
  private saveTimer: number | null = null;
  private mountedContainer: HTMLElement | null = null;
  private hooks: ControllerHooks;

  constructor(hooks: ControllerHooks = {}) {
    this.hooks = hooks;
    this.adapter = getAdapter(location.href);
    this.gestures = new GestureController({
      getSurface: () => this.video,
      getState: () => this.state,
      apply: (next, phase) => this.onGesture(next, phase),
      isEnabled: () => this.settings.enabled && this.settings.gesturesEnabled,
      onDoubleClickReset: () => this.dispatch('reset-all'),
    });
  }

  // --- lifecycle ----------------------------------------------------------

  async start(): Promise<void> {
    this.settings = await loadSettings();
    const saved = await loadView(location.href);
    if (saved) this.state = saved;

    if (!this.settings.enabled) return;

    this.adapter = getAdapter(location.href);
    this.hooks.onAdapterChange?.(this.adapter.name);

    this.reconcile();
    this.installObserver();
    this.idleTimer = window.setInterval(() => {
      if (!this.video || !this.video.isConnected) this.reconcile();
    }, IDLE_POLL_MS);

    document.addEventListener('fullscreenchange', this.onFullscreenChange, true);
    document.addEventListener('webkitfullscreenchange', this.onFullscreenChange as EventListener, true);
    window.addEventListener('popstate', this.onUrlChange);
    window.addEventListener('hashchange', this.onUrlChange);
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.settings = { ...this.settings, enabled };
    if (enabled) {
      await this.start();
    } else {
      this.teardown();
    }
  }

  teardown(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.reconcileTimer !== null) window.clearTimeout(this.reconcileTimer);
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    if (this.idleTimer !== null) window.clearInterval(this.idleTimer);
    this.reconcileTimer = null;
    this.saveTimer = null;
    this.idleTimer = null;

    document.removeEventListener('fullscreenchange', this.onFullscreenChange, true);
    document.removeEventListener('webkitfullscreenchange', this.onFullscreenChange as EventListener, true);
    window.removeEventListener('popstate', this.onUrlChange);
    window.removeEventListener('hashchange', this.onUrlChange);

    this.gestures.detach();
    this.panel?.destroy();
    this.controlButton?.destroy();
    this.panel = null;
    this.controlButton = null;
    this.applier.release();
    this.video = null;
    this.mountedContainer = null;
  }

  // --- public API ---------------------------------------------------------

  getState(): TransformState {
    return { ...this.state };
  }

  getVideo(): HTMLVideoElement | null {
    return this.video;
  }

  getAdapterName(): string {
    return this.adapter.name;
  }

  setState(partial: Partial<TransformState>): TransformState {
    const next: TransformState = { ...this.state, ...partial };
    next.rotation = ((next.rotation % 360) + 360) % 360;
    next.scale = clampScale(next.scale);
    this.commit(next);
    return this.getState();
  }

  dispatch(action: ActionId): TransformState {
    this.commit(runAction(this.state, action));
    return this.getState();
  }

  togglePanel(): void {
    this.panel?.toggle();
  }

  reset(): TransformState {
    this.commit(runAction(this.state, 'reset-all'));
    return this.getState();
  }

  handleRequest(request: ContentRequest): ContentResponse {
    try {
      switch (request.type) {
        case 'getState':
          return this.status();
        case 'setState':
          this.setState(request.payload ?? {});
          return this.status();
        case 'reset':
          this.reset();
          return this.status();
        case 'command':
          return this.runCommand(request.command);
        case 'setSiteEnabled':
          void this.setEnabled(request.enabled);
          return this.status();
        case 'togglePanel':
          this.togglePanel();
          return this.status();
        default:
          return { type: 'error', error: 'Unknown request' };
      }
    } catch (error) {
      return { type: 'error', error: error instanceof Error ? error.message : String(error) };
    }
  }

  private runCommand(command: string): ContentResponse {
    const commandMap: Record<string, ActionId | 'toggle-panel'> = {
      'rotate-cw': 'rotate-cw',
      'rotate-ccw': 'rotate-ccw',
      'zoom-in': 'zoom-in',
      'zoom-out': 'zoom-out',
      'reset-transform': 'reset-all',
      'reset-view': 'reset-all',
      'toggle-autofit': 'auto-fit',
      'toggle-flip-h': 'flip-h',
      'toggle-flip-v': 'flip-v',
      'toggle-panel': 'toggle-panel',
    };

    const mapped = commandMap[command];
    if (!mapped) return { type: 'error', error: `Unknown command: ${command}` };
    if (mapped === 'toggle-panel') {
      this.togglePanel();
      return this.status();
    }
    this.dispatch(mapped);
    return this.status();
  }

  private status(): ContentResponse {
    return {
      type: 'state',
      ok: true,
      state: this.getState(),
      hasVideo: Boolean(this.video && this.video.isConnected),
      adapter: this.adapter.name,
      siteEnabled: this.settings.enabled,
    };
  }

  // --- core rendering -----------------------------------------------------

  private commit(next: TransformState): void {
    this.state = next;
    this.render(false);
    this.panel?.update(this.state, this.settings.enabled);
    this.scheduleSave();
  }

  private onGesture(next: TransformState, phase: 'start' | 'move' | 'end'): void {
    this.state = next;
    const target = this.applier.currentTarget;
    if (target) {
      this.applier.setInteractive(target, phase !== 'end');
    }
    this.render(phase !== 'end' ? false : false);
    if (phase === 'end') {
      this.panel?.update(this.state, this.settings.enabled);
      this.scheduleSave();
    }
  }

  private render(force: boolean): void {
    const video = this.video;
    if (!video || !video.isConnected) return;

    const target = this.adapter.findTransformTarget(video) ?? video;
    this.stage = this.adapter.findStage(video) ?? this.stage;
    this.media = this.readMediaSize(video);

    if (!force) {
      this.applier.apply(target, this.state, this.stage, this.media);
    } else {
      this.applier.apply(target, getDefaultState(), this.stage, this.media);
    }
  }

  private readMediaSize(video: HTMLVideoElement): MediaSize | null {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      return { width: video.videoWidth, height: video.videoHeight };
    }
    const rect = video.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return { width: rect.width, height: rect.height };
    }
    return this.media;
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void saveView(location.href, this.state);
    }, SAVE_DEBOUNCE_MS);
  }

  // --- DOM reconciliation -------------------------------------------------

  private scheduleReconcile(): void {
    if (this.reconcileTimer !== null) return;
    this.reconcileTimer = window.setTimeout(() => {
      this.reconcileTimer = null;
      this.reconcile();
    }, RECONCILE_DEBOUNCE_MS);
  }

  private reconcile(): void {
    if (!this.settings.enabled) return;

    const url = location.href;
    const nextAdapter = getAdapter(url);
    if (nextAdapter !== this.adapter) {
      this.adapter = nextAdapter;
      this.hooks.onAdapterChange?.(this.adapter.name);

      // Different site context (SPA route change) → different saved view.
      void loadView(url).then((saved) => {
        if (saved) {
          this.state = saved;
          this.render(false);
          this.panel?.update(this.state, this.settings.enabled);
        }
      });
    }

    const video = this.adapter.findVideoElement();
    if (video !== this.video) {
      // Video switched (episode change, next autoplay, source quality swap).
      // Keep the user's transform instead of resetting it, but re-target and
      // reset the pan so it does not drift off-screen on a different box.
      this.video = video;
      if (video) {
        this.gestures.attach(video);
        video.addEventListener('loadedmetadata', this.onLoadedMetadata);
        video.addEventListener('resize', this.onLoadedMetadata);
      }
    }

    if (!this.video) {
      this.panel?.destroy();
      this.panel = null;
      this.controlButton?.destroy();
      this.controlButton = null;
      this.mountedContainer = null;
      return;
    }

    this.render(false);
    this.mountUi(this.video);
  }

  private onLoadedMetadata = (): void => {
    if (!this.video) return;
    this.media = this.readMediaSize(this.video);
    this.stage = this.adapter.findStage(this.video) ?? this.stage;
    // Auto-fit depends on the real intrinsic size, which only exists now.
    if (this.state.autoFit) this.render(false);
  };

  private mountUi(video: HTMLVideoElement): void {
    const anchor = this.adapter.findUiAnchor(video);
    if (!anchor) return;

    if (!this.panel) {
      this.panel = createFloatingPanel(this.state, {
        onAction: (action) => this.dispatch(action),
        onScale: (value) => this.setState({ scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, value)) }),
      });
    }
    this.panel.mount(anchor.container);
    this.panel.update(this.state, this.settings.enabled);
    this.mountedContainer = anchor.container;

    if (this.settings.showControlBarButton && anchor.controlBar) {
      if (!this.controlButton || !this.controlButton.host.isConnected) {
        this.controlButton?.destroy();
        this.controlButton = createControlBarButton(() => this.togglePanel());
        anchor.controlBar.prepend(this.controlButton.host);
      }
      this.controlButton.setActive(this.panel.isOpen());
    } else if (this.controlButton) {
      this.controlButton.destroy();
      this.controlButton = null;
    }
  }

  private installObserver(): void {
    if (this.observer) return;
    this.observer = new MutationObserver((records) => {
      for (const record of records) {
        // Ignore our own UI churn.
        if (record.target instanceof Element && record.target.closest('[data-tiltview]')) {
          continue;
        }
        invalidateShadowCache();
        this.scheduleReconcile();
        return;
      }
    });
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  private onFullscreenChange = (): void => {
    const fullscreen = getFullscreenElement();
    if (fullscreen) {
      // The fullscreen element is a new top-layer root; re-mount the UI there
      // and swap the stage so auto-fit uses the full viewport.
      this.mountedContainer = null;
      this.panel?.destroy();
      this.panel = null;
      this.controlButton?.destroy();
      this.controlButton = null;
    }
    this.scheduleReconcile();
  };

  private onUrlChange = (): void => {
    invalidateShadowCache();
    this.scheduleReconcile();
  };
}

export function isTiltviewRequest(value: unknown): value is ContentRequest {
  return isContentRequest(value);
}
