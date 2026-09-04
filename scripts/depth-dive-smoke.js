'use strict';
// Iteration 0056: after a true held rest, one quick downward stroke must
// fold the live current into one audible/visible low answer. The sustain
// voice stays alive and no child ripple or score memory is created.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const { closeServer, createStaticServer, listenOnLoopback } = require('../electron/static-server.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'pond-piano', 'depth-dive-56.png');

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

    await page.mouse.move(195, 300);
    await page.mouse.down();
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 1);
    await page.waitForTimeout(530);
    const baseline = await page.evaluate(() => {
      const pond = document.querySelector('#pond');
      return {
        ripples: Number(pond.dataset.rippleEvents || 0),
        score: Number(pond.dataset.scoreMemories || 0),
        pitch: Number(pond.dataset.glideWakePitch || 0)
      };
    });

    for (const y of [315, 335, 350]) {
      await page.mouse.move(195, y);
      await page.waitForTimeout(26);
    }
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.depthDiveEvents || 0) === 1,
      null, { timeout: 2000 });
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.depthDiveVoices || 0) === 1);
    await page.waitForTimeout(130);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await page.locator('#pond').screenshot({ path: OUT });

    const folded = await page.evaluate(baseline => {
      const pond = document.querySelector('#pond');
      return {
        events: Number(pond.dataset.depthDiveEvents || 0),
        transientVoices: Number(pond.dataset.depthDiveVoices || 0),
        sustainVoices: Number(pond.dataset.audioVoices || 0),
        visuals: Number(pond.dataset.depthDives || 0),
        childRipples: Number(pond.dataset.rippleEvents || 0) - baseline.ripples,
        scoreDelta: Number(pond.dataset.scoreMemories || 0) - baseline.score,
        pitch: Number(pond.dataset.glideWakePitch || 0)
      };
    }, baseline);

    // More motion in the same held contact must not retrigger the dive.
    for (const y of [365, 382, 400]) {
      await page.mouse.move(195, y);
      await page.waitForTimeout(35);
    }
    await page.waitForTimeout(580);
    const latchedEvents = Number(await page.locator('#pond').getAttribute('data-depth-dive-events'));
    const transientAfterTail = Number(await page.locator('#pond').getAttribute('data-depth-dive-voices'));
    const sustainAfterTail = Number(await page.locator('#pond').getAttribute('data-audio-voices'));
    await page.mouse.up();
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 0,
      null, { timeout: 4000 });
    const pointerReleasedVoices = Number(await page.locator('#pond').getAttribute('data-audio-voices'));

    // The same geometry is reachable without a pointer: hold the keyboard
    // voice at rest, then move down through repeated native ArrowDown steps.
    await page.locator('#pond').focus();
    await page.keyboard.down('Space');
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 1);
    await page.waitForTimeout(530);
    for (let index = 0; index < 3; index += 1) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(30);
    }
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.depthDiveEvents || 0) === 2,
      null, { timeout: 2000 });
    const keyboardFold = await page.evaluate(() => {
      const pond = document.querySelector('#pond');
      return {
        events: Number(pond.dataset.depthDiveEvents || 0),
        transientVoices: Number(pond.dataset.depthDiveVoices || 0),
        sustainVoices: Number(pond.dataset.audioVoices || 0)
      };
    });
    await page.keyboard.up('Space');
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 0,
      null, { timeout: 4000 });

    const checks = [
      ['one audible and visible depth fold formed', folded.events === 1 && folded.transientVoices === 1 && folded.visuals === 1, JSON.stringify(folded)],
      ['the original sustain voice stayed alive', folded.sustainVoices === 1 && sustainAfterTail === 1, JSON.stringify({ folded, sustainAfterTail })],
      ['the fold created no child ripple or score entry', folded.childRipples === 0 && folded.scoreDelta === 0, JSON.stringify(folded)],
      ['the held contact latched exactly one dive', latchedEvents === 1, String(latchedEvents)],
      ['the shared transient released before the sustain', transientAfterTail === 0 && sustainAfterTail === 1, JSON.stringify({ transientAfterTail, sustainAfterTail })],
      ['release cleaned the pointer sustain voice', pointerReleasedVoices === 0, String(pointerReleasedVoices)],
      ['keyboard hold plus ArrowDown reaches the same fold', keyboardFold.events === 2 && keyboardFold.transientVoices === 1 && keyboardFold.sustainVoices === 1, JSON.stringify(keyboardFold)],
      ['keyboard release cleaned the sustain voice', Number(await page.locator('#pond').getAttribute('data-audio-voices')) === 0, 'audio voice pool'],
      ['no runtime or console errors', errors.length === 0, errors.join('; ')]
    ];
    const failed = checks.filter(([, ok]) => !ok);
    console.log(JSON.stringify({
      iteration: '0056-depth-dive-smoke', origin, screenshot: OUT,
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
