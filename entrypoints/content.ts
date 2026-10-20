import { TiltviewController } from '@/lib/controller';
import { isContentRequest, type ContentRequest } from '@/lib/messaging';

/**
 * Content script entry point.
 *
 * Injected into every page (`<all_urls>`), but it does nothing visible until a
 * qualifying <video> exists, so ordinary browsing is unaffected. The UI only
 * appears when the user acts (panel tab, shortcut, or popup).
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: false,
  runAt: 'document_idle',
  main() {
    if (!document.documentElement) return;

    const controller = new TiltviewController();
    void controller.start();

    // 1. Extension messaging (popup + background commands).
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isContentRequest(message)) return false;
      sendResponse(controller.handleRequest(message));
      return true;
    });

    // 2. Same-page bridge (`window.postMessage`).
    //
    // Deliberately narrow: the page can only use the same typed request
    // vocabulary the popup uses (get/set transform state, reset, known
    // commands). It cannot change extension settings, read other tabs, or run
    // arbitrary code. This exists so a page can offer its own "tilt" controls
    // and so automated tests can drive the real controller.
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as { __tiltview?: unknown } | null;
      if (!data || typeof data !== 'object' || !('__tiltview' in data)) return;
      const request = (data as { __tiltview: unknown }).__tiltview;
      if (!isContentRequest(request)) return;
      const response = controller.handleRequest(request as ContentRequest);
      window.postMessage({ __tiltviewResponse: response }, '*');
    });
  },
});
