'use strict';
// Production shell: the shore writes and carries a note. The examination keeps
// the listener's own verdict per scene (unheard -> sounds -> off), persists it
// across a reload, starts no sound of its own, and can carry one compact note
// off the bank: the same honest readings the panel shows plus the ear's words.
// A platform that refuses the clipboard leaves the note on the shore and says
// so; it never pretends the words were carried away.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/usr/lib/node_modules/openclaw/node_modules/playwright-core');
const { createStaticServer, listenOnLoopback, closeServer } = require('../electron/static-server');

const CHROME = require('./chrome-path')();

const CLIP_STUB = () => {
  window.__noteText = null;
  try {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => { window.__noteText = String(text); } }
    });
  } catch {}
};

const CLIP_REFUSE = () => {
  window.__noteText = null;
  try {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('denied'); } }
    });
  } catch {}
};

const read = page => page.evaluate(() => {
  const canvas = document.querySelector('#pond');
  let diaryLines = 0;
  try { diaryLines = (JSON.parse(localStorage.getItem('pond-piano.diary.v1') || '{}').lines || []).length; } catch {}
  const scenes = [...document.querySelectorAll('.inspect-scene')].map(button => ({
    id: button.dataset.scene,
    pressed: button.getAttribute('aria-pressed')
  }));
  const verdicts = [...document.querySelectorAll('.inspect-verdict')].map(button => ({
    id: button.dataset.scene,
    value: button.dataset.verdict || '',
    text: button.textContent.trim(),
    label: button.getAttribute('aria-label') || '',
    width: Math.round(button.getBoundingClientRect().width),
    height: Math.round(button.getBoundingClientRect().height)
  }));
  const noteButton = document.querySelector('#inspect-note');
  return {
    open: canvas.dataset.inspectOpen,
    audioState: canvas.dataset.audioState || 'uninitialized',
    voices: Number(canvas.dataset.inspectVoices) || 0,
    diaryLines,
    scenes,
    verdicts,
    verdictProbe: canvas.dataset.inspectVerdicts || '',
    verdictEvent: canvas.dataset.inspectVerdict || '',
    noteState: canvas.dataset.inspectNote || '0',
    noteLength: Number(canvas.dataset.inspectNoteLength) || 0,
    noteButton: noteButton ? { width: Math.round(noteButton.getBoundingClientRect().width), height: Math.round(noteButton.getBoundingClientRect().height) } : null,
    status: document.querySelector('#status').textContent,
    rows: [...document.querySelectorAll('#inspect-facts .inspect-fact')].map(row => ({
      id: row.querySelector('.inspect-term').textContent,
      value: row.querySelector('.inspect-value').textContent,
      state: row.dataset.state
    }))
  };
});

const noteText = page => page.evaluate(() => window.__noteText);

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
    await page.addInitScript(CLIP_STUB);

    // ---- 1. Four scenes, four honest verdict stones, nothing judged yet -----
    await page.goto(`${origin}/?inspect`, { waitUntil: 'networkidle' });
    const fresh = await read(page);
    assert.equal(fresh.open, '1');
    assert.equal(fresh.verdicts.length, 4, `one verdict stone per scene, got ${fresh.verdicts.length}`);
    assert.deepEqual(fresh.verdicts.map(item => item.id), ['taps', 'hold', 'chord', 'pearls']);
    for (const stone of fresh.verdicts) {
      assert.equal(stone.value, 'unheard', `${stone.id} starts unheard`);
      assert.equal(stone.text, 'Суд: не слушал');
      assert.match(stone.label, /Нажмите, чтобы отметить «звучит»/, `${stone.id} names its own next step`);
      assert.ok(stone.width >= 44 && stone.height >= 44, `${stone.id} verdict target is ${stone.width}x${stone.height}`);
    }
    assert.equal(fresh.noteState, '0', 'no note was carried before one was asked for');
    assert.ok(fresh.noteButton.height >= 44, 'the note stone is a real target');
    assert.equal(fresh.audioState, 'uninitialized', 'an examination asks for nothing by itself');

    // ---- 2. Judging is not playing: no sound, no phrase, no ripple ---------
    await page.click('.inspect-verdict[data-scene="taps"]');
    const saidSounds = await read(page);
    const tapsStone = saidSounds.verdicts.find(item => item.id === 'taps');
    assert.equal(tapsStone.value, 'sounds');
    assert.equal(tapsStone.text, 'Суд: звучит');
    assert.match(tapsStone.label, /ухо сказало «звучит»/);
    assert.equal(saidSounds.verdictEvent, 'taps:sounds');
    assert.match(saidSounds.verdictProbe, /taps:sounds/);
    assert.match(saidSounds.status, /ухо сказало «звучит»/);
    assert.equal(saidSounds.audioState, 'uninitialized', 'judging must not wake the water');
    assert.equal(saidSounds.voices, 0, 'judging must not sound a voice');
    assert.equal(saidSounds.diaryLines, 0, 'judging must not write a phrase');

    await page.click('.inspect-verdict[data-scene="chord"]');
    await page.click('.inspect-verdict[data-scene="chord"]');
    const saidOff = await read(page);
    const chordStone = saidOff.verdicts.find(item => item.id === 'chord');
    assert.equal(chordStone.value, 'off', 'the cycle closes on a third word, not a fourth');
    assert.equal(chordStone.text, 'Суд: мимо');
    assert.equal(saidOff.audioState, 'uninitialized');
    assert.equal(saidOff.diaryLines, 0);

    // ---- 3. The note carries the same truth the panel shows ----------------
    await page.click('#inspect-note');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.inspectNote === 'copied');
    const carried = await read(page);
    const text = await noteText(page);
    assert.ok(text && text.startsWith('Береговая записка пруда-пианино'), `note text: ${String(text).slice(0, 40)}`);
    assert.match(text, /UTC\+03:00/, 'the note is stamped in the shore clock');
    assert.match(text, /Сцена «Короткие касания»: звучит/);
    assert.match(text, /Сцена «Плотная ладонь»: мимо/);
    assert.match(text, /Сцена «Долгая вода»: не слушал/);
    assert.match(text, /Сцена «Встреча волн»: не слушал/);
    assert.match(text, /Итог: 1 звучит, 1 мимо, 2 не слушал/);
    assert.match(text, /отклик: вода ещё не знает/, 'an unasked reading is carried as unknown');
    assert.ok(!/Гц|\d+ мс/.test(text), `no invented reading in the note: ${text}`);
    assert.equal(carried.noteLength, text.length);
    assert.match(carried.status, /Записка ушла с берега: \d+ измерено, \d+ вода ещё не знает/);
    assert.equal(carried.audioState, 'uninitialized', 'carrying a note must not wake the water');
    assert.equal(carried.diaryLines, 0);

    // ---- 4. The verdicts are kept on this shore across a reload ------------
    await page.reload({ waitUntil: 'networkidle' });
    const kept = await read(page);
    assert.equal(kept.open, '1', 'the requested examination is open again by its own address');
    assert.equal(kept.verdicts.find(item => item.id === 'taps').value, 'sounds', 'the ear s word survives a reload');
    assert.equal(kept.verdicts.find(item => item.id === 'chord').value, 'off');
    assert.equal(kept.verdicts.find(item => item.id === 'hold').value, 'unheard');
    assert.match(kept.verdictProbe, /taps:sounds hold:unheard chord:off pearls:unheard/);

    // ---- 5. A real hand wakes the water, and the note says what it measured -
    await page.keyboard.press('Escape');
    const cdp = await context.newCDPSession(page);
    const points = [0, 1, 2].map(index => ({ id: index + 1, x: 90 + index * 90, y: 240 + index * 40, radiusX: 8, radiusY: 8, force: .5 }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    await page.waitForTimeout(220);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => document.querySelector('#pond').dataset.audioState === 'running');
    await page.keyboard.press('I');
    const woken = await read(page);
    assert.equal(woken.verdicts.find(item => item.id === 'taps').value, 'sounds', 'real play must not disturb the ear s verdict');
    assert.equal(woken.diaryLines, 3, 'the three real fingers were played, and only they were written');
    await page.click('#inspect-note');
    await page.waitForFunction(() => document.querySelector('#pond').dataset.inspectNote === 'copied');
    const measuredText = await noteText(page);
    assert.match(measuredText, /вода: проснулась, \d+ Гц/, 'the woken rate is carried honestly');
    assert.match(measuredText, /пальцы: вода держала 3 пальца/);
    assert.match(measuredText, /указатели: палец/);
    assert.match(measuredText, /отклик: \d+ мс объявлено платформой/);
    assert.match(measuredText, /Итог: 1 звучит, 1 мимо, 2 не слушал/);
    assert.ok(!measuredText.includes('вода ещё не знает'), 'every fact is measured now, so nothing is carried as unknown');

    // ---- 6. The keyboard really reaches the new stones --------------------
    const reached = new Set();
    for (let step = 0; step < 24; step += 1) {
      reached.add(await page.evaluate(() => {
        const active = document.activeElement;
        return active ? (active.className || active.tagName) : 'none';
      }));
      await page.keyboard.press('Tab');
    }
    assert.ok([...reached].some(name => String(name).includes('inspect-verdict')), `Tab reaches the verdict stones: ${[...reached].join(' | ')}`);
    assert.ok([...reached].some(name => String(name).includes('inspect-note')), 'Tab reaches the note stone');

    await page.screenshot({ path: path.join(root, 'output/pond-piano/shore-note-80.png') });
    await context.close();

    // ---- 7. A refusing platform leaves the note on the shore --------------
    const refusing = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const refusePage = await refusing.newPage();
    refusePage.on('pageerror', e => errors.push(String(e)));
    await refusePage.addInitScript(CLIP_REFUSE);
    await refusePage.goto(`${origin}/?inspect`, { waitUntil: 'networkidle' });
    await refusePage.click('#inspect-note');
    await refusePage.waitForFunction(() => document.querySelector('#pond').dataset.inspectNote === 'refused');
    const refused = await read(refusePage);
    assert.match(refused.status, /записка осталась на берегу/, 'a refused clipboard is said plainly');
    assert.equal(refused.audioState, 'uninitialized', 'a refusal must not wake the water either');
    assert.equal(refused.diaryLines, 0);
    await refusing.close();

    assert.deepEqual(errors, [], `no console or page errors: ${errors.join(' | ')}`);
    console.log('shore-note-smoke: all checks passed');
  } finally {
    await browser.close();
    await closeServer(server);
  }
})().catch(error => { console.error(error); process.exit(1); });