'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const caustic = require('../pond-caustic.js');

test('creates a stable bounded field of light motes', () => {
  const a = caustic.createMotes(22, 7);
  const b = caustic.createMotes(22, 7);
  assert.equal(a.length, 22);
  assert.deepEqual(a, b, 'same seed must reproduce the same field');
  for (const mote of a) {
    assert.ok(mote.x >= 0 && mote.x <= 1);
    assert.ok(mote.y >= 0 && mote.y <= 1);
    assert.ok(mote.size >= 0.5 && mote.size <= 1);
    assert.equal(mote.warmth, 0);
  }
});

test('bounds the field size regardless of caller input', () => {
  assert.equal(caustic.createMotes(9999, 1).length, caustic.DEFAULT_COUNT);
  assert.equal(caustic.createMotes(-4, 1).length, 8);
});

test('advancing time breathes motes and decays their warmth', () => {
  let motes = caustic.createMotes(10, 3);
  const before = motes.map(mote => mote.phase);
  motes = caustic.gatherMotes(motes, .5, .5, 1, 1);
  assert.ok(motes.every(mote => mote.warmth > 0), 'a field-wide note warms every mote');
  const warm = motes.at(0).warmth;
  motes = caustic.updateMotes(motes, 1);
  assert.ok(motes.every((mote, index) => mote.warmth < (index === 0 ? warm : mote.warmth + 1)),
    'warmth decays with wall time');
  assert.ok(motes.some((mote, index) => mote.phase !== before[index]), 'phases advance');
});

test('motional light only enters near the event and fades with distance', () => {
  let motes = caustic.createMotes(40, 11);
  const near = caustic.gatherMotes(motes, .5, .5, 1, .12);
  const far = caustic.gatherMotes(motes, .5, .5, 1, .3);
  const nearWarm = near.reduce((sum, mote) => sum + mote.warmth, 0);
  const farWarm = far.reduce((sum, mote) => sum + mote.warmth, 0);
  assert.ok(farWarm > nearWarm, 'a wider reach catches and warms more motes');
  assert.ok(caustic.gatherMotes(motes, .5, .5, 0).every(mote => mote.warmth === 0),
    'zero-strength events leave the field untouched');
});

test('visual state is deterministic and reduced-motion clips the wobble', () => {
  const motes = caustic.createMotes(12, 5);
  const full = motes.map(mote => caustic.moteVisual(mote, 1234, false));
  const fullAgain = motes.map(mote => caustic.moteVisual(mote, 1234, false));
  assert.deepEqual(full, fullAgain, 'same now must reproduce the same visual state');
  assert.ok(motes.every(mote => {
    const steady = caustic.moteVisual(mote, 1234, true);
    return steady.x >= 0 && steady.x <= 1 && steady.y >= 0 && steady.y <= 1 &&
      steady.alpha >= 0 && steady.alpha <= 1;
  }), 'reduced motion keeps motes inside the pond with bounded brightness');
});