'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const diagnostic = require('../pond-diagnostic.js');

const byId = (report, id) => report.find(entry => entry.id === id);

test('an unasked pond admits it knows nothing instead of guessing', () => {
  const report = diagnostic.environmentReport();
  assert.equal(report.length, 6);
  for (const entry of report) {
    assert.equal(entry.state, 'unknown', `${entry.id} must not claim a measurement nobody made`);
    assert.equal(entry.value, diagnostic.UNKNOWN_VALUE);
  }
  // Broken probes are treated as no probe at all, never as a false reading.
  for (const broken of [null, undefined, 7, 'touch', []]) {
    const each = diagnostic.environmentReport(broken);
    assert.ok(each.every(entry => entry.state === 'unknown'));
  }
});

test('the water is honest about every state it can really be in', () => {
  const water = (state, rate) => byId(diagnostic.environmentReport({ audioState: state, sampleRate: rate }), 'water');
  assert.equal(water('running', 44100).value, 'проснулась, 44100 Гц');
  assert.equal(water('running', 44100).state, 'measured');
  assert.equal(water('running').state, 'unknown', 'a sleeping rate must not be invented');
  assert.equal(water('running').value, 'проснулась');
  assert.equal(water('suspended', 48000).value, 'спит после жеста');
  assert.equal(water('closed', 48000).value, 'закрыта платформой');
  assert.equal(water('uninitialized', 48000).value, 'ещё не проснулась — первого жеста не было');
  assert.equal(water('nonsense', 48000).state, 'unknown');
});

test('movement, the hand and the declared response stay truthful', () => {
  const movement = value => byId(diagnostic.environmentReport({ reducedMotion: value }), 'movement');
  assert.equal(movement(true).state, 'measured');
  assert.match(movement(true).value, /покой запрошен/);
  assert.match(movement(false).value, /вода движется полностью/);
  assert.equal(movement(undefined).state, 'unknown');

  const hand = value => byId(diagnostic.environmentReport({ vibrate: value }), 'hand');
  assert.match(hand(true).value, /ответить толчком/);
  assert.match(hand(false).value, /только ухом/);
  assert.equal(hand(undefined).state, 'unknown');

  const response = value => byId(diagnostic.environmentReport({ baseLatency: value }), 'response');
  assert.equal(response(0).value, '0 мс объявлено платформой');
  assert.equal(response(.01).value, '10 мс объявлено платформой');
  assert.equal(response(-1).state, 'unknown');
  assert.equal(response(NaN).state, 'unknown');
});

test('pointers are named by what the water really saw', () => {
  const pointers = value => byId(diagnostic.environmentReport({ pointerTypes: value }), 'pointers');
  assert.equal(pointers(['touch', 'mouse', 'pen']).value, 'палец, мышь, перо');
  assert.equal(pointers(['touch', 'touch']).value, 'палец', 'the same hand is not counted twice');
  assert.equal(pointers([]).value, 'вода ещё не видела касаний');
  assert.equal(pointers([]).state, 'measured', 'an empty hand is a real answer, not ignorance');
  assert.equal(pointers('touch').state, 'unknown');
  assert.equal(pointers([null, 9, '']).value, 'вода ещё не видела касаний');
});

test('fingers are counted in real Russian, and an unseen hand is silence', () => {
  assert.equal(diagnostic.fingersHeld(undefined), null);
  assert.equal(diagnostic.fingersHeld(NaN), null);
  assert.equal(diagnostic.fingersHeld('three'), null);
  assert.equal(diagnostic.fingersHeld(0), 'вода ещё не держала пальцев');
  assert.equal(diagnostic.fingersHeld(1), 'вода держала один палец');
  assert.equal(diagnostic.fingersHeld(2), 'вода держала 2 пальца');
  assert.equal(diagnostic.fingersHeld(3), 'вода держала 3 пальца');
  assert.equal(diagnostic.fingersHeld(5), 'вода держала 5 пальцев');
  assert.equal(diagnostic.fingersHeld(6), 'вода держала 6 пальцев — до самого предела');
  assert.equal(diagnostic.fingersHeld(7), 'вода держала 7 пальцев — до самого предела');
  assert.equal(diagnostic.fingersHeld(2.7), 'вода держала 2 пальца');
  assert.equal(diagnostic.fingersHeld(-4), 'вода ещё не держала пальцев');

  assert.equal(diagnostic.fingerWord(11), 'пальцев');
  assert.equal(diagnostic.fingerWord(12), 'пальцев');
  assert.equal(diagnostic.fingerWord(14), 'пальцев');
  assert.equal(diagnostic.fingerWord(21), 'палец');
  assert.equal(diagnostic.fingerWord(22), 'пальца');
  assert.equal(diagnostic.fingerWord(25), 'пальцев');

  const fingers = value => byId(diagnostic.environmentReport({ maxFingers: value }), 'fingers');
  assert.equal(fingers(3).state, 'measured');
  assert.equal(fingers(3).value, 'вода держала 3 пальца');
  assert.equal(fingers(undefined).state, 'unknown');
});

test('the listening scenarios are deterministic and within the water', () => {
  const first = diagnostic.acceptanceScenarios();
  const second = diagnostic.acceptanceScenarios();
  assert.deepEqual(first, second, 'the same scenes must be played every time');
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first[0]) && Object.isFrozen(first[0].strikes));

  const ids = first.map(item => item.id);
  assert.deepEqual(ids, ['taps', 'hold', 'chord', 'pearls']);
  assert.equal(new Set(ids).size, ids.length);

  for (const scene of first) {
    assert.equal(typeof scene.title, 'string');
    assert.ok(scene.sentence.length > 20, `${scene.id} must say what the ear is judging`);
    assert.ok(scene.strikes.length >= 1);
    assert.ok(Number.isFinite(scene.spanMs) && scene.spanMs > 0);
    let end = 0;
    for (const hit of scene.strikes) {
      assert.ok(Number.isFinite(hit.at) && hit.at >= 0, `${scene.id} strike time`);
      assert.ok(hit.x >= 0 && hit.x <= 1, `${scene.id} x stays on the water`);
      assert.ok(hit.y >= 0 && hit.y <= 1, `${scene.id} y stays on the water`);
      assert.ok(hit.holdMs >= 0 && Number.isFinite(hit.holdMs), `${scene.id} hold`);
      assert.ok(hit.pressure >= 0 && hit.pressure <= 1, `${scene.id} pressure`);
      assert.ok(Number.isInteger(hit.shade) && hit.shade >= 0 && hit.shade <= 2, `${scene.id} shade is one of three`);
      end = Math.max(end, hit.at + hit.holdMs);
    }
    assert.ok(scene.spanMs >= end + diagnostic.TAIL_MS - 1, `${scene.id} must outlive its own tail`);
  }
});

test('the scenes cover exactly the four open listening questions', () => {
  const scenes = diagnostic.acceptanceScenarios();
  const taps = scenes.find(item => item.id === 'taps');
  const hold = scenes.find(item => item.id === 'hold');
  const chord = scenes.find(item => item.id === 'chord');
  assert.equal(taps.strikes.length, 12, 'twelve scattered strikes are what the timbre question needs');
  assert.equal(hold.strikes[0].holdMs, 6500, 'the long hold matches the recorded listening pass');
  assert.equal(chord.strikes.length, 5, 'a dense hand is five fingers, not six bowls');
  assert.ok(chord.strikes.every(hit => hit.at === 0), 'the dense hand lands together');
  assert.ok(scenes.find(item => item.id === 'pearls').strikes.length >= 4, 'collisions need pairs of rings');
});

test('a scene is found by name and an unknown name invents nothing', () => {
  assert.equal(diagnostic.scenarioById('hold').title, 'Долгая вода');
  assert.equal(diagnostic.scenarioById('nope'), null);
  assert.equal(diagnostic.scenarioById(undefined), null);
});

test('the ear verdict cycles through three honest words and never invents a fourth', () => {
  assert.deepEqual([...diagnostic.VERDICTS], ['unheard', 'sounds', 'off']);
  assert.equal(diagnostic.verdictLabel('sounds'), 'звучит');
  assert.equal(diagnostic.verdictLabel('off'), 'мимо');
  assert.equal(diagnostic.verdictLabel('unheard'), 'не слушал');
  assert.equal(diagnostic.verdictLabel('СЛУШАЛ'), null);
  assert.equal(diagnostic.verdictLabel(undefined), null);

  assert.equal(diagnostic.nextVerdict('unheard'), 'sounds');
  assert.equal(diagnostic.nextVerdict('sounds'), 'off');
  assert.equal(diagnostic.nextVerdict('off'), 'unheard', 'the cycle closes, it does not grow a fourth word');
  assert.equal(diagnostic.nextVerdict('junk'), 'sounds', 'junk is not a judgement: it starts from unheard');
  assert.equal(diagnostic.nextVerdict(undefined), 'sounds');
  assert.equal(diagnostic.normalizeVerdict('off'), 'off');
  assert.equal(diagnostic.normalizeVerdict(7), 'unheard');
});

test('only the four real scenes are judged, and silence is not an approval', () => {
  const judged = diagnostic.normalizeVerdicts({ taps: 'sounds', chord: 'off', bogus: 'sounds' });
  assert.deepEqual(Object.keys(judged).sort(), ['chord', 'hold', 'pearls', 'taps']);
  assert.equal(judged.taps, 'sounds');
  assert.equal(judged.chord, 'off');
  assert.equal(judged.hold, 'unheard', 'a scene nobody judged is recorded as unheard, not as approval');
  assert.equal(judged.pearls, 'unheard');
  assert.ok(!('bogus' in judged), 'an invented scene has no place on the shore');
  assert.equal(judged.taps, diagnostic.normalizeVerdicts({ taps: 'sounds' }).taps);

  for (const broken of [null, undefined, 7, 'sounds', ['sounds']]) {
    const each = diagnostic.normalizeVerdicts(broken);
    assert.deepEqual(Object.values(each), ['unheard', 'unheard', 'unheard', 'unheard']);
  }
  assert.equal(diagnostic.normalizeVerdicts({ taps: 'maybe' }).taps, 'unheard', 'an unknown word is no judgement');
});

test('a verdict line names the scene it belongs to, or says nothing', () => {
  assert.equal(diagnostic.verdictLine('hold', 'sounds'), 'Сцена «Долгая вода»: звучит');
  assert.equal(diagnostic.verdictLine('chord', 'off'), 'Сцена «Плотная ладонь»: мимо');
  assert.equal(diagnostic.verdictLine('taps', undefined), 'Сцена «Короткие касания»: не слушал');
  assert.equal(diagnostic.verdictLine('nope', 'sounds'), null);
  assert.equal(diagnostic.verdictLine(undefined, 'sounds'), null);

  const summary = diagnostic.verdictSummary({ taps: 'sounds', chord: 'off' });
  assert.equal(summary.sounds, 1);
  assert.equal(summary.off, 1);
  assert.equal(summary.unheard, 2);
  assert.equal(summary.judged, 2, 'only real judgements count as the ear having spoken');
  assert.equal(diagnostic.verdictSummary().judged, 0);
});

test('the note is stamped in the shore clock, and a missing clock drops the stamp', () => {
  assert.equal(diagnostic.momentStamp(Date.UTC(2026, 8, 28, 12, 17), 180), '28.09.2026, 15:17 UTC+03:00');
  assert.equal(diagnostic.momentStamp(Date.UTC(2026, 8, 28, 23, 30), 180), '29.09.2026, 02:30 UTC+03:00');
  assert.equal(diagnostic.momentStamp(Date.UTC(2026, 8, 28, 12, 17), -300), '28.09.2026, 07:17 UTC−05:00');
  assert.equal(diagnostic.momentStamp(Date.UTC(2026, 8, 28, 12, 17), 0), '28.09.2026, 12:17 UTC+00:00');
  assert.equal(diagnostic.momentStamp(undefined, 180), null);
  assert.equal(diagnostic.momentStamp(NaN, 180), null);
  assert.equal(diagnostic.momentStamp(Date.UTC(2026, 8, 28, 12, 17), NaN), '28.09.2026, 12:17 UTC+00:00');
});

test('an unasked water writes an honest note instead of a plausible one', () => {
  const note = diagnostic.shoreNote({ at: Date.UTC(2026, 8, 28, 12, 17), offsetMinutes: 180 });
  assert.equal(note.title, diagnostic.NOTE_TITLE);
  assert.ok(note.text.startsWith(diagnostic.NOTE_TITLE));
  assert.ok(note.text.includes('28.09.2026, 15:17 UTC+03:00'), 'the note carries its own moment');
  assert.equal(note.measured, 0, 'nothing was measured here, and the note says so six times');
  assert.equal(note.unknown, 6);
  assert.equal(note.text.split('\n').length, 14, 'title, stamp, six facts, a heading, four scenes, a summary');
  for (const entry of diagnostic.environmentReport()) {
    assert.ok(note.text.includes(`${entry.label}: ${entry.value}`), `${entry.id} is carried as it was measured`);
  }
  assert.ok(note.text.includes('суд уха:'));
  for (const scene of diagnostic.acceptanceScenarios()) {
    assert.ok(note.text.includes(`— Сцена «${scene.title}»: не слушал`), `${scene.id} is honestly unheard`);
  }
  assert.ok(note.text.endsWith('Итог: 0 звучит, 0 мимо, 4 не слушал'));
  assert.ok(!/Гц|\d+ мс/.test(note.text), 'no rate and no response time may appear before they were measured');
  assert.ok(Object.isFrozen(note) && Object.isFrozen(note.lines));
  assert.ok(note.text.length < 900, 'the note stays a note, not a journal');
});

test('a measured water, with the ear s own words, writes the same truth it shows', () => {
  const note = diagnostic.shoreNote({
    probe: { reducedMotion: false, audioState: 'running', sampleRate: 48000, baseLatency: .005, vibrate: true, pointerTypes: ['touch'], maxFingers: 3 },
    verdicts: { taps: 'sounds', hold: 'sounds', chord: 'off' },
    at: Date.UTC(2026, 8, 28, 12, 17),
    offsetMinutes: 180
  });
  assert.equal(note.measured, 6, 'every fact was really measured this time');
  assert.equal(note.unknown, 0);
  assert.ok(note.text.includes('вода: проснулась, 48000 Гц'));
  assert.ok(note.text.includes('отклик: 5 мс объявлено платформой'));
  assert.ok(note.text.includes('пальцы: вода держала 3 пальца'));
  assert.ok(note.text.includes('Сцена «Короткие касания»: звучит'));
  assert.ok(note.text.includes('Сцена «Плотная ладонь»: мимо'));
  assert.ok(note.text.includes('Сцена «Встреча волн»: не слушал'));
  assert.ok(note.text.endsWith('Итог: 2 звучит, 1 мимо, 1 не слушал'));
  assert.equal(note.summary.judged, 3);
  assert.deepEqual(Object.keys(note.verdicts).sort(), ['chord', 'hold', 'pearls', 'taps']);

  // Broken material never becomes a reading, and never grows the note.
  const broken = diagnostic.shoreNote({ probe: 'touch', verdicts: 7, at: 'now', offsetMinutes: 'east' });
  assert.equal(broken.lines.length, 13, 'a missing clock drops the stamp rather than inventing one');
  assert.equal(broken.measured, 0);
  assert.equal(broken.unknown, 6);
  assert.ok(!broken.text.includes('UTC'));
  assert.equal(diagnostic.shoreNote().lines.length, 13);
  assert.equal(diagnostic.shoreNote(null).text.split('\n').length, 13);
});
