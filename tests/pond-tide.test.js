'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const tide = require('../pond-tide.js');

test('creates a stable bounded field of swells', () => {
  const a = tide.createSwells(3, 13);
  const b = tide.createSwells(3, 13);
  assert.equal(a.length, 3);
  assert.deepEqual(a, b, 'same seed must reproduce the same field');
  for (const swell of a) {
    assert.ok(swell.x >= 0 && swell.x <= 1);
    assert.ok(swell.y >= 0 && swell.y <= 1);
    assert.ok(swell.size >= 0.1 && swell.size <= 0.6);
    assert.ok(swell.peak >= 0.02 && swell.peak <= 0.16);
    assert.ok(swell.speed >= 0 && swell.speed <= 0.05);
  }
});

test('bounds the field size regardless of caller input', () => {
  assert.equal(tide.createSwells(99, 1).length, 5);
  assert.equal(tide.createSwells(0, 1).length, 1);
  assert.equal(tide.createSwells(-3, 1).length, 1);
});

test('advancing time lets swells wander within the pond', () => {
  let swells = tide.createSwells(3, 17);
  const { swells: next } = tide.updateTide(swells, [], 1.2);
  assert.equal(next.length, 3);
  for (let index = 0; index < next.length; index += 1) {
    assert.ok(next[index].x >= 0 && next[index].x <= 1, 'swell stays inside horizontally');
    assert.ok(next[index].y >= 0 && next[index].y <= 1, 'swell stays inside vertically');
    assert.ok(Number.isFinite(next[index].phase), 'phase advances');
  }
});

test('a note stirs a bounded afterglow near the site', () => {
  let stirs = [];
  stirs = tide.stir(stirs, .4, .6, .5);
  assert.equal(stirs.length, 1);
  assert.ok(Math.abs(stirs[0].x - .4) < 1e-9);
  assert.ok(Math.abs(stirs[0].energy - .5) < 1e-9);
  assert.equal(stirs[0].born, 0);

  for (let index = 0; index < 14; index += 1) {
    stirs = tide.stir(stirs, .2 + index * .04, .5, .4);
  }
  assert.ok(stirs.length <= tide.MAX_STIRS, 'stirs stay bounded below max');
});

test('weak or invalid events leave the field untouched', () => {
  const initial = tide.stir([], .5, .5, .6);
  assert.deepEqual(tide.stir(initial, .5, .5, 0), initial, 'zero-strength stir ignored');
  assert.deepEqual(tide.stir(initial, Number.NaN, .5, .5), initial, 'bad coordinate ignored');
});

test('afterglow ages toward quiet and eventually clears', () => {
  let stirs = tide.stir([], .5, .5, 1);
  assert.ok(stirs[0].energy > 0.9);
  let next = { swells: [], stirs };
  next = tide.updateTide([], next.stirs, 10);
  const aged = next.stirs[0];
  assert.ok(aged.energy < stirs[0].energy, 'afterglow fades with wall time');
  for (let step = 0; step < 80 && next.stirs.length; step += 1) {
    next = tide.updateTide([], next.stirs, 0.19);
  }
  assert.equal(next.stirs.length, 0, 'afterglow clears after its full life');
});

test('visual state is bounded and reduced-motion clips the drift', () => {
  const swells = tide.createSwells(3, 5);
  const stirs = tide.stir([], .5, .5, 1);
  const full = tide.tideVisual(swells, stirs, 1234, false);
  assert.ok(full.length > 0);
  for (const glow of full) {
    assert.ok(glow.x >= 0 && glow.x <= 1);
    assert.ok(glow.y >= 0 && glow.y <= 1);
    assert.ok(glow.alpha >= 0 && glow.alpha <= 1);
  }
  const reduced = tide.tideVisual(swells, stirs, 9999, true);
  assert.deepEqual(reduced, tide.tideVisual(swells, stirs, 40000, true),
    'reduced motion must hold the field still regardless of now');
});