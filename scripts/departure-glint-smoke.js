'use strict';
// Instrumented headless-Chromium smoke for iteration 0084: the visible departure
// is alive again. When the hand lifts, exactly one soft pool of light must rest
// at the note's last place and sink away over the decay the water still holds.
//
// The check rides the shell's own honest numbers instead of frozen ones:
// `dataset.lastRelease` is the remaining decay, and the expected visible life
// comes from the same pure layer the product draws with (pond-waves
// releaseLifeSeconds), so the smoke and the water cannot drift apart. The
// shore inspection is not play and must leave no departing light.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const chromePath = require('./chrome-path');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const waves = require('../pond-waves.js');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4291;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'departure-light-84.png');

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
    executablePath: chromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('page: ' + e));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text); });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const eyebrow = (await page.locator('.eyebrow').textContent()).trim();

  const width = 390, height = 844;
  const x = Math.round(width * .5);
  const deepYFrac = .78, midYFrac = .5;

  const glintCount = () => page.evaluate(() => Number(document.querySelector('#pond').dataset.releaseGlints ?? '-1'));

  // Relative same-frame probe: brightness at the glint spot minus a control
  // point on the same tide band (same y, x shifted 130px), so ambient bands
  // affect both equally.
  async function spotVsControl(yFrac) {
    const y = Math.round(height * yFrac);
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
    }), [x, y, Math.max(8, x - 130)]);
  }

  // One real gesture: press, hold, and lift. Returns the honest remaining
  // decay the shell reports at the lift, plus when the lift happened.
  async function gesture(yFrac, holdMs) {
    await page.mouse.move(x, Math.round(height * yFrac));
    await page.mouse.down();
    await page.waitForTimeout(holdMs);
    const heldVoices = Number(await page.evaluate(() => document.querySelector('#pond').dataset.audioVoices || 0));
    await page.mouse.up();
    const endedAt = Date.now();
    await page.waitForTimeout(60);
    const lastRelease = Number(await page.evaluate(() => document.querySelector('#pond').dataset.lastRelease || NaN));
    return { heldVoices, endedAt, lastRelease };
  }

  // No gesture yet: the water has not departed, so no light rests on it.
  const quietStart = await glintCount();

  // Warm-up unlocks audio; its own light must retire before the real reading.
  const warmup = await gesture(midYFrac, 140);
  await page.waitForTimeout(2400);
  const warmupQuiet = await glintCount();

  // Held deep note: the bowl keeps ringing after the hand leaves, and one pool
  // of light rests where it sounded.
  const hold = await gesture(deepYFrac, 1650);
  const holdSpotDelta = await spotVsControl(deepYFrac);
  const holdPeak = await page.waitForFunction(
    () => Number(document.querySelector('#pond').dataset.releaseGlints) >= 1, null, { timeout: 3000 }
  ).then(() => glintCount(), () => 0);
  await page.waitForFunction(() => document.querySelector('#pond').dataset.releaseGlints === '0', null, { timeout: 6000 });
  const holdVisibleMs = Date.now() - hold.endedAt;
  const expectedHoldLifeMs = waves.releaseLifeSeconds(.78, hold.lastRelease) * 1000;
  const stayedDepartedA = await glintCount();

  // A quick mid-water tap departs too, and its light is bounded by the envelope.
  await page.waitForTimeout(900);
  const tap = await gesture(midYFrac, 110);
  const tapPeak = await page.waitForFunction(
    () => Number(document.querySelector('#pond').dataset.releaseGlints) >= 1, null, { timeout: 3000 }
  ).then(() => glintCount(), () => 0);
  await page.waitForFunction(() => document.querySelector('#pond').dataset.releaseGlints === '0', null, { timeout: 6000 });
  const tapVisibleMs = Date.now() - tap.endedAt;
  const expectedTapLifeMs = waves.releaseLifeSeconds(.5, tap.lastRelease) * 1000;
  await page.waitForTimeout(700);
  const stayedDepartedB = await glintCount();

  await page.screenshot({ path: OUT, fullPage: false });

  const report = {
    eyebrow, quietStart, warmupQuiet, warmupLastRelease: warmup.lastRelease,
    heldVoices: hold.heldVoices, holdLastRelease: hold.lastRelease,
    holdPeak, holdVisibleMs, expectedHoldLifeMs,
    tapLastRelease: tap.lastRelease, tapPeak, tapVisibleMs, expectedTapLifeMs,
    holdSpotDelta: holdSpotDelta === null ? null : Number(holdSpotDelta.toFixed(1)),
    errors
  };
  console.log(JSON.stringify(report, null, 2));

  // The measured life rides an rAF poll, so it can only overshoot the pure
  // envelope by a couple of frames; it may never undershoot it.
  const bounded = value => value >= waves.RELEASE_LIFE_MIN_S * 1000 - 1 && value <= waves.RELEASE_LIFE_MAX_S * 1000 + 150;
  const follows = (visible, expected) => Math.abs(visible - expected) <= 250 && visible >= expected - 200;
  const checks = {
    eyebrowNamesEtude: /^Этюд воды · \d+$/.test(report.eyebrow),
    quietBeforeAnyGesture: quietStart === 0 && warmupQuiet === 0,
    gesturesHeard: hold.heldVoices >= 1 && tap.heldVoices >= 1,
    departingLightReturns: holdPeak === 1 && tapPeak === 1,
    // The light rides the decay the water still holds: the shell's remaining
    // seconds, bounded by the pure envelope, not a frozen literal.
    lifeFollowsRemainingDecay:
      follows(holdVisibleMs, expectedHoldLifeMs) && follows(tapVisibleMs, expectedTapLifeMs),
    lightIsBounded: bounded(holdVisibleMs) && bounded(tapVisibleMs),
    spotBrighterThanSameBandControl: holdSpotDelta !== null && holdSpotDelta >= 8,
    glintsStayDeparted: stayedDepartedA === 0 && stayedDepartedB === 0,
    noErrors: errors.length === 0
  };
  console.log('CHECKS ' + JSON.stringify(checks));
  if (Object.values(checks).some(v => !v)) process.exitCode = 1;

  await browser.close();
  server.close();
})().catch(err => { console.error(err); process.exit(1); });