'use strict';
// Real browser: a moving hand draws an ink line but never rewrites its struck note.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const { createStaticServer, listenOnLoopback, closeServer } = require('../electron/static-server');

(async () => {
  const root = path.resolve(__dirname, '..');
  const server = createStaticServer(root);
  const origin = await listenOnLoopback(server);
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: '/home/mfoadmin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
      headless: true, args: ['--no-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      window.startedNotes = [];
      const Native = AudioContext;
      window.AudioContext = class extends Native {
        constructor(options) {
          super(options);
          const create = this.createOscillator.bind(this);
          this.createOscillator = () => {
            const oscillator = create(), start = oscillator.start.bind(oscillator);
            const setFrequency = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
            oscillator.frequency.setValueAtTime = (value, at) => {
              oscillator.firstScheduledFrequency ??= value;
              return setFrequency(value, at);
            };
            oscillator.start = (...args) => {
              window.startedNotes.push({ type: oscillator.type,
                frequency: oscillator.firstScheduledFrequency ?? oscillator.frequency.value });
              return start(...args);
            };
            return oscillator;
          };
        }
      };
    });
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.mouse.move(85, 320);
    await page.mouse.down();
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '1');
    const struck = Number(await page.locator('#pond').getAttribute('data-bowl-pitch'));
    await page.mouse.move(320, 540, { steps: 14 });
    await page.mouse.up();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('pond-piano.score.v1'))?.memories?.length === 1);
    const record = await page.evaluate(() => ({
      memory: JSON.parse(localStorage.getItem('pond-piano.score.v1')).memories[0],
      ink: JSON.parse(localStorage.getItem('pond-piano.diary.v1')).lines[0]
    }));
    const expected = await page.evaluate(pitch => PondMusic.normalizedAtFrequency(pitch), struck);
    assert.ok(record.memory.points.length > 2, 'a drawn gesture is still a drawn score');
    assert.ok(record.memory.points.at(-1).x - record.memory.points[0].x > .4);
    assert.ok(record.memory.points.every(p => Math.abs(p.pitch - expected) < .002));
    assert.ok(Math.abs(record.ink.pitch - expected) < .002);
    await page.locator('#diary-stone').click();
    const beforeReplay = await page.evaluate(() => window.startedNotes.length);
    await page.locator('.diary-entry').first().click();
    await page.waitForFunction(offset => window.startedNotes.slice(offset).some(n => n.type === 'triangle'), beforeReplay);
    const replay = await page.evaluate(offset => window.startedNotes.slice(offset).filter(n => n.type === 'triangle'), beforeReplay);
    const expectedEcho = await page.evaluate(pitch => PondMusic.echoNote(pitch, .5, .2, 0, 3).startFrequency, expected);
    assert.ok(Math.abs(replay[0].frequency / expectedEcho - 1) < .05,
      `diary echo should use the played bowl, got ${replay[0].frequency} instead of ${expectedEcho}`);
    await page.screenshot({ path: path.join(root, 'output/pond-piano/bowl-score-60.png') });
    await page.locator('#pond').focus();
    await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices !== '0');
    const keyboardStruck = Number(await page.locator('#pond').getAttribute('data-bowl-pitch'));
    for (let n = 0; n < 18; n += 1) await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Space');
    const keyboardMemory = await page.evaluate(() => JSON.parse(localStorage.getItem('pond-piano.score.v1')).memories.at(-1));
    const keyboardExpected = await page.evaluate(pitch => PondMusic.normalizedAtFrequency(pitch), keyboardStruck);
    assert.ok(keyboardMemory.points.at(-1).x - keyboardMemory.points[0].x > .3);
    assert.ok(keyboardMemory.points.every(p => Math.abs(p.pitch - keyboardExpected) < .002),
      'keyboard location must not rewrite its held bowl in the score');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ struck, scorePoints: record.memory.points.length,
      scorePitch: record.memory.pitch, replay: replay[0], keyboardStruck,
      keyboardScorePoints: keyboardMemory.points.length, errors, screenshot: 'output/pond-piano/bowl-score-60.png' }));
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
