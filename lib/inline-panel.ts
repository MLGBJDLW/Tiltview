import type { TransformState } from './types';

const PANEL_CSS = /* css */ `
  :host {
    all: initial;
    position: absolute;
    bottom: 50px;
    right: 10px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    color: #fff;
    line-height: 1.4;
  }
  :host(.tv-with-toggle) .tv-toggle {
    display: none;
  }

  .tv-toggle {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.2s, background 0.2s;
    opacity: 0.6;
    padding: 0;
  }
  .tv-toggle:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.8);
  }
  .tv-toggle.active {
    opacity: 1;
    background: rgba(37, 99, 235, 0.9);
  }

  .tv-panel {
    display: none;
    width: 220px;
    background: rgba(0, 0, 0, 0.85);
    border-radius: 8px;
    padding: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    margin-bottom: 6px;
  }
  .tv-panel::after {
    content: '';
    position: absolute;
    bottom: -6px;
    right: 16px;
    width: 10px;
    height: 10px;
    background: rgba(0, 0, 0, 0.85);
    transform: rotate(45deg);
  }
  .tv-panel.open {
    display: block;
  }

  .tv-section {
    margin-bottom: 10px;
  }
  .tv-section:last-child {
    margin-bottom: 0;
  }
  .tv-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 4px;
  }

  .tv-row {
    display: flex;
    gap: 4px;
  }

  .tv-btn {
    flex: 1;
    padding: 5px 0;
    border: none;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.8);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    font-family: inherit;
  }
  .tv-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  .tv-btn.selected {
    background: rgba(37, 99, 235, 0.9);
    color: #fff;
  }

  .tv-slider-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tv-slider {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    outline: none;
  }
  .tv-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
  }
  .tv-slider-val {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    min-width: 32px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .tv-reset {
    width: 100%;
    padding: 5px 0;
    border: none;
    border-radius: 4px;
    background: rgba(220, 38, 38, 0.7);
    color: #fff;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    font-family: inherit;
    margin-top: 4px;
  }
  .tv-reset:hover {
    background: rgba(220, 38, 38, 0.9);
  }
`;

export interface InlinePanelHandle {
  host: HTMLElement;
  update(state: TransformState): void;
  toggle(): void;
  destroy(): void;
}

export interface ToggleButtonHandle {
  host: HTMLElement;
  destroy(): void;
}

const TOGGLE_BTN_CSS = /* css */ `
  :host {
    all: initial;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    vertical-align: middle;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    line-height: normal;
    height: 100%;
  }
  button {
    width: 36px;
    height: 36px;
    border: none;
    background: transparent;
    color: #fff;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    vertical-align: middle;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    line-height: normal;
    opacity: 0.8;
    transition: opacity 0.15s;
  }
  button:hover {
    opacity: 1;
  }
  button svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
  }
`;

export function createToggleButton(
  onClick: () => void,
): ToggleButtonHandle {
  const host = document.createElement('div');
  host.id = 'tiltview-toggle-host';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = TOGGLE_BTN_CSS;
  shadow.appendChild(style);

  const btn = document.createElement('button');
  btn.title = 'Tiltview';
  btn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M7.11 8.53 5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z"/></svg>`;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  btn.addEventListener('mousedown', (e) => e.stopPropagation());
  shadow.appendChild(btn);

  return {
    host,
    destroy() {
      host.remove();
    },
  };
}

export function createInlinePanel(
  initialState: TransformState,
  onChange: (partial: Partial<TransformState>) => void,
  hasExternalToggle = false,
): InlinePanelHandle {
  let state = { ...initialState };

  const host = document.createElement('div');
  host.id = 'tiltview-inline-host';

  const shadow = host.attachShadow({ mode: 'closed' });

  // Styles
  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  shadow.appendChild(style);

  // Toggle button (hidden when external toggle exists)
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'tv-toggle';
  toggleBtn.textContent = '🔄';
  toggleBtn.title = 'Tiltview';
  shadow.appendChild(toggleBtn);

  if (hasExternalToggle) {
    host.classList.add('tv-with-toggle');
  }

  // Panel
  const panel = document.createElement('div');
  panel.className = 'tv-panel';
  shadow.appendChild(panel);

  let panelOpen = false;
  function setPanelOpen(open: boolean) {
    panelOpen = open;
    panel.classList.toggle('open', panelOpen);
    toggleBtn.classList.toggle('active', panelOpen);
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setPanelOpen(!panelOpen);
  });

  // Stop clicks inside panel from propagating to the video player
  panel.addEventListener('click', (e) => e.stopPropagation());
  panel.addEventListener('mousedown', (e) => e.stopPropagation());
  panel.addEventListener('dblclick', (e) => e.stopPropagation());

  // --- Rotation section ---
  const rotSection = createSection('Rotation');
  const rotRow = document.createElement('div');
  rotRow.className = 'tv-row';
  const rotBtns: HTMLButtonElement[] = [];
  for (const deg of [0, 90, 180, 270]) {
    const btn = document.createElement('button');
    btn.className = 'tv-btn';
    btn.textContent = `${deg}°`;
    btn.addEventListener('click', () => onChange({ rotation: deg }));
    rotRow.appendChild(btn);
    rotBtns.push(btn);
  }
  rotSection.appendChild(rotRow);
  panel.appendChild(rotSection);

  // --- Zoom section ---
  const zoomSection = createSection('Zoom');
  const zoomSliderRow = document.createElement('div');
  zoomSliderRow.className = 'tv-slider-row';
  const zoomSlider = document.createElement('input');
  zoomSlider.type = 'range';
  zoomSlider.className = 'tv-slider';
  zoomSlider.min = '0.5';
  zoomSlider.max = '5';
  zoomSlider.step = '0.1';
  zoomSlider.value = String(state.scale);
  const zoomVal = document.createElement('span');
  zoomVal.className = 'tv-slider-val';
  zoomVal.textContent = `${state.scale.toFixed(1)}x`;
  zoomSlider.addEventListener('input', () => {
    const v = parseFloat(zoomSlider.value);
    onChange({ scale: v });
  });
  zoomSliderRow.appendChild(zoomSlider);
  zoomSliderRow.appendChild(zoomVal);
  zoomSection.appendChild(zoomSliderRow);
  panel.appendChild(zoomSection);

  // --- Auto-fit section ---
  const fitSection = createSection('Auto-fit');
  const fitRow = document.createElement('div');
  fitRow.className = 'tv-row';
  const fitBtn = document.createElement('button');
  fitBtn.className = 'tv-btn';
  fitBtn.textContent = 'Auto-fit';
  fitBtn.addEventListener('click', () => onChange({ autoFit: !state.autoFit }));
  fitRow.appendChild(fitBtn);
  fitSection.appendChild(fitRow);
  panel.appendChild(fitSection);

  // --- Mirror section ---
  const mirrorSection = createSection('Mirror');
  const mirrorRow = document.createElement('div');
  mirrorRow.className = 'tv-row';
  const flipHBtn = document.createElement('button');
  flipHBtn.className = 'tv-btn';
  flipHBtn.textContent = '↔ H';
  flipHBtn.addEventListener('click', () => onChange({ flipH: !state.flipH }));
  const flipVBtn = document.createElement('button');
  flipVBtn.className = 'tv-btn';
  flipVBtn.textContent = '↕ V';
  flipVBtn.addEventListener('click', () => onChange({ flipV: !state.flipV }));
  mirrorRow.appendChild(flipHBtn);
  mirrorRow.appendChild(flipVBtn);
  mirrorSection.appendChild(mirrorRow);
  panel.appendChild(mirrorSection);

  // --- Reset ---
  const resetBtn = document.createElement('button');
  resetBtn.className = 'tv-reset';
  resetBtn.textContent = 'Reset';
  resetBtn.addEventListener('click', () =>
    onChange({
      rotation: 0,
      scale: 1,
      translateX: 0,
      translateY: 0,
      flipH: false,
      flipV: false,
      autoFit: false,
    }),
  );
  panel.appendChild(resetBtn);

  function syncUI() {
    for (const btn of rotBtns) {
      const deg = parseInt(btn.textContent!, 10);
      btn.classList.toggle('selected', state.rotation === deg);
    }
    zoomSlider.value = String(state.scale);
    zoomVal.textContent = `${state.scale.toFixed(1)}x`;
    fitBtn.classList.toggle('selected', state.autoFit);
    flipHBtn.classList.toggle('selected', state.flipH);
    flipVBtn.classList.toggle('selected', state.flipV);
  }

  syncUI();

  return {
    host,
    update(newState: TransformState) {
      state = { ...newState };
      syncUI();
    },
    toggle() {
      setPanelOpen(!panelOpen);
    },
    destroy() {
      host.remove();
    },
  };
}

function createSection(title: string): HTMLDivElement {
  const section = document.createElement('div');
  section.className = 'tv-section';
  const label = document.createElement('div');
  label.className = 'tv-label';
  label.textContent = title;
  section.appendChild(label);
  return section;
}
