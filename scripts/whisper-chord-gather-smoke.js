'use strict';
// Iteration 0054: the water whisper now teaches the two newest gestures.
// A real 3-voice chord that blooms once earns the "water flower" lesson, and
// a real two-finger gathering that forms a pearl earns the "pearl" lesson -
// each once per session, after the honest calm pause, never while a hand is
// still down. Release tails keep the engine busy, so the browser layer must
// retire an earned flag only when a whisper is actually accepted; releasing
// fingers one after another therefore lets the LAST finger of the group speak.
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const { closeServer, createStaticServer, listenOnLoopback } = require('../electron/static-server.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'pond-piano', 'whisper-chord-gather-54.png');

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

    const alpha = () => page.evaluate(() => Number(document.querySelector('#pond').dataset.whisperAlpha ?? '-1'));
    const statusText = () => page.locator('#status').textContent();
    const eyebrow = (await page.locator('.eyebrow').textContent()).trim();
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok, detail });

    // A trusted click unlocks Web Audio and marks the pond played; let its
    // release tail leave so the synthetic multi-touch is the only activity.
    await page.mouse.click(195, 650);
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 0,
      null, { timeout: 4000 });
    check('quiet before the chord', (await alpha()) === 0);

    // Real chord: three held touch voices bloom once into the shared flower.
    await dispatch('pointerdown', 11, 130, 560);
    await dispatch('pointerdown', 12, 195, 420);
    await dispatch('pointerdown', 13, 270, 560);
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 3);
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.chordBloomEvents || 0) === 1,
      null, { timeout: 3500 });
    // Release one finger at a time: the first two are declined while a hand
    // is still down, the last release must be the one that speaks.
    await dispatch('pointerup', 11, 130, 560);
    await page.waitForTimeout(90);
    await dispatch('pointerup', 12, 195, 420);
    await page.waitForTimeout(90);
    await dispatch('pointerup', 13, 270, 560);
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.whisperAlpha || 0) > .3,
      null, { timeout: 2500 });
    const chordAlpha = await alpha();
    const chordStatus = await statusText();
    check('chord bloom earns its flower whisper', chordAlpha > .3, `alpha=${chordAlpha}`);
    check('flower whisper names the shared bloom', chordStatus.includes('цветок'), chordStatus);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await page.locator('#pond').screenshot({ path: OUT });

    // The calm pause: the pearl lesson may only speak after it.
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.whisperAlpha || 0) === 0,
      null, { timeout: 12000 });
    await page.waitForTimeout(scoreWhisperPauseMs());

    // Real gathering: two independent voices converge into one pearl.
    await dispatch('pointerdown', 21, 70, 420);
    await dispatch('pointerdown', 22, 320, 420);
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 2);
    await page.waitForTimeout(270);
    for (const [left, right] of [[105, 285], [135, 255], [165, 225]]) {
      await dispatch('pointermove', 21, left, 425);
      await dispatch('pointermove', 22, right, 415);
      await page.waitForTimeout(34);
    }
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.gatheringPearlEvents || 0) === 1,
      null, { timeout: 2500 });
    await dispatch('pointerup', 21, 165, 425);
    await page.waitForTimeout(90);
    await dispatch('pointerup', 22, 225, 415);
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.whisperAlpha || 0) > .3,
      null, { timeout: 2500 });
    const gatherAlpha = await alpha();
    const gatherStatus = await statusText();
    check('gathering earns its pearl whisper', gatherAlpha > .3, `alpha=${gatherAlpha}`);
    check('pearl whisper names the gathering', gatherStatus.includes('жемчужина'), gatherStatus);

    // One per session: a second gathering must not re-whisper.
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.whisperAlpha || 0) === 0,
      null, { timeout: 12000 });
    await page.waitForTimeout(scoreWhisperPauseMs());
    await dispatch('pointerdown', 31, 70, 420);
    await dispatch('pointerdown', 32, 320, 420);
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.audioVoices || 0) === 2);
    await page.waitForTimeout(270);
    for (const [left, right] of [[105, 285], [135, 255], [165, 225]]) {
      await dispatch('pointermove', 31, left, 425);
      await dispatch('pointermove', 32, right, 415);
      await page.waitForTimeout(34);
    }
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.gatheringPearlEvents || 0) >= 2,
      null, { timeout: 2500 });
    await dispatch('pointerup', 31, 165, 425);
    await page.waitForTimeout(90);
    await dispatch('pointerup', 32, 225, 415);
    await page.waitForTimeout(700);
    check('a second gathering stays whisper-silent', (await alpha()) === 0, `alpha=${await alpha()}`);

    await browser.close();
    await closeServer(server);

    const failed = checks.filter(c => !c.ok);
    console.log(JSON.stringify({
      iteration: '0054-whisper-chord-gather-smoke',
      eyebrow,
      passed: checks.length - failed.length,
      failed: failed.length,
      failures: failed,
      errors: errors.length,
      checks
    }, null, 2));
    process.exit(failed.length || errors.length ? 1 : 0);
  } catch (error) {
    console.error(error);
    try { await closeServer(server); } catch {}
    process.exit(1);
  }
})().catch(error => { console.error(error); process.exit(1); });

// The whisper's honest calm pause lives in pond-score.js as WHISPER_PAUSE_MS
// (16000). Duplicated here so the smoke never needs the module internals; the
// margin keeps the second gesture strictly outside the pause window.
function scoreWhisperPauseMs() {
  return 16300;
}