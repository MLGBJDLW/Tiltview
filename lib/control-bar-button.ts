/**
 * Optional control-bar button.
 *
 * v0.1.0 hard-coded `width/height: 36px` and `height: 100%`, which broke the
 * layout on every site differently (YouTube wants ~40px, Twitch ~30px,
 * Bilibili ~32px). Here the button inherits the bar's own sizing so it looks
 * native everywhere.
 */

const CSS = /* css */ `
  :host {
    all: initial;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: center;
    height: 100%;
    max-height: 40px;
    margin: 0 2px;
    padding: 0;
    font-size: 0;
    line-height: 0;
    contain: layout style;
  }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-width: 26px;
    height: 100%;
    min-height: 24px;
    padding: 0 3px;
    margin: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: 0.78;
    transition: opacity 120ms ease, background-color 120ms ease;
    font: inherit;
  }
  button:hover, button:focus-visible {
    opacity: 1;
    background: rgba(255, 255, 255, 0.14);
  }
  button[data-active="true"] { color: #38bdf8; opacity: 1; }
  svg {
    width: 100%;
    height: 100%;
    max-width: 22px;
    max-height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
`;

const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5h4v4"/><path d="M18.5 6.5 14 11"/><rect x="3.5" y="9.5" width="9" height="9" rx="2"/></svg>`;

export interface ControlBarButtonHandle {
  host: HTMLElement;
  setActive(active: boolean): void;
  destroy(): void;
}

export function createControlBarButton(
  onClick: () => void,
): ControlBarButtonHandle {
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
  button.innerHTML = ICON;

  const stop = (event: Event): void => {
    event.stopPropagation();
  };
  button.addEventListener('click', (event) => {
    stop(event);
    onClick();
  });
  for (const type of ['mousedown', 'pointerdown', 'dblclick', 'keydown']) {
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
