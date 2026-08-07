'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const waves = require('../pond-waves.js');

test('predicts the first elliptical wave-front meeting without renderer frames', () => {
  const a = waves.createWave({ id: 'a', x: 40, y: 120, born: 1000, pressure: .5, strength: 1, frequency: 220 });
  const b = waves.createWave({ id: 'b', x: 280, y: 120, born: 1160, pressure: .6, strength: .9, frequency: 440 });
  const collision = waves.predictCollision(a, b, 1160);
  assert.ok(collision);
  assert.ok(collision.at > 1160 && collision.delayMs < waves.MAX_COLLISION_DELAY_MS);
  assert.ok(collision.x > a.x && collision.x < b.x);
  assert.equal(collision.y, 120);
  assert.ok(Math.abs(collision.parentFrequency - Math.sqrt(220 * 440)) < .000001);
  assert.deepEqual(collision, waves.predictCollision(a, b, 1160), 'frame cadence must not affect prediction');
});

test('uses the pond ellipse rather than circular screen distance', () => {
  const a = waves.createWave({ id: 1, x: 160, y: 80, born: 0, pressure: .5 });
  const b = waves.createWave({ id: 2, x: 160, y: 210, born: 0, pressure: .5 });
  const collision = waves.predictCollision(a, b, 0);
  assert.ok(collision);
  assert.equal(collision.x, 160);
  assert.ok(collision.y > 80 && collision.y < 210);
});

test('rejects overlaps, expired fronts and inaudible meetings', () => {
  const closeA = waves.createWave({ id: 'close-a', x: 100, y: 100, born: 0 });
  const closeB = waves.createWave({ id: 'close-b', x: 130, y: 100, born: 0 });
  assert.equal(waves.predictCollision(closeA, closeB, 0), null);

  const old = waves.createWave({ id: 'old', x: 0, y: 0, born: 0 });
  const fresh = waves.createWave({ id: 'fresh', x: 300, y: 0, born: 4000 });
  assert.equal(waves.predictCollision(old, fresh, 4000), null);

  const farA = waves.createWave({ id: 'far-a', x: 0, y: 0, born: 0 });
  const farB = waves.createWave({ id: 'far-b', x: 1200, y: 0, born: 0 });
  assert.equal(waves.predictCollision(farA, farB, 0), null);
});

test('pair latches have stable order and wave lifetime stays bounded', () => {
  const a = waves.createWave({ id: '17', x: 0, y: 0, born: 0 });
  const b = waves.createWave({ id: '3', x: 100, y: 0, born: 0 });
  assert.equal(waves.pairKey(a, b), waves.pairKey(b, a));
  assert.ok(waves.isAlive(a, waves.lifeMs(a) - 1));
  assert.equal(waves.isAlive(a, waves.lifeMs(a)), false);
});
