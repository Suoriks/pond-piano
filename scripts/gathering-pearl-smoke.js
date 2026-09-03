'use strict';
// Iteration 0053: two safely separated live touch currents moving inward
// must gather once into an audible and visible pearl, without making a child
// ripple, sustain voice or score entry while the pair stays down.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const { closeServer, createStaticServer, listenOnLoopback } = require('../electron/static-server.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'pond-piano', 'gathering-pearl-53.png');

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

    // A trusted click unlocks Web Audio. Let its release tail leave before the
    // synthetic multi-touch pair exercises the exact Pointer Events path.
    await page.mouse.click(195, 650);
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 0,
      null, { timeout: 4000 });

    const dispatch = (type, id, x, y) => page.evaluate(({ type, id, x, y }) => {
      const canvas = document.querySelector('#pond');
      canvas.dispatchEvent(new PointerEvent(type, {
        pointerId: id, pointerType: 'touch', isPrimary: false,
        clientX: x, clientY: y, pressure: type === 'pointerup' ? 0 : .5,
        button: 0, buttons: type === 'pointerup' ? 0 : 1,
        bubbles: true, cancelable: true
      }));
    }, { type, id, x, y });

    const baseline = await page.evaluate(() => {
      const pond = document.querySelector('#pond');
      return {
        ripples: Number(pond.dataset.rippleEvents || 0),
        score: Number(pond.dataset.scoreMemories || 0)
      };
    });
    await dispatch('pointerdown', 42, 70, 420);
    await dispatch('pointerdown', 43, 320, 420);
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 2);
    await page.waitForTimeout(270);
    for (const [left, right] of [[105, 285], [135, 255], [165, 225]]) {
      await dispatch('pointermove', 42, left, 425);
      await dispatch('pointermove', 43, right, 415);
      await page.waitForTimeout(34);
    }
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.gatheringPearlEvents || 0) === 1,
      null, { timeout: 2500 });
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.gatheringPearlVoices || 0) === 1);
    await page.waitForTimeout(130);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await page.locator('#pond').screenshot({ path: OUT });

    const gathered = await page.evaluate(baseline => {
      const pond = document.querySelector('#pond');
      return {
        sustainVoices: Number(pond.dataset.audioVoices || 0),
        pearlEvents: Number(pond.dataset.gatheringPearlEvents || 0),
        pearlVoices: Number(pond.dataset.gatheringPearlVoices || 0),
        peakPearlVoices: Number(pond.dataset.peakGatheringPearlVoices || 0),
        pearlVisuals: Number(pond.dataset.gatheringPearls || 0),
        childRipples: Number(pond.dataset.rippleEvents || 0) - baseline.ripples - 2,
        scoreDelta: Number(pond.dataset.scoreMemories || 0) - baseline.score
      };
    }, baseline);

    // More inward movement with unchanged membership must stay latched.
    await dispatch('pointermove', 42, 175, 424);
    await dispatch('pointermove', 43, 215, 416);
    await page.waitForTimeout(260);
    const unchangedEvents = Number(await page.locator('#pond').getAttribute('data-gathering-pearl-events'));

    await dispatch('pointerup', 42, 175, 424);
    await dispatch('pointerup', 43, 215, 416);
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 0,
      null, { timeout: 4000 });
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.gatheringPearlVoices || 0) === 0,
      null, { timeout: 3000 });
    const ended = await page.evaluate(() => ({
      voices: Number(document.querySelector('#pond').dataset.audioVoices || 0),
      pearlVoices: Number(document.querySelector('#pond').dataset.gatheringPearlVoices || 0)
    }));

    const checks = [
      ['two independent sustain voices stayed live', gathered.sustainVoices === 2, JSON.stringify(gathered)],
      ['one audible and visible gathering pearl formed', gathered.pearlEvents === 1 && gathered.peakPearlVoices === 1 && gathered.pearlVisuals === 1, JSON.stringify(gathered)],
      ['the pearl made no child ripple or score entry', gathered.childRipples === 0 && gathered.scoreDelta === 0, JSON.stringify(gathered)],
      ['unchanged pair stayed latched', unchangedEvents === 1, String(unchangedEvents)],
      ['sustain and pearl pools released cleanly', ended.voices === 0 && ended.pearlVoices === 0, JSON.stringify(ended)],
      ['no runtime or console errors', errors.length === 0, errors.join('; ')]
    ];
    const failed = checks.filter(([, ok]) => !ok);
    console.log(JSON.stringify({
      iteration: '0053-gathering-pearl-smoke', origin, screenshot: OUT,
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
