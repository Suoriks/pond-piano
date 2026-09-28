'use strict';
// Production shell, real keyboard/Web Audio contract for the keyboard gather.
// The touch pair is validated by the gesture layer; this proves the keyboard
// route reaches the same pearl (one event, bounded pool) and closes cleanly.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const chromePath = require('./chrome-path');
const { createStaticServer, listenOnLoopback, closeServer } = require('../electron/static-server');

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
    const pond = page.locator('#pond');
    const data = key => page.evaluate(name => document.querySelector('#pond').dataset[name] ?? null, key);
    await pond.focus();
    await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '1', null, { timeout: 12000 });
    const heldPitch = await data('bowlPitch');
    await page.keyboard.down('g');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '2', null, { timeout: 12000 });
    const opened = await page.locator('#status').textContent();
    const shadowPitch = await data('bowlPitch');
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.gatheringPearlEvents || 0) >= 1, null, { timeout: 12000 });
    const following = await data('gatheringPearlVoices');
    await page.screenshot({ path: path.join(root, 'output/pond-piano/keyboard-gather-66.png') });
    await page.keyboard.up('g');
    await page.keyboard.up('Space');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '0', null, { timeout: 15000 });
    assert.equal(await data('gatheringPearlEvents'), '1', 'one held keyboard pair gathers exactly one pearl');
    assert.equal(await data('peakGatheringPearlVoices'), '1', 'the pearl stays inside the bounded pool');
    assert.equal(following, '1', 'the pearl is alive while the currents close');
    assert.equal(await data('gatheringPearlVoices'), '0', 'the pearl pool drains back to zero');
    assert.match(opened, /Второе течение открылось/, 'the keyboard player is told the second current opened');
    assert.equal(heldPitch === shadowPitch, false, 'the second current sounds its own bowl of water');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      pearlEvents: 1, peakPearlVoices: 1, pearlVoicesAfter: '0', voicesAfter: '0',
      heldPitch, shadowPitch, statusOnOpen: opened, errors,
      screenshot: 'output/pond-piano/keyboard-gather-66.png'
    }, null, 2));
  } finally { await browser.close(); await closeServer(server); }
})().catch(error => { console.error(error); process.exitCode = 1; });