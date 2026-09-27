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
    const expectedEcho = await page.evaluate(pitch => PondMusic.echoNote(pitch, .5, .2, 0, 3).frequency, expected);
    await page.waitForFunction(({offset, fundamental}) => [1, 2].every(ratio =>
      window.startedNotes.slice(offset).some(note => note.type === 'sine' &&
        Math.abs(note.frequency / (fundamental * ratio) - 1) < .002)),
    {offset:beforeReplay, fundamental:expectedEcho});
    const replay = await page.evaluate(({offset, fundamental}) => [1, 2].map(ratio =>
      window.startedNotes.slice(offset).find(note => note.type === 'sine' &&
        Math.abs(note.frequency / (fundamental * ratio) - 1) < .002)),
    {offset:beforeReplay, fundamental:expectedEcho});
    assert.deepEqual(replay.map(note => note.type), ['sine', 'sine'], 'replay has two bowl modes, not a triangle sweep');
    assert.ok(Math.abs(replay[0].frequency / expectedEcho - 1) < .002 &&
      Math.abs(replay[1].frequency / (expectedEcho * 2) - 1) < .002,
      `diary echo should use the played bowl and octave, got ${JSON.stringify(replay)}`);
    await page.waitForFunction(() => document.querySelector('#pond').dataset.echoVoices === '0');
    await page.screenshot({ path: path.join(root, 'output/pond-piano/bowl-echo-61.png') });
    await page.locator('#diary-stone').click();
    await page.mouse.move(195, 235);
    await page.mouse.down();
    await page.waitForTimeout(130);
    const beforeCrossing = await page.evaluate(() => window.startedNotes.length);
    await page.mouse.move(195, 625, {steps:20});
    await page.waitForFunction(() => Number(document.querySelector('#pond').dataset.melodicEchoes) > 0);
    await page.waitForFunction(({offset, fundamental}) => [1, 2].every(ratio =>
      window.startedNotes.slice(offset).some(note => note.type === 'sine' &&
        Math.abs(note.frequency / (fundamental * ratio) - 1) < .002)),
    {offset:beforeCrossing, fundamental:expectedEcho});
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('#pond').dataset.echoVoices === '0');
    await page.reload({ waitUntil: 'networkidle' }); // the diary dialog must not intercept keyboard play
    await page.locator('#pond').focus();
    const memoryCount = await page.evaluate(() => JSON.parse(localStorage.getItem('pond-piano.score.v1')).memories.length);
    await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioVoices === '1');
    const keyboardStruck = Number(await page.locator('#pond').getAttribute('data-bowl-pitch'));
    for (let n = 0; n < 18; n += 1) await page.keyboard.press('ArrowRight');
    await page.keyboard.up('Space');
    await page.waitForFunction(count => JSON.parse(localStorage.getItem('pond-piano.score.v1')).memories.length > count, memoryCount);
    const keyboardMemory = await page.evaluate(() => JSON.parse(localStorage.getItem('pond-piano.score.v1')).memories.at(-1));
    const keyboardExpected = await page.evaluate(pitch => PondMusic.normalizedAtFrequency(pitch), keyboardStruck);
    assert.ok(keyboardMemory.points.at(-1).x - keyboardMemory.points[0].x > .3);
    assert.ok(keyboardMemory.points.every(p => Math.abs(p.pitch - keyboardExpected) < .002),
      `keyboard location must not rewrite its held bowl in the score: ${keyboardMemory.points.map(p => p.pitch).join(',')} vs ${keyboardExpected}`);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ struck, scorePoints: record.memory.points.length,
      scorePitch: record.memory.pitch, replay: replay[0], crossedScoreEcho: true, keyboardStruck,
      keyboardScorePoints: keyboardMemory.points.length, errors, screenshot: 'output/pond-piano/bowl-echo-61.png' }));
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
