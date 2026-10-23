# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/).

## [Unreleased]

## [1.0.6] — 2026-10-22

### Changed

- **New brand mark.** The green "plug/gear" glyph was replaced with a video
  frame tilted 12° holding an upright portrait frame: the extension's core idea
  (a vertical video on a landscape player) in one shape. Drawn at the palette
  already used by the injection UI (`#38bdf8` on `#0a1018`–`#1b2333`), so the
  toolbar icon and the floating panel stop looking like two different products.

  - `public/icon/logo.svg` is the source of truth; the PNGs are rendered from
    the same geometry (`16/32/48/96/128`).
  - 16px/32px use a wider stroke and a 10px inner gap instead of a scaled-down
    128px drawing: the first render of the scaled version made the nested frame
    a single blob at toolbar size.
  - The popup header now shows the mark (`entrypoints/popup/TiltLogo.tsx`)
    instead of the title alone.

## [1.0.5] — 2026-10-21

### Fixed

- **Rotating the picture pushed it outside the player, so the whole frame was
  never visible.** Rotating a landscape video 90° swaps its bounding box
  (978×550 → 550×978). Measured on Bilibili, the transformed picture reported
  `bottom: 932` against a player bottom of `718` — 214px of the frame sat outside
  the box on every side.

  Three defects combined:

  1. **Wrong measurement basis.** Auto-fit computed a cover factor from the
     *intrinsic* pixel size (`videoWidth/videoHeight`, 640×360) while the element
     was already scaled to 978×550 by `object-fit: contain`. That returned 1.53 at
     0° — a 1.5× zoom on an untouched video.
  2. **Self-referential measurement.** `readMediaSize()` used
     `getBoundingClientRect()`, which reports the *transformed* box. Once a 90°
     rotation was applied it measured the already-rotated box, fit it again, and
     the picture grew without bound. Now uses `offsetWidth/offsetHeight`, which
     ignore `transform`.
  3. **The wrong fit direction.** A cover fit (`max`) upscaled the rotated box to
     978×1739 — worse than the bug. Auto-fit is now a **contain** fit (`min`),
     which brings the rotated picture back to 309×550: fully inside the player,
     letterboxed on the sides exactly like an unrotated video.

  Auto-fit is now on by default, and `reset` keeps it on, so a rotation is
  corrected without the user having to enable anything. Turning auto-fit off
  still gives the raw, uncorrected rotation.

- **The floating panel was covered by Bilibili's danmaku input bar.** The panel
  was anchored to `.bpx-player-container` with `bottom: 64px`, but that container
  is taller than the picture: it is 596px while `.bpx-player-video-area` is only
  550px, and the extra 46px is the danmaku submit bar. Measured overlap before
  the fix: the panel reached into that bar.

  Adapters now declare an optional `safeArea` (the picture region). The panel is
  positioned against it with a clamped bottom-right placement, re-clamped after
  opening (the body is `display:none` until then, so its height is only
  measurable afterwards). YouTube declares its picture area too, which keeps the
  panel clear of `.ytp-chrome-bottom`; YouTube does not have the danmaku problem —
  its chrome lives inside the player rather than below it.

- **Overflow overrides did not follow auto-fit toggles.** Switching auto-fit from
  off to on left ancestors at `overflow: hidden` from the previous clipping pass,
  so a fitted picture could still be cut. The override set now migrates in both
  directions and restores original values exactly.

- **A zero-height safe area silently disabled panel positioning.** YouTube's
  `.html5-video-container` measures 0px tall (the `<video>` is absolutely
  positioned inside it), which made the clamp a no-op. It now falls back to the
  parent box.

### Changed

- `safeArea` added to `UiAnchor`; Bilibili and YouTube adapters populate it.

### Verified on real sites

Bilibili watch page, shipped bundle injected through a CDP isolated world:

| check | before | after |
|---|---|---|
| picture after 90° rotation | 550×978, bottom 932 (player 718) | 310×550, bottom 718 |
| overflow beyond the player | bottom 214px, top 0 | top 0, bottom 0 |
| panel vs danmaku bar | overlapping | panel bottom 702 vs bar top 718 — 0px |
| panel vs picture area | — | inside |

## [1.0.4] — 2026-10-21

### Fixed

- **Nothing in the floating panel did anything — rotate, zoom, mirror, reset were
  all dead. Only the extension's own programmatic control worked.** The panel
  registers itself as a drag surface, and its `pointerdown` handler called
  `setPointerCapture()` on the panel element for *any* press inside it, including
  presses on the action buttons. Pointer capture retargets every subsequent
  pointer event to the capturing element, so press and release landed on
  different elements:

  ```
  pointerdown -> button.act   (composedPath depth 11)
  pointerup   -> .panel       (depth 8)
  click       -> .panel       (depth 8)
  ```

  With no common target the browser cannot synthesise a `click` on the button and
  dispatches it to the nearest common ancestor instead, so not one action button
  ever fired. The capture now only happens for presses that start on the panel
  itself, never for presses aimed at a control
  (`button, input, select, textarea, a, [role="button"]`).

  Isolated by a single-variable experiment on the built bundle rather than by
  editing source: with `setPointerCapture()` neutered, a real click produced one
  button click and the video transform changed; unmodified it produced zero.

  This affected every site, not just Bilibili — a local test page reproduced it
  identically — and it was present since the v1.0.0 rewrite.

### Added

- The end-to-end suite now force-opens the panel's closed shadow root, measures
  the real rect of an action button, clicks it with a real mouse event and
  asserts both that the click arrives and that the `<video>` transform changes.
  Verified to fail when the capture guard is removed (`39 passed, 2 failed`).

## [1.0.3] — 2026-10-21

### Fixed

- **The in-player button was misaligned on Bilibili (and would be on any player
  whose controls are not 40×40).** The v1.0.2 fix mirrored YouTube's
  `.ytp-button` with a hard-coded 40×40 box. Bilibili's
  `.bpx-player-ctrl-btn` is 28–50 wide by **22 high** inside a **35px** bar, and
  that bar does not centre its children (`align-items: normal`, so a 22px
  control sits at the top with 13px of slack below). Measured against a real
  `.bpx-player-ctrl-btn`, the fixed box was **6.5px low and 18px too tall**.

  The button no longer hard-codes geometry: on mount it measures a visible
  sibling control in the actual bar and adopts its width, height, `margin-right`
  gutter, font size, colour and alignment (`align-self` / `vertical-align`),
  falling back to YouTube's metrics when nothing is measureable. Because it
  re-measures on every reconcile, it also follows the bar through quality
  switches, wide-screen mode and fullscreen transitions.

  The button is also re-parented if the player rebuilds its bar, instead of
  being stranded in a detached subtree.

### Verified on real sites

Both players, real pages, built bundle injected through a CDP isolated world:

| site | host box | sibling box | top Δ | centre Δ | height Δ | click opens panel |
|---|---|---|---|---|---|---|
| YouTube | 48×40 | 144×40 | 0 | 0 | 0 | yes |
| Bilibili | 28×22 | 28×22 | 0 | 0 | 0 | yes |

### Added

- `tests/control-bar-metrics.test.ts` — stubs per-site layout boxes and asserts
  the host adopts the dominant sibling's geometry, gutter, colour and alignment;
  covers Bilibili (22px, top-pinned, 10px gutter), YouTube (40×40), the
  hidden-sibling case (players keep `display:none` buttons) and the fallback.
- The end-to-end suite now drives a Bilibili control-bar scenario on the
  `bilibili.com` origin and asserts mount, box parity, baseline parity,
  gutter/colour reuse and click-to-open.

## [1.0.2] — 2026-10-21

### Fixed

- **The in-player control-bar button did nothing on YouTube, and no panel could
  be opened at all.** Both UI surfaces injected their icon with
  `element.innerHTML = '<svg…>'`. YouTube enforces a Trusted Types CSP policy,
  so that assignment threw during construction:
  `TypeError: This document requires 'TrustedHTML' assignment`. The throw
  aborted `TiltviewController.start()` on its **initialisation path**, before
  either the floating panel or the control-bar button was attached — so the
  button was present in the DOM but dead, and the panel never mounted.
  Icons are now built with `createElementNS` (`lib/icons.ts`), which Trusted
  Types does not police.
- **The control-bar button was not on the same horizontal line as the other
  icons.** The host used `inline-flex` + `height:100%` + `max-height:40px`.
  In an `inline-block` control bar that falls back to `vertical-align:
  baseline`; in a flex bar it stretched to the bar height and was then capped.
  It is now a fixed 40×40 box mirroring YouTube's own `.ytp-button`, with
  explicit `vertical-align: top`, and measures identical in both layouts.
- **Temporal-dead-zone crash in `createFloatingPanel`.** `sliderRef` and
  `outputRef` were declared with `let` *after* `buildPanel()` ran and assigned
  them. Bundler hoisting hid it in production, but as plain ESM it throws
  `Cannot access 'sliderRef' before initialization`. Declarations moved above
  the call.

### Added

- `tests/ui-trusted-types.test.ts` — installs a Trusted-Types-style policy on
  `Element.prototype.innerHTML` and asserts both UI surfaces construct cleanly.
  Verified to fail when the implementation regresses to `innerHTML`.
- The end-to-end fixture now models YouTube's control bar, and a dedicated
  scenario runs it on the `youtube.com` origin (fulfilled locally via
  `page.route`, so no network or DNS dependency) to assert the button mounts,
  matches the 40×40 box, shares the icon baseline, and opens the panel on click.

## [1.0.1] — 2026-10-20

### Fixed

- **The extension could not be loaded at all.** Chrome rejected the manifest
  with `Too many shortcuts specified for 'commands': The maximum is 4.` and the
  extension never appeared in `chrome://extensions`. Seven commands declared a
  `suggested_key`; Chrome allows four. v0.1.0 had the same latent bug with six.
  - Default keys are now limited to the four actions that have no other
    one-gesture path: `toggle-panel`, `rotate-cw`, `rotate-ccw`,
    `reset-transform`.
  - `zoom-in`, `zoom-out` and `toggle-autofit` stay in the manifest without a
    default and remain bindable at `chrome://extensions/shortcuts`; zoom keeps
    `Ctrl`/`Alt` + wheel and auto-fit keeps its panel button.

### Changed

- The `commands` table moved to `lib/shortcuts.ts` so the manifest is generated
  from one typed source instead of hand-written JSON-ish config.
- New regression guards: unit tests assert the generated command table never
  exceeds the limit, uses unique Alt-based keys, and stays in sync with the
  runtime command vocabulary; the end-to-end suite now also inspects the
  **built** `manifest.json` before driving the bundle.

## [1.0.0] — 2026-10-20

Full rewrite of the transform engine, the UI, and the delivery layer.

### Fixed

- **Pan no longer rotates with the video.** `translate()` was emitted before
  `rotate()`, so at 90° dragging right moved the picture *up*. Translation is now
  the outermost operation of a single `matrix3d`, i.e. it lives in screen space.
- **Auto-fit no longer shrinks 16:9 video.** The old formula was
  `containerHeight / containerWidth` and only applied at 90°/270°. It is now a
  proper "cover" fit computed from the rotated bounding box of the real media.
- **Keyboard shortcuts work.** They were sent to a content script that did not
  exist on most tabs, and `activeTab` is not granted for commands. The background
  worker now retries once after injecting the script, and host permissions are
  declared.
- **The popup no longer reports "Could not establish connection".** Messages are
  routed through the background worker, which can recover a missing content script.
- **Host page overflow is restored.** The old applier rebuilt its saved-overflow
  map on every frame, permanently leaving ancestors at `overflow: visible`. One
  snapshot is kept and replayed on reset/release.
- **No more per-frame page-wide shadow-DOM scans.** Deep queries used
  `querySelectorAll('*')` on every mutation; shadow hosts are now discovered with
  a `TreeWalker` and cached for 500 ms, and DOM churn is coalesced into one
  180 ms debounce.
- **Fullscreen works.** The controller detects the top-layer element, re-mounts
  the UI inside it, and uses the viewport as the auto-fit stage.
- **`Alt+Plus` → `Alt+Equal`**, the only binding Chrome actually fires.
- **The transform targets the `<video>`, not the player wrapper,** so sites that
  rewrite their own wrapper transform during transitions no longer fight the
  extension.
- **Original inline transforms are preserved and restored verbatim.**

### Added

- Gesture layer: drag to pan (capture-phase, 4 px threshold, never steals clicks
  from player controls), `Ctrl`/`Alt` + wheel to zoom anchored at the cursor,
  double-click to reset.
- Draggable floating panel in a closed shadow root, with remembered position.
- Correct fullscreen-aware UI anchoring per adapter.
- Per-site persistence of the view (`origin + first path segment`), debounced.
- Single action table (`lib/actions.ts`) shared by the popup, the panel, and the
  keyboard, replacing three drifting implementations.
- `lib/geometry.ts`: DOM-free matrix math, unit tested.
- 54 unit tests and an 18-assertion end-to-end suite that drives the built bundle
  in a real Chrome.
- CI now runs typecheck → unit tests → build → end-to-end test.
- A typed `window.postMessage` bridge so pages can drive the extension without
  reaching into extension APIs.

### Changed

- Manifest now covers `<all_urls>`; the README's "works on any site" claim is
  finally accurate.
- Popup rebuilt as a full console: live angle/zoom sliders, presets, pan pad,
  mirror toggles, auto-fit, reset.
- Control-bar button inherits each site's own control sizing instead of a
  hard-coded 36 px.
- `lib/inline-panel.ts` removed, replaced by `lib/floating-panel.ts` and
  `lib/control-bar-button.ts`.
- Version bumped to 1.0.0.

### Known limitations

- Firefox support is built (`pnpm build:firefox`) but only Chrome is verified.
- Auto-fit uses the video's intrinsic size; if a site's own `object-fit` differs
  from `contain`, the fit can be off by the site's own letterbox.
- The content script is not injected into iframes (`allFrames: false`); videos
  that only exist inside a cross-origin iframe are not detected.

## [0.1.0] — 2026-04-08

- Initial release: rotate, zoom, mirror, auto-fit, inline controls for YouTube,
  Twitch, and Bilibili.
