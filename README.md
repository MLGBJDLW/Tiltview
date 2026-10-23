[中文](README_zh.md)

# Tiltview

> Rotate, zoom, pan, and mirror any HTML5 video, on any website.

A Chrome/Edge (MV3) browser extension that gives you full control over HTML5
video geometry — for vertical videos on a landscape player, mirrored dance
tutorials, zoomed-in sports analysis, or a lecture recorded sideways.

## Features

- **Rotate** — 90° steps, any preset 0/90/180/270, or any angle from 0° to 359°
- **Zoom** — 0.5x to 8x, presets, and cursor-anchored wheel zoom
- **Pan** — drag the video directly, with arrow keys in the popup
- **Mirror** — independent horizontal and vertical flips
- **Auto-fit** — scales the rotated video so it *covers* the player
  (correctly, using the real video aspect ratio)
- **Gestures** — drag to pan, Ctrl/Alt + wheel to zoom at the cursor,
  double-click to reset
- **Floating panel** — draggable, remembers its position, styled in an isolated
  shadow root so no site CSS can break it
- **In-player button** — on YouTube, Twitch and Bilibili the panel also opens
  from a button injected next to the player's own controls; other sites use the
  floating tab (or `Alt+Shift+T`)
- **Per-site memory** — your view survives reloads, episode changes, and ad breaks
- **Fullscreen aware** — the panel and transform follow the video into fullscreen
- **Any site** — works with YouTube, Twitch, Bilibili, and any page with an
  HTML5 `<video>` element (including shadow DOM)

## Keyboard shortcuts

Chrome allows at most **four** commands with a default shortcut, so only the
actions without another one-gesture path get one:

| Shortcut | Action |
|---|---|
| `Alt+Shift+T` | Open / close the floating panel |
| `Alt+R` | Rotate 90° clockwise |
| `Alt+Shift+R` | Rotate 90° counter-clockwise |
| `Alt+0` | Reset all transforms |

Zoom already has `Ctrl`/`Alt` + wheel at the cursor, and auto-fit has a button in
the panel, so those commands ship **without** a default binding. All seven
commands can be bound at `chrome://extensions/shortcuts`.

## Install

### From source

```bash
git clone https://github.com/MLGBJDLW/Tiltview.git
cd Tiltview
pnpm install
pnpm build
```

Then open `chrome://extensions` → enable **Developer mode** → **Load unpacked**
→ select `.output/chrome-mv3`.

### Development

```bash
pnpm dev            # dev mode with hot reload
pnpm build          # production build (Chrome MV3)
pnpm build:firefox  # Firefox build
pnpm compile        # TypeScript check
pnpm icons          # regenerate public/icon from scripts/logo-art.mjs
pnpm test           # unit tests (vitest)
pnpm test:coverage  # unit tests with coverage
pnpm test:e2e       # build + drive the real bundle in a real Chrome
pnpm check          # compile + unit + e2e
```

## How it works

The transform is a single similarity matrix (`T · R · S`) emitted as `matrix3d`,
so:

- **pan is in screen space** — dragging right always moves the picture right,
  whatever the rotation (v0.1.0 applied `translate()` before `rotate()`, which
  made the drag direction rotate with the video);
- **mirroring and rotation compose without drift** — no stacked CSS functions;
- **auto-fit is computed from geometry** — the rotated bounding box of the
  *actual* video, not a hard-coded ratio.

State is persisted per `origin + first path segment`, so
`youtube.com/watch?v=a` and `.../watch?v=b` share a view while `.../shorts` does not.

The content script is injected on `<all_urls>` but stays idle until a `<video>`
exists; DOM churn is coalesced through a single 180 ms debounce instead of
running a deep shadow-DOM query on every mutation.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Remember rotation/zoom/pan per site |
| `scripting` | Re-inject the content script on tabs open at install/update time |
| `activeTab` | Read the current tab when you click the toolbar icon |
| `<all_urls>` (host) | Detect videos on any site — this is what "works anywhere" requires |

The content script never reads page content, network traffic, or form data; it
only locates `<video>` elements and applies a CSS transform.

## Testing

- `tests/*.test.ts` — 54 unit tests covering the matrix math, auto-fit geometry,
  action reducers, storage keys, message validation, and the DOM applier
  (including regressions for the v0.1.0 overflow leak and rotated pan).
- `tests/e2e/smoke.mjs` — 18 end-to-end assertions against the **built bundle**
  running in a real Chrome: panel mounting, shadow-root isolation, rotation,
  screen-space pan at 90°, overflow restoration, persistence across reload,
  drag-to-pan, and double-click reset.

## License

MIT
