'use strict';
// Iteration 0052: three held voices must gather once into a shared audible
// and visible bloom, stay latched while membership is unchanged, then rearm
// only when the chord itself changes.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const { closeServer, createStaticServer, listenOnLoopback } = require('../electron/static-server.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'pond-piano', 'chord-bloom-52.png');

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

    const dispatch = (type, id, x, y) => page.evaluate(({ type, id, x, y }) => {
      const canvas = document.querySelector('#pond');
      canvas.dispatchEvent(new PointerEvent(type, {
        pointerId: id, pointerType: 'touch', isPrimary: false,
        clientX: x, clientY: y, pressure: type === 'pointerup' ? 0 : .5,
        button: 0, buttons: type === 'pointerup' ? 0 : 1,
        bubbles: true, cancelable: true
      }));
    }, { type, id, x, y });

    // One trusted pointer unlocks Web Audio; two independent synthetic touch
    // pointers exercise the exact multi-pointer product path afterward.
    await page.mouse.move(72, 360);
    await page.mouse.down();
    await dispatch('pointerdown', 42, 195, 520);
    await dispatch('pointerdown', 43, 318, 350);
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 3);
    const rippleBaseline = await page.locator('#pond').getAttribute('data-ripple-events');
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.chordBloomEvents || 0) === 1,
      null, { timeout: 2500 });
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.chordBloomVoices || 0) === 1);
    await page.waitForTimeout(180);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await page.locator('#pond').screenshot({ path: OUT });

    const first = await page.evaluate(() => {
      const pond = document.querySelector('#pond');
      return {
        voices: Number(pond.dataset.audioVoices || 0),
        bloomEvents: Number(pond.dataset.chordBloomEvents || 0),
        bloomVoices: Number(pond.dataset.chordBloomVoices || 0),
        bloomVisuals: Number(pond.dataset.chordBlooms || 0),
        ripples: Number(pond.dataset.rippleEvents || 0),
        score: Number(pond.dataset.scoreMemories || 0)
      };
    });
    await page.waitForTimeout(240);
    const unchangedEvents = Number(await page.locator('#pond').getAttribute('data-chord-bloom-events'));

    // Break the first membership, let its transient leave, then form a new
    // three-note chord. The changed membership earns exactly one new bloom.
    await dispatch('pointerup', 42, 195, 520);
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.chordBloomVoices || 0) === 0,
      null, { timeout: 2500 });
    await dispatch('pointerdown', 44, 205, 245);
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 3);
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.chordBloomEvents || 0) === 2,
      null, { timeout: 2500 });
    await page.waitForTimeout(220);
    const changedEvents = Number(await page.locator('#pond').getAttribute('data-chord-bloom-events'));

    await dispatch('pointerup', 43, 318, 350);
    await dispatch('pointerup', 44, 205, 245);
    await page.mouse.up();
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 0,
      null, { timeout: 4000 });
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.chordBloomVoices || 0) === 0,
      null, { timeout: 3000 });
    const ended = await page.evaluate(() => ({
      voices: Number(document.querySelector('#pond').dataset.audioVoices || 0),
      bloomVoices: Number(document.querySelector('#pond').dataset.chordBloomVoices || 0)
    }));

    const checks = [
      ['three independent sustain voices held', first.voices === 3, JSON.stringify(first)],
      ['one audible and visible chord bloom opened', first.bloomEvents === 1 && first.bloomVoices === 1 && first.bloomVisuals === 1, JSON.stringify(first)],
      ['bloom created no child ripple or score entry', first.ripples === Number(rippleBaseline) && first.score === 0, `${rippleBaseline} -> ${first.ripples}; score=${first.score}`],
      ['unchanged membership stayed latched', unchangedEvents === 1, String(unchangedEvents)],
      ['changed chord membership rearmed exactly once', changedEvents === 2, String(changedEvents)],
      ['all sustain and bloom voices released', ended.voices === 0 && ended.bloomVoices === 0, JSON.stringify(ended)],
      ['no runtime or console errors', errors.length === 0, errors.join('; ')]
    ];
    const failed = checks.filter(([, ok]) => !ok);
    console.log(JSON.stringify({
      iteration: '0052-chord-bloom-smoke', origin, screenshot: OUT,
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
