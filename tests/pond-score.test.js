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
assert.deepEqual(memory.points[0], { ...samples[0], pitch: samples[0].x });
assert.deepEqual(memory.points.at(-1), { ...samples.at(-1), pitch: samples.at(-1).x });
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

const precisionMemory = score.createMemory([
  { x: .64, y: .45, pitch: .58, at: 10, pressure: .4 },
  { x: .67, y: .46, pitch: .59, at: 90, pressure: .4 }
], 120);
assert.equal(precisionMemory.points.at(-1).x, .67, 'the visible score path must preserve the real contact');
assert.equal(precisionMemory.pitch, .59, 'the score must remember the finely controlled sounding pitch');

const note = (startedAt, releasedAt, x = .5) => score.createMemory([
  { x, y: .5, at: startedAt, pressure: .4 }
], releasedAt);

// Phrase survives reload: serialize against epoch wall-clock, restore into the new run's perf clock.
const savedPerf = 50000, savedEpoch = 1700000000000;
const phraseMemories = [
  score.createMemory([{ x: .2, y: .5, at: 49000, pressure: .4 }], 49500),
  score.createMemory([{ x: .62, y: .72, at: 49600, pressure: .6 }], 49900)
];
const serialized = score.serializePhrase(phraseMemories, savedPerf, savedEpoch);
assert.equal(typeof serialized, 'string');
const restored = score.restorePhrase(serialized, 5000, savedEpoch + 5000);
assert.equal(restored.length, 2, 'a saved phrase must come back after reload');
assert.equal(restored[1].born, -100, 'the phrase was released 100ms before save, so on the new run it lands just before origin');
assert.equal(restored[0].born, -500, 'the older phrase lands earlier on the new timeline');
assert.equal(score.visibility(restored[1], 5000), 1, 'a phrase released moments before reload must be fully readable on the new run');
const stayVisible = score.visibility(restored[1], 10000);
assert.ok(stayVisible > 0 && stayVisible < 1, 'a phrase right after restart must still be readable and fading');
assert.equal(restored[1].pitch, .62, 'restored sounding pitch survives');
assert.equal(restored[1].depth, .72, 'restored depth survives');
const midRestored = score.restorePhrase(serialized, 12000, savedEpoch + 12000);
assert.equal(midRestored.length, 2, 'a mid-life phrase must still restore');
const staleRestored = score.restorePhrase(serialized, 50000, savedEpoch + score.lifeMs() + 1000);
assert.equal(staleRestored.length, 0, 'an expired phrase must not reappear');
assert.deepEqual(score.restorePhrase('not json', 5000, savedEpoch), [], 'damaged stored phrase must fall back safely');
assert.deepEqual(score.restorePhrase('', 5000, savedEpoch), []);
assert.equal(score.serializePhrase([], 1000, 1), null, 'no visible memories means nothing worth persisting');


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
