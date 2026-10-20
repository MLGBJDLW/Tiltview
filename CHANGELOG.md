# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/).

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
