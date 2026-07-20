'use strict';

const assert = require('node:assert/strict');
const score = require('../pond-score.js');

const samples = Array.from({ length: 80 }, (_, index) => ({
  x: index / 79,
  y: .2 + index / 158,
  at: 1000 + index * 20,
  pressure: .35 + index / 400
}));
const memory = score.createMemory(samples, 3000);
assert.ok(memory);
assert.equal(memory.points.length, score.MAX_POINTS, 'long gestures must have a bounded score path');
assert.deepEqual(memory.points[0], samples[0]);
assert.deepEqual(memory.points.at(-1), samples.at(-1));
assert.equal(memory.pitch, 1);
assert.equal(memory.depth, .7);
assert.equal(memory.durationMs, 2000);
assert.equal(score.visibility(memory, memory.born - 1), 0);
assert.ok(score.visibility(memory, memory.born + 300) > .99);
assert.equal(score.visibility(memory, memory.born + score.lifeMs()), 0);
assert.ok(score.lifeMs(true) < score.lifeMs(false));

let phrase = [];
for (let index = 0; index < score.MAX_MEMORIES + 3; index += 1) {
  phrase = score.append(phrase, score.createMemory([{ x: index / 20, y: .5, at: index }], 100 + index));
}
assert.equal(phrase.length, score.MAX_MEMORIES, 'phrase memory must stay bounded');
assert.equal(phrase[0].born, 103);
assert.equal(score.createMemory([], 100), null);

console.log('pond-score: bounded phrase paths, duration, and fading verified');
