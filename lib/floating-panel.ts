import { ACTIONS, isActionActive, type ActionId } from './actions';
import type { TransformState } from './geometry';
import { createTiltviewIcon } from './icons';

/**
 * Floating, draggable control panel injected into the player.
 *
 * Lives in a closed shadow root so page CSS cannot leak in and our CSS cannot
 * leak out. Position is remembered per browser in localStorage (page origin
 * scope is fine here; it is cosmetic state).
 */

/** Matches the control-bar button so both entry points share one grid. */
const ICON_SIZE_PX = 40;

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
    width: ${ICON_SIZE_PX}px;
    height: ${ICON_SIZE_PX}px;
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

/** Gap between the panel and the edge of the picture area it sits in. */
const PANEL_MARGIN_PX = 10;
/**
 * Space kept clear at the bottom of the picture area for the player's own
 * control bar, so the panel tab never covers play/seek controls.
 */
const CONTROL_BAR_CLEARANCE_PX = 56;

export interface PanelHandle {
  host: HTMLElement;
  mount(container: HTMLElement, safeArea?: HTMLElement | null): void;
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
  // Trusted Types safe: build the icon with DOM APIs, never innerHTML.
  tab.appendChild(createTiltviewIcon());
  shadow.appendChild(tab);

  const buttons = new Map<ActionId, HTMLButtonElement>();

  // These must be declared before buildPanel() runs: buildPanel assigns them at
  // the end, and `let` bindings are in their temporal dead zone until the
  // declaration is evaluated. Declaring them after the call worked only because
  // the bundler hoisted them; as plain ESM it throws
  // "Cannot access 'sliderRef' before initialization".
  let sliderRef: HTMLInputElement | null = null;
  let outputRef: HTMLOutputElement | null = null;

  buildPanel();
  applySavedPosition();

  let open = false;
  /** Picture area the panel is kept inside; set by mount(). */
  let safeBox: HTMLElement | null = null;

  function setOpen(next: boolean): void {
    open = next;
    panel.setAttribute('data-open', String(open));
    tab.setAttribute('data-open', String(open));
    // The panel body is display:none until opened, so its height is only
    // measurable now. Re-clamp so an opened panel still fits the picture area.
    if (open && safeBox) {
      // Two frames: one for the display flip, one for the resulting layout.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (safeBox) clampInto(safeBox);
      }));
    }
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
    mount(container, safeArea) {
      if (host.parentElement !== container) {
        container.appendChild(host);
      }
      safeBox = safeArea ?? container;
      clampInto(safeBox);
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

      // Never start a drag from an interactive control inside the panel.
      //
      // The panel is registered as a drag surface, so a press on any button used
      // to call setPointerCapture() on the panel. Pointer capture retargets every
      // subsequent pointer event to the capturing element, so `pointerup` arrived
      // at `.panel` while `pointerdown` had arrived at the button. With press and
      // release on different elements the browser cannot synthesise a click on
      // the button and dispatches it to their common ancestor instead — every
      // action button in the panel was dead.
      //
      // A single-variable experiment on the built bundle confirmed it: with
      // setPointerCapture() disabled, a real click produced 1 button click and
      // the video transform changed; unmodified it produced 0 and no change.
      const origin = event.target as HTMLElement | null;
      if (target === panel && origin && origin !== panel && origin.closest?.(
        'button, input, select, textarea, a, [role="button"]',
      )) {
        return;
      }

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

  /**
   * Keep the whole panel inside `box`.
   *
   * Why this exists: players disagree about what their "container" is. Bilibili
   * puts the danmaku input bar *inside* `.bpx-player-container`, so a panel
   * anchored with `bottom: 64px` from the container edge lands on the input and
   * gets clipped. Positioning is therefore expressed against the picture area
   * (the adapter's `safeArea`), and this function guarantees the result stays
   * within it whatever size the panel ends up being.
   */
  function clampInto(box: HTMLElement): void {
    const hostRect = host.getBoundingClientRect();
    // Some players expose a "picture area" element with zero height (YouTube's
    // .html5-video-container is 0px tall because the <video> is absolutely
    // positioned inside). Falling back to the parent keeps the panel positioned
    // instead of silently doing nothing.
    let target = box;
    let boxRect = target.getBoundingClientRect();
    if ((boxRect.width <= 0 || boxRect.height <= 0) && target.parentElement) {
      target = target.parentElement;
      boxRect = target.getBoundingClientRect();
    }
    if (boxRect.width <= 0 || boxRect.height <= 0) return;
    const panelRect = panel.getBoundingClientRect();
    // The tab is always visible; the panel body adds height only when open.
    const contentHeight =
      open && panelRect.height > 0 ? panelRect.height + 6 : hostRect.height;
    const width = Math.max(hostRect.width, panelRect.width);
    if (width <= 0 || contentHeight <= 0) return;

    const margin = PANEL_MARGIN_PX;
    const origin = host.offsetParent as HTMLElement | null;
    const originRect = origin?.getBoundingClientRect() ?? {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;

    // Desired position: bottom-right of the safe area, lifted above the control
    // bar so the tab never sits on top of the play controls.
    const boxLeftInParent = boxRect.left - originRect.left + (origin?.scrollLeft ?? 0);
    const boxTopInParent = boxRect.top - originRect.top + (origin?.scrollTop ?? 0);

    const desiredLeft = boxLeftInParent + boxRect.width - width - margin;
    const desiredTop = boxTopInParent + boxRect.height - contentHeight - CONTROL_BAR_CLEARANCE_PX;

    const minLeft = boxLeftInParent + margin;
    const maxLeft = boxLeftInParent + boxRect.width - width - margin;
    const minTop = boxTopInParent + margin;
    const maxTop = boxTopInParent + boxRect.height - contentHeight - margin;

    const left = Math.min(Math.max(desiredLeft, minLeft), Math.max(minLeft, maxLeft));
    const top = Math.min(Math.max(desiredTop, minTop), Math.max(minTop, maxTop));

    host.style.left = `${Math.round(left)}px`;
    host.style.top = `${Math.round(top)}px`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
    host.dataset.safeArea = 'true';
  }

  function applySavedPosition(): void {
    try {
      const raw = localStorage.getItem(POSITION_KEY);
      const parsed = raw ? (JSON.parse(raw) as { left?: string; top?: string }) : null;
      if (parsed?.left && parsed.top) {
        host.style.left = parsed.left;
        host.style.top = parsed.top;
      }
    } catch {
      /* fall through to the adapter-driven default */
    }
  }
}
