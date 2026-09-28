'use strict';
// Production shell: where the platform has an actuator, the pond answers the
// hand as well as the ear. One real touch earns one short pulse sized by the
// strike itself; reduced motion stills the answer, a fast series cannot buzz,
// the pond's own diary replay never buzzes (it is not the player's hand), and
// a platform without navigator.vibrate simply hears nothing. The audio rules
// are untouched: still no sound before the first explicit gesture.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const { createStaticServer, listenOnLoopback, closeServer } = require('../electron/static-server');

const CHROME = require('./chrome-path')();

const SEED = () => {
  try { localStorage.setItem('pond-piano.legend-intro.v1', 'seen'); } catch {}
  try {
    const epoch = Date.now();
    const line = (ageMs, durationMs, depth, pressure, pitch, points) => ({
      born: epoch - ageMs, durationMs, depth, pressure, pitch,
      points: points.map(([x, y]) => ({ x, y, pressure }))
    });
    localStorage.setItem('pond-piano.diary.v1', JSON.stringify({
      v: 1, savedAt: epoch,
      lines: [
        line(6000, 1200, .25, .5, .18, [[.12, .3], [.28, .42], [.46, .5]]),
        line(4200, 900, .55, .42, .62, [[.55, .28], [.68, .46], [.79, .38]]),
        line(2400, 1400, .78, .6, .86, [[.3, .7], [.5, .62], [.72, .74]])
      ]
    }));
  } catch {}
};

// The shell owns navigator.vibrate; here we replace it with a recorder that
// keeps the exact patterns the pond asked for, without an actuator.
const RECORD_VIBRATE = () => {
  window.__vibrations = [];
  const record = pattern => { window.__vibrations.push(pattern); return true; };
  try { Object.defineProperty(Navigator.prototype, 'vibrate', { value: record, configurable: true, writable: true }); }
  catch { try { navigator.vibrate = record; } catch {} }
};

const read = page => page.evaluate(() => {
  const canvas = document.querySelector('#pond');
  return {
    vibrations: window.__vibrations.slice(),
    haptic: canvas.dataset.haptic,
    audioState: canvas.dataset.audioState || 'uninitialized',
    flushing: canvas.dataset.flushing || '0',
    phrases: Number(canvas.dataset.flushPhrases) || 0
  };
});

(async () => {
  const root = path.resolve(__dirname, '..');
  const server = createStaticServer(root), url = await listenOnLoopback(server);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const errors = [];
    const watch = page => {
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    };

    // ---- 1. Reduced motion stills the answer too -----------------------------
    const quiet = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, reducedMotion: 'reduce' });
    const still = await quiet.newPage();
    watch(still);
    await still.addInitScript(SEED);
    await still.addInitScript(RECORD_VIBRATE);
    await still.goto(url, { waitUntil: 'networkidle' });
    const stillBefore = await read(still);
    assert.equal(stillBefore.vibrations.length, 0, 'reduced motion answers nothing before the touch');
    await still.touchscreen.tap(195, 470);
    await still.waitForFunction(() => document.querySelector('#pond').dataset.audioState === 'running');
    const stilled = await read(still);
    assert.equal(stilled.audioState, 'running', 'reduced motion keeps the pond playable');
    assert.equal(stilled.vibrations.length, 0, 'reduced motion stills the tactile answer completely');
    assert.equal(stilled.haptic, '0', 'the stilled strike is recorded honestly');
    await quiet.close();

    // ---- 2. A real hand on a real strike ------------------------------------
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
    const page = await context.newPage();
    watch(page);
    await page.addInitScript(SEED);
    await page.addInitScript(RECORD_VIBRATE);
    await page.goto(url, { waitUntil: 'networkidle' });

    const before = await read(page);
    assert.equal(before.audioState, 'uninitialized', 'the pond must not sound before the first gesture');
    assert.equal(before.vibrations.length, 0, 'the water answers nothing before it is touched');
    assert.equal(before.haptic, undefined, 'no pulse is recorded before a real strike');

    await page.touchscreen.tap(195, 470);
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioState === 'running');
    const struck = await read(page);
    assert.equal(struck.vibrations.length, 1, `a real touch earns exactly one pulse (got ${struck.vibrations.length})`);
    const firstPulse = Number(struck.vibrations[0]);
    assert.ok(firstPulse >= 9 && firstPulse <= 24, `the pulse stays a short calm answer (got ${firstPulse})`);
    assert.equal(struck.haptic, String(firstPulse), 'the recorded probe matches the pattern the pond asked for');

    // A mouse over water has no actuator to answer, even on a touch device.
    await page.mouse.click(150, 400);
    const byMouse = await read(page);
    assert.equal(byMouse.vibrations.length, 1, 'a mouse strike does not buzz the hand');
    assert.equal(byMouse.haptic, '0', 'the mouse strike is recorded honestly as no answer');

    // Wait out the calm gap, then let a burst of three strikes land in the
    // same instant: the first is answered, the rest cannot buzz. All three are
    // fired synchronously so the gap is measured, not raced against.
    await page.waitForTimeout(140);
    const burst = await page.evaluate(() => {
      const canvas = document.querySelector('#pond');
      const fire = (x, y) => {
        const opts = { pointerId: 77, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: x, clientY: y, pressure: .6 };
        canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
        canvas.dispatchEvent(new PointerEvent('pointerup', opts));
      };
      const before = window.__vibrations.length;
      fire(200, 460); fire(205, 465); fire(210, 470);
      return { before, after: window.__vibrations.length };
    });
    assert.equal(burst.after - burst.before, 1, `a rapid burst cannot buzz continuously (${burst.after - burst.before} of 3 answered)`);
    const busy = await read(page);
    assert.equal(busy.haptic, '0', 'the suppressed strikes are recorded honestly as no answer');

    // ---- 3. The pond's own replay is not the player's hand -------------------
    await page.keyboard.press('r');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.flushing === '1');
    await page.waitForTimeout(900);
    const replaying = await read(page);
    assert.ok(replaying.phrases >= 1, 'the seeded chronicle is really replaying');
    assert.equal(replaying.vibrations.length, 2, 'the pond never buzzes the hand while it plays its own diary back');

    await page.screenshot({ path: path.join(root, 'output/pond-piano/haptics-78.png') });
    await context.close();

    assert.deepEqual(errors, [], `no console or page errors: ${errors.join(' | ')}`);
    console.log('haptics-smoke: all checks passed');
  } finally {
    await browser.close();
    await closeServer(server);
  }
})().catch(error => { console.error(error); process.exit(1); });