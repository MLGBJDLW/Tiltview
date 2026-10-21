import { createTiltviewIcon } from './icons';

/**
 * In-player control-bar button.
 *
 * History of the defects this file has to satisfy simultaneously:
 *
 * 1. Trusted Types ("the button does nothing").
 *    The icon used to be injected with `innerHTML`. YouTube enforces a Trusted
 *    Types policy, so that assignment threw during construction and the whole
 *    content script died before mounting anything. Icons are built with
 *    `createElementNS` (see ./icons.ts), which Trusted Types does not police.
 *
 * 2. Per-site metrics ("not on the same horizontal line").
 *    A fixed 40x40 box mirrors YouTube's `.ytp-button`, but other players size
 *    their controls completely differently — Bilibili's
 *    `.bpx-player-ctrl-btn` is 28-50 wide by 22 high inside a 35px bar. A
 *    hard-coded box therefore lines up on one site and sits 6.5px low and 18px
 *    too tall on another.
 *
 *    The fix is to stop hard-coding: when mounting, the host measures a real
 *    sibling control in that bar and adopts its height, font size and colour,
 *    mirroring the `margin-right` gutter the site uses between controls. If no
 *    visible sibling can be measured it falls back to YouTube's metrics.
 */

/** Fallback metrics, used only when the bar exposes no measureable sibling. */
const FALLBACK = {
  width: 40,
  height: 40,
  marginRight: 0,
  fontSize: 12,
  color: 'rgb(255, 255, 255)',
} as const;

/** Candidate selectors for "a sibling control in this bar", per known player. */
const SIBLING_SELECTORS = [
  '.ytp-button',
  '.bpx-player-ctrl-btn',
  '.player-controls__right-control-group button',
  'button',
] as const;

const CSS = /* css */ `
  :host {
    all: initial;
    display: inline-block;
    /* Alignment is decided in JS from the measured star sibling; see
       applyControlBarMetrics(). This default only applies before that runs. */
    vertical-align: top;
    margin: 0;
    padding: 0;
    font-size: 0;
    line-height: 0;
    flex: 0 0 auto;
    contain: layout style;
    box-sizing: border-box;
  }
  button {
    display: block;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: 1;
    transition: opacity 120ms ease, filter 120ms ease;
    font: inherit;
    line-height: 0;
    -webkit-appearance: none;
    appearance: none;
  }
  button:hover {
    filter: brightness(1.35);
  }
  button[data-active="true"] {
    color: #38bdf8;
    filter: none;
  }
  button:focus-visible {
    outline: 2px solid #38bdf8;
    outline-offset: -2px;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: none;
  }
`;

export interface ControlBarMetrics {
  width: number;
  height: number;
  marginRight: number;
  fontSize: number;
  color: string;
  /** How the sibling sits in its container, so we can reproduce it exactly. */
  marker: string;
  alignSelf: string;
  verticalAlign: string;
}

export interface ControlBarButtonHandle {
  host: HTMLElement;
  setActive(active: boolean): void;
  destroy(): void;
}

/**
 * Read the metrics of a real, visible control inside `bar`.
 *
 * Hidden siblings are skipped on purpose: players keep `display:none` buttons
 * in the bar (YouTube does), and copying one yields an all-zero box.
 */
export function measureControlBar(bar: HTMLElement): ControlBarMetrics | null {
  for (const selector of SIBLING_SELECTORS) {
    let siblings: Element[];
    try {
      siblings = Array.from(bar.querySelectorAll(selector));
    } catch {
      continue;
    }

    for (const sibling of siblings) {
      if (sibling.id === 'tiltview-controlbar-host') continue;
      const style = getComputedStyle(sibling);
      const rect = sibling.getBoundingClientRect();
      const hidden =
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        rect.width < 8 ||
        rect.height < 8;
      if (hidden) continue;

      const marginRight = Number.parseFloat(style.marginRight);
      const fontSize = Number.parseFloat(style.fontSize);

      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        marginRight: Number.isFinite(marginRight) && marginRight >= 0 ? marginRight : 0,
        fontSize: Number.isFinite(fontSize) && fontSize > 0 ? fontSize : FALLBACK.fontSize,
        color: style.color || FALLBACK.color,
        marker: `${selector}#${siblings.indexOf(sibling)}`,
        alignSelf: style.alignSelf || 'auto',
        verticalAlign: style.verticalAlign || 'baseline',
      };
    }
  }
  return null;
}

export function createControlBarButton(onClick: () => void): ControlBarButtonHandle {
  const host = document.createElement('div');
  host.id = 'tiltview-controlbar-host';
  host.setAttribute('data-tiltview', 'control-bar');

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.appendChild(style);

  const button = document.createElement('button');
  button.type = 'button';
  button.title = 'Tiltview';
  button.setAttribute('aria-label', 'Tiltview');
  // Trusted Types safe: DOM construction, never innerHTML.
  button.appendChild(createTiltviewIcon());

  const stop = (event: Event): void => {
    event.stopPropagation();
  };

  button.addEventListener('click', (event) => {
    stop(event);
    onClick();
  });
  // Stop the player from reading our interactions as its own.
  for (const type of ['mousedown', 'pointerdown', 'dblclick', 'keydown'] as const) {
    button.addEventListener(type, stop);
  }

  shadow.appendChild(button);

  return {
    host,
    setActive(active: boolean) {
      button.setAttribute('data-active', String(active));
    },
    destroy() {
      host.remove();
    },
  };
}

/**
 * Size the host to match the control bar it is being inserted into.
 *
 * Separate from construction because the metrics are only knowable once the bar
 * exists. Idempotent, so reconcile() may call it on every pass.
 */
export function applyControlBarMetrics(host: HTMLElement, bar: HTMLElement): ControlBarMetrics {
  const measured = measureControlBar(bar) ?? {
    width: FALLBACK.width,
    height: FALLBACK.height,
    marginRight: FALLBACK.marginRight,
    fontSize: FALLBACK.fontSize,
    color: FALLBACK.color,
    marker: 'fallback',
    alignSelf: 'center',
    verticalAlign: 'top',
  };

  host.style.width = `${measured.width}px`;
  host.style.height = `${measured.height}px`;
  // Match the gutter the site puts between its own controls so the row keeps an
  // even rhythm. The icon box itself carries no padding.
  host.style.margin = `0 ${measured.marginRight}px 0 0`;
  host.style.fontSize = `${measured.fontSize}px`;
  host.style.color = measured.color;

  // Reproduce the sibling's own alignment. Players differ: YouTube centres its
  // buttons, while Bilibili pins `.bpx-player-ctrl-btn` to the top of a 35px bar
  // (align-items: normal + a 22px box), leaving 13px of slack underneath. Copying
  // the star sibling's alignment is what actually puts the icons on one line.
  host.style.alignSelf = measured.alignSelf;
  host.style.verticalAlign = measured.verticalAlign;

  return measured;
}
