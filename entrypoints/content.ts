import type { TransformState } from '@/lib/types';
import { getAdapter } from '@/lib/adapters';
import {
  getDefaultState,
  applyTransform,
  resetTransform,
} from '@/lib/transform';
import {
  createInlinePanel,
  createToggleButton,
  type InlinePanelHandle,
  type ToggleButtonHandle,
} from '@/lib/inline-panel';

export default defineContentScript({
  matches: [
    '*://*.youtube.com/*',
    '*://*.youtu.be/*',
    '*://*.twitch.tv/*',
    '*://*.bilibili.com/*',
  ],
  main() {
    let currentState: TransformState = getDefaultState();
    let currentTarget: HTMLElement | null = null;
    let currentVideoElement: HTMLVideoElement | null = null;
    let inlinePanel: InlinePanelHandle | null = null;
    let toggleButton: ToggleButtonHandle | null = null;

    function getAdapterInstance() {
      return getAdapter(window.location.href);
    }

    function getTarget(): HTMLElement | null {
      return getAdapterInstance().findTransformTarget();
    }

    function getVideo(): HTMLVideoElement | null {
      return getAdapterInstance().findVideoElement();
    }

    function getContainerDims(): { width: number; height: number } | undefined {
      const adapter = getAdapterInstance();
      const container = adapter.findPlayerContainer?.();
      if (!container) return undefined;
      return { width: container.clientWidth, height: container.clientHeight };
    }

    function applyCurrentTransform(): void {
      const target = getTarget();
      if (!target) return;
      currentTarget = target;
      const dims = currentState.autoFit ? getContainerDims() : undefined;
      applyTransform(target, currentState, dims);
    }

    function handleInlineChange(partial: Partial<TransformState>): void {
      currentState = { ...currentState, ...partial };
      applyCurrentTransform();
      inlinePanel?.update(currentState);
    }

    // --- Inline panel injection ---
    function injectInlinePanel(): void {
      const adapter = getAdapterInstance();

      // Inject toggle button into control bar (bottom-right)
      if (!toggleButton || !document.contains(toggleButton.host)) {
        if (toggleButton) {
          toggleButton.destroy();
          toggleButton = null;
        }
        const controlBar = adapter.findControlBarRight?.();
        if (controlBar) {
          toggleButton = createToggleButton(() => {
            if (inlinePanel) {
              inlinePanel.toggle();
            }
          });
          // Prepend so it appears before other right controls
          controlBar.prepend(toggleButton.host);
        }
      }

      // Inject floating panel into the player overlay area
      if (inlinePanel && document.contains(inlinePanel.host)) return;

      const overlayParent = adapter.findPlayerOverlayParent?.();
      if (!overlayParent) return;

      // Clean up old panel if it exists but got detached
      if (inlinePanel) {
        inlinePanel.destroy();
        inlinePanel = null;
      }

      const hasControlBar = !!toggleButton;
      inlinePanel = createInlinePanel(currentState, handleInlineChange, hasControlBar);

      // Ensure parent has position for absolute positioning
      const parentPos = getComputedStyle(overlayParent).position;
      if (parentPos === 'static') {
        overlayParent.style.position = 'relative';
      }

      overlayParent.appendChild(inlinePanel.host);

      // If no control bar toggle button, panel starts with its own toggle visible
      // If control bar toggle exists, panel starts hidden (opened via control bar button)
    }

    // Re-inject panel if detached
    const panelObserver = new MutationObserver(() => {
      if (
        (inlinePanel && !document.contains(inlinePanel.host)) ||
        (toggleButton && !document.contains(toggleButton.host))
      ) {
        inlinePanel = null;
        toggleButton = null;
        injectInlinePanel();
      }
    });

    // Watch for video element changes (SPA navigation)
    let pending = false;
    const observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const adapter = getAdapterInstance();
        const newVideo = adapter.findVideoElement();

        // Detect new video element (SPA navigation) — reset state
        if (newVideo && newVideo !== currentVideoElement) {
          if (currentTarget) {
            resetTransform(currentTarget);
          }
          currentVideoElement = newVideo;
          currentTarget = adapter.findTransformTarget() ?? null;
          currentState = getDefaultState();
          // Suppress transition flash on the new target
          if (currentTarget) {
            currentTarget.style.transition = 'none';
            applyTransform(currentTarget, currentState);
            requestAnimationFrame(() => {
              if (currentTarget) {
                currentTarget.style.transition = '';
              }
            });
          }
          inlinePanel?.update(currentState);
        } else {
          const target = getTarget();
          if (target && target !== currentTarget) {
            currentTarget = target;
            const dims = currentState.autoFit ? getContainerDims() : undefined;
            applyTransform(target, currentState, dims);
          }
        }
        // Try to inject inline panel if not yet present
        injectInlinePanel();
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    panelObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Initial injection attempt (delayed to let player load)
    setTimeout(injectInlinePanel, 1500);

    // Message handler
    browser.runtime.onMessage.addListener(
      (
        message: { type: string; payload?: Partial<TransformState> },
        _sender,
        sendResponse,
      ) => {
        try {
          switch (message.type) {
            case 'getState': {
              const video = getVideo();
              sendResponse({
                success: true,
                state: currentState,
                hasVideo: video !== null,
              });
              break;
            }

            case 'setState': {
              if (message.payload) {
                currentState = { ...currentState, ...message.payload };
                applyCurrentTransform();
                inlinePanel?.update(currentState);
              }
              sendResponse({ success: true, state: currentState });
              break;
            }

            case 'reset': {
              if (currentTarget) {
                resetTransform(currentTarget);
              }
              currentState = getDefaultState();
              currentTarget = null;
              currentVideoElement = null;
              inlinePanel?.update(currentState);
              sendResponse({ success: true, state: currentState });
              break;
            }

            default:
              sendResponse({ success: false, error: 'Unknown message type' });
          }
        } catch (e) {
          sendResponse({ success: false, error: String(e) });
        }
        return true;
      },
    );
  },
});
