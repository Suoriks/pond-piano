'use strict';
// Production shell: the keyboard map introduces itself exactly once to a
// keyboard visitor, without stealing focus from the water, and any real
// gesture dismisses it for good on this device.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const chromePath = require('./chrome-path');
const { createStaticServer, listenOnLoopback, closeServer } = require('../electron/static-server');
const a11y = require('../pond-a11y.js');

(async () => {
  const root = path.resolve(__dirname, '..');
  const server = createStaticServer(root), url = await listenOnLoopback(server);
  const browser = await chromium.launch({
    executablePath: chromePath(),
    headless: true, args: ['--no-sandbox', '--disable-gpu']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'networkidle' });

    const state = () => page.evaluate(() => ({
      open: document.querySelector('#legend-control').classList.contains('is-open'),
      expanded: document.querySelector('#legend-trigger').getAttribute('aria-expanded'),
      visibility: getComputedStyle(document.querySelector('#legend-panel')).visibility,
      active: document.activeElement?.id || document.activeElement?.tagName || '',
      stored: localStorage.getItem('pond-piano.legend-intro.v1'),
      status: document.querySelector('#status').textContent
    }));

    // Nothing opens before the player arrives.
    assert.equal((await state()).open, false);
    assert.equal(a11y.shouldIntroduceLegend({ keyboardVisit: true, seen: false }), true);

    // A pointer press on the water never summons the keyboard map.
    await page.locator('#pond').click({ position: { x: 120, y: 300 } });
    await page.waitForTimeout(150);
    assert.equal((await state()).open, false, 'a pointer player must not be interrupted');

    // The first honest keyboard visit lets the map introduce itself, but focus
    // stays on the water so the player keeps playing.
    await page.reload({ waitUntil: 'networkidle' });
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'pond');
    await page.waitForFunction(() => document.querySelector('#legend-control').classList.contains('is-open'));
    const intro = await state();
    assert.equal(intro.open, true);
    assert.equal(intro.expanded, 'true');
    assert.equal(intro.visibility, 'visible');
    assert.equal(intro.active, 'pond', 'the introduction must not steal focus from the water');
    assert.equal(intro.stored, 'seen', 'showing it once must mark it seen');
    assert.match(intro.status, /Карта клавиш открылась сама/);

    await page.waitForTimeout(420);
    await page.screenshot({ path: path.join(root, 'output/pond-piano/keyboard-legend-intro-69.png') });

    // A real gesture dismisses the guest: the arrow moves the chosen bowl and
    // closes the map in the same keystroke.
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => !document.querySelector('#legend-control').classList.contains('is-open'));
    assert.equal((await state()).expanded, 'false');

    // It does not come back on the next keyboard visit: the device has been
    // taught. Re-focusing the water is a real focus event, not a red herring.
    await page.evaluate(() => document.querySelector('#pond').focus());
    await page.waitForTimeout(150);
    assert.equal((await state()).open, false, 'the introduction must not repeat in the same session');

    // Nor after a reload: the flag lives on the device.
    await page.reload({ waitUntil: 'networkidle' });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
    assert.equal((await state()).open, false, 'the introduction must not return after a reload');

    // The explicit map still works after the introduction: "?" opens it and
    // moves focus inside as before.
    await page.keyboard.press('?');
    await page.waitForFunction(() => document.querySelector('#legend-control').classList.contains('is-open'));
    assert.equal((await state()).active, 'legend-close');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#legend-control').classList.contains('is-open'));

    // The water is unharmed: the keyboard still strikes a bowl.
    await page.evaluate(() => document.querySelector('#pond').focus());
    await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '1');
    await page.keyboard.up('Space');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '0', null, { timeout: 12000 });

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      introduced: intro, storedKey: a11y.legendIntroKey(), finalVoices: '0', errors,
      screenshot: 'output/pond-piano/keyboard-legend-intro-69.png'
    }, null, 2));
  } finally { await browser.close(); await closeServer(server); }
})().catch(error => { console.error(error); process.exitCode = 1; });