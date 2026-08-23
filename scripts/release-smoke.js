'use strict';
// Instrumented headless-Chromium smoke for iteration 0044: a note leaves
// the water the way it lived. One quick tap and one long settled hold land
// on the exact same spot of mid-depth water; the scheduled stop of the
// sustain trio must sit close to the material base for the tap and stretch
// visibly longer for the hold, while dataset.lastRelease reports the same
// story through the shell.
//
// Identification: on release, oscillator/overtone/undertow share one stop
// time (now + releaseSeconds); the droplet stops much earlier as its own
// singleton. Per gesture window the longest singleton stop-span therefore
// belongs to the release tail.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4289;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'water-release-44.png');

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
  page.on('console', msg => { if (msg.type === 'error') errors.push('console: ' + msg.text); });

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
  const tapX = Math.round(width * .32), tapY = Math.round(height * .5); // mid water

  // Release tail inside this gesture window: the sustain trio stops latest
  // (now + releaseSeconds beats every transient), so the maximum stop-span
  // over all fresh stops belongs to the tail. Short singleton stops around
  // it are the droplet and possible stone-skip echoes.
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
      if (!heldVoices) await page.waitForTimeout(2400); // full retire before retry
    }
    if (!heldVoices) throw new Error('gesture never produced a held voice: ' + label);
    await page.waitForTimeout(300); // let the release scheduling land
    const sample = await harvestTail(stopsBefore);
    sample.label = label;
    sample.heldVoices = heldVoices;
    return sample;
  }

  // Warm-up gesture first: the very first interaction unlocks audio and
  // invitation state; its numbers are not part of the comparison.
  await gesture(140, 'warmup');
  await page.waitForTimeout(2000);

  // Pair A - mid water: the tap keeps the material exit, the settled note
  // stretches partway.
  const tapA = await gesture(110, 'tap-mid');
  await page.waitForTimeout(2200);
  const holdA = await gesture(1650, 'hold-mid');
  await page.waitForTimeout(2600);

  // Pair B - deep water: same story with a visibly longer departure.
  const tapB = await gesture(110, 'tap-deep', .82);
  await page.waitForTimeout(2200);
  const holdB = await gesture(1650, 'hold-deep', .82);
  await page.waitForTimeout(400);

  await page.screenshot({ path: OUT, fullPage: false });

  const report = { eyebrow, tapA, holdA, tapB, holdB, errors };
  console.log(JSON.stringify(report, null, 2));

  const num = v => Number(v ?? NaN);
  const stretchA = num(holdA.lastRelease) - num(tapA.lastRelease);
  const stretchB = num(holdB.lastRelease) - num(tapB.lastRelease);
  const checks = {
    eyebrow44: /44/.test(report.eyebrow),
    allGesturesHeard: [tapA, holdA, tapB, holdB].every(g => g.tailSpan !== null),
    midTapKeepsBaseExit: num(tapA.lastRelease) >= .45 && num(tapA.lastRelease) <= .62,
    lifeStretchesMidWater: stretchA >= .05 && stretchA <= .12,
    deepWaterStretchesMore: stretchB > stretchA,
    longDeepTailBeyondOldConstant: num(holdB.lastRelease) >= .68,
    scheduledStopFollows:
      holdB.tailSpan > tapB.tailSpan && holdA.tailSpan > tapA.tailSpan,
    tailsBounded: num(holdB.lastRelease) <= 1.15 && holdB.tailSpan < 3.2,
    noErrors: errors.length === 0
  };
  console.log('CHECKS ' + JSON.stringify(checks));
  console.log('TAILS ' + JSON.stringify({
    mid: { tap: tapA.tailSpan, hold: holdA.tailSpan },
    deep: { tap: tapB.tailSpan, hold: holdB.tailSpan }
  }));
  if (Object.values(checks).some(v => !v)) process.exitCode = 1;

  await browser.close();
  server.close();
})().catch(err => { console.error(err); process.exit(1); });
