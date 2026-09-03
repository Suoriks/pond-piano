'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const chord = require('../pond-chord.js');

const contact = (id, x, y, frequency, extra = {}) => ({
  id, x, y, frequency, pressure: .5, born: 0, lastMotion: 500, sounding: true, ...extra
});
const bounds = { width: 390, height: 844 };

test('three calm held contacts gather into one bounded bloom', () => {
  const contacts = [
    contact(9, 70, 320, 220),
    contact(2, 195, 470, 330),
    contact(5, 320, 330, 440)
  ];
  const bloom = chord.chordBloom(contacts, 900, bounds);
  assert.ok(bloom);
  assert.equal(bloom.key, '2|5|9');
  assert.equal(bloom.count, 3);
  assert.ok(bloom.x > 170 && bloom.x < 220);
  assert.ok(bloom.y > 350 && bloom.y < 410);
  assert.ok(bloom.depth > 0 && bloom.depth < 1);
  assert.ok(bloom.energy >= .32 && bloom.energy <= .86);
  assert.equal(bloom.frequencies.length, 3);
  assert.equal(bloom.petals.length, 3);
});

test('membership is stable across contact order and ignores silent contacts', () => {
  const contacts = [
    contact('finger-c', 300, 300, 440),
    contact('finger-a', 80, 300, 220),
    contact('finger-b', 190, 500, 330),
    contact('gone', 10, 10, 880, { sounding: false })
  ];
  assert.equal(chord.membershipKey(contacts), 'finger-a|finger-b|finger-c');
  assert.equal(chord.membershipKey([...contacts].reverse()), 'finger-a|finger-b|finger-c');
});

test('two voices, fresh voices and moving voices do not bloom', () => {
  const three = [contact(1, 80, 300, 220), contact(2, 190, 500, 330), contact(3, 300, 300, 440)];
  assert.equal(chord.chordBloom(three.slice(0, 2), 900, bounds), null);
  assert.equal(chord.chordBloom(three.map(item => ({ ...item, born: 600 })), 900, bounds), null,
    'all voices must have settled into the held chord');
  assert.equal(chord.chordBloom(three.map((item, index) => index === 1 ? { ...item, lastMotion: 800 } : item), 900, bounds), null,
    'recent movement keeps the chord fluid instead of retriggering a bloom');
});

test('six voices stay bounded and malformed geometry stays quiet', () => {
  const six = Array.from({ length: 6 }, (_, index) => contact(index, index * 500 - 800, index * 300 - 400, 130 * (index + 1), { pressure: index / 5 }));
  const bloom = chord.chordBloom(six, 1000, bounds);
  assert.ok(bloom);
  assert.equal(bloom.count, 6);
  assert.ok(bloom.x >= 0 && bloom.x <= bounds.width);
  assert.ok(bloom.y >= 0 && bloom.y <= bounds.height);
  assert.ok(bloom.spread >= .06 && bloom.spread <= .42);
  assert.equal(chord.chordBloom(six, NaN, bounds), null);
  assert.equal(chord.chordBloom(six, 1000, { width: 0, height: 844 }), null);
  assert.equal(chord.membershipKey([{ id: 1, x: NaN, y: 2, frequency: 220 }]), null);
});

test('bloom opens and fades on schedule while reduced motion rests', () => {
  const bloom = { born: 100, energy: .7, spread: .2 };
  const early = chord.bloomVisual(bloom, 260, false);
  const open = chord.bloomVisual(bloom, 760, false);
  const ended = chord.bloomVisual(bloom, 100 + chord.BLOOM_LIFE_MS, false);
  const calm = chord.bloomVisual(bloom, 760, true);
  assert.ok(early.alive && early.alpha > 0);
  assert.ok(open.radius > early.radius);
  assert.ok(open.opening > early.opening);
  assert.equal(ended.alive, false);
  assert.equal(ended.alpha, 0);
  assert.equal(calm.rotation, 0);
  assert.equal(calm.opening, .58);
  assert.ok(calm.alpha > 0, 'reduced motion keeps visible chord feedback');
  assert.equal(chord.bloomVisual(bloom, 50, false).alpha, 0, 'nothing appears before birth');
});
