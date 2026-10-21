import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  ACTIONS,
  ROTATION_PRESETS,
  ZOOM_PRESETS,
  isActionActive,
  runAction,
  type ActionId,
} from '@/lib/actions';
import { MAX_SCALE, MIN_SCALE, getDefaultState, type TransformState } from '@/lib/geometry';
import type { ContentResponse } from '@/lib/messaging';

const PAN_STEP = 40;
const SEND_DEBOUNCE_MS = 60;

interface ConnectionState {
  connected: boolean;
  hasVideo: boolean;
  adapter: string;
  siteEnabled: boolean;
  error?: string;
}

function useController() {
  const [state, setState] = useState<TransformState>(getDefaultState());
  const [conn, setConn] = useState<ConnectionState>({
    connected: false,
    hasVideo: false,
    adapter: '—',
    siteEnabled: true,
  });
  const stateRef = useRef<TransformState>(state);
  const pending = useRef<Partial<TransformState> | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const send = useCallback(async (message: unknown): Promise<ContentResponse | null> => {
    try {
      const response = (await browser.runtime.sendMessage(message)) as ContentResponse | undefined;
      if (!response) {
        setConn((c) => ({ ...c, connected: false, error: 'No response' }));
        return null;
      }
      if (response.type === 'error') {
        setConn((c) => ({ ...c, error: response.error }));
        return response;
      }
      setState(response.state);
      setConn({
        connected: true,
        hasVideo: response.hasVideo,
        adapter: response.adapter,
        siteEnabled: response.siteEnabled,
      });
      return response;
    } catch (error) {
      setConn((c) => ({
        ...c,
        connected: false,
        error: error instanceof Error ? error.message : String(error),
      }));
      return null;
    }
  }, []);

  useEffect(() => {
    void send({ type: 'getState' });
  }, [send]);

  /** Local echo + debounced flush, so sliders feel instant. */
  const patch = useCallback(
    (partial: Partial<TransformState>) => {
      setState((prev) => ({ ...prev, ...partial }));
      pending.current = { ...(pending.current ?? {}), ...partial };
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const payload = pending.current;
        pending.current = null;
        timer.current = null;
        if (payload) void send({ type: 'setState', payload });
      }, SEND_DEBOUNCE_MS);
    },
    [send],
  );

  const action = useCallback(
    (id: ActionId) => {
      const next = runAction(stateRef.current, id);
      setState(next);
      // Send the resulting full state rather than a command name: preset
      // actions (zoom-2, rotate-180, …) are not part of the command vocabulary,
      // and this keeps the popup and page in lockstep.
      void send({ type: 'setState', payload: next });
    },
    [send],
  );

  const refresh = useCallback(() => {
    void send({ type: 'getState' });
  }, [send]);

  return { state, conn, patch, action, refresh };
}

function App() {
  const { state, conn, patch, action, refresh } = useController();
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(refresh, 1500);
    return () => window.clearInterval(id);
  }, [autoRefresh, refresh]);

  const rotationActions = ACTIONS.filter((a) => a.group === 'rotation');

  return (
    <div className="w-[340px] bg-slate-900 text-slate-100 font-sans">
      <header className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-800">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Tiltview</h1>
          <p className="text-[11px] text-slate-500">{conn.adapter} · v1.0</p>
        </div>
        <StatusPill conn={conn} />
      </header>

      {conn.error && (
        <div className="mx-4 mt-3 rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-300">
          {conn.error}
        </div>
      )}

      {!conn.hasVideo && conn.connected && (
        <div className="mx-4 mt-3 rounded-md bg-slate-800/70 px-3 py-2 text-[11px] text-slate-400">
          当前页面没找到视频。播放任意 HTML5 视频后再打开本面板。
        </div>
      )}

      <main className="px-4 py-3 space-y-4">
        <Section title="旋转">
          <div className="grid grid-cols-4 gap-1.5">
            {rotationActions
              .filter((a) => a.id.startsWith('rotate-') && a.id !== 'rotate-cw' && a.id !== 'rotate-ccw')
              .map((spec) => (
                <ActionButton
                  key={spec.id}
                  active={isActionActive(state, spec.id)}
                  title={spec.title}
                  onClick={() => action(spec.id)}
                >
                  {spec.label}
                </ActionButton>
              ))}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <ActionButton title="Rotate 90° counter-clockwise" onClick={() => action('rotate-ccw')}>
              ⟲ 90°
            </ActionButton>
            <ActionButton title="Rotate 90° clockwise" onClick={() => action('rotate-cw')}>
              ⟳ 90°
            </ActionButton>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={359}
              value={Math.round(state.rotation)}
              onChange={(e) => patch({ rotation: Number(e.target.value) })}
              className="flex-1 accent-sky-500"
              aria-label="Custom rotation"
            />
            <input
              type="number"
              min={0}
              max={359}
              value={Math.round(state.rotation)}
              onChange={(e) => patch({ rotation: Number(e.target.value) })}
              className="w-14 rounded bg-slate-800 px-1.5 py-1 text-right text-xs tabular-nums outline-none focus:ring-1 focus:ring-sky-500"
              aria-label="Rotation degrees"
            />
            <span className="text-xs text-slate-500">°</span>
          </div>
        </Section>

        <Section title="缩放">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.05}
              value={state.scale}
              onChange={(e) => patch({ scale: Number(e.target.value) })}
              className="flex-1 accent-sky-500"
              aria-label="Zoom"
            />
            <span className="w-12 text-right text-xs tabular-nums text-slate-400">
              {state.scale.toFixed(2)}x
            </span>
          </div>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {ZOOM_PRESETS.map((z) => {
              const id = `zoom-${z}` as ActionId;
              return (
                <ActionButton
                  key={z}
                  active={isActionActive(state, id)}
                  title={`Zoom to ${z}x`}
                  onClick={() => patch({ scale: z })}
                >
                  {z}x
                </ActionButton>
              );
            })}
          </div>
        </Section>

        <Section title="平移">
          <div className="flex items-center justify-between gap-3">
            <div className="grid grid-cols-3 gap-1">
              <span />
              <ArrowButton label="▲" onClick={() => patch({ translateY: state.translateY - PAN_STEP })} />
              <span />
              <ArrowButton label="◀" onClick={() => patch({ translateX: state.translateX - PAN_STEP })} />
              <ArrowButton
                label="●"
                title="Recenter"
                onClick={() => patch({ translateX: 0, translateY: 0 })}
              />
              <ArrowButton label="▶" onClick={() => patch({ translateX: state.translateX + PAN_STEP })} />
              <span />
              <ArrowButton label="▼" onClick={() => patch({ translateY: state.translateY + PAN_STEP })} />
              <span />
            </div>
            <div className="text-[11px] text-slate-500 leading-relaxed">
              <div>
                x: <span className="tabular-nums text-slate-300">{Math.round(state.translateX)}</span>
              </div>
              <div>
                y: <span className="tabular-nums text-slate-300">{Math.round(state.translateY)}</span>
              </div>
              <div className="mt-1 text-slate-600">也可在视频上直接拖拽</div>
            </div>
          </div>
        </Section>

        <Section title="镜像 / 适配">
          <div className="grid grid-cols-2 gap-1.5">
            <ActionButton
              active={state.flipH}
              title="Mirror horizontally"
              onClick={() => action('flip-h')}
            >
              ↔ 水平翻转
            </ActionButton>
            <ActionButton
              active={state.flipV}
              title="Mirror vertically"
              onClick={() => action('flip-v')}
            >
              ↕ 垂直翻转
            </ActionButton>
          </div>
          <div className="mt-1.5">
            <ActionButton
              active={state.autoFit}
              title="Scale so the rotated video fills the player"
              onClick={() => action('auto-fit')}
              wide
            >
              Auto-fit {state.autoFit ? '已开' : '已关'}
            </ActionButton>
          </div>
        </Section>

        <Section title="预设角度">
          <div className="grid grid-cols-4 gap-1.5">
            {ROTATION_PRESETS.map((deg) => (
              <ActionButton
                key={deg}
                active={state.rotation === deg}
                onClick={() => patch({ rotation: deg })}
                title={`Rotate to ${deg}°`}
              >
                {deg}°
              </ActionButton>
            ))}
          </div>
        </Section>
      </main>

      <footer className="px-4 pb-4 space-y-2">
        <button
          onClick={() => action('reset-all')}
          className="w-full rounded-md bg-rose-600/85 hover:bg-rose-600 py-2 text-xs font-medium transition"
        >
          全部重置
        </button>
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-sky-500"
            />
            实时同步
          </label>
          <kbd
            className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px]"
            title="Chrome allows 4 default shortcuts; bind the rest at chrome://extensions/shortcuts"
          >
            Alt+Shift+T
          </kbd>
        </div>
      </footer>
    </div>
  );
}

function StatusPill({ conn }: { conn: ConnectionState }) {
  const tone = !conn.connected
    ? 'bg-slate-600'
    : conn.hasVideo
      ? 'bg-emerald-400'
      : 'bg-amber-400';
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
      <span className={`h-2 w-2 rounded-full ${tone}`} />
      {!conn.connected ? '未连接' : conn.hasVideo ? '已检测到视频' : '无视频'}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ActionButton({
  children,
  active,
  onClick,
  title,
  wide,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  title?: string;
  wide?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        wide ? 'w-full' : '',
        'rounded-md py-1.5 text-xs font-medium transition',
        active
          ? 'bg-sky-500/25 text-sky-100 ring-1 ring-sky-500/60'
          : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function ArrowButton({
  label,
  onClick,
  title,
}: {
  label: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 text-xs text-slate-300 transition hover:bg-slate-700"
    >
      {label}
    </button>
  );
}

export default App;
