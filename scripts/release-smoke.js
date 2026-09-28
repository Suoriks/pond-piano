'use strict';
// Instrumented headless-Chromium smoke for the bowl era (originally 0044,
// retargeted 0085): the note leaves the water the way it lived. After 0057 a
// tap is a struck bowl whose decay is decided at touch-down, so a lift no
// longer stretches the tail - it only reports how much of that fixed decay is
// still ringing. The honest story the product keeps is the inverse of the old
// one, and this smoke reads it from the shell's own numbers:
//   - the same cell schedules the same decay whether the hand leaves at once
//     or stays (the strike decides, not the lift);
//   - dataset.lastRelease at the lift is the honest remainder, so it matches
//     (scheduled decay - hold time) for both a quick tap and a long hold;
//   - deeper water rings longer, because the bowl's life grows with depth.
//
// Identification: on release the shell schedules no new stop, so every fresh
// oscillator stop is a strike-scheduled mode; the longest stop-span over a
// gesture window is the bowl's fundamental (duration + .04).
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const chromePath = require('./chrome-path');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4289;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'bowl-decay-85.png');

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

  await page.addInitScript(() => {
    window.__probe = { stops: [] };
    const orig = window.AudioContext;
    window.AudioContext = class extends orig {
      constructor(...args) {
        super(...args);
        const ctx = this;
        const origCreate = ctx.createOscillator.bind(ctx);
        ctx.createOscillator = (...cargs) => {
          const osc = origCreate(...cargs);
          const born = ctx.currentTime;
          const origStop = osc.stop.bind(osc);
          osc.stop = (when) => {
            const stopAt = typeof when === 'number' ? when : ctx.currentTime;
            window.__probe.stops.push({ born, stopAt });
            return origStop(when);
          };
          return osc;
        };
      }
    };
  });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const eyebrow = (await page.locator('.eyebrow').textContent()).trim();

  const width = 390, height = 844;
  const tapX = Math.round(width * .32);

  // Scheduled decay inside this gesture window: the bowl's fundamental lives
  // longest, so the maximum stop-span over fresh stops is that decay.
  async function harvestTail(previousCount) {
    return page.evaluate(prev => {
      const fresh = window.__probe.stops.slice(prev);
      const spans = fresh.map(s => s.stopAt - s.born);
      return {
        tailSpan: spans.length ? Math.max(...spans) : null,
        lastRelease: document.querySelector('#pond').dataset.lastRelease || null,
        freshStops: fresh.length
      };
    }, previousCount);
  }

  async function gesture(holdMs, label, yFraction = .5) {
    let heldVoices = 0;
    let stopsBefore = 0;
    for (let attempt = 0; attempt < 4 && !heldVoices; attempt += 1) {
      stopsBefore = await page.evaluate(() => window.__probe.stops.length);
      await page.mouse.move(tapX, Math.round(height * yFraction));
      await page.mouse.down();
      await page.waitForTimeout(holdMs);
      heldVoices = await page.evaluate(() => Number(document.querySelector('#pond').dataset.audioVoices || 0));
      await page.mouse.up();
      if (!heldVoices) await page.waitForTimeout(4800); // full bowl retire before retry
    }
    if (!heldVoices) throw new Error('gesture never produced a held voice: ' + label);
    await page.waitForTimeout(300); // let the release bookkeeping land
    const sample = await harvestTail(stopsBefore);
    sample.label = label;
    sample.heldVoices = heldVoices;
    sample.holdMs = holdMs;
    return sample;
  }

  // Warm-up gesture first: the very first interaction unlocks audio and
  // invitation state; its numbers are not part of the comparison.
  await gesture(140, 'warmup');
  await page.waitForTimeout(4800);

  // Pair A - mid water.
  const tapA = await gesture(110, 'tap-mid');
  await page.waitForTimeout(4800);
  const holdA = await gesture(1650, 'hold-mid');
  await page.waitForTimeout(4800);

  // Pair B - deep water: the same story with a longer ring.
  const tapB = await gesture(110, 'tap-deep', .82);
  await page.waitForTimeout(4800);
  const holdB = await gesture(1650, 'hold-deep', .82);
  await page.waitForTimeout(400);

  await page.screenshot({ path: OUT, fullPage: false });

  const report = { eyebrow, tapA, holdA, tapB, holdB, errors };
  console.log(JSON.stringify(report, null, 2));

  const num = v => Number(v ?? NaN);
  const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
  // The lift reports the honest remainder: the decay the strike scheduled,
  // minus the time the hand already spent on the water.
  const remainder = g => g.tailSpan - g.holdMs / 1000;
  const checks = {
    eyebrowNamesEtude: /^Этюд воды · \d+$/.test(report.eyebrow),
    allGesturesHeard: [tapA, holdA, tapB, holdB].every(g => g.tailSpan !== null && g.heldVoices >= 1),
    decayDecidedAtStrike:
      near(tapA.tailSpan, holdA.tailSpan, .35) && near(tapB.tailSpan, holdB.tailSpan, .35),
    liftReportsHonestRemainder:
      [tapA, holdA, tapB, holdB].every(g => near(num(g.lastRelease), remainder(g), .4)),
    deepWaterRingsLonger: num(tapB.tailSpan) > num(tapA.tailSpan) + .2,
    tailsBounded: [tapA, holdA, tapB, holdB].every(g =>
      num(g.lastRelease) >= 0 && num(g.lastRelease) <= 6 && num(g.tailSpan) < 6),
    noErrors: errors.length === 0
  };
  console.log('CHECKS ' + JSON.stringify(checks));
  console.log('DECAY ' + JSON.stringify({
    mid: { tap: tapA.tailSpan, hold: holdA.tailSpan },
    deep: { tap: tapB.tailSpan, hold: holdB.tailSpan },
    remainder: {
      tapMid: remainder(tapA), holdMid: remainder(holdA),
      tapDeep: remainder(tapB), holdDeep: remainder(holdB)
    }
  }));
  if (Object.values(checks).some(v => !v)) process.exitCode = 1;

  await browser.close();
  server.close();
})().catch(err => { console.error(err); process.exit(1); });