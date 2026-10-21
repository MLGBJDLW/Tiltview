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
/** Origin the control-bar scenario needs; fulfilled locally via page.route. */
const YT_FIXTURE_URL = 'https://www.youtube.com/player.html';
const BILI_FIXTURE_URL = 'https://www.bilibili.com/video/BV1GJ411x7h7';
/**
 * Bilibili-shaped player whose container is taller than its picture area:
 * the extra 46px at the bottom is the danmaku submit bar. The floating panel
 * must be positioned against the picture area, never over that bar.
 */
const SAFE_AREA_FIXTURE = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#000;color:#fff}
  .bpx-player-container{position:relative;width:978px;height:596px;background:#000}
  .bpx-player-video-area{position:relative;width:978px;height:550px;background:#111;overflow:hidden}
  .bpx-player-video-wrap{width:978px;height:550px}
  video{width:100%;height:100%;object-fit:contain;display:block}
  .bpx-player-control-wrap{position:absolute;left:0;right:0;bottom:46px;height:55px}
  .bpx-player-control-bottom{display:flex;height:35px;padding:0 12px}
  .bpx-player-control-bottom-right{display:flex;height:35px}
  .bpx-player-sending-area{position:absolute;left:0;right:0;bottom:0;height:46px;background:#0a0a0a}
  .bpx-player-ctrl-btn{display:block;height:22px;line-height:22px;margin:0 10px 0 0;font-size:12px}
</style></head><body>
<div class="bpx-player-container" id="bilibili-player">
  <div class="bpx-player-video-area">
    <div class="bpx-player-video-wrap"><video id="v" playsinline muted loop></video></div>
  </div>
  <div class="bpx-player-control-wrap">
    <div class="bpx-player-control-bottom">
      <div class="bpx-player-control-bottom-left"></div>
      <div class="bpx-player-control-bottom-right">
        <div class="bpx-player-ctrl-btn" style="width:28px">1080P</div>
        <div class="bpx-player-ctrl-btn" style="width:36px">Fullscreen</div>
      </div>
    </div>
  </div>
  <div class="bpx-player-sending-area" id="sending"></div>
</div>
</body></html>`;

/** Force-open shadow roots so the harness can measure the panel's internals. */
const openShadowHook = `
  (() => {
    const orig = Element.prototype.attachShadow;
    window.__tvShadowRoots = [];
    Element.prototype.attachShadow = function (init) {
      const root = orig.call(this, { ...init, mode: 'open' });
      window.__tvShadowRoots.push({ host: this, root });
      return root;
    };
  })();
`;


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

  // --- shipped manifest is loadable by Chrome -----------------------------
  // Regression guard: v1.0.0 declared 7 commands with suggested_key and Chrome
  // refused to load the extension at all ("The maximum is 4").
  const commands = manifest.commands ?? {};
  const keyed = Object.entries(commands).filter(
    ([, value]) => value.suggested_key !== undefined,
  );
  diag.commands = Object.keys(commands);
  diag.keyedCommands = keyed.map(([id, value]) => `${id}=${value.suggested_key?.default}`);

  check(
    'manifest declares commands',
    Object.keys(commands).length > 0,
    JSON.stringify(commands),
  );
  check(
    `at most 4 commands carry a suggested_key (found ${keyed.length})`,
    keyed.length <= 4,
    JSON.stringify(diag.keyedCommands),
  );
  check(
    'all commands have a non-empty suggested_key.default when present',
    keyed.every(([, value]) => typeof value.suggested_key?.default === 'string' && value.suggested_key.default.length > 0),
    JSON.stringify(diag.keyedCommands),
  );
  check(
    'suggested_key values are unique',
    new Set(keyed.map(([, value]) => String(value.suggested_key?.default ?? '').toLowerCase())).size === keyed.length,
    JSON.stringify(diag.keyedCommands),
  );
  check(
    'commands without a default key are still declared (user-assignable)',
    Object.keys(commands).length > keyed.length,
    JSON.stringify(diag.commands),
  );

  const server = createServer(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(await readFile(FIXTURE, 'utf8'));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  // The control-bar button only mounts through the YouTube adapter, so that
  // scenario needs a page whose URL is on the youtube.com origin. Instead of
  // relying on *.localhost DNS resolution (which differs across environments),
  // the scenario fulfils https://www.youtube.com/player.html from the local
  // fixture via page.route below — the URL really is youtube.com.
  const url = `http://127.0.0.1:${port}/player.html`;

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

    // --- rotation (auto-fit pinned off: this asserts the raw matrix) -------
    await send({ type: 'setState', payload: { rotation: 0, scale: 1, autoFit: false } });
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
      payload: { rotation: 90, scale: 1.5, translateX: 40, translateY: -25, autoFit: false },
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
    // With auto-fit owning the geometry the picture is sized to land exactly on
    // the player, so ancestors are opened rather than clipped — otherwise a
    // sub-pixel rounding difference would show up as a cut edge.
    await send({ type: 'setState', payload: { rotation: 90, scale: 1, autoFit: true } });
    await page.waitForTimeout(200);
    const overflowDuring = await page.locator('#player').evaluate((el) => getComputedStyle(el).overflow);
    check(
      'auto-fit does not clip the picture mid-transform',
      overflowDuring === 'visible',
      overflowDuring,
    );

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


    // --- control-bar button: mount, alignment, click ----------------------
    // The Generic adapter never returns a control-bar anchor, so this scenario
    // loads the same fixture through the YouTube adapter route. It is the exact
    // path a real youtube.com page takes.
    {
      const barPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      try {
        const fixtureHtml = await readFile(FIXTURE, 'utf8');
        await barPage.route('https://www.youtube.com/**', (route) =>
          route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixtureHtml }),
        );
        await barPage.goto(YT_FIXTURE_URL, { waitUntil: 'domcontentloaded' });
        await barPage.addScriptTag({ content: stub });
        await barPage.addScriptTag({ content: bundle });
        await barPage.waitForTimeout(1200);

        const barStatus = await barPage.evaluate(
          () => new Promise((resolve) => window.__tvListeners[0]({ type: 'getState' }, {}, resolve)),
        );
        check(
          'control-bar scenario runs on the youtube.com origin',
          barPage.url().startsWith('https://www.youtube.com/'),
          barPage.url(),
        );
        check(
          'control-bar scenario uses the YouTube adapter',
          barStatus?.adapter === 'YouTube',
          JSON.stringify(barStatus),
        );

        const barHost = barPage.locator('#tiltview-controlbar-host');
        const barMounted = await barHost
          .waitFor({ state: 'attached', timeout: 5000 })
          .then(() => true)
          .catch(() => false);
        check('control-bar button mounts into .ytp-right-controls', barMounted);

        if (barMounted) {
          const geom = await barPage.evaluate(() => {
            const host = document.querySelector('#tiltview-controlbar-host');
            const rc = document.querySelector('.ytp-right-controls');
            const sibling = rc?.querySelector('.ytp-button');
            if (!host || !rc || !sibling) return null;
            const h = host.getBoundingClientRect();
            const s = sibling.getBoundingClientRect();
            const r = rc.getBoundingClientRect();
            return {
              host: { w: +h.width.toFixed(1), h: +h.height.toFixed(1), cy: +((h.top + h.bottom) / 2).toFixed(1) },
              sibling: { w: +s.width.toFixed(1), h: +s.height.toFixed(1), cy: +((s.top + s.bottom) / 2).toFixed(1) },
              bar: { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1) },
              isFirst: rc.firstElementChild === host,
            };
          });
          diag.controlBar = geom;

          check('button is prepended as the first control-bar child', geom?.isFirst === true);
          check(
            'button matches the .ytp-button box (40x40)',
            geom && Math.abs(geom.host.w - 40) < 0.6 && Math.abs(geom.host.h - 40) < 0.6,
            JSON.stringify(geom?.host),
          );
          check(
            'button sits on the same horizontal line as sibling icons',
            geom && Math.abs(geom.host.cy - geom.sibling.cy) <= 0.5,
            geom ? 'host.cy=' + geom.host.cy + ' sibling.cy=' + geom.sibling.cy : 'no geometry',
          );
          check(
            'button stays inside the control bar',
            geom && geom.host.cy > geom.bar.top && geom.host.cy < geom.bar.bottom,
            JSON.stringify(geom?.bar),
          );

          // The reported defect: clicking it did nothing.
          const panel = barPage.locator('#tiltview-panel-host');
          const before = await panel.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
          });
          const hb = await barHost.boundingBox();
          await barPage.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
          await barPage.waitForTimeout(300);
          const after = await panel.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
          });
          check(
            'clicking the control-bar button opens the floating panel',
            after.h > before.h + 4,
            'before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after),
          );
        }
      } finally {
        await barPage.close();
      }
    }


    // --- Bilibili control bar: per-site metrics ---------------------------
    // The button used to hard-code YouTube's 40x40 box. Bilibili's
    // .bpx-player-ctrl-btn is 28x22 in a 35px bar, top-aligned, with a 10px
    // gutter — against which the fixed box measured 6.5px low and 18px too tall.
    {
      const biliPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      try {
        await biliPage.route('https://www.bilibili.com/**', (route) =>
          route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: "<!doctype html><html lang=\"zh\"><head><meta charset=\"utf-8\"><title>bili fixture</title><style>\n  html,body{margin:0;background:#000;color:#fff}\n  .bpx-player-container{position:relative;width:978px;height:596px;background:#000}\n  .bpx-player-video-area{position:relative;width:978px;height:550px;background:#111}\n  .bpx-player-video-wrap{width:978px;height:550px;overflow:visible}\n  video{width:100%;height:100%;object-fit:contain;display:block}\n  .bpx-player-control-wrap{position:absolute;left:0;right:0;bottom:0;height:46px}\n  .bpx-player-control-bottom{display:flex;align-items:normal;justify-content:space-between;\n    height:35px;padding:0 12px}\n  .bpx-player-control-bottom-right{display:flex;height:35px}\n  .bpx-player-ctrl-btn{display:block;height:22px;line-height:22px;margin:0 10px 0 0;\n    font-size:12px;color:rgba(255,255,255,.8);cursor:pointer;white-space:nowrap}\n</style></head><body>\n<div class=\"bpx-player-container\" id=\"bilibili-player\">\n  <div class=\"bpx-player-video-area\">\n    <div class=\"bpx-player-video-wrap\"><video id=\"v\" playsinline muted loop></video></div>\n  </div>\n  <div class=\"bpx-player-control-wrap\">\n    <div class=\"bpx-player-control-bottom\">\n      <div class=\"bpx-player-control-bottom-left\"></div>\n      <div class=\"bpx-player-control-bottom-right\" id=\"right\">\n        <div class=\"bpx-player-ctrl-btn bpx-player-ctrl-quality\" style=\"width:28px\">1080P</div>\n        <div class=\"bpx-player-ctrl-btn bpx-player-ctrl-playbackrate\" style=\"width:50px\">倍速</div>\n        <div class=\"bpx-player-ctrl-btn bpx-player-ctrl-subtitle\" style=\"width:28px\">字幕</div>\n        <div class=\"bpx-player-ctrl-btn bpx-player-ctrl-volume\" style=\"width:36px\">音量</div>\n        <div class=\"bpx-player-ctrl-btn bpx-player-ctrl-full\" style=\"width:36px\">全屏</div>\n      </div>\n    </div>\n  </div>\n</div>\n</body></html>" }),
        );
        await biliPage.goto(BILI_FIXTURE_URL, { waitUntil: 'domcontentloaded' });
        await biliPage.addScriptTag({ content: stub });
        await biliPage.addScriptTag({ content: bundle });
        await biliPage.waitForTimeout(1200);

        const biliStatus = await biliPage.evaluate(
          () => new Promise((resolve) => window.__tvListeners[0]({ type: 'getState' }, {}, resolve)),
        );
        check(
          'bilibili scenario uses the Bilibili adapter',
          biliStatus?.adapter === 'Bilibili',
          JSON.stringify(biliStatus),
        );

        const biliHost = biliPage.locator('#tiltview-controlbar-host');
        const biliMounted = await biliHost
          .waitFor({ state: 'attached', timeout: 5000 })
          .then(() => true)
          .catch(() => false);
        check('bilibili: control-bar button mounts', biliMounted);

        if (biliMounted) {
          const geom = await biliPage.evaluate(() => {
            const host = document.querySelector('#tiltview-controlbar-host');
            const bar = document.querySelector('.bpx-player-control-bottom-right');
            const sib = bar?.querySelector('.bpx-player-ctrl-btn');
            if (!host || !bar || !sib) return null;
            const h = host.getBoundingClientRect();
            const s = sib.getBoundingClientRect();
            return {
              host: { w: +h.width.toFixed(1), h: +h.height.toFixed(1), top: +h.top.toFixed(1),
                      cy: +((h.top + h.bottom) / 2).toFixed(1) },
              sibling: { w: +s.width.toFixed(1), h: +s.height.toFixed(1), top: +s.top.toFixed(1),
                         cy: +((s.top + s.bottom) / 2).toFixed(1) },
              marginRight: getComputedStyle(host).marginRight,
              color: getComputedStyle(host).color,
            };
          });
          diag.bilibiliControlBar = geom;

          check(
            'bilibili: button adopts the 28x22 sibling box',
            geom && Math.abs(geom.host.w - geom.sibling.w) <= 0.5 &&
              Math.abs(geom.host.h - geom.sibling.h) <= 0.5,
            JSON.stringify({ host: geom?.host, sibling: geom?.sibling }),
          );
          check(
            'bilibili: button sits on the same horizontal line',
            geom && Math.abs(geom.host.cy - geom.sibling.cy) <= 0.5,
            geom ? 'host.cy=' + geom.host.cy + ' sibling.cy=' + geom.sibling.cy : 'no geometry',
          );
          check(
            'bilibili: button top aligns with siblings (bar does not centre)',
            geom && Math.abs(geom.host.top - geom.sibling.top) <= 0.5,
            geom ? 'host.top=' + geom.host.top + ' sibling.top=' + geom.sibling.top : 'no geometry',
          );
          check(
            'bilibili: button reuses the site 10px gutter and colour',
            geom && geom.marginRight === '10px' && geom.color.includes('255'),
            JSON.stringify({ m: geom?.marginRight, c: geom?.color }),
          );

          const before = await biliPage.evaluate(() => {
            const p = document.querySelector('#tiltview-panel-host');
            if (!p) return null;
            const r = p.getBoundingClientRect();
            return { h: +r.height.toFixed(1) };
          });
          const hb = await biliHost.boundingBox();
          await biliPage.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
          await biliPage.waitForTimeout(300);
          const after = await biliPage.evaluate(() => {
            const p = document.querySelector('#tiltview-panel-host');
            if (!p) return null;
            const r = p.getBoundingClientRect();
            return { h: +r.height.toFixed(1) };
          });
          check(
            'bilibili: clicking the control-bar button opens the panel',
            Boolean(before && after) && after.h > before.h + 4,
            'before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after),
          );
        }
      } finally {
        await biliPage.close();
      }
    }


    // --- floating panel: real clicks must reach the action buttons ---------
    // Regression: the panel registered itself as a drag surface and called
    // setPointerCapture() on the panel for ANY press inside it, including
    // presses on the buttons. Capture retargeted pointerup to .panel, so press
    // and release landed on different elements, the browser dispatched click to
    // their common ancestor, and every action button was dead:
    //   pointerdown -> button.act (depth 11)
    //   pointerup   -> .panel     (depth 8)
    //   click       -> .panel     (depth 8)
    // The shadow root is closed, so this scenario force-opens it via an
    // attachShadow hook before the bundle runs, then measures real button rects
    // and clicks them with real mouse events.
    {
      const panelPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      try {
        await panelPage.goto(url, { waitUntil: 'domcontentloaded' });
        await panelPage.addScriptTag({ content: openShadowHook });
        await panelPage.addScriptTag({ content: stub });
        await panelPage.addScriptTag({ content: bundle });
        await panelPage.waitForTimeout(1200);

        const shadowRootOf = (page) =>
          page.evaluate(() => {
            const host = document.querySelector('#tiltview-panel-host');
            if (!host) return null;
            const entry = (window.__tvShadowRoots || []).find((e) => e.host === host);
            if (!entry) return null;
            const panel = entry.root.querySelector('.panel');
            return { open: panel.getAttribute('data-open') };
          });

        // Open the panel by clicking the tab.
        const tabPt = await panelPage.evaluate(() => {
          const host = document.querySelector('#tiltview-panel-host');
          const entry = window.__tvShadowRoots.find((e) => e.host === host);
          const tab = entry.root.querySelector('.tab');
          const r = tab.getBoundingClientRect();
          return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
        });
        await panelPage.mouse.click(tabPt.cx, tabPt.cy);
        await panelPage.waitForTimeout(400);

        const state = await shadowRootOf(panelPage);
        check('panel opens when its tab is clicked', state?.open === 'true', JSON.stringify(state));

        if (state?.open === 'true') {
          // Instrument the first action button and measure its real rect.
          const target = await panelPage.evaluate(() => {
            const host = document.querySelector('#tiltview-panel-host');
            const entry = window.__tvShadowRoots.find((e) => e.host === host);
            const btn = entry.root.querySelector('button.act');
            window.__tvBtnClicks = 0;
            btn.addEventListener('click', () => { window.__tvBtnClicks += 1; });
            const r = btn.getBoundingClientRect();
            return {
              cx: Math.round(r.x + r.width / 2),
              cy: Math.round(r.y + r.height / 2),
              title: btn.getAttribute('title'),
            };
          });

          const transformBefore = await panelPage.evaluate(
            () => getComputedStyle(document.querySelector('#v')).transform,
          );

          await panelPage.mouse.click(target.cx, target.cy);
          await panelPage.waitForTimeout(350);

          const clicks = await panelPage.evaluate(() => window.__tvBtnClicks);
          const transformAfter = await panelPage.evaluate(
            () => getComputedStyle(document.querySelector('#v')).transform,
          );

          diag.panelClick = { target, clicks, transformBefore, transformAfter };

          check(
            'a real click reaches the panel action button',
            clicks > 0,
            'button=' + target.title + ' clicks=' + clicks,
          );
          check(
            'that click actually transforms the video',
            transformBefore !== transformAfter,
            transformBefore + ' -> ' + transformAfter,
          );
        }
      } finally {
        await panelPage.close();
      }
    }


    // --- rotated picture stays inside the player (bug 1) ------------------
    // Rotating a landscape picture 90° swaps its bounding box. Without a
    // corrected fit factor the portrait box overflows the player vertically and
    // the user only sees a cropped fragment. Measured on Bilibili before the
    // fix: the 978x550 video became 550x978 with bottom 932 vs player 718.
    {
      const fitPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      try {
        await fitPage.goto(url, { waitUntil: 'domcontentloaded' });
        await fitPage.addScriptTag({ content: stub });
        await fitPage.addScriptTag({ content: bundle });
        await fitPage.waitForTimeout(1200);

        const send = (request) =>
          fitPage.evaluate(
            (req) => new Promise((res) => window.__tvListeners[0](req, {}, res)),
            request,
          );

        const box = () =>
          fitPage.evaluate(() => {
            const v = document.querySelector('#v').getBoundingClientRect();
            const stage = document.querySelector('#player').getBoundingClientRect();
            return {
              video: { l: v.left, t: v.top, r: v.right, b: v.bottom, w: v.width, h: v.height },
              stage: { l: stage.left, t: stage.top, r: stage.right, b: stage.bottom, w: stage.width, h: stage.height },
            };
          });

        for (const degrees of [90, 180, 270]) {
          await send({ type: 'setState', payload: { rotation: degrees, autoFit: true } });
          await fitPage.waitForTimeout(400);
          const m = await box();
          const slack = 1.5;
          const inside =
            m.video.l >= m.stage.l - slack &&
            m.video.r <= m.stage.r + slack &&
            m.video.t >= m.stage.t - slack &&
            m.video.b <= m.stage.b + slack;
          check(
            'rotation ' + degrees + '° keeps the picture inside the player',
            inside,
            'video=' + JSON.stringify(m.video) + ' stage=' + JSON.stringify(m.stage),
          );
        }

        // Auto-fit off: the user asked for the raw (overflowing) rotation.
        await send({ type: 'setState', payload: { rotation: 90, autoFit: false } });
        await fitPage.waitForTimeout(300);
        const raw = await box();
        check(
          'with auto-fit off the rotation is left uncorrected',
          raw.video.b > raw.stage.b + 1,
          'video.b=' + raw.video.b + ' stage.b=' + raw.stage.b,
        );

        await send({ type: 'reset' });
        await fitPage.waitForTimeout(300);
        const afterReset = await fitPage.evaluate(
          () => getComputedStyle(document.querySelector('#v')).transform,
        );
        check('reset restores the untransformed picture', afterReset === 'none', afterReset);
      } finally {
        await fitPage.close();
      }
    }

    // --- panel clears the danmaku input bar (bug 2) ----------------------
    // Bilibili's player container is taller than its picture area: the extra
    // 46px is the danmaku submit bar. The panel is positioned against the
    // picture area (adapter safeArea) so it can never overlap that bar.
    {
      const safePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      try {
        await safePage.route('https://www.bilibili.com/**', (route) =>
          route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: SAFE_AREA_FIXTURE }),
        );
        await safePage.goto('https://www.bilibili.com/video/BV1GJ411x7h7', {
          waitUntil: 'domcontentloaded',
        });
        await safePage.addScriptTag({ content: stub });
        await safePage.addScriptTag({ content: bundle });
        await safePage.waitForTimeout(1200);

        // Open the panel.
        await safePage.evaluate(
          () => new Promise((res) => window.__tvListeners[0]({ type: 'togglePanel' }, {}, res)),
        );
        await safePage.waitForTimeout(900);

        const overlap = await safePage.evaluate(() => {
          const host = document.querySelector('#tiltview-panel-host');
          const sending = document.querySelector('.bpx-player-sending-area');
          const area = document.querySelector('.bpx-player-video-area');
          if (!host || !sending || !area) return null;
          const h = host.getBoundingClientRect();
          const s = sending.getBoundingClientRect();
          const a = area.getBoundingClientRect();
          return {
            panelBottom: Math.round(h.bottom),
            sendingTop: Math.round(s.top),
            pictureBottom: Math.round(a.bottom),
            overlapPx: Math.max(0, Math.round(h.bottom - s.top)),
          };
        });
        diag.safeArea = overlap;

        check(
          'panel does not overlap the danmaku input bar',
          overlap && overlap.overlapPx === 0,
          JSON.stringify(overlap),
        );
        check(
          'panel stays inside the picture area',
          overlap && overlap.panelBottom <= overlap.pictureBottom + 1,
          JSON.stringify(overlap),
        );
      } finally {
        await safePage.close();
      }
    }

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
