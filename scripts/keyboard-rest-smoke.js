'use strict';
// Production shell: the water shows a sighted keyboard player where they
// stand — a quiet resting light at the chosen bowl and depth — before any
// strike, without starting the audio system, moving with the arrows, and
// yielding to the real contact light the moment a note sounds.
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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    // The keyboard map stays closed in this proof: it is a different layer.
    await page.addInitScript(() => {
      try { localStorage.setItem('pond-piano.legend-intro.v1', 'seen'); } catch {}
    });
    await page.goto(url, { waitUntil: 'networkidle' });

    const state = () => page.evaluate(() => {
      const canvas = document.querySelector('#pond');
      return {
        rest: canvas.dataset.keyboardRest,
        at: canvas.dataset.keyboardRestAt || '',
        audioState: canvas.dataset.audioState || 'uninitialized',
        active: document.activeElement?.id || ''
      };
    });
    const patch = (nx, ny, r = 8) => page.evaluate(([nx, ny, r]) => {
      const canvas = document.querySelector('#pond');
      const g = canvas.getContext('2d');
      const x = Math.max(0, Math.round(nx * canvas.width) - r);
      const y = Math.max(0, Math.round(ny * canvas.height) - r);
      const data = g.getImageData(x, y, r * 2, r * 2).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      return sum / (data.length / 4);
    }, [nx, ny, r]);

    // Before the player arrives: no mark, and no audio system invented.
    const calm = await state();
    assert.equal(calm.rest, '0', 'quiet water shows no resting light');
    assert.equal(calm.audioState, 'uninitialized', 'the mark must not start the audio system early');
    const centerBefore = await patch(.5, .52);

    // The first honest keyboard visit: the water shows where the keyboard
    // stands, and it does so without a single sound.
    await page.keyboard.press('Tab');
    assert.equal((await state()).active, 'pond');
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.keyboardRest) > .2);
    const shown = await state();
    assert.equal(shown.at, '0.500,0.520', 'the mark sits at the chosen bowl and depth');
    assert.equal(shown.audioState, 'uninitialized', 'showing the position must not start the audio system');
    await page.waitForTimeout(520);
    const centerAfter = await patch(.5, .52);
    assert.ok(centerAfter - centerBefore > 8,
      `the resting light must be visible on the water (${centerBefore.toFixed(1)} -> ${centerAfter.toFixed(1)})`);

    await page.screenshot({ path: path.join(root, 'output/pond-piano/keyboard-rest-71.png') });

    // The arrows carry the mark with them: eight steps right move it, and the
    // light really is at the new bowl rather than the old one.
    for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(160);
    const moved = await state();
    const [mx, my] = moved.at.split(',').map(Number);
    assert.ok(mx > .6, `eight steps right must move the mark (at ${moved.at})`);
    const newSpot = await patch(mx, my);
    const oldSpot = await patch(.5, .52);
    assert.ok(newSpot - oldSpot > 6,
      `the light must travel with the chosen bowl (new ${newSpot.toFixed(1)} vs old ${oldSpot.toFixed(1)})`);

    // A real strike takes over: the resting light yields to the contact light.
    await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioState === 'running');
    await page.waitForTimeout(320);
    assert.equal((await state()).rest, '0', 'a sounding keyboard voice replaces the resting light');
    await page.keyboard.up('Space');
    await page.waitForTimeout(180);
    assert.ok(Number((await state()).rest) > .2,
      'the player is still standing there, so the resting light returns once the note departs');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '0');

    // Leaving the water takes the light with it.
    await page.evaluate(() => document.querySelector('#pond').blur());
    await page.waitForTimeout(140);
    assert.equal((await state()).rest, '0', 'unfocused water shows no resting light');
    assert.ok(await page.evaluate(() => !('keyboardRestAt' in document.querySelector('#pond').dataset)),
      'a mark left behind must not lie about a position nobody holds');

    // Reduced motion keeps the mark, still.
    const stillPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    stillPage.on('pageerror', e => errors.push(String(e)));
    stillPage.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await stillPage.addInitScript(() => {
      try { localStorage.setItem('pond-piano.legend-intro.v1', 'seen'); } catch {}
    });
    await stillPage.goto(url, { waitUntil: 'networkidle' });
    await stillPage.keyboard.press('Tab');
    // Let the calm arrival finish first: the ring must hold still once it is
    // there, not keep drifting like the open-water breath.
    await stillPage.waitForFunction(() => document.querySelector('#pond').dataset.keyboardRest === '0.440');
    const alphaA = await stillPage.evaluate(() => document.querySelector('#pond').dataset.keyboardRest);
    await stillPage.waitForTimeout(400);
    const alphaB = await stillPage.evaluate(() => document.querySelector('#pond').dataset.keyboardRest);
    assert.equal(alphaA, alphaB, 'reduced motion holds one still ring instead of breathing');

    assert.deepEqual(errors, [], `no console or page errors: ${errors.join(' | ')}`);
    console.log('keyboard-rest-smoke: all checks passed');
  } finally {
    await browser.close();
    await closeServer(server);
  }
})().catch(error => { console.error(error); process.exit(1); });