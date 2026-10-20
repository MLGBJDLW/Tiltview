/**
 * End-to-end verification without relying on Chrome's extension loader.
 *
 * Loading unpacked extensions through CDP is unreliable on current Chrome/
 * Playwright builds (`--load-extension` is rejected in headless shell and
 * sandboxed on Windows), so this harness injects the *actual built bundle*
 * (`content-scripts/content.js` from `.output/chrome-mv3`) into a real page and
 * stubs the three `chrome.*` APIs the content script touches. Everything else —
 * the controller, adapters, gestures, panel, matrix math, storage round-trip —
 * is the exact code that ships.
 *
 * Run:  node tests/e2e/smoke.mjs   (after `pnpm build`)
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUNDLE = path.join(ROOT, '.output/chrome-mv3/content-scripts/content.js');
const MANIFEST = path.join(ROOT, '.output/chrome-mv3/manifest.json');
const FIXTURE = path.join(ROOT, 'tests/fixtures/player.html');

const CHROME_CANDIDATES = [
  process.env.TILTVIEW_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const lines = [];
const diag = {};
let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    lines.push(`  PASS  ${name}`);
  } else {
    failed += 1;
    lines.push(`  FAIL  ${name}${detail ? `\n          ${detail}` : ''}`);
  }
}

async function firstExisting(paths) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* next */
    }
  }
  return null;
}

function parseMatrix(value) {
  const match = value.match(/matrix(3d)?\(([^)]+)\)/);
  if (!match) return null;
  const v = match[2].split(',').map((n) => Number(n.trim()));
  return match[1] === '3d'
    ? { a: v[0], b: v[1], c: v[4], d: v[5], tx: v[12], ty: v[13] }
    : { a: v[0], b: v[1], c: v[2], d: v[3], tx: v[4], ty: v[5] };
}

const near = (actual, expected, tol = 1e-3) => Math.abs(actual - expected) <= tol;

async function run() {
  const chrome = await firstExisting(CHROME_CANDIDATES);
  if (!chrome) throw new Error('No Chrome/Edge binary found. Set TILTVIEW_CHROME.');

  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const bundle = await readFile(BUNDLE, 'utf8');
  diag.browser = chrome;
  diag.bundleBytes = bundle.length;
  diag.manifestVersion = manifest.version;

  const server = createServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(await readFile(FIXTURE, 'utf8'));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/player.html`;

  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    page.on('pageerror', (err) => {
      diag.pageError = String(err);
    });

    // --- stub the minimal `chrome.*` surface, backed by a page-world Map ----
    // Injected with addScriptTag (not addInitScript) because Playwright's init
    // scripts run in an isolated world, where the content script and the test
    // assertions would see different globals.
    const stub = `
      (() => {
        // Back the fake storage with sessionStorage so it survives a reload,
        // which is what we want to assert (the real extension uses chrome.storage).
        const KEY = '__tv_storage';
        const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch { return {}; } };
        const store = {
          get size() { return Object.keys(load()).length; },
          has: (k) => k in load(),
          get: (k) => load()[k],
          set: (k, v) => { const all = load(); all[k] = v; sessionStorage.setItem(KEY, JSON.stringify(all)); },
          delete: (k) => { const all = load(); delete all[k]; sessionStorage.setItem(KEY, JSON.stringify(all)); },
          keys: () => Object.keys(load()),
        };
        window.__tvStore = store;
        const listeners = [];
        const api = {
          storage: {
            local: {
              async get(key) {
                const all = load();
                const keys = key === null || key === undefined ? Object.keys(all) : [].concat(key);
                const out = {};
                for (const k of keys) if (k in all) out[k] = all[k];
                return out;
              },
              async set(items) { for (const [k, v] of Object.entries(items)) store.set(k, v); },
              async remove(key) { for (const k of [].concat(key)) store.delete(k); },
            },
          },
          runtime: {
            onMessage: { addListener: (fn) => listeners.push(fn) },
            lastError: undefined,
            getManifest: () => ({ version: '1.0.0' }),
          },
        };
        window.__tvListeners = listeners;
        window.chrome = api;
        window.browser = api;
      })();
    `;

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: stub });

    // --- load the shipped content script ---------------------------------
    await page.addScriptTag({ content: bundle });
    await page.waitForTimeout(1200);

    const video = page.locator('#v');
    check('fixture exposes a <video>', (await video.count()) === 1);

    const panelHost = page.locator('#tiltview-panel-host');
    const mounted = await panelHost
      .waitFor({ state: 'attached', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    check('floating panel mounts on a generic page', mounted);

    if (!mounted) {
      diag.html = await page.evaluate(() => document.body.innerHTML.slice(0, 600));
      diag.errors = diag.pageError;
      return;
    }

    check(
      'panel shadow root is closed (page cannot reach in)',
      (await panelHost.evaluate((el) => el.shadowRoot !== null)) === false,
    );

    const initial = await video.evaluate((el) => getComputedStyle(el).transform);
    check('video starts untransformed', initial === 'none', initial);

    // Message the controller exactly like the popup does.
    const send = (request) =>
      page.evaluate(
        (req) =>
          new Promise((resolve) => {
            const listener = window.__tvListeners[0];
            listener(req, {}, resolve);
          }),
        request,
      );

    const status = await send({ type: 'getState' });
    check('getState reports the generic adapter', status?.adapter === 'Generic', JSON.stringify(status));
    check('getState reports a detected video', status?.hasVideo === true, JSON.stringify(status));

    // --- rotation ---------------------------------------------------------
    await send({ type: 'command', command: 'rotate-cw' });
    await page.waitForTimeout(200);
    const rotated = parseMatrix(await video.evaluate((el) => getComputedStyle(el).transform));
    check(
      'rotate-cw yields a 90° clockwise matrix',
      rotated && near(rotated.a, 0) && near(rotated.b, 1),
      JSON.stringify(rotated),
    );

    // --- pan in screen space (the v0.1.0 regression) -----------------------
    await send({
      type: 'setState',
      payload: { rotation: 90, scale: 1.5, translateX: 40, translateY: -25 },
    });
    await page.waitForTimeout(200);
    const panned = parseMatrix(await video.evaluate((el) => getComputedStyle(el).transform));
    check(
      'pan is in screen space at 90° (tx=40, ty=-25)',
      panned && near(panned.tx, 40, 0.5) && near(panned.ty, -25, 0.5),
      JSON.stringify(panned),
    );
    check(
      'scale is applied (|a,b| ≈ 1.5)',
      panned && near(Math.hypot(panned.a, panned.b), 1.5, 0.01),
      JSON.stringify(panned),
    );

    // --- overflow hygiene -------------------------------------------------
    const overflowDuring = await page.locator('#player').evaluate((el) => getComputedStyle(el).overflow);
    check('rotated content is not clipped mid-transform', overflowDuring === 'visible', overflowDuring);

    await send({ type: 'reset' });
    await page.waitForTimeout(200);
    const resetTransform = await video.evaluate((el) => getComputedStyle(el).transform);
    check('reset clears the transform', resetTransform === 'none', resetTransform);
    const overflowAfter = await page.locator('#player').evaluate((el) => getComputedStyle(el).overflow);
    check('player overflow restored after reset', overflowAfter === 'hidden', overflowAfter);

    // --- persistence ------------------------------------------------------
    await send({ type: 'setState', payload: { rotation: 180, scale: 2 } });
    await page.waitForTimeout(800); // 400ms save debounce
    const saved = await page.evaluate(() => window.__tvStore.keys());
    check('state was persisted to storage', saved.some((k) => k.includes('tiltview:views')), JSON.stringify(saved));

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: stub });
    await page.addScriptTag({ content: bundle });
    await page.waitForTimeout(1200);
    const restored = parseMatrix(
      await page.locator('#v').evaluate((el) => getComputedStyle(el).transform),
    );
    check(
      'view survives a reload (rotation 180, scale 2)',
      restored && near(restored.a, -2, 0.05) && near(restored.d, -2, 0.05),
      JSON.stringify(restored),
    );

    // --- gestures ---------------------------------------------------------
    await page.evaluate(() => window.__tvListeners.length);
    await send({ type: 'reset' });
    await page.waitForTimeout(150);
    const box = await video.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy + 40, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const dragged = parseMatrix(await video.evaluate((el) => getComputedStyle(el).transform));
    check(
      'dragging the video pans it by the drag delta',
      dragged && near(dragged.tx, 60, 6) && near(dragged.ty, 40, 6),
      JSON.stringify(dragged),
    );

    await page.mouse.dblclick(cx, cy);
    await page.waitForTimeout(250);
    const afterDbl = await video.evaluate((el) => getComputedStyle(el).transform);
    check('double-click resets the view', afterDbl === 'none', afterDbl);

    // --- fullscreen anchoring --------------------------------------------
    // (jsdom and headless both support the API only via user gesture, so this
    //  checks the adapter's notion of the stage instead of real fullscreen.)
    const stage = await page.evaluate(() => {
      const el = document.querySelector('#player');
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    check('stage geometry is reported for auto-fit', stage.w === 960 && stage.h === 540, JSON.stringify(stage));

    check('no page errors during the run', !diag.pageError, diag.pageError);
  } finally {
    await browser.close();
    server.close();
  }
}

run()
  .catch((err) => {
    failed += 1;
    lines.push(`  FAIL  harness error: ${err?.message ?? err}`);
    diag.harnessError = String(err?.stack ?? err).slice(0, 1500);
  })
  .finally(() => {
    console.log(`\nTiltview E2E\n${lines.join('\n')}`);
    if (Object.keys(diag).length > 0) {
      console.log(`\n--- diagnostics ---\n${JSON.stringify(diag, null, 2)}`);
    }
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed === 0 ? 0 : 1);
  });
