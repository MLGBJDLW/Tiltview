// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createTiltviewIcon, createRectIcon } from '../lib/icons';
import { createControlBarButton } from '../lib/control-bar-button';
import { createFloatingPanel } from '../lib/floating-panel';
import { getDefaultState } from '../lib/geometry';

/**
 * Regression guard for two real-world defects reported against v1.0.1:
 *
 * 1. "The button in the progress bar does nothing."
 *    YouTube enforces a Trusted Types CSP policy. `element.innerHTML = '<svg…>'`
 *    throws `TypeError: This document requires 'TrustedHTML' assignment` inside
 *    the content script's initialisation path. The throw aborted
 *    `TiltviewController.start()` before either UI surface mounted, so the user
 *    saw no button behaviour at all — and no floating panel either.
 *
 * 2. "It isn't on the same horizontal line as the others."
 *    The host was `inline-flex` + `height:100%` + `max-height:40px`, which fell
 *    back to `vertical-align: baseline` in an inline-block control bar and
 *    drifted off centre in a flex one.
 *
 * The guard works by installing a Trusted-Types-like policy on
 * `Element.prototype.innerHTML` (jsdom keeps the setter there) and asserting
 * that constructing the UI never trips it. It is verified to FAIL when the
 * implementation regresses to `innerHTML`.
 */

const HTML_SINK_ERR =
  "Failed to set the 'innerHTML' property on 'Element': " +
  "This document requires 'TrustedHTML' assignment.";

interface SinkGuard {
  restore(): void;
  readonly violations: string[];
}

/**
 * Make string assignment of markup to `innerHTML` throw, mirroring Chrome's
 * behaviour under `require-trusted-types-for 'script'`.
 */
function installHtmlSink(): SinkGuard {
  const violations: string[] = [];
  const proto = Element.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
  if (!original?.set) throw new Error('Element.prototype.innerHTML setter not found');

  const originalSet = original.set;
  const originalGet = original.get!;

  Object.defineProperty(proto, 'innerHTML', {
    configurable: true,
    get: originalGet,
    set(this: Element, value: unknown) {
      if (typeof value === 'string' && /<\s*[a-z]/i.test(value)) {
        violations.push(value.slice(0, 80));
        throw new TypeError(HTML_SINK_ERR);
      }
      originalSet.call(this, value);
    },
  });

  return {
    violations,
    restore() {
      Object.defineProperty(proto, 'innerHTML', original);
    },
  };
}

describe('Trusted Types safety', () => {
  let guard: SinkGuard | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    guard?.restore();
    guard = null;
  });

  it('the guard itself throws on string markup (self-check)', () => {
    const g = installHtmlSink();
    try {
      const el = document.createElement('button');
      expect(() => {
        el.innerHTML = '<svg viewBox="0 0 24 24"></svg>';
      }).toThrow(HTML_SINK_ERR);
      expect(g.violations.length).toBe(1);
    } finally {
      g.restore();
    }
  });

  it('builds the icon without touching innerHTML', () => {
    guard = installHtmlSink();
    const icon = createTiltviewIcon();
    expect(icon.tagName.toLowerCase()).toBe('svg');
    expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(icon.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(icon.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(guard.violations).toEqual([]);
  });

  it('creates the control-bar button under a strict policy', () => {
    guard = installHtmlSink();
    const handle = createControlBarButton(() => {});
    expect(handle.host.id).toBe('tiltview-controlbar-host');
    // Closed shadow root: the page must not be able to reach inside.
    expect(handle.host.shadowRoot).toBeNull();
    expect(guard.violations).toEqual([]);
  });

  it('creates the floating panel under a strict policy', () => {
    guard = installHtmlSink();
    const panel = createFloatingPanel(getDefaultState(), {
      onAction: () => {},
      onScale: () => {},
    });
    expect(panel.host.id).toBe('tiltview-panel-host');
    expect(panel.host.shadowRoot).toBeNull();
    expect(guard.violations).toEqual([]);
  });

  it('the panel reports state after construction', () => {
    guard = installHtmlSink();
    const panel = createFloatingPanel(getDefaultState(), {
      onAction: () => {},
      onScale: () => {},
    });
    expect(panel.isOpen()).toBe(false);
    panel.setOpen(true);
    expect(panel.isOpen()).toBe(true);
    panel.toggle();
    expect(panel.isOpen()).toBe(false);
  });

  it('rect icon helper uses the SVG namespace', () => {
    const icon = createRectIcon();
    expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(icon.querySelector('rect')).not.toBeNull();
  });
});

describe('control-bar host integration', () => {
  it('exposes the documented host contract', () => {
    const handle = createControlBarButton(() => {});
    expect(handle.host.id).toBe('tiltview-controlbar-host');
    expect(handle.host.getAttribute('data-tiltview')).toBe('control-bar');
  });

  it('prepends without disturbing existing children', () => {
    const bar = document.createElement('div');
    bar.className = 'ytp-right-controls';
    const existing = document.createElement('button');
    existing.className = 'ytp-button';
    bar.appendChild(existing);

    const handle = createControlBarButton(() => {});
    bar.prepend(handle.host);

    expect(bar.children.length).toBe(2);
    expect(bar.firstElementChild).toBe(handle.host);
    expect(bar.lastElementChild).toBe(existing);
  });

  it('destroy removes the host and leaves siblings intact', () => {
    const bar = document.createElement('div');
    const existing = document.createElement('button');
    bar.appendChild(existing);
    const handle = createControlBarButton(() => {});
    bar.prepend(handle.host);
    handle.destroy();
    expect(bar.children.length).toBe(1);
    expect(bar.firstElementChild).toBe(existing);
  });
});
