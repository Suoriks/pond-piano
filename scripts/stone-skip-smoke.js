'use strict';
// A real fast straight flick must answer with a bounded two-mode pebble-bowl,
// never the old triangle pitch sweep. Instrumented production-loopback Chromium:
// probe every started oscillator, drive a real mouse flick, assert the skip pool
// enters the existing budget, the two modes are a fundamental + exact octave,
// the pool drains, and the screenshot is a calm organic surface.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const { createStaticServer, listenOnLoopback, closeServer } = require('../electron/static-server');

(async () => {
  const root = path.resolve(__dirname, '..'), server = createStaticServer(root);
  const origin = await listenOnLoopback(server);
  let browser;
  try {
    browser = await chromium.launch({ executablePath: '/home/mfoadmin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      window.skipProbe = { notes: [], live: 0 };
      const Native = AudioContext;
      window.AudioContext = class extends Native {
        constructor(options) {
          super(options);
          const create = this.createOscillator.bind(this);
          this.createOscillator = () => {
            const oscillator = create(), start = oscillator.start.bind(oscillator);
            const setFrequency = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
            oscillator.frequency.setValueAtTime = (frequency, at) => {
              oscillator.firstFrequency ??= frequency;
              return setFrequency(frequency, at);
            };
            oscillator.start = (...args) => {
              skipProbe.notes.push({ type: oscillator.type, frequency: oscillator.firstFrequency ?? oscillator.frequency.value });
              skipProbe.live++;
              return start(...args);
            };
            oscillator.addEventListener('ended', () => skipProbe.live--, { once: true });
            return oscillator;
          };
        }
      };
    });
    await page.goto(origin, { waitUntil: 'networkidle' });

    // A fast straight flick: pointer down, four quick samples inside the skip
    // window, then release — the same gesture a finger makes skipping a stone.
    await page.mouse.move(96, 430);
    await page.mouse.down();
    for (const x of [126, 156, 186, 216]) {
      await page.mouse.move(x, 430);
      await page.waitForTimeout(13);
    }
    await page.mouse.up();
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.skipEvents || 0) > 0, null, { timeout: 3000 });

    const result = await page.evaluate(() => {
      const skip = window.skipProbe.notes.filter(note => note.type === 'sine');
      let pair = null;
      for (const a of skip) {
        const octave = skip.find(b => Math.abs(b.frequency / a.frequency - 2) < .001);
        if (octave) { pair = [a.frequency, octave.frequency]; break; }
      }
      return {
        notes: window.skipProbe.notes,
        pair,
        events: Number(document.querySelector('#pond').dataset.skipEvents),
        pool: Number(document.querySelector('#pond').dataset.skipVoices),
        peak: Number(document.querySelector('#pond').dataset.peakSkipVoices),
        status: document.querySelector('#status').textContent
      };
    });

    assert.ok(result.events >= 1, 'a fast straight flick must send the pebble skipping');
    assert.ok(result.peak >= 1 && result.peak <= 4, 'the skip enters the existing bounded transient budget');
    assert.ok(result.pair, `the pebble answers with a fundamental and an exact octave: ${JSON.stringify(result.notes)}`);
    assert.ok(result.notes.every(note => note.type !== 'triangle'), 'no triangle pitch sweep remains in the skip voice');
    assert.ok(!('startFrequency' in (await page.evaluate(() => PondMusic.stoneSkip(440, .3, .5, 0)))),
      'the skip plan no longer carries a falling sweep');
    await page.screenshot({ path: path.join(root, 'output/pond-piano/stone-skip-63.png') });

    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.skipVoices || 0) === 0, null, { timeout: 6000 });
    await page.waitForFunction(() => window.skipProbe.live === 0, null, { timeout: 6000 });
    assert.deepEqual(errors, []);
    console.log({ result, screenshot: 'output/pond-piano/stone-skip-63.png', errors });
  } finally { await browser?.close(); await closeServer(server); }
})().catch(error => { console.error(error); process.exitCode = 1; });