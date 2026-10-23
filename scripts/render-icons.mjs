/**
 * Regenerates the brand assets Chrome consumes.
 *
 *   pnpm icons          → public/icon/logo.svg + 16/32/48/96/128 PNGs
 *   pnpm icons --sheet  → also writes review sheets to .nexa/tmp/icon/out
 *
 * Runs in a real browser because the PNGs come from a canvas: the drawing in
 * `logo-art.mjs` is shared with the SVG, so both outputs stay identical.
 * Chrome is used when present (it is the encoder whose output ships), with the
 * bundled Playwright build as a fallback.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ICON_DIR = path.join(ROOT, 'public/icon');
const SHEET_DIR = path.join(ROOT, '.nexa/tmp/icon/out');
const ART = path.join(ROOT, 'scripts/logo-art.mjs');

// Chrome's icon spec: 16 toolbar, 32 Windows taskbar, 48 extensions page,
// 128 store listing. 96 is kept for high-DPI toolbars.
const SIZES = [16, 32, 48, 96, 128];
const SHEET_SIZES = [...SIZES, 512];

const CHROME_CANDIDATES = [
  process.env.TILTVIEW_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const firstExisting = (candidates) => candidates.find((p) => p && fs.existsSync(p));

const chrome = firstExisting(CHROME_CANDIDATES);
const browser = await chromium.launch(chrome ? { executablePath: chrome } : {});
const page = await browser.newPage();
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
await page.addScriptTag({ path: ART });

const pngAt = (size) =>
  page.evaluate((s) => window.logoArt.markCanvas(s).toDataURL('image/png'), size);

fs.mkdirSync(ICON_DIR, { recursive: true });
fs.writeFileSync(path.join(ICON_DIR, 'logo.svg'), await page.evaluate(() => window.logoArt.fullSvg()));
for (const size of SIZES) {
  const dataUrl = await pngAt(size);
  fs.writeFileSync(path.join(ICON_DIR, `${size}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
console.log(`icons → ${path.relative(ROOT, ICON_DIR)} (${SIZES.join(', ')} + logo.svg)`);

if (!process.argv.includes('--sheet')) {
  await browser.close();
  process.exit(0);
}

// --- review sheet -----------------------------------------------------------
// Real 1x sizes on Chrome's light and dark toolbars, a zoomed detail row, and
// the vector rendering next to the raster one so they can be compared.
fs.mkdirSync(SHEET_DIR, { recursive: true });
const data = {};
for (const size of SHEET_SIZES) data[size] = await pngAt(size);

const sheet = `
<html><body style="margin:0;font:12px/1.4 system-ui;background:#e9edf2;padding:24px">
  ${['#f1f3f4', '#dee1e6'].map((bg) => `<div class="strip" style="background:${bg}">${row(bg)}</div>`).join('')}
  ${['#202124', '#35363a'].map((bg) => `<div class="strip" style="background:${bg};color:#9aa0a6">${row(bg)}</div>`).join('')}
  <h3>Detail (512, 128, and 16 nearest-neighbour)</h3>
  <div style="display:flex;gap:24px;align-items:flex-end;background:#fff;padding:16px;border-radius:8px">
    <img src="${data[512]}" width="256" height="256">
    <img src="${data[128]}" width="128" height="128">
    <img src="${data[16]}" width="128" height="128" style="image-rendering:pixelated">
  </div>
  <h3>Vector 16/32 next to the raster</h3>
  <div style="display:flex;gap:16px;background:#f1f3f4;padding:8px">
    <div class="cell">${await page.evaluate(() => window.logoArt.svgForSize(16))}<span>svg16</span></div>
    <div class="cell">${await page.evaluate(() => window.logoArt.svgForSize(32))}<span>svg32</span></div>
    <div class="cell"><img src="${data[16]}" width="16" height="16"><span>png16</span></div>
    <div class="cell"><img src="${data[32]}" width="32" height="32"><span>png32</span></div>
  </div>
  <style>
    .strip{display:flex;gap:40px;align-items:center;padding:18px 24px;border-radius:8px;margin-bottom:8px}
    .cell{display:flex;flex-direction:column;align-items:center;gap:6px;color:inherit}
    .cell span{opacity:.6;font-size:11px}
  </style>
</body></html>`;

function row() {
  return SIZES.map((s) => `<div class="cell"><img src="${data[s]}" width="${s}" height="${s}" alt=""><span>${s}</span></div>`).join('');
}

fs.writeFileSync(path.join(SHEET_DIR, 'contact.html'), sheet);
await page.setContent(sheet, { waitUntil: 'load' });
await page.setViewportSize({ width: 640, height: 900 });
await page.screenshot({ path: path.join(SHEET_DIR, 'contact.png'), fullPage: true });

// The mark at the size Chrome actually paints it, plus the hover tile.
const icon16 = fs.readFileSync(path.join(ICON_DIR, '16.png')).toString('base64');
const icon32 = fs.readFileSync(path.join(ICON_DIR, '32.png')).toString('base64');
await page.setContent(`<html><body style="margin:0;font:12px system-ui">
  ${['#202124', '#f1f3f4'].flatMap((bg) => [
    `<div style="background:${bg};height:40px;display:flex;align-items:center;gap:4px;padding:0 8px">
      <img src="data:image/png;base64,${icon16}" width="16" height="16" style="margin:0 4px">
      <img src="data:image/png;base64,${icon16}" width="16" height="16" style="margin:0 4px;outline:2px solid #5c9bff;border-radius:4px">
    </div>`,
  ]).join('')}
  <div style="padding:16px"><img src="data:image/png;base64,${icon32}" width="32" height="32"></div>
</body></html>`);
await page.screenshot({ path: path.join(SHEET_DIR, 'toolbar.png'), clip: { x: 0, y: 0, width: 320, height: 140 } });

await browser.close();
console.log(`sheet → ${path.relative(ROOT, SHEET_DIR)}`);
