'use strict';
// Instrumented headless-Chromium smoke for iteration 0040: repeated short
// taps become plainly separable on the ear. Three taps land on the exact
// same X (same pitch), taking the three deterministic note shades in order;
// the scheduled droplet transient must lengthen clear -> neutral -> deep
// while the settled pitch stays identical, proving the shade reaches the
// ear through the water transient without touching the height axis.
//
// Drop identification: every fresh note creates four oscillators; three of
// them (sustain pair + undertow) are stopped together by the release call
// and share one stop time, while the droplet is scheduled to stop at
// born + durationSeconds + .025 all by itself. So per tap window the
// singleton stop time belongs to the droplet.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4287;
const OUT = path.join(ROOT, 'output', 'pond-piano', 'shade-taps-40.png');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
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
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
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
  const tapX = Math.round(width * .3), tapY = Math.round(height * .5);
  const labels = ['clear', 'neutral', 'deep'];
  const taps = [];

  // Droplet length for this tap window: among fresh stops, the release
  // cluster shares one rounded stop time; singleton stop times are the
  // droplets (one per voice actually started, all of this tap's shade).
  async function harvestDropSpan(previousCount) {
    return page.evaluate(prev => {
      const fresh = window.__probe.stops.slice(prev);
      const key = s => Math.round(s.stopAt * 1000) / 1;
      const counts = new Map();
      for (const s of fresh) counts.set(key(s), (counts.get(key(s)) || 0) + 1);
      const singletons = fresh.filter(s => counts.get(key(s)) === 1);
      const spans = singletons.map(s => s.stopAt - s.born).filter(span => span > .03 && span < .3);
      return {
        dropSpan: spans.length ? Math.min(...spans) : null,
        freshStops: fresh.length,
        dropVoicesSeen: document.querySelector('#pond').dataset.dropVoices || '?'
      };
    }, previousCount);
  }

  for (let index = 0; index < labels.length; index += 1) {
    let heldVoices = 0;
    let stopsBeforeAttempt = 0;
    for (let attempt = 0; attempt < 4 && !heldVoices; attempt += 1) {
      // Baseline per attempt: a failed tap still creates oscillators, and
      // every retry of the same shade sounds identically, so scoping to the
      // last attempt keeps the droplet window honest.
      stopsBeforeAttempt = await page.evaluate(() => window.__probe.stops.length);
      await page.mouse.move(tapX, tapY);
      await page.mouse.down();
      await page.waitForTimeout(190);
      heldVoices = await page.evaluate(() => Number(document.querySelector('#pond').dataset.audioVoices || 0));
      await page.mouse.up();
      if (!heldVoices) await page.waitForTimeout(2200); // full retire before retry
    }
    if (!heldVoices) throw new Error('tap never produced a held voice: ' + labels[index]);
    await page.waitForTimeout(430); // let even the deepest droplet stop fire
    const sample = await harvestDropSpan(stopsBeforeAttempt);
    sample.label = labels[index];
    sample.heldVoices = heldVoices;
    taps.push(sample);
    await page.waitForTimeout(1900); // release tail retires fully before next shade
  }

  await page.screenshot({ path: OUT, fullPage: false });

  const report = { eyebrow, taps, errors };
  console.log(JSON.stringify(report, null, 2));

  const minima = taps.map(t => t.dropSpan);
  const checks = {
    eyebrow40: /40/.test(report.eyebrow),
    threeTapsHeard: minima.every(span => span !== null),
    dropletGrowsWithShade: minima[0] < minima[1] && minima[1] < minima[2],
    growthIsAudible: (minima[2] - minima[0]) >= .04,
    noErrors: errors.length === 0
  };
  console.log('CHECKS ' + JSON.stringify(checks));
  console.log('DROP_SPANS ' + JSON.stringify(minima));
  if (Object.values(checks).some(v => !v)) { process.exitCode = 1; }

  await browser.close();
  server.close();
})().catch(err => { console.error(err); process.exit(1); });
