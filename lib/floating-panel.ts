import { ACTIONS, isActionActive, type ActionId } from './actions';
import type { TransformState } from './geometry';

/**
 * Floating, draggable control panel injected into the player.
 *
 * Lives in a closed shadow root so page CSS cannot leak in and our CSS cannot
 * leak out. Position is remembered per browser in localStorage (page origin
 * scope is fine here; it is cosmetic state).
 */

const CSS = /* css */ `
  :host {
    all: initial;
    position: absolute;
    z-index: 2147483646;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    color: #f8fafc;
    line-height: 1.35;
    contain: layout style;
  }
  .tab, .panel {
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(148, 163, 184, 0.28);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  }
  .tab {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    cursor: grab;
    padding: 0;
    color: #e2e8f0;
  }
  .tab:hover { color: #38bdf8; }
  .tab:active { cursor: grabbing; }
  .tab[data-open="true"] { color: #38bdf8; border-color: rgba(56, 189, 248, 0.6); }
  .tab svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

  .panel {
    display: none;
    width: 236px;
    border-radius: 12px;
    padding: 10px;
    margin-bottom: 6px;
  }
  .panel[data-open="true"] { display: block; }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
    cursor: grab;
  }
  .title { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #94a3b8; }
  .close {
    border: 0; background: transparent; color: #94a3b8; cursor: pointer;
    font-size: 14px; line-height: 1; padding: 2px 4px; border-radius: 4px;
  }
  .close:hover { color: #f8fafc; background: rgba(148, 163, 184, 0.18); }

  .group { margin-bottom: 8px; }
  .group:last-child { margin-bottom: 0; }
  .label { font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; margin-bottom: 3px; }
  .row { display: flex; gap: 4px; flex-wrap: wrap; }

  button.act {
    flex: 1 1 auto;
    min-width: 38px;
    padding: 5px 6px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: rgba(148, 163, 184, 0.16);
    color: #e2e8f0;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: background 120ms, border-color 120ms;
  }
  button.act:hover { background: rgba(148, 163, 184, 0.3); }
  button.act[data-active="true"] {
    background: rgba(56, 189, 248, 0.22);
    border-color: rgba(56, 189, 248, 0.65);
    color: #e0f2fe;
  }
  button.act.danger { background: rgba(248, 113, 113, 0.18); color: #fecaca; }
  button.act.danger:hover { background: rgba(248, 113, 113, 0.32); }

  .slider-row { display: flex; align-items: center; gap: 6px; }
  input[type="range"] {
    flex: 1; height: 3px; accent-color: #38bdf8; cursor: pointer;
  }
  output { width: 38px; text-align: right; font-variant-numeric: tabular-nums; color: #94a3b8; font-size: 11px; }

  .hint { margin-top: 6px; font-size: 9px; color: #475569; line-height: 1.4; }
`;

const POSITION_KEY = 'tiltview:panel-position';

export interface PanelHandle {
  host: HTMLElement;
  mount(container: HTMLElement): void;
  update(state: TransformState, siteEnabled: boolean): void;
  setOpen(open: boolean): void;
  isOpen(): boolean;
  toggle(): void;
  destroy(): void;
}

export interface PanelCallbacks {
  onAction(action: ActionId): void;
  onScale(value: number): void;
}

const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5h4v4"/><path d="M18.5 6.5 14 11"/><rect x="3.5" y="9.5" width="9" height="9" rx="2"/></svg>`;

export function createFloatingPanel(
  initialState: TransformState,
  callbacks: PanelCallbacks,
): PanelHandle {
  let state = { ...initialState };
  let siteEnabled = true;

  const host = document.createElement('div');
  host.id = 'tiltview-panel-host';
  host.setAttribute('data-tiltview', 'panel');
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.appendChild(style);

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.setAttribute('data-open', 'false');
  panel.addEventListener('click', (e) => e.stopPropagation());
  panel.addEventListener('mousedown', (e) => e.stopPropagation());
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  panel.addEventListener('dblclick', (e) => e.stopPropagation());
  shadow.appendChild(panel);

  const tab = document.createElement('button');
  tab.className = 'tab';
  tab.type = 'button';
  tab.title = 'Tiltview — drag to reposition';
  tab.setAttribute('data-open', 'false');
  tab.innerHTML = ICON;
  shadow.appendChild(tab);

  const buttons = new Map<ActionId, HTMLButtonElement>();

  buildPanel();
  applySavedPosition();

  let open = false;
  function setOpen(next: boolean): void {
    open = next;
    panel.setAttribute('data-open', String(open));
    tab.setAttribute('data-open', String(open));
  }

  tab.addEventListener('click', (event) => {
    if (dragMoved) {
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
    setOpen(!open);
  });

  setupDragging();

  return {
    host,
    mount(container) {
      if (host.parentElement !== container) {
        container.appendChild(host);
      }
    },
    update(nextState, enabled) {
      state = { ...nextState };
      siteEnabled = enabled;
      sync();
    },
    setOpen,
    isOpen: () => open,
    toggle: () => setOpen(!open),
    destroy() {
      host.remove();
    },
  };

  // --- construction -------------------------------------------------------

  function buildPanel(): void {
    const head = document.createElement('div');
    head.className = 'head';
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = 'Tiltview';
    const close = document.createElement('button');
    close.className = 'close';
    close.type = 'button';
    close.title = 'Close';
    close.textContent = '✕';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(false);
    });
    head.append(title, close);
    panel.appendChild(head);

    // Rotation
    panel.appendChild(group('Rotation', ['rotate-ccw', 'rotate-cw', 'rotate-0', 'rotate-90', 'rotate-180', 'rotate-270']));

    // Zoom
    const zoomGroup = group('Zoom', ['zoom-out', 'zoom-in']);
    const sliderRow = document.createElement('div');
    sliderRow.className = 'slider-row';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0.5';
    slider.max = '8';
    slider.step = '0.05';
    slider.value = String(state.scale);
    slider.setAttribute('aria-label', 'Zoom');
    const output = document.createElement('output');
    output.textContent = `${state.scale.toFixed(2)}x`;
    slider.addEventListener('input', () => {
      const value = Number.parseFloat(slider.value);
      output.textContent = `${value.toFixed(2)}x`;
      callbacks.onScale(value);
    });
    sliderRow.append(slider, output);
    zoomGroup.appendChild(sliderRow);
    zoomGroup.appendChild(group('', ['zoom-1', 'zoom-1.5', 'zoom-2', 'zoom-3']));
    panel.appendChild(zoomGroup);

    // Mirror + view
    panel.appendChild(group('Mirror', ['flip-h', 'flip-v']));
    panel.appendChild(group('View', ['auto-fit', 'reset-pan', 'reset-all']));

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Drag video to pan · Ctrl+wheel to zoom · Double-click to reset';
    panel.appendChild(hint);

    sliderRef = slider;
    outputRef = output;
  }

  let sliderRef: HTMLInputElement | null = null;
  let outputRef: HTMLOutputElement | null = null;

  function group(label: string, ids: ActionId[]): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'group';
    if (label) {
      const caption = document.createElement('div');
      caption.className = 'label';
      caption.textContent = label;
      wrapper.appendChild(caption);
    }
    const row = document.createElement('div');
    row.className = 'row';
    for (const id of ids) {
      const spec = ACTIONS.find((a) => a.id === id);
      if (!spec) continue;
      const button = document.createElement('button');
      button.className = 'act';
      button.type = 'button';
      button.textContent = spec.short ?? spec.label;
      button.title = spec.title;
      if (id === 'reset-all') button.classList.add('danger');
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        callbacks.onAction(id);
      });
      buttons.set(id, button);
      row.appendChild(button);
    }
    wrapper.appendChild(row);
    return wrapper;
  }

  function sync(): void {
    for (const [id, button] of buttons) {
      button.setAttribute('data-active', String(isActionActive(state, id)));
      button.disabled = !siteEnabled;
    }
    if (sliderRef) sliderRef.value = String(state.scale);
    if (outputRef) outputRef.textContent = `${state.scale.toFixed(2)}x`;
    host.style.opacity = siteEnabled ? '1' : '0.55';
  }

  // --- dragging -----------------------------------------------------------

  let dragMoved = false;

  function setupDragging(): void {
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      const target = event.currentTarget as HTMLElement;
      if (target === tab) event.stopPropagation();
      pointerId = event.pointerId;
      dragMoved = false;
      startX = event.clientX;
      startY = event.clientY;
      const rect = host.getBoundingClientRect();
      const parentRect = host.offsetParent?.getBoundingClientRect() ?? {
        left: 0,
        top: 0,
      };
      startLeft = rect.left - parentRect.left;
      startTop = rect.top - parentRect.top;
      target.setPointerCapture?.(event.pointerId);
    };

    const onMove = (event: PointerEvent): void => {
      if (pointerId === null || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!dragMoved && Math.hypot(dx, dy) < 4) return;
      dragMoved = true;
      event.stopPropagation();
      event.preventDefault();
      host.style.left = `${startLeft + dx}px`;
      host.style.top = `${startTop + dy}px`;
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    };

    const onUp = (event: PointerEvent): void => {
      if (pointerId === null || event.pointerId !== pointerId) return;
      pointerId = null;
      if (dragMoved) {
        savePosition(host.style.left, host.style.top);
      }
    };

    for (const handle of [tab, panel]) {
      handle.addEventListener('pointerdown', onDown as EventListener);
      handle.addEventListener('pointermove', onMove as EventListener);
      handle.addEventListener('pointerup', onUp as EventListener);
      handle.addEventListener('pointercancel', onUp as EventListener);
    }
  }

  function savePosition(left: string, top: string): void {
    if (!left || !top) return;
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify({ left, top }));
    } catch {
      /* ignore */
    }
  }

  function applySavedPosition(): void {
    try {
      const raw = localStorage.getItem(POSITION_KEY);
      if (!raw) {
        host.style.right = '12px';
        host.style.bottom = '64px';
        return;
      }
      const parsed = JSON.parse(raw) as { left?: string; top?: string };
      if (parsed.left && parsed.top) {
        host.style.left = parsed.left;
        host.style.top = parsed.top;
      } else {
        host.style.right = '12px';
        host.style.bottom = '64px';
      }
    } catch {
      host.style.right = '12px';
      host.style.bottom = '64px';
    }
  }
}
