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

// A crossed phrase wakes as a small melodic figure of its own real anchor points.
assert.deepEqual(score.melodyAnchors(crossingMemory, 3).map(point => point.pitch),
  [.15, .5, .85], 'a three-anchor echo must expose evenly spaced points and end on the real final one');
assert.deepEqual(score.melodyAnchors(crossingMemory, 3).map(point => point.y),
  [.5, .48, .52]);
const single = score.melodyAnchors(crossingMemory, 1);
assert.equal(single.length, 1);
assert.equal(single[0].x, .85, 'a one-note echo must sound only the stored final point');
assert.ok(score.melodyAnchors(crossingMemory, 9).length <= 4, 'the echo must stay bounded to at most four distinct anchors');
assert.deepEqual(score.melodyAnchors(null, 3), [], 'an absent memory must wake no echo');
assert.equal(score.melodyAnchors(crossingMemory, -5)[0].x, .85, 'a broken requested maximum must fall back to the final point');

// The pond's quiet diary: bounded fading ink lines, pourable while visible.
{
  const inkMemory = score.createMemory([
    { x: .1, y: .3, at: 0, pressure: .4 },
    { x: .5, y: .45, at: 300, pressure: .5 },
    { x: .9, y: .6, at: 700, pressure: .6 }
  ], 900);
  const entry = score.phraseInk(inkMemory);
  assert.ok(entry, 'a finished phrase must become an ink line');
  assert.equal(entry.points.length, 3);
  assert.equal(entry.depth, .6);
  assert.equal(score.phraseInk(null), null, 'an absent phrase writes nothing');
  assert.equal(score.phraseInk(score.createMemory([
    { x: .2, y: .5, at: 0, pressure: .4 }
  ], 100)), null, 'a single-point gesture has no line to write');

  let diary = [];
  for (let index = 0; index < score.MAX_INK + 2; index += 1) {
    diary = score.appendPhraseInk(diary, { ...entry, born: index * 10 }, index * 10);
  }
  assert.equal(diary.length, score.MAX_INK, 'the diary must stay bounded');
  assert.equal(diary[0].born, (score.MAX_INK + 2 - score.MAX_INK) * 10, 'oldest lines leave first');
  const expired = score.appendPhraseInk(
    [{ ...entry, born: -score.INK_LIFE_MS - 1 }, null, { ...entry, born: 5 }], entry, 1000
  );
  assert.equal(expired.length, 2, 'expired and broken lines are dropped at append time');
  assert.equal(score.appendPhraseInk(diary, null, 1000).length, score.MAX_INK, 'broken input never grows the diary');

  assert.equal(score.inkVisibility(entry, entry.born - 1), 0);
  assert.ok(score.inkVisibility(entry, entry.born + 2000) > .99, 'a fresh line is fully on the water');
  assert.ok(score.inkVisibility(entry, entry.born + score.inkLifeMs() * .85) < .5, 'an old line is dissolving');
  assert.equal(score.inkVisibility(entry, entry.born + score.inkLifeMs()), 0);
  assert.ok(score.inkLifeMs(true) < score.inkLifeMs(false), 'reduced motion shortens the ink patience');
  assert.ok(score.inkVisibility(entry, entry.born + score.inkLifeMs(true) + 1, true) === 0,
    'reduced-motion expiry must hold');

  const fresh = { ...entry, born: 5000 };
  const dissolving = { ...entry, born: 10000 - score.inkLifeMs() + 6000 };
  const gone = { ...entry, born: 10000 - score.inkLifeMs() - 100 };
  const pourable = score.pourableInk([gone, dissolving, fresh], 10000);
  assert.deepEqual(pourable.map(line => line.born), [dissolving.born, fresh.born],
    'only still-visible lines can be poured back, oldest first');
  assert.equal(score.pourableInk(null, 0).length, 0);

  // The pouring loop: a still-visible line may keep circling a few quiet
  // passes, always inside its own ink life, and nothing broken loops.
  const loopNow = 5000;
  const schedule = score.loopSchedule({ ...entry, born: loopNow - 2000 }, loopNow);
  assert.ok(Array.isArray(schedule) && schedule.length > 0, 'a young line gets a bounded loop schedule');
  assert.ok(schedule.length <= score.MAX_LOOP_PASSES, 'the loop never exceeds its cap');
  for (const pass of schedule) {
    assert.ok(pass.at > 0 && pass.at < score.INK_LIFE_MS, 'every pass stays inside the ink life');
    assert.equal(pass.pass, schedule.indexOf(pass), 'passes come in order');
  }
  assert.deepEqual(score.loopSchedule(null, loopNow), [], 'an absent line never loops');
  assert.deepEqual(score.loopSchedule({ ...entry, born: 100 }, score.INK_LIFE_MS + 101), [],
    'an already-expired line has no passes');
  const short = score.loopSchedule({ ...entry, born: loopNow - (score.INK_LIFE_MS - 200) }, loopNow);
  assert.ok(short.length < schedule.length, 'an older line loops fewer times');
  const quiet = score.loopSchedule({ ...entry, born: loopNow - 2000 }, loopNow, 3, true);
  assert.ok(quiet.length <= 3 && quiet.length <= schedule.length, 'reduced motion keeps the loop quieter');
}

console.log('pond-score: bounded paths, fading, motifs, playable path crossings, melodic echoes, and the quiet ink diary verified');
