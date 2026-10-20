import {
  KNOWN_COMMANDS,
  isContentRequest,
  type CommandType,
  type ContentRequest,
  type ContentResponse,
} from '@/lib/messaging';

/**
 * Background service worker.
 *
 * v0.1.0 did `tabs.sendMessage(...)` and ignored the promise, so keyboard
 * shortcuts failed silently whenever the content script was not present (which
 * was most of the time: it was only injected on 4 hostnames, and `activeTab` is
 * not granted for commands).
 *
 * Now every command goes through `sendToTab`, which retries once after
 * programmatically injecting the content script.
 */

async function sendToTab(tabId: number, request: ContentRequest): Promise<ContentResponse | null> {
  try {
    const response = (await browser.tabs.sendMessage(tabId, request)) as ContentResponse | undefined;
    if (response) return response;
  } catch {
    // No receiver yet (page loaded before install, or content script missing).
  }

  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/content.js'],
    });
  } catch {
    return null;
  }

  try {
    const response = (await browser.tabs.sendMessage(tabId, request)) as ContentResponse | undefined;
    return response ?? null;
  } catch {
    return null;
  }
}

async function activeTabId(): Promise<number | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function asCommand(value: string): CommandType | null {
  return (KNOWN_COMMANDS as readonly string[]).includes(value) ? (value as CommandType) : null;
}

export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command) => {
    const mapped = asCommand(command);
    if (!mapped) return;
    const tabId = await activeTabId();
    if (tabId === null) return;
    await sendToTab(tabId, { type: 'command', command: mapped });
  });

  // The popup asks the background instead of messaging the tab directly, so a
  // missing content script can be recovered rather than surfacing as
  // "Could not establish connection".
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isContentRequest(message)) return false;

    void (async () => {
      const tabId = await activeTabId();
      if (tabId === null) {
        sendResponse({ type: 'error', error: 'No active tab' });
        return;
      }
      const response = await sendToTab(tabId, message);
      sendResponse(response ?? { type: 'error', error: 'No response from page' });
    })();

    return true;
  });
});
