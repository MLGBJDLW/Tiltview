// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  applyControlBarMetrics,
  createControlBarButton,
  measureControlBar,
} from '../lib/control-bar-button';

/**
 * Regression guard for per-site control-bar metrics.
 *
 * The button used to hard-code a 40x40 box (YouTube's `.ytp-button`). On
 * Bilibili the real control is `.bpx-player-ctrl-btn`: 28-50 wide by 22 high in
 * a 35px bar, pinned to the *top* of that bar (align-items: normal leaves 13px
 * of slack underneath). Against that bar the hard-coded box measured
 * centerDeltaY = 6.5px and heightDelta = 18px — exactly "not on the same
 * horizontal line".
 *
 * jsdom does not run layout, so these tests stub `getBoundingClientRect` and
 * assert the contract: the host adopts the dominant sibling's box, gutter,
 * colour and alignment rather than its own defaults.
 */

interface StubRect {
  width: number;
  height: number;
  top: number;
  bottom: number;
}

/** Give an element a fake layout box; jsdom would otherwise report all zeroes. */
function stubBox(el: Element, box: StubRect, style: Partial<CSSStyleDeclaration> = {}): void {
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: box.top,
      width: box.width,
      height: box.height,
      top: box.top,
      bottom: box.bottom,
      left: 0,
      right: box.width,
      toJSON() {
        return this;
      },
    }) as DOMRect;
  for (const [k, v] of Object.entries(style)) {
    (el as HTMLElement).style.setProperty(
      k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
      String(v),
    );
  }
}

function makeBar(selector: string, count: number): { bar: HTMLElement; controls: HTMLElement[] } {
  const bar = document.createElement('div');
  bar.className = 'control-bar';
  const controls: HTMLElement[] = [];
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement('div');
    el.className = selector.replace(/^\./, '');
    bar.appendChild(el);
    controls.push(el);
  }
  document.body.appendChild(bar);
  return { bar, controls };
}

describe('measureControlBar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('adopts Bilibili metrics (22px tall, 10px gutter, top-pinned)', () => {
    const { bar, controls } = makeBar('.bpx-player-ctrl-btn', 2);
    // Real values captured from bilibili.com video pages.
    for (const c of controls) {
      stubBox(c, { width: 28, height: 22, top: 683, bottom: 705 }, {
        marginRight: '10px',
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.8)',
        verticalAlign: 'baseline',
      });
    }

    const m = measureControlBar(bar);
    expect(m).not.toBeNull();
    expect(m).toMatchObject({
      width: 28,
      height: 22,
      marginRight: 10,
      fontSize: 12,
    });
    expect(m?.color).toContain('255');
    expect(m?.marker).toContain('.bpx-player-ctrl-btn');
  });

  it('adopts YouTube metrics (40x40, no gutter)', () => {
    const { bar, controls } = makeBar('.ytp-button', 3);
    stubBox(controls[0], { width: 40, height: 40, top: 500, bottom: 540 }, {
      marginRight: '0px',
      fontSize: '0px',
    });

    const m = measureControlBar(bar);
    expect(m).toMatchObject({ width: 40, height: 40, marginRight: 0 });
  });

  it('skips hidden siblings (players keep display:none buttons)', () => {
    const { bar, controls } = makeBar('.ytp-button', 2);
    // First control is hidden — must not be the reference.
    stubBox(controls[0], { width: 0, height: 0, top: 0, bottom: 0 }, { display: 'none' });
    stubBox(controls[1], { width: 36, height: 40, top: 500, bottom: 540 }, {
      marginRight: '4px',
    });

    const m = measureControlBar(bar);
    expect(m).toMatchObject({ width: 36, height: 40, marginRight: 4 });
  });

  it('returns null when the bar has no measureable control', () => {
    const bar = document.createElement('div');
    document.body.appendChild(bar);
    expect(measureControlBar(bar)).toBeNull();
  });

  it('never measures our own injected host', () => {
    const { bar } = makeBar('.ytp-button', 1);
    const handle = createControlBarButton(() => {});
    bar.prepend(handle.host);
    stubBox(handle.host, { width: 999, height: 999, top: 0, bottom: 999 });

    // The only .ytp-button is a real sibling; our host is selected by id and
    // would only match the generic 'button' fallback selector, not this one.
    const m = measureControlBar(bar);
    expect(m?.width).not.toBe(999);
  });
});

describe('applyControlBarMetrics', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('writes the measured box and gutter onto the host', () => {
    const { bar, controls } = makeBar('.bpx-player-ctrl-btn', 2);
    for (const c of controls) {
      stubBox(c, { width: 28, height: 22, top: 683, bottom: 705 }, {
        marginRight: '10px',
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.8)',
      });
    }
    const host = document.createElement('div');

    const applied = applyControlBarMetrics(host, bar);

    expect(applied.width).toBe(28);
    expect(host.style.width).toBe('28px');
    expect(host.style.height).toBe('22px');
    // jsdom normalises shorthand lengths, so compare the parsed gutter.
    expect(host.style.marginRight).toBe('10px');
    expect(host.style.marginLeft).toBe('0px');
    expect(host.style.fontSize).toBe('12px');
  });

  it('reproduces the sibling alignment instead of forcing centre', () => {
    // Bilibili pins its controls to the top of a taller bar.
    const { bar, controls } = makeBar('.bpx-player-ctrl-btn', 1);
    stubBox(controls[0], { width: 28, height: 22, top: 683, bottom: 705 }, {
      alignSelf: 'auto',
    });
    const host = document.createElement('div');
    applyControlBarMetrics(host, bar);

    // `align-self: auto` resolves against the fact that Bilibili's bar does not
    // centre: the important part is that we do NOT hard-code `center`.
    expect(host.style.alignSelf).toBe('auto');
  });

  it('falls back to YouTube metrics when nothing is measureable', () => {
    const bar = document.createElement('div');
    document.body.appendChild(bar);
    const host = document.createElement('div');

    const applied = applyControlBarMetrics(host, bar);
    expect(applied.marker).toBe('fallback');
    expect(host.style.width).toBe('40px');
    expect(host.style.height).toBe('40px');
  });

  it('is idempotent', () => {
    const { bar, controls } = makeBar('.bpx-player-ctrl-btn', 1);
    stubBox(controls[0], { width: 36, height: 22, top: 683, bottom: 705 }, {
      marginRight: '8px',
    });
    const host = document.createElement('div');

    applyControlBarMetrics(host, bar);
    const first = host.style.cssText;
    applyControlBarMetrics(host, bar);
    expect(host.style.cssText).toBe(first);
  });
});
