'use strict';
// Production shell, accessibility tree and real keyboard/Web Audio contract.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const { createStaticServer, listenOnLoopback, closeServer } = require('../electron/static-server');

(async () => {
  const root = path.resolve(__dirname, '..');
  const server = createStaticServer(root), url = await listenOnLoopback(server);
  const browser = await chromium.launch({
    executablePath: '/home/mfoadmin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
    headless: true, args: ['--no-sandbox', '--disable-gpu']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    // The keyboard map introduces itself once (0069); this proof is about the
    // bowl narration, so the map is already a stranger here.
    await page.addInitScript(() => {
      try { localStorage.setItem('pond-piano.legend-intro.v1', 'seen'); } catch {}
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Accessibility.enable');
    const tree = (await cdp.send('Accessibility.getFullAXTree')).nodes;
    const pond = tree.find(n => n.role?.value === 'application' && n.name?.value === 'Музыкальный пруд');
    assert.ok(pond && !pond.ignored, 'playable surface must be exposed, not inside aria-hidden');
    assert.match(pond.description?.value || '', /Стрелками выбирайте одну из 11 чаш/);
    assert.ok(tree.some(n => n.role?.value === 'radio' && !n.ignored), 'shore tuning remains reachable');
    assert.equal(await page.evaluate(() => document.querySelector('#pond').dataset.audioVoices || '0'), '0');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'pond');
    assert.equal(await page.locator('#pond').evaluate(el => el.matches(':focus-visible')), true);
    assert.equal(await page.locator('#pond').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    const status = () => page.locator('#status').textContent();
    assert.match(await status(), /Следующий удар: чаша 6 из 11, вода: средняя/);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    assert.match(await status(), /Следующий удар: чаша 7 из 11/);
    await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '1');
    const struck = await page.locator('#pond').getAttribute('data-bowl-pitch');
    assert.match(await status(), /Звучит чаша 7 из 11/);
    for (let n = 0; n < 4; n += 1) await page.keyboard.press('ArrowRight');
    const moving = await status();
    assert.match(moving, /Звучит чаша 7 из 11; её высота не меняется\. Следующий удар: чаша 8 из 11/);
    assert.equal(await page.locator('#pond').getAttribute('data-bowl-pitch'), struck);
    await page.screenshot({ path: path.join(root, 'output/pond-piano/keyboard-water-59.png') });
    await page.keyboard.up('Space');
    assert.match(await status(), /^Следующий удар: чаша 8 из 11/);
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '0', null, { timeout: 10000 });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ accessibilityRole: pond.role.value, description: pond.description.value, statusOnMove: moving, struckPitch: struck, finalVoices: '0', errors, screenshot: 'output/pond-piano/keyboard-water-59.png' }, null, 2));
  } finally { await browser.close(); await closeServer(server); }
})().catch(error => { console.error(error); process.exitCode = 1; });
