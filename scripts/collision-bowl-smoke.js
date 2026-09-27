'use strict';
// A real pair of pointer ripples must meet and sound a finite bowl-family bead.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const { createStaticServer, listenOnLoopback, closeServer } = require('../electron/static-server');

(async () => {
  const root = path.resolve(__dirname, '..'), server = createStaticServer(root);
  const origin = await listenOnLoopback(server);
  let browser;
  try {
    browser = await chromium.launch({ executablePath: '/home/mfoadmin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      window.collisionProbe = { contexts: [], notes: [], live: 0 };
      const Native = AudioContext;
      window.AudioContext = class extends Native {
        constructor(options) {
          super(options);
          collisionProbe.contexts.push(this);
          const create = this.createOscillator.bind(this);
          this.createOscillator = () => {
            const oscillator = create(), start = oscillator.start.bind(oscillator);
            const setFrequency = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
            oscillator.frequency.setValueAtTime = (frequency, at) => {
              oscillator.firstFrequency ??= frequency;
              return setFrequency(frequency, at);
            };
            oscillator.start = (...args) => {
              collisionProbe.notes.push({ type: oscillator.type, frequency: oscillator.firstFrequency ?? oscillator.frequency.value });
              collisionProbe.live++;
              return start(...args);
            };
            oscillator.addEventListener('ended', () => collisionProbe.live--, {once:true});
            return oscillator;
          };
        }
      };
    });
    await page.goto(origin, { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => collisionProbe.contexts.length), 0, 'no context before gesture');
    await page.mouse.click(92, 420);
    await page.waitForTimeout(75);
    const prior = await page.evaluate(() => collisionProbe.notes.length);
    await page.mouse.click(300, 420);
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.waveCollisions || 0) > 0, null, {timeout:3000});
    const result = await page.evaluate(prior => ({
      notes: collisionProbe.notes.slice(prior),
      collisions: Number(document.querySelector('#pond').dataset.waveCollisions),
      pool: Number(document.querySelector('#pond').dataset.pearlVoices),
      ripples: Number(document.querySelector('#pond').dataset.rippleEvents),
      contexts: collisionProbe.contexts.length
    }), prior);
    const pearl = await page.evaluate(() => {
      const pitchA = PondMusic.bowlPlan(92 / 390, 420 / 844, .5, 'dawn').frequency;
      const pitchB = PondMusic.bowlPlan(300 / 390, 420 / 844, .5, 'dawn').frequency;
      return PondMusic.collisionPearl(Math.sqrt(pitchA * pitchB), .5, .5).frequency;
    });
    assert.equal(result.collisions, 1, 'two real wavefronts meet once');
    assert.ok(result.pool >= 1 && result.pool <= 3, 'the meeting enters the existing transient budget');
    assert.ok(result.notes.some(note => note.type === 'sine' && Math.abs(note.frequency / pearl - 1) < .02), `fixed fundamental: ${JSON.stringify(result.notes)}`);
    assert.ok(result.notes.some(note => note.type === 'sine' && Math.abs(note.frequency / (pearl * 2) - 1) < .02), 'short octave started with the collision');
    assert.equal(result.contexts, 1);
    await page.screenshot({ path: path.join(root, 'output/pond-piano/collision-bowl-62.png') });
    assert.equal(await page.locator('#pond').getAttribute('data-pearl-voices'), '1', 'background test begins while the pearl is still sounding');
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForFunction(() => collisionProbe.contexts[0].state === 'suspended');
    assert.equal(await page.locator('#pond').getAttribute('data-pearl-voices'), '0', 'background drops the entire transient pool');
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow')));
    await page.mouse.click(195, 430); // trusted gesture resumes the same context
    await page.waitForFunction(() => collisionProbe.contexts[0].state === 'running');
    await page.waitForFunction(() => collisionProbe.live === 0, null, {timeout:6000});
    assert.equal(await page.evaluate(() => collisionProbe.contexts.length), 1, 'foreground does not create another context');
    assert.deepEqual(errors, []);
    console.log({result, pearl, errors, screenshot:'output/pond-piano/collision-bowl-62.png'});
  } finally { await browser?.close(); await closeServer(server); }
})().catch(error => { console.error(error); process.exitCode = 1; });
