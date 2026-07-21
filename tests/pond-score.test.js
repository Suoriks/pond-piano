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
assert.equal(memory.startedAt, 1000);
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

const note = (startedAt, releasedAt, x = .5) => score.createMemory([
  { x, y: .5, at: startedAt, pressure: .4 }
], releasedAt);
const motifs = score.groupMotifs([
  note(100, 400, .2),
  note(620, 850, .4),
  note(2400, 2850, .7),
  note(2600, 3000, .8)
]);
assert.equal(motifs.length, 2, 'silence longer than the motif gap must open a new motif');
assert.equal(motifs[0].memories.length, 2, 'nearby sequential notes belong to one motif');
assert.equal(motifs[1].memories.length, 2, 'temporally overlapping notes belong to one motif');
assert.equal(motifs[1].startedAt, 2400);
assert.equal(motifs[1].endedAt, 3000);

const reverseReleaseChord = score.groupMotifs([
  note(300, 600, .8),
  note(100, 900, .2)
], 0);
assert.equal(reverseReleaseChord.length, 1, 'overlapping chord releases stay together regardless of release order');
assert.ok(Object.isFrozen(reverseReleaseChord[0].memories));

const bridgeNote = score.groupMotifs([
  note(100, 300, .2),
  note(700, 900, .8),
  note(0, 1000, .5)
], 0);
assert.equal(bridgeNote.length, 1, 'a held note must bridge every gesture it temporally overlaps');
assert.deepEqual(score.groupMotifs([null, {}]), []);

const crossingMemory = score.createMemory([
  { x: .15, y: .5, at: 100, pressure: .4 },
  { x: .5, y: .48, at: 200, pressure: .5 },
  { x: .85, y: .52, at: 300, pressure: .6 }
], 400);
const crossing = score.findCrossedMemory(
  [crossingMemory], { x: .5, y: .28 }, { x: .5, y: .72 }, 700,
  { width: 390, height: 844, radiusPx: 18 }
);
assert.equal(crossing.memory, crossingMemory, 'a deliberate stroke crossing a visible path must find its memory');
assert.ok(crossing.distancePx < 1);
assert.equal(crossing.segmentIndex, 0);
assert.equal(score.findCrossedMemory(
  [crossingMemory], { x: .04, y: .1 }, { x: .08, y: .2 }, 700,
  { width: 390, height: 844, radiusPx: 18 }
), null, 'a remote stroke must not wake the score');
assert.equal(score.findCrossedMemory(
  [crossingMemory], { x: .5, y: .28 }, { x: .5, y: .72 }, crossingMemory.born + score.lifeMs(),
  { width: 390, height: 844, radiusPx: 18 }
), null, 'an expired score path must no longer be playable');
assert.equal(score.findCrossedMemory(
  [crossingMemory], { x: .5, y: .499 }, { x: .501, y: .501 }, 700,
  { width: 390, height: 844, radiusPx: 18 }
), null, 'tiny pointer jitter must not count as a deliberate crossing');

console.log('pond-score: bounded paths, fading, motifs, and playable path crossings verified');
