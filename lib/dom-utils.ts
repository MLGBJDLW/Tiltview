export function deepQuerySelector<T extends Element>(
  selector: string,
  root: ParentNode = document,
): T | null {
  const el = root.querySelector<T>(selector);
  if (el) return el;
  for (const host of root.querySelectorAll('*')) {
    if (host.shadowRoot) {
      const found = deepQuerySelector<T>(selector, host.shadowRoot);
      if (found) return found;
    }
  }
  return null;
}

export function deepQuerySelectorAll<T extends Element>(
  selector: string,
  root: ParentNode = document,
): T[] {
  const results: T[] = [];
  results.push(...Array.from(root.querySelectorAll<T>(selector)));
  for (const host of root.querySelectorAll('*')) {
    if (host.shadowRoot) {
      results.push(...deepQuerySelectorAll<T>(selector, host.shadowRoot));
    }
  }
  return results;
}
