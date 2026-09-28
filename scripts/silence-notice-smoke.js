'use strict';
// Production shell: the water never pretends about sound. Before the player
// asks, nothing is said; when a genuine gesture cannot wake the pond (a device
// that gives the browser no Web Audio, or a wake the browser refuses) one calm
// line appears for the eye and the live region alike, the water stays playable,
// and the ordinary "voices are full" fallback never overwrites that honesty.
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
    const errors = [];
    const watch = page => {
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    };

    const state = page => page.evaluate(() => {
      const line = document.querySelector('#water-silence');
      const cs = getComputedStyle(line);
      return {
        audioState: document.querySelector('#pond').dataset.audioState || 'uninitialized',
        trouble: document.querySelector('#pond').dataset.audioTrouble || '',
        text: line.textContent || '',
        shown: line.classList.contains('is-shown') && Number(cs.opacity) > .5 && cs.visibility !== 'hidden',
        status: document.querySelector('#status').textContent || ''
      };
    });
    const patch = (page, nx, ny, r = 8) => page.evaluate(([nx, ny, r]) => {
      const canvas = document.querySelector('#pond');
      const g = canvas.getContext('2d');
      const x = Math.max(0, Math.round(nx * canvas.width) - r);
      const y = Math.max(0, Math.round(ny * canvas.height) - r);
      const data = g.getImageData(x, y, r * 2, r * 2).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      return sum / (data.length / 4);
    }, [nx, ny, r]);

    // ---- A device without Web Audio at all ---------------------------------
    const blind = await browser.newPage({ viewport: { width: 390, height: 844 } });
    watch(blind);
    await blind.addInitScript(() => {
      try { localStorage.setItem('pond-piano.legend-intro.v1', 'seen'); } catch {}
      Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true });
      Object.defineProperty(window, 'webkitAudioContext', { value: undefined, configurable: true });
    });
    await blind.goto(url, { waitUntil: 'networkidle' });

    // Before any gesture: silence is expected, not a failure.
    const before = await state(blind);
    assert.equal(before.audioState, 'uninitialized', 'loading must not create audio');
    assert.equal(before.shown, false, 'the pond says nothing before the player asks');
    assert.equal(before.text, '', 'no stale silence line on a fresh visit');
    assert.equal(before.status, 'Пруд ждёт касания', 'the default status is untouched');

    // A real gesture that cannot wake the water: the pond admits it plainly.
    await blind.keyboard.press('Tab');
    const centerBefore = await patch(blind, .5, .52);
    await blind.keyboard.press('Space');
    await blind.waitForFunction(() => document.querySelector('#pond').dataset.audioTrouble === 'hard');
    await blind.waitForFunction(() => Number(getComputedStyle(document.querySelector('#water-silence')).opacity) > .5);
    const troubled = await state(blind);
    assert.equal(troubled.audioState, 'uninitialized', 'no context can exist on this device');
    assert.match(troubled.text, /молча/, 'the eye is told this water is silent');
    assert.equal(troubled.shown, true, 'the silence line is really visible, not just in the DOM');
    assert.equal(troubled.status, troubled.text, 'the live region speaks the same words as the eye reads');
    assert.ok(!/голосов/.test(troubled.status), 'the ordinary fallback must never overwrite an honest silence');

    // The water still plays: the strike really landed a visible contact.
    await blind.waitForTimeout(220);
    const centerAfter = await patch(blind, .5, .52);
    assert.ok(centerAfter - centerBefore > 6,
      `the pond must stay playable without sound (${centerBefore.toFixed(1)} -> ${centerAfter.toFixed(1)})`);
    await blind.screenshot({ path: path.join(root, 'output/pond-piano/silence-notice-72-unsupported.png') });

    // ---- A wake the browser refuses ---------------------------------------
    const refused = await browser.newPage({ viewport: { width: 390, height: 844 } });
    watch(refused);
    await refused.addInitScript(() => {
      try { localStorage.setItem('pond-piano.legend-intro.v1', 'seen'); } catch {}
      // A browser that keeps the context asleep and refuses the wake: the honest
      // real-world failure (iOS/Android background resume). Node factories are
      // the real ones, so the quiet attempt is genuine and only the wake fails.
      const Real = window.AudioContext || window.webkitAudioContext;
      class RefusingContext extends Real {
        get state() { return 'suspended'; }
        resume() { return Promise.reject(new Error('the browser refuses to wake')); }
        addEventListener() {}
        removeEventListener() {}
      }
      Object.defineProperty(window, 'AudioContext', { value: RefusingContext, configurable: true });
      Object.defineProperty(window, 'webkitAudioContext', { value: RefusingContext, configurable: true });
    });
    await refused.goto(url, { waitUntil: 'networkidle' });
    await refused.keyboard.press('Tab');
    await refused.keyboard.press('Space');
    await refused.waitForFunction(() => document.querySelector('#pond').dataset.audioTrouble === 'soft');
    await refused.waitForFunction(() => Number(getComputedStyle(document.querySelector('#water-silence')).opacity) > .5);
    const soft = await state(refused);
    assert.equal(soft.shown, true, 'a refused wake is said softly, not hidden');
    assert.match(soft.text, /коснитесь воды ещё раз/, 'a failed wake invites another honest try');
    assert.equal(soft.status, soft.text, 'the refused wake is spoken as well as shown');
    assert.equal(soft.audioState, 'suspended', 'a refused wake leaves the context asleep, not running');
    await refused.screenshot({ path: path.join(root, 'output/pond-piano/silence-notice-72-refused.png') });

    assert.deepEqual(errors, [], `no console or page errors: ${errors.join(' | ')}`);
    console.log('silence-notice-smoke: all checks passed');
  } finally {
    await browser.close();
    await closeServer(server);
  }
})().catch(error => { console.error(error); process.exit(1); });