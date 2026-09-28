'use strict';
// Production shell: the pond plays its own diary back. One gesture - the R
// key or the warm stone in the diary panel - hands the whole still-readable
// chronicle to the water as one continuous, bounded replay: phrases in the
// order they were played, each answering from its own contour, ending by
// itself when the last promised note has spoken. A second gesture stops it.
// No new machine-gun, no unbounded timers, and no audio before the first
// explicit gesture.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const { createStaticServer, listenOnLoopback, closeServer } = require('../electron/static-server');

const CHROME = require('./chrome-path')();

// Three real phrases already on the water when the page opens: born a few
// seconds ago, with real contours and durations, so the diary is honestly
// pourable without waiting a minute of play.
const SEED_HARNESS = () => {
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
  window.__vis = 'visible';
  Object.defineProperty(document, 'visibilityState', { get: () => window.__vis, configurable: true });
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
      const canvas = document.querySelector('#pond');
      const flush = document.querySelector('#diary-flush');
      return {
        state: canvas.dataset.audioState || 'uninitialized',
        inkLines: Number(canvas.dataset.inkLines) || 0,
        flushing: canvas.dataset.flushing || '0',
        planned: Number(canvas.dataset.flushPlanned) || 0,
        phrases: Number(canvas.dataset.flushPhrases) || 0,
        notes: Number(canvas.dataset.flushNotes) || 0,
        skipped: Number(canvas.dataset.flushSkipped) || 0,
        remaining: Number(canvas.dataset.flushRemaining) || 0,
        fraction: Number(canvas.dataset.flushFraction) || 0,
        current: Number(canvas.dataset.flushCurrent ?? -1),
        embers: Number(canvas.dataset.flushEmber) || 0,
        spoken: Number(canvas.dataset.flushSpoken ?? -1),
        echoVoices: Number(canvas.dataset.echoVoices) || 0,
        status: document.querySelector('#status').textContent || '',
        legend: (document.querySelector('#legend-list')?.textContent || '').replace(/\s+/g, ' '),
        flushDisabled: flush ? flush.disabled : null,
        flushLabel: flush ? flush.textContent : '',
        flushAria: flush ? flush.getAttribute('aria-label') : ''
      };
    });

    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    watch(page);
    await page.addInitScript(SEED_HARNESS);
    await page.goto(url, { waitUntil: 'networkidle' });

    // The seeded chronicle is really readable and really silent until asked.
    const cold = await read(page);
    assert.equal(cold.state, 'uninitialized', 'loading must not create audio');
    assert.equal(cold.inkLines, 3, 'the seeded diary is honestly readable on the water');
    assert.equal(cold.flushing, '0', 'nothing replays before the player asks');

    // A real gesture wakes the water (and writes one more phrase on release).
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioState === 'running');
    await page.keyboard.up('Space');
    await page.waitForTimeout(300);
    const awake = await read(page);
    assert.ok(awake.inkLines >= 3, 'the player really played, so the diary still has phrases');
    assert.match(awake.legend, /разлить весь дневник/, 'the map itself teaches the whole-diary route');

    // R hands the whole chronicle back: one bounded, continuous replay.
    await page.keyboard.press('r');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.flushing === '1');
    const started = await read(page);
    assert.ok(started.planned > 0, 'the replay really scheduled notes');
    assert.ok(started.planned <= 14, `the replay stays inside its note bound (${started.planned})`);
    assert.ok(started.phrases === 0, 'the first phrase has not spoken yet when the replay opens');
    assert.equal(started.spoken, -1, 'no phrase has been spoken aloud yet at the very start');
    assert.match(started.status, /разливает дневник|Разлив идёт/, 'the water says what it is doing');
    // The surface shows how much of the replay is still to come: at the very
    // start the whole chronicle is waiting, and every planned phrase keeps a
    // quiet ember while the replay has not reached it.
    assert.equal(started.remaining, started.planned,
      'before the first note the whole replay is still to come');
    assert.equal(started.fraction, 0, 'nothing has sounded yet at the start');
    assert.ok(started.embers >= 1, 'the water really shows where the replay is going');
    // The visible half of the feature: the water really answers while the
    // chronicle is being handed back, not only in a dataset counter.
    await page.waitForTimeout(1500);
    const midway = await read(page);
    assert.ok(midway.phrases >= 1, 'by mid-replay a phrase has really spoken on the water');
    assert.ok(midway.remaining < started.remaining, 'the water shows the replay is moving on');
    assert.ok(midway.fraction > 0 && midway.fraction < 1, 'the honest fraction sits inside the replay');
    assert.ok(midway.remaining >= 0 && midway.remaining <= started.planned,
      'the remaining count stays inside the whole plan');
    assert.ok(midway.remaining < started.remaining, 'the water shows the replay is moving on');
    assert.ok(midway.current >= 0, 'the phrase now sounding is named on the water');
    assert.ok(midway.embers >= 1, 'a phrase the replay has not reached still holds its ember');
    // The water shows where the replay stands; the live region says the same
    // thing in words, so a player who listens rather than watches is told too.
    assert.ok(midway.spoken >= 0, 'the sounding phrase has really been spoken aloud, not only shown');
    assert.match(midway.status, /Разлив идёт: звучит фраза \d+ из \d+/,
      'the live region names which phrase of the chronicle is sounding now');
    assert.match(midway.status, /Впереди ещё \d+ фраз|звучит последняя фраза/,
      'the spoken line names honestly how much is still to come');
    await page.screenshot({ path: path.join(root, 'output/pond-piano/diary-flush-77.png') });

    // It ends by itself, with every phrase spoken and the pool given back.
    await page.waitForFunction(() => document.querySelector('#pond').dataset.flushing === '0', null, { timeout: 25000 });
    // The last promise released is a bowl still ringing: the shared pool is
    // truly given back when that voice ends, so wait for the honest drain.
    await page.waitForFunction(() => (Number(document.querySelector('#pond').dataset.echoVoices) || 0) === 0, null, { timeout: 8000 });
    const done = await read(page);
    assert.ok(done.phrases >= 2, `more than one phrase came home (${done.phrases})`);
    assert.ok(done.phrases <= awake.inkLines, 'no phrase is invented beyond the diary');
    assert.ok(done.notes >= done.phrases, 'every spoken phrase really carried at least one note');
    assert.ok(done.notes <= 14, `the whole replay stayed inside its note bound (${done.notes})`);
    assert.match(done.status, /разлил свой дневник/, 'the end is announced honestly');
    assert.equal(done.remaining, 0, 'when the replay ends nothing is left to come');
    assert.equal(done.embers, 0, 'no waiting ember outlives the replay it belonged to');
    assert.equal(done.fraction, 0, 'a finished replay holds no progress of its own on the water');
    assert.equal(done.spoken, -1, 'a finished replay leaves no spoken milestone behind');
    assert.equal(done.echoVoices, 0, 'the shared echo pool is given back when the replay ends');

    // The diary panel carries the same route as a real, honest control.
    await page.click('#diary-stone');
    await page.waitForFunction(() => document.querySelector('#diary-control').classList.contains('is-open'));
    const panel = await read(page);
    assert.equal(panel.flushDisabled, false, 'the whole-diary stone is a real control while lines are readable');
    assert.match(panel.flushLabel, /Разлить весь дневник/, 'the stone names the act');
    assert.match(panel.flushAria, /одна за другой/, 'the stone describes what the water will do');

    // Pressing it replays again, and the same gesture stops it honestly. The
    // stop must land while the replay is still speaking, so the water is
    // focused (its own keydown listener) and R is pressed at once.
    await page.click('#diary-flush');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.flushing === '1');
    await page.evaluate(() => document.querySelector('#pond').focus());
    await page.keyboard.press('r');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.flushing === '0');
    await page.waitForFunction(() => (Number(document.querySelector('#pond').dataset.echoVoices) || 0) === 0, null, { timeout: 8000 });
    const stopped = await read(page);
    assert.match(stopped.status, /перестал разливать дневник/, 'a stopped replay says so');
    assert.match(stopped.status, /осталось \d+ фраз|всё обещанное уже прозвучало/,
      'a stopped replay names honestly what never came home instead of implying it was all heard');
    assert.equal(stopped.remaining, 0, 'a stopped replay leaves no half-promise on the water');
    assert.equal(stopped.embers, 0, 'a stopped replay takes its waiting embers with it');
    assert.equal(stopped.echoVoices, 0, 'a stopped replay holds no voices hostage');

    assert.deepEqual(errors, [], `no console or page errors: ${errors.join(' | ')}`);
    console.log('flush-diary-smoke: all checks passed');
  } finally {
    await browser.close();
    await closeServer(server);
  }
})().catch(error => { console.error(error); process.exit(1); });