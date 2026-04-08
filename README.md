[中文说明](README_zh.md)

# Tiltview

> Rotate, zoom, pan, and mirror videos on YouTube, Bilibili, Twitch, and more.

A Chrome/Edge MV3 browser extension that gives you full control over HTML5 video transforms.

## Features

- 🔄 **Rotate** videos: 0°, 90°, 180°, 270° or custom angle
- 🔍 **Zoom**: 0.5x – 5x with preset buttons (1x, 1.5x, 2x, 3x)
- ↔️ **Pan**: drag video position in any direction
- 🪞 **Mirror**: horizontal and vertical flip
- 📐 **Auto-fit**: automatically scale video to fit container after rotation
- 🎮 **Inline controls**: control panel integrated directly into the player's control bar
- 🌐 **Multi-site support**: YouTube, Bilibili, Twitch + generic fallback for any HTML5 video

## Supported Sites

| Site | Status | Notes |
|------|--------|-------|
| YouTube | ✅ | Shadow DOM compatible |
| Bilibili | ✅ | New/old player support |
| Twitch | ✅ | Live + VOD |
| Other sites | ✅ | Generic adapter for any HTML5 video |

## Installation

### From Source

1. Clone this repository
2. `pnpm install`
3. `pnpm build`
4. Open Chrome → `chrome://extensions` → Enable "Developer mode"
5. Click "Load unpacked" → Select `.output/chrome-mv3` folder

### Development

```bash
pnpm dev           # Start dev mode with hot reload
pnpm build         # Build for production
pnpm build:firefox # Build for Firefox
pnpm compile       # TypeScript check
```

## Usage

1. Navigate to a supported video site
2. Click the Tiltview icon in the toolbar, OR use the inline control button in the video player's control bar
3. Use the controls to rotate, zoom, pan, or mirror the video
4. Click "Reset" to restore original state

## Tech Stack

- TypeScript
- WXT (Web Extension Tools)
- React
- Tailwind CSS v4
- Chrome Extension Manifest V3

## Permissions

- `activeTab` — Access current tab only when you interact with the extension

## License

MIT
