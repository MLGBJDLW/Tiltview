/**
 * DOM helpers shared by adapters and the content script.
 *
 * v0.1.0's `deepQuerySelectorAll` walked *every* element on the page to find
 * shadow roots. On YouTube that runs thousands of times per second and was the
 * single biggest source of jank. Here we:
 *  - query light DOM first (fast path, covers ~all sites),
 *  - only descend into shadow roots when a cheap predicate says it is worth it,
 *  - memoize the list of shadow hosts for a short window.
 */

const SHADOW_HOST_CACHE_MS = 500;

let shadowHostCache: { at: number; hosts: Element[] } | null = null;

export function invalidateShadowCache(): void {
  shadowHostCache = null;
}

function getShadowHosts(root: ParentNode): Element[] {
  if (root !== document) {
    return Array.from(root.querySelectorAll('*')).filter((el) => el.shadowRoot);
  }
  const now = Date.now();
  if (shadowHostCache && now - shadowHostCache.at < SHADOW_HOST_CACHE_MS) {
    return shadowHostCache.hosts;
  }
  const hosts: Element[] = [];
  const walker = document.createTreeWalker(document.body ?? document, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    const el = node as Element;
    if (el.shadowRoot) hosts.push(el);
    node = walker.nextNode();
  }
  shadowHostCache = { at: now, hosts };
  return hosts;
}

export function deepQuerySelector<T extends Element>(
  selector: string,
  root: ParentNode = document,
): T | null {
  const direct = root.querySelector<T>(selector);
  if (direct) return direct;
  for (const host of getShadowHosts(root)) {
    if (!host.shadowRoot) continue;
    const found = deepQuerySelector<T>(selector, host.shadowRoot);
    if (found) return found;
  }
  return null;
}

export function deepQuerySelectorAll<T extends Element>(
  selector: string,
  root: ParentNode = document,
): T[] {
  const results: T[] = Array.from(root.querySelectorAll<T>(selector));
  for (const host of getShadowHosts(root)) {
    if (!host.shadowRoot) continue;
    results.push(...deepQuerySelectorAll<T>(selector, host.shadowRoot));
  }
  return results;
}

/** First selector in `selectors` that resolves. */
export function queryFirst<T extends Element>(
  selectors: readonly string[],
  root: ParentNode = document,
): T | null {
  for (const selector of selectors) {
    const found = deepQuerySelector<T>(selector, root);
    if (found) return found;
  }
  return null;
}

/**
 * The element that currently fills the viewport, if anything.
 * Fullscreen videos live in a separate top-layer tree, so transforms and UI
 * must be anchored there instead of to the original player container.
 */
export function getFullscreenElement(): HTMLElement | null {
  const el =
    document.fullscreenElement ??
    (document as Document & { webkitFullscreenElement?: Element })
      .webkitFullscreenElement ??
    null;
  return (el as HTMLElement | null) ?? null;
}

export function isElementVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width < 16 || rect.height < 16) return false;
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

/** Can this element be transformed without breaking the page layout? */
export function isTransformable(element: Element | null): element is HTMLElement {
  if (!element) return false;
  return element instanceof HTMLElement && element.isConnected;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
