'use strict';
// Iteration 0055: a post-attack glissando must open one visible and audible
// wake from real speed, using the existing voice nodes. Coming to rest closes
// it again while the final X still owns pitch and release stays clean.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const music = require('../pond-music.js');
const { closeServer, createStaticServer, listenOnLoopback } = require('../electron/static-server.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'pond-piano', 'glide-wake-55.png');

(async () => {
  const server = createStaticServer(ROOT);
  const origin = await listenOnLoopback(server);
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: '/home/mfoadmin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-gpu']
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(`page: ${error}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Number.isFinite(Number(document.querySelector('#pond')?.dataset.budgetFrameMs)));

    const y = 430;
    await page.mouse.move(86, y);
    await page.mouse.down();
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 1);
    await page.waitForTimeout(650); // the drop has landed; wake maturity is full
    const calm = await page.evaluate(() => {
      const pond = document.querySelector('#pond');
      return {
        wake: Number(pond.dataset.glideWake || 0),
        filter: Number(pond.dataset.glideWakeFilter || 0),
        overtone: Number(pond.dataset.glideWakeOvertone || 0)
      };
    });

    // A broad but held stroke: glissando, not a release/skip. Several steps
    // leave enough sampled geometry to prove the visible paired wake.
    for (const x of [118, 154, 194, 238, 286]) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(10);
    }
    await page.waitForTimeout(34);
    const moving = await page.evaluate(() => {
      const pond = document.querySelector('#pond');
      return {
        wake: Number(pond.dataset.glideWake || 0),
        filter: Number(pond.dataset.glideWakeFilter || 0),
        overtone: Number(pond.dataset.glideWakeOvertone || 0),
        pitch: Number(pond.dataset.glideWakePitch || 0),
        wakeTrails: Number(pond.dataset.glideWakeTrails || 0),
        voices: Number(pond.dataset.audioVoices || 0)
      };
    });
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await page.locator('#pond').screenshot({ path: OUT });

    await page.waitForTimeout(1250);
    const rested = await page.evaluate(() => {
      const pond = document.querySelector('#pond');
      return {
        wake: Number(pond.dataset.glideWake || 0),
        filter: Number(pond.dataset.glideWakeFilter || 0),
        overtone: Number(pond.dataset.glideWakeOvertone || 0),
        pitch: Number(pond.dataset.glideWakePitch || 0),
        voices: Number(pond.dataset.audioVoices || 0)
      };
    });
    await page.mouse.up();
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 0,
      null, { timeout: 4000 });

    const expectedPitch = music.frequencyAt(286 / 390);
    const endedVoices = Number(await page.locator('#pond').getAttribute('data-audio-voices'));
    const checks = [
      ['resting held water has no wake', calm.wake <= .01, JSON.stringify(calm)],
      ['movement opens existing filter and overtone', moving.wake >= .35 && moving.filter > calm.filter * 1.04 && moving.overtone > calm.overtone + .008, JSON.stringify({ calm, moving })],
      ['the same expression leaves a visible wake trail', moving.wakeTrails >= 2, JSON.stringify(moving)],
      ['final X still owns glissando pitch', Math.abs(moving.pitch - expectedPitch) < .7, JSON.stringify({ expectedPitch, movingPitch: moving.pitch })],
      ['stopping closes wake without ending the voice', rested.wake <= .02 && rested.voices === 1 && Math.abs(rested.filter - calm.filter) < 2 && Math.abs(rested.overtone - calm.overtone) < .001, JSON.stringify(rested)],
      ['release cleans the sole sustain voice', endedVoices === 0, String(endedVoices)],
      ['no runtime or console errors', errors.length === 0, errors.join('; ')]
    ];
    const failed = checks.filter(([, ok]) => !ok);
    console.log(JSON.stringify({
      iteration: '0055-glide-wake-smoke', origin, screenshot: OUT,
      passed: checks.length - failed.length, failed: failed.length,
      failures: failed.map(([name, , detail]) => ({ name, detail })),
      checks: checks.map(([name, ok, detail]) => ({ name, ok, detail }))
    }, null, 2));
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    await browser?.close();
    await closeServer(server);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
