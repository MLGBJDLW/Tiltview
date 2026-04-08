import { useState, useEffect, useCallback } from 'react';
import { browser } from 'wxt/browser';
import type { TransformState } from '@/lib/types';

const DEFAULT_STATE: TransformState = {
  rotation: 0,
  scale: 1,
  translateX: 0,
  translateY: 0,
  flipH: false,
  flipV: false,
  autoFit: false,
};

const PAN_STEP = 20;

async function sendToContent(
  type: string,
  payload?: Partial<TransformState>,
): Promise<{ success: boolean; state: TransformState; hasVideo?: boolean }> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  return browser.tabs.sendMessage(tab.id, { type, payload });
}

function App() {
  const [state, setState] = useState<TransformState>(DEFAULT_STATE);
  const [hasVideo, setHasVideo] = useState(false);
  const [connected, setConnected] = useState(false);

  // Sync state from content script on open
  useEffect(() => {
    sendToContent('getState')
      .then((res) => {
        if (res.success) {
          setState(res.state);
          setHasVideo(res.hasVideo ?? false);
          setConnected(true);
        }
      })
      .catch(() => setConnected(false));
  }, []);

  const updateState = useCallback(
    (partial: Partial<TransformState>) => {
      setState(prev => {
        const next = { ...prev, ...partial };
        sendToContent('setState', next).catch(() => {});
        return next;
      });
    },
    [],
  );

  const handleReset = useCallback(() => {
    setState(DEFAULT_STATE);
    sendToContent('reset').catch(() => {});
  }, []);

  return (
    <div className="w-80 bg-gray-900 text-white p-4 text-sm font-sans">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold tracking-tight">Tiltview</h1>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span
            className={`w-2 h-2 rounded-full ${
              connected && hasVideo ? 'bg-green-400' : 'bg-gray-600'
            }`}
          />
          {connected && hasVideo
            ? 'Video detected'
            : connected
              ? 'No video'
              : 'Disconnected'}
        </div>
      </div>

      {/* Rotation */}
      <Section title="Rotation">
        <div className="flex gap-1.5">
          {[0, 90, 180, 270].map((deg) => (
            <button
              key={deg}
              onClick={() => updateState({ rotation: deg })}
              className={`flex-1 py-1.5 rounded text-xs font-medium transition ${
                state.rotation === deg
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {deg}°
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input
            type="range"
            min={0}
            max={359}
            value={state.rotation}
            onChange={(e) =>
              updateState({ rotation: Number(e.target.value) })
            }
            className="flex-1 accent-blue-500 h-1.5"
          />
          <span className="text-xs text-gray-400 w-10 text-right tabular-nums">
            {state.rotation}°
          </span>
        </div>
        <button
          onClick={() => updateState({ autoFit: !state.autoFit })}
          className={`w-full mt-2 py-1.5 rounded text-xs font-medium transition ${
            state.autoFit
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Auto-fit {state.autoFit ? 'ON' : 'OFF'}
        </button>
      </Section>

      {/* Zoom */}
      <Section title="Zoom">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0.5}
            max={5}
            step={0.1}
            value={state.scale}
            onChange={(e) =>
              updateState({ scale: Number(e.target.value) })
            }
            className="flex-1 accent-blue-500 h-1.5"
          />
          <span className="text-xs text-gray-400 w-10 text-right tabular-nums">
            {state.scale.toFixed(1)}x
          </span>
        </div>
        <div className="flex gap-1.5 mt-2">
          {[1, 1.5, 2, 3].map((z) => (
            <button
              key={z}
              onClick={() => updateState({ scale: z })}
              className={`flex-1 py-1.5 rounded text-xs font-medium transition ${
                state.scale === z
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {z}x
            </button>
          ))}
        </div>
      </Section>

      {/* Pan */}
      <Section title="Pan">
        <div className="grid grid-cols-3 gap-1.5 w-28 mx-auto">
          <div />
          <ArrowBtn
            label="▲"
            onClick={() =>
              updateState({ translateY: state.translateY - PAN_STEP })
            }
          />
          <div />
          <ArrowBtn
            label="◀"
            onClick={() =>
              updateState({ translateX: state.translateX - PAN_STEP })
            }
          />
          <ArrowBtn
            label="●"
            onClick={() => updateState({ translateX: 0, translateY: 0 })}
            secondary
          />
          <ArrowBtn
            label="▶"
            onClick={() =>
              updateState({ translateX: state.translateX + PAN_STEP })
            }
          />
          <div />
          <ArrowBtn
            label="▼"
            onClick={() =>
              updateState({ translateY: state.translateY + PAN_STEP })
            }
          />
          <div />
        </div>
      </Section>

      {/* Mirror */}
      <Section title="Mirror">
        <div className="flex gap-1.5">
          <button
            onClick={() => updateState({ flipH: !state.flipH })}
            className={`flex-1 py-1.5 rounded text-xs font-medium transition ${
              state.flipH
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            ↔ Horizontal
          </button>
          <button
            onClick={() => updateState({ flipV: !state.flipV })}
            className={`flex-1 py-1.5 rounded text-xs font-medium transition ${
              state.flipV
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            ↕ Vertical
          </button>
        </div>
      </Section>

      {/* Reset */}
      <button
        onClick={handleReset}
        className="w-full mt-3 py-2 rounded bg-red-600/80 hover:bg-red-600 text-white text-xs font-medium transition"
      >
        Reset All
      </button>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
        {title}
      </h2>
      {children}
    </div>
  );
}

function ArrowBtn({
  label,
  onClick,
  secondary,
}: {
  label: string;
  onClick: () => void;
  secondary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-8 h-8 rounded flex items-center justify-center text-xs transition ${
        secondary
          ? 'bg-gray-600 text-gray-300 hover:bg-gray-500'
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );
}

export default App;
