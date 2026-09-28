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