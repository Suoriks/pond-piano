'use strict';
// Production shell, real keyboard/Web Audio contract for the keyboard chord.
// The chord plane validates the trio; this proves the keyboard route opens
// two companion currents and reaches the same bounded flower, then closes.
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
    await page.keyboard.down('h');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '3', null, { timeout: 12000 });
    const opened = await page.locator('#status').textContent();
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.chordBloomEvents || 0) >= 1, null, { timeout: 12000 });
    const bloomVoices = await data('chordBloomVoices');
    const blooms = await data('chordBlooms');
    await page.screenshot({ path: path.join(root, 'output/pond-piano/keyboard-chord-67.png') });
    await page.keyboard.up('h');
    await page.keyboard.up('Space');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '0', null, { timeout: 15000 });
    assert.equal(await data('chordBloomEvents'), '1', 'a held keyboard trio opens exactly one flower');
    assert.equal(await data('chordBloomVoices'), '0', 'the flower pool drains back to zero');
    assert.equal(bloomVoices, '1', 'the flower is alive while the trio is held');
    assert.match(opened, /соседних течения открылись/, 'the keyboard player is told the companions opened');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      chordBloomEvents: 1, bloomVoices, blooms, voicesAfter: '0',
      statusOnOpen: opened, errors, screenshot: 'output/pond-piano/keyboard-chord-67.png'
    }, null, 2));
  } finally { await browser.close(); await closeServer(server); }
})().catch(error => { console.error(error); process.exitCode = 1; });