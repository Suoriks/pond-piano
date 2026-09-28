'use strict';
// Production shell: the shore examines itself. The pond repeats only what it
// really measured on this device, admits plainly where it was never asked,
// plays the recorded listening scenes for a human ear, and never writes a
// scene into the diary. Multi-touch is counted from real trusted CDP touches,
// which is the one multi-touch question a phone has to settle.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const { createStaticServer, listenOnLoopback, closeServer } = require('../electron/static-server');

const CHROME = require('./chrome-path')();

const SEED = () => {
  try { localStorage.setItem('pond-piano.legend-intro.v1', 'seen'); } catch {}
  try {
    const epoch = Date.now();
    const line = (ageMs, durationMs, depth, pressure, pitch, points) => ({
      born: epoch - ageMs, durationMs, depth, pressure, pitch,
      points: points.map(([x, y]) => ({ x, y, pressure }))
    });
    localStorage.setItem('pond-piano.diary.v1', JSON.stringify({
      v: 1, savedAt: epoch,
      lines: [
        line(6000, 1200, .25, .5, .18, [[.12, .3], [.28, .42], [.46, .5]]),
        line(4200, 900, .55, .42, .62, [[.55, .28], [.68, .46], [.79, .38]]),
        line(2400, 1400, .78, .6, .86, [[.3, .7], [.5, .62], [.72, .74]])
      ]
    }));
  } catch {}
};

const FACTS = () => [...document.querySelectorAll('#inspect-facts .inspect-fact')].map(row => ({
  id: row.querySelector('.inspect-term').textContent,
  value: row.querySelector('.inspect-value').textContent,
  state: row.dataset.state
}));

const read = page => page.evaluate(() => {
  const canvas = document.querySelector('#pond');
  const control = document.querySelector('#inspect-control');
  let diaryLines = 0;
  try { diaryLines = (JSON.parse(localStorage.getItem('pond-piano.diary.v1') || '{}').lines || []).length; } catch {}
  return {
    open: canvas.dataset.inspectOpen,
    hidden: control.hidden,
    fingers: canvas.dataset.inspectFingers,
    pointers: canvas.dataset.inspectPointers,
    facts: canvas.dataset.inspectFacts || '',
    scenario: canvas.dataset.inspectScenario,
    voices: Number(canvas.dataset.inspectVoices) || 0,
    audioState: canvas.dataset.audioState || 'uninitialized',
    diaryCount: document.querySelector('#diary-count').textContent,
    diaryLines,
    fingersLine: document.querySelector('#inspect-fingers').textContent,
    rows: [...document.querySelectorAll('#inspect-facts .inspect-fact')].map(row => ({
      id: row.querySelector('.inspect-term').textContent,
      value: row.querySelector('.inspect-value').textContent,
      state: row.dataset.state
    }))
  };
});

(async () => {
  const root = path.resolve(__dirname, '..');
  const server = createStaticServer(root), origin = await listenOnLoopback(server);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const errors = [];
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(SEED);

    // ---- 1. Opened on purpose, and honest before anything was measured ------
    await page.goto(`${origin}/?inspect`, { waitUntil: 'networkidle' });
    const opened = await read(page);
    assert.equal(opened.open, '1', 'the requested examination must really be open');
    assert.equal(opened.hidden, false, 'the panel is visible when it says it is');
    assert.equal(opened.rows.length, 6, `six honest facts, got ${opened.rows.length}`);
    const before = Object.fromEntries(opened.rows.map(row => [row.id, row]));
    assert.equal(before['вода'].state, 'measured');
    assert.match(before['вода'].value, /ещё не проснулась/, 'no sound may be claimed before the first gesture');
    assert.equal(before['отклик'].state, 'unknown', 'a response time nobody measured must not be invented');
    assert.equal(before['указатели'].value, 'вода ещё не видела касаний');
    assert.equal(before['пальцы'].value, 'вода ещё не держала пальцев');
    assert.ok(['measured', 'unknown'].includes(before['рука'].state));
    for (const row of opened.rows) assert.ok(row.state === 'measured' || row.state === 'unknown', `${row.id} state`);

    // ---- 2. A scene sounds and writes nothing into the diary ---------------
    const diaryBefore = opened.diaryLines;
    assert.equal(diaryBefore, 3, 'the seeded chronicle is the baseline');
    await page.click('.inspect-scene[data-scene="chord"]');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioState === 'running');
    await page.waitForTimeout(260);
    const playing = await read(page);
    assert.equal(playing.scenario, 'chord', 'the panel names the scene it is really playing');
    assert.equal(playing.voices, 5, `five fingers must really sound, got ${playing.voices}`);
    assert.equal(playing.diaryLines, diaryBefore, 'an examination is not the player: the diary must not grow');
    assert.equal(playing.diaryCount, opened.diaryCount, 'the diary stone must not move either');
    const pressed = await page.getAttribute('.inspect-scene[data-scene="chord"]', 'aria-pressed');
    assert.equal(pressed, 'true', 'the sounding scene says it is the one sounding');

    // ---- 3. The scene ends by itself and stops telling a stale promise -----
    await page.waitForFunction(() => document.querySelector('#pond').dataset.inspectScenario === '0', null, { timeout: 12000 });
    const ended = await read(page);
    assert.equal(ended.scenario, '0');
    assert.ok(ended.voices <= 5, 'released tails stay inside the six-voice budget');
    assert.equal(ended.audioState, 'running', 'the water stays awake after a scene');
    assert.equal((await page.getAttribute('.inspect-scene[data-scene="chord"]', 'aria-pressed')), 'false');
    assert.equal(ended.diaryLines, diaryBefore, 'no scene, however loud, may leave a phrase behind');

    // ---- 4. Real trusted multi-touch is counted, not guessed ---------------
    await page.keyboard.press('i');
    const closed = await read(page);
    assert.equal(closed.open, '0', 'I closes the examination');
    assert.equal(closed.hidden, true, 'a closed panel is really closed');
    const cdp = await context.newCDPSession(page);
    const points = [0, 1, 2].map(index => ({ id: index + 1, x: 90 + index * 90, y: 240 + index * 40, radiusX: 8, radiusY: 8, force: .5 }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    await page.waitForTimeout(200);
    const touched = await read(page);
    assert.equal(touched.fingers, '3', `three real fingers must be counted, got ${touched.fingers}`);
    assert.match(touched.pointers, /touch/, 'a finger is named as a finger');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
    const played = await read(page);
    assert.equal(played.diaryLines, diaryBefore + 3, 'a real hand IS the player: three fingers leave three remembered phrases');

    await page.keyboard.press('I');
    const again = await read(page);
    assert.equal(again.open, '1', 'I opens the examination again');
    const counted = Object.fromEntries(again.rows.map(row => [row.id, row]));
    assert.equal(counted['пальцы'].value, 'вода держала 3 пальца', `the panel repeats the count it measured (${counted['пальцы'].value})`);
    assert.match(again.fingersLine, /вода держала 3 пальца/, 'the live line says the same truth');
    assert.equal(counted['вода'].state, 'measured');
    assert.match(counted['вода'].value, /проснулась, \d+ Гц/, 'the sleeping sample rate is now really known');
    assert.equal(counted['отклик'].state, 'measured', 'the declared response time is known once the water woke');
    assert.equal(again.diaryLines, diaryBefore + 3, 'the examination itself wrote nothing beyond the player s own three phrases');

    await page.screenshot({ path: path.join(root, 'output/pond-piano/inspect-79.png') });
    await context.close();

    assert.deepEqual(errors, [], `no console or page errors: ${errors.join(' | ')}`);
    console.log('inspect-smoke: all checks passed');
  } finally {
    await browser.close();
    await closeServer(server);
  }
})().catch(error => { console.error(error); process.exit(1); });