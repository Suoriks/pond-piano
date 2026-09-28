'use strict';
// Production shell: coming back to the pond tells the truth about the water.
// Leaving for another window is not a failure - the pond itself sleeps the
// sound, and the return stays quiet until a real gesture cannot wake it. But
// water the browser closed while the player was away can never be woken by a
// touch, so the return says so at once (reload), in the same words the eye
// reads and the live region speaks, and never softens that truth into "touch
// to wake". The return path itself never starts or creates audio.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const { createStaticServer, listenOnLoopback, closeServer } = require('../electron/static-server');

const CHROME = require('./chrome-path')();

const RETURN_HARNESS = () => {
  try { localStorage.setItem('pond-piano.legend-intro.v1', 'seen'); } catch {}
  const Orig = window.AudioContext || window.webkitAudioContext;
  window.__ctxs = [];
  if (Orig) {
    const Sub = class extends Orig { constructor(...a) { super(...a); window.__ctxs.push(this); } };
    Object.defineProperty(window, 'AudioContext', { value: Sub, configurable: true });
    Object.defineProperty(window, 'webkitAudioContext', { value: Sub, configurable: true });
  }
  window.__vis = 'visible';
  Object.defineProperty(document, 'visibilityState', { get: () => window.__vis, configurable: true });
  window.__setVis = value => { window.__vis = value; document.dispatchEvent(new Event('visibilitychange')); };
};

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
    const read = page => page.evaluate(() => {
      const line = document.querySelector('#water-silence');
      const cs = getComputedStyle(line);
      return {
        state: document.querySelector('#pond').dataset.audioState || 'uninitialized',
        trouble: document.querySelector('#pond').dataset.audioTrouble || '',
        contexts: window.__ctxs.length,
        ctxStates: window.__ctxs.map(c => c.state).join(','),
        text: line.textContent || '',
        shown: line.classList.contains('is-shown') && Number(cs.opacity) > .5 && cs.visibility !== 'hidden',
        tone: line.classList.contains('is-hard') ? 'hard' : (line.classList.contains('is-shown') ? 'soft' : ''),
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
    const fresh = async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      watch(page);
      await page.addInitScript(RETURN_HARNESS);
      await page.goto(url, { waitUntil: 'networkidle' });
      return page;
    };

    // ---- An ordinary return: the pond is quiet about its own chosen sleep ---
    const quiet = await fresh();
    const beforeAsk = await read(quiet);
    assert.equal(beforeAsk.state, 'uninitialized', 'loading must not create audio');
    assert.equal(beforeAsk.text, '', 'a fresh visit says nothing');

    await quiet.keyboard.press('Tab');
    await quiet.keyboard.press('Space');
    await quiet.waitForFunction(() => document.querySelector('#pond').dataset.audioState === 'running');
    const played = await read(quiet);
    assert.equal(played.contexts, 1, 'the explicit gesture creates exactly one context');
    assert.equal(played.shown, false, 'sound that works says nothing about silence');
    assert.match(played.status, /Следующий удар/, 'a working pond keeps describing the next strike');

    await quiet.evaluate(() => window.__setVis('hidden'));
    await quiet.waitForFunction(() => document.querySelector('#pond').dataset.audioState === 'suspended');
    await quiet.evaluate(() => window.__setVis('visible'));
    await quiet.waitForTimeout(500);
    const returned = await read(quiet);
    assert.equal(returned.state, 'suspended', 'returning does not start audio by itself');
    assert.equal(returned.shown, false, 'the pond does not announce its own ordinary sleep');
    assert.equal(returned.text, '', 'no silence line on a plain return');
    assert.equal(returned.trouble, '', 'no trouble is claimed on a plain return');
    assert.equal(returned.contexts, 1, 'returning creates no second context');
    assert.match(returned.status, /Следующий удар/, 'the honest next-strike line survives the trip');
    assert.ok(!/уснул/.test(returned.status), 'a plain return must not tell the player the water slept');

    await quiet.keyboard.press('Space');
    await quiet.waitForFunction(() => document.querySelector('#pond').dataset.audioState === 'running');
    const woke = await read(quiet);
    assert.equal(woke.contexts, 1, 'the same context wakes, no duplicate');
    assert.equal(woke.shown, false, 'the water that woke says nothing about silence');
    assert.equal(woke.text, '', 'the line stays empty after a real wake');
    await quiet.screenshot({ path: path.join(root, 'output/pond-piano/return-quiet-74.png') });

    // ---- The browser closed the water while the player was away ------------
    const closed = await fresh();
    await closed.keyboard.press('Tab');
    await closed.keyboard.press('Space');
    await closed.waitForFunction(() => document.querySelector('#pond').dataset.audioState === 'running');
    await closed.evaluate(() => window.__setVis('hidden'));
    await closed.waitForFunction(() => document.querySelector('#pond').dataset.audioState === 'suspended');
    await closed.evaluate(() => window.__ctxs[0].close());
    await closed.waitForFunction(() => document.querySelector('#pond').dataset.audioState === 'closed');
    await closed.evaluate(() => window.__setVis('visible'));
    await closed.waitForFunction(() => document.querySelector('#pond').dataset.audioTrouble === 'hard');
    await closed.waitForFunction(() => Number(getComputedStyle(document.querySelector('#water-silence')).opacity) > .5);
    const truth = await read(closed);
    assert.equal(truth.tone, 'hard', 'a closed pond is a hard truth, not a soft one');
    assert.match(truth.text, /перезагрузите/i, 'the return names the real way back');
    assert.ok(!/уснул/.test(truth.text), 'a return must never promise that a touch wakes closed water');
    assert.equal(truth.shown, true, 'the truth is really visible, not only in the DOM');
    assert.equal(truth.status, truth.text, 'the live region speaks the same words as the eye reads');
    assert.equal(truth.ctxStates, 'closed', 'the context really is closed');

    // A real gesture cannot soften the truth: the water stays honestly closed.
    const spotBefore = await patch(closed, .5, .52);
    await closed.keyboard.press('Space');
    await closed.waitForTimeout(240);
    const afterGesture = await read(closed);
    assert.equal(afterGesture.text, truth.text, 'a gesture on closed water cannot rewrite the truth');
    assert.equal(afterGesture.tone, 'hard', 'the closed truth stays hard');
    assert.equal(afterGesture.status, truth.text, 'the live region keeps the same honest words');
    const spotAfter = await patch(closed, .5, .52);
    assert.ok(spotAfter - spotBefore > 6,
      `the water must stay playable without sound (${spotBefore.toFixed(1)} -> ${spotAfter.toFixed(1)})`);
    await closed.screenshot({ path: path.join(root, 'output/pond-piano/return-closed-74.png') });

    // ---- A player who never asked hears nothing ---------------------------
    const stranger = await fresh();
    await stranger.evaluate(() => window.__setVis('hidden'));
    await stranger.evaluate(() => window.__setVis('visible'));
    await stranger.waitForTimeout(400);
    const naive = await read(stranger);
    assert.equal(naive.state, 'uninitialized', 'a return before the first gesture starts no audio');
    assert.equal(naive.contexts, 0, 'a return before the first gesture creates no context');
    assert.equal(naive.text, '', 'the pond says nothing before it has been asked');
    assert.equal(naive.shown, false, 'no line for a player who has not played');
    assert.equal(naive.status, 'Пруд ждёт касания', 'the default invitation still stands');

    assert.deepEqual(errors, [], `no console or page errors: ${errors.join(' | ')}`);
    console.log('return-silence-smoke: all checks passed');
  } finally {
    await browser.close();
    await closeServer(server);
  }
})().catch(error => { console.error(error); process.exit(1); });