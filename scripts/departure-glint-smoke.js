'use strict';
// Instrumented headless-Chromium smoke for iteration 0045: the visible
// departure. After a note ends, exactly one soft pool of light must rest
// at the note's place and sink away along the same stretched tail the
// sound uses (waterRelease). Hard assertions ride the shell's own
// dataset.releaseGlints counter (written every frame by the draw loop):
// deterministic timings without guessing against tide bands. A relative
// same-frame pixel probe (glint spot vs same-band control point) and a
// screenshot add visual evidence.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4291;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'departure-glint-45.png');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let p = url.pathname;
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

(async () => {
  server.listen(PORT, '127.0.0.1');
  const browser = await chromium.launch({
    executablePath: '/home/mfoadmin/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('page: ' + e));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const eyebrow = (await page.locator('.eyebrow').textContent()).trim();

  const width = 390, height = 844;
  const deepY = Math.round(height * .78), midY = Math.round(height * .5);
  const x = Math.round(width * .5);

  const glintCount = () => page.evaluate(() => Number(document.querySelector('#pond').dataset.releaseGlints ?? '-1'));

  async function gesture(yFrac, holdMs) {
    await page.mouse.move(x, Math.round(height * yFrac));
    await page.mouse.down();
    await page.waitForTimeout(holdMs);
    const heldVoices = Number(await page.evaluate(() => document.querySelector('#pond').dataset.audioVoices || 0));
    await page.mouse.up();
    return { heldVoices, endedAt: Date.now() };
  }

  // Wait until the departing-light counter is back to zero; returns ms
  // since the gesture's mouse-up (rAF poll adds <=~2 frames of slack).
  async function waitDepartedSince(endedAt) {
    await page.waitForFunction(() => document.querySelector('#pond').dataset.releaseGlints === '0', null, { timeout: 5000 });
    return Date.now() - endedAt;
  }

  // Relative same-frame probe: brightness at the glint spot minus a
  // control point on the same tide band (same y, x shifted 130px), taken
  // inside one rAF so ambient bands affect both equally.
  async function spotVsControl() {
    return page.evaluate(([sx, sy, cx]) => new Promise(resolve => {
      const pond = document.querySelector('#pond');
      const ctx = pond.getContext('2d');
      const sxScale = pond.width / pond.clientWidth, syScale = pond.height / pond.clientHeight;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try {
          const s = ctx.getImageData(sx * sxScale, sy * syScale, 1, 1).data;
          const c = ctx.getImageData(cx * sxScale, sy * syScale, 1, 1).data;
          resolve((s[0] + s[1] + s[2]) / 3 - (c[0] + c[1] + c[2]) / 3);
        } catch (e) { resolve(null); }
      }));
    }), [x, deepY, Math.max(8, x - 130)]);
  }

  // Warm-up unlocks audio; its own glint (<=~.65s) retires well before 2.6s.
  const warmup = await gesture(.78, 140);
  await page.waitForTimeout(2600);
  const warmupCount = await glintCount();

  // Held deep note: stretched audio tail -> visibly longer departure.
  const hold = await gesture(.78, 1650);
  await page.waitForTimeout(320);
  const holdSpotDelta = await spotVsControl();
  const lastRelease = Number(await page.evaluate(() => document.querySelector('#pond').dataset.lastRelease || NaN));
  const depthValue = .78; // clamp(yFraction) for deep water
  const expectedHoldLifeMs = lastRelease * (1 + depthValue * .35) * 1000;
  const holdVisibleMs = await waitDepartedSince(hold.endedAt);

  // Quick tap in mid water: short bounded departure, clearly shorter.
  await page.waitForTimeout(600);
  const tap = await gesture(.5, 110);
  const tapVisibleMs = await waitDepartedSince(tap.endedAt);
  await page.waitForTimeout(700);
  const stayedDepartedA = await glintCount();
  const stayedDepartedB = await glintCount();

  await page.screenshot({ path: OUT, fullPage: false });

  const report = {
    eyebrow, warmupCount, heldVoices: hold.heldVoices,
    lastRelease, expectedHoldLifeMs: Number(expectedHoldLifeMs.toFixed(1)),
    holdVisibleMs, tapVisibleMs, holdSpotDelta: holdSpotDelta === null ? null : Number(holdSpotDelta.toFixed(1)),
    errors
  };
  console.log(JSON.stringify(report, null, 2));

  const checks = {
    eyebrow45: /45/.test(report.eyebrow),
    warmupQuiet: warmupCount === 0,
    gestureHeard: hold.heldVoices >= 1 && lastRelease >= .6 && lastRelease <= 1.15,
    holdGlintLifeFollowsTail: Math.abs(holdVisibleMs - expectedHoldLifeMs) <= 180 && holdVisibleMs >= expectedHoldLifeMs - 120,
    tapGlintBoundedAndShorter: tapVisibleMs <= 900 && tapVisibleMs < holdVisibleMs - 250,
    glintsStayDeparted: stayedDepartedA === 0 && stayedDepartedB === 0,
    spotBrighterThanSameBandControl: holdSpotDelta !== null && holdSpotDelta >= 8,
    noErrors: errors.length === 0
  };
  console.log('CHECKS ' + JSON.stringify(checks));
  if (Object.values(checks).some(v => !v)) process.exitCode = 1;

  await browser.close();
  server.close();
})().catch(err => { console.error(err); process.exit(1); });
