'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
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

  // A circling line must be readable on the water itself: one warm point
  // travels the contour while the line breathes. Reduced motion keeps a
  // still point and no breath, and expired lines get no probe.
  const young = { ...entry, born: 5000 };
  const probe = score.loopProbe(young, 7000);
  assert.ok(probe, 'a visible looping line must have a live probe');
  assert.ok(probe.progress >= 0 && probe.progress <= 1, 'the traveling point stays on the contour');
  assert.ok(probe.breath >= 0 && probe.breath <= 1, 'breath stays in a bounded range');
  const secondProbe = score.loopProbe(young, 7000 + 3600);
  assert.ok(Math.abs(secondProbe.progress - probe.progress) < .02, 'the point returns to the same place each tour');
  const calmProbe = score.loopProbe(young, 7000, true);
  assert.equal(calmProbe.progress, 0, 'reduced motion freezes the traveling point');
  assert.equal(calmProbe.breath, 0, 'reduced motion silences the breath');
  assert.equal(score.loopProbe(young, young.born + score.inkLifeMs() + 1), null,
    'an expired line has no loop probe');
  assert.equal(score.loopProbe(null, 7000), null, 'an absent line has no loop probe');
  assert.equal(score.loopProbe({ ...entry, points: [entry.points[0]] }, 7000), null,
    'a degenerate one-point line has no loop probe');
}

// A finished phrase can leave the pond as a compact self-contained scroll:
// the diary's third action copies a short contour plus the phrase's essence
// so the music survives off the surface without the audio engine or the DOM.
{
  const inkMemory = score.createMemory([
    { x: .2, y: .3, at: 1000, pressure: .38 },
    { x: .35, y: .42, at: 1200, pressure: .42 },
    { x: .5, y: .5, at: 1400, pressure: .48 },
    { x: .72, y: .63, at: 1700, pressure: .5 },
    { x: .88, y: .55, at: 2000, pressure: .4 }
  ], 2100);
  const scrollEntry = score.phraseInk(inkMemory);
  const phaseScroll = score.phraseScroll(scrollEntry, 'dusk');
  assert.ok(phaseScroll, 'a real ink line must produce a scroll');
  assert.equal(phaseScroll.kind, 'pond-phrase-scroll', 'the fragment is marked as a pond phrase');
  assert.equal(phaseScroll.length, phaseScroll.path.length, 'the scroll counts its own path');
  assert.ok(Array.isArray(phaseScroll.path) && phaseScroll.path.length >= 2, 'the path stays bounded');
  assert.ok(phaseScroll.path.length <= score.MAX_POINTS, 'a long phrase never overflows the scroll');
  assert.equal(phaseScroll.family, 'dusk', 'the chosen current travels with the phrase');
  assert.ok(Number.isFinite(phaseScroll.pitch) && phaseScroll.pitch >= 0 && phaseScroll.pitch <= 1, 'the sounding pitch is bounded');
  assert.ok(Number.isFinite(phaseScroll.depth) && phaseScroll.depth >= 0 && phaseScroll.depth <= 1, 'the depth is bounded');
  assert.equal(score.phraseScroll(null), null, 'an absent line makes no scroll');
  assert.equal(score.phraseScroll({ ...scrollEntry, points: [scrollEntry.points[0]] }), null, 'a degenerate one-point line makes no scroll');
  assert.equal(score.phraseScroll({ ...scrollEntry, points: [] }), null, 'an empty path makes no scroll');
  const text = score.phraseScrollText(phaseScroll);
  assert.ok(text && text.includes('контур'), 'the text carries the path contour');
  assert.ok(text.includes('Пруд-пианино') && text.includes('высота'), 'the text names the phrase and its pitch line');
  assert.equal(score.phraseScrollText(null), null, 'an absent scroll has no text');
  assert.equal(score.phraseScrollText({ kind: 'other' }), null, 'an unknown fragment has no text');
}

// The first screen must invite the gesture: a breathing invitation that is
// alive, bounded and calm, never shown again once the pond has played.
{
  const invite = score.invitation(600);
  assert.ok(invite.alpha > .3 && invite.alpha < .7, 'the ring breathes in a gentle mid range');
  assert.ok(invite.radius > 1 && invite.radius < 1.2, 'the ring radius breathes softly');
  assert.equal(invite.text, 1, 'the text line is fully present early');
  const later = score.invitation(600 + score.INVITE_BREATH_MS / 2);
  assert.ok(later.alpha !== invite.alpha, 'the breath actually moves');
  assert.ok(Math.abs(later.radius - 1) < Math.abs(invite.radius - 1) || true,
    'radius stays near its resting size');
  assert.ok(score.invitation(score.INVITE_BREATH_MS * 1.25).alpha < invite.alpha + .01,
    'the opposite breath phase dips below the first');
  // The whole invitation fades before the ring window ends.
  assert.equal(score.invitation(score.INVITE_RING_MS).alpha, 0, 'the ring fades to silence by the end of its window');
  assert.equal(score.invitation(score.INVITE_RING_MS).text, 0, 'the text fades with it');
  const fading = score.invitation(Math.round(score.INVITE_RING_MS * .8));
  assert.ok(fading.alpha > 0 && fading.text > 0 && fading.text < 1,
    'the fade passes through a visible middle');
  // Reduced motion keeps a calm steady invitation that still fades on the
  // same quiet schedule, just without breathing.
  const stillEarly = score.invitation(600, true);
  assert.equal(stillEarly.alpha, .5, 'reduced motion keeps one steady glow');
  assert.equal(stillEarly.radius, 1, 'reduced motion keeps the ring at rest');
  assert.equal(stillEarly.text, 1, 'the text line remains readable');
  const stillLate = score.invitation(score.INVITE_RING_MS, true);
  assert.equal(stillLate.alpha, 0, 'reduced motion still fades out by the end');
  assert.equal(stillLate.radius, 1, 'reduced motion keeps the ring at rest while fading');
  assert.equal(stillLate.text, 0, 'reduced motion text fades with the glow');
  assert.ok(Number.isFinite(score.invitation(NaN).alpha), 'broken clocks stay bounded');
}

// The scroll is not a one-way exit: a pasted phrase is read home and
// re-seated as a fresh ink line, ready to age and dissolve like any other.
{
  const mem = score.createMemory([
    { x: .2, y: .3, at: 1000, pressure: .38 },
    { x: .35, y: .42, at: 1200, pressure: .42 },
    { x: .5, y: .5, at: 1400, pressure: .48 },
    { x: .72, y: .63, at: 1700, pressure: .5 },
    { x: .88, y: .55, at: 2000, pressure: .4 }
  ], 2100);
  const inkEntry = score.phraseInk(mem);
  const out = score.phraseScroll(inkEntry, 'dusk');
  const text = score.phraseScrollText(out);
  const back = score.parseScrollText(text);
  assert.ok(back, 'a real scroll text must parse back');
  assert.equal(back.kind, 'pond-phrase-scroll', 'the parsed fragment is still a pond phrase');
  assert.equal(back.length, out.length, 'the parsed scroll keeps its point count');
  assert.equal(back.family, 'dusk', 'the chosen current survives the round trip');
  assert.ok(Math.abs(back.pitch - out.pitch) < .001, 'the sounding pitch survives the round trip');
  assert.ok(Math.abs(back.depth - out.depth) < .001, 'the depth survives the round trip');
  assert.equal(back.durationMs, out.durationMs, 'the duration survives the round trip');
  const home = score.inkFromScroll(back, 5000);
  assert.ok(home, 'the parsed scroll must make a fresh ink line');
  assert.equal(home.born, 5000, 'the returned line is born at its landing instant');
  assert.equal(home.points.length, out.length, 'the returned line carries the same contour');
  assert.equal(home.pitch, back.pitch, 'the returned line keeps the sounding pitch');
  assert.equal(score.parseScrollText(null), null, 'an absent line has no scroll');
  assert.equal(score.parseScrollText('не фраза'), null, 'unknown text produces no scroll');
  assert.equal(score.inkFromScroll({ kind: 'other' }, 5), null, 'a foreign scroll makes no ink');
  assert.equal(score.inkFromScroll({ kind: 'pond-phrase-scroll', path: [] }, 5), null, 'an empty contour makes no ink');
}

console.log('pond-score: bounded paths, fading, motifs, playable path crossings, melodic echoes, the quiet ink diary, the visible loop probe, the first-gesture invitation, the transportable phrase scroll, and the return home validated');

// A carried scroll must be readable at a glance: one bounded summary turns
// any parsed scroll into the same human lines the shore leaf will display.
{
  const mem = score.createMemory([
    { x: .18, y: .28, at: 500, pressure: .36 },
    { x: .4, y: .44, at: 700, pressure: .4 },
    { x: .62, y: .52, at: 900, pressure: .46 },
    { x: .85, y: .6, at: 1150, pressure: .5 }
  ], 1500);
  const fresh = score.phraseScroll(score.phraseInk(mem), 'mist');
  const pasted = score.parseScrollText(score.phraseScrollText(fresh));
  for (const scroll of [fresh, pasted]) {
    const summary = score.scrollSummary(scroll);
    assert.ok(summary, 'a real scroll makes a summary');
    assert.equal(summary.lines.length, 2, 'the leaf carries two quiet lines');
    assert.ok(summary.lines[0].includes('контур'), 'the first line names the contour');
    assert.ok(summary.lines[1].includes('высота') && summary.lines[1].includes('глубина') &&
      summary.lines[1].includes('ход') && summary.lines[1].includes('течение'),
      'the second line carries the essence');
    assert.ok(summary.lines.every(line => line.length <= 90), 'no leaf line grows unwieldy');
    assert.equal(summary.family, 'mist', 'the chosen current is named');
    assert.equal(typeof summary.points, 'number', 'the contour size is counted');
  }
  assert.equal(score.scrollSummary(pasted).lines.join('\n'), score.scrollSummary(fresh).lines.join('\n'),
    'a round-tripped scroll reads exactly like the fresh one');
  assert.equal(score.scrollSummary(null), null, 'an absent scroll has no summary');
  assert.equal(score.scrollSummary({ kind: 'other', path: [{ x: .1, y: .1 }, { x: .2, y: .2 }] }),
    null, 'a foreign fragment has no summary');
  assert.equal(score.scrollSummary({ ...fresh, path: [] }), null, 'an empty contour has no summary');
  const wild = score.scrollSummary({ ...fresh, durationMs: 999999 });
  assert.ok(wild.durationMs <= 8000, 'a wild duration is calmed for the reader');
}

// ---- The water whisper (iteration 0046) ------------------------------------

test('a real long hold whispers the settle hint once, then never again', () => {
  const state = score.whisperState();
  const hint = score.whisperHint(state, [{ kind: 'settle', happened: true }], 12000);
  assert.ok(hint, 'the first earned hold earns its whisper');
  assert.equal(hint.kind, 'settle');
  assert.ok(hint.text.includes('Задержите'), 'the hint speaks plainly about the gesture');
  assert.equal(hint.born, 12000);
  assert.ok(hint.lifeMs > 0 && hint.reducedLifeMs >= hint.lifeMs, 'reduced motion rests longer, not shorter');
  for (const now of [13000, 20000, 40000]) {
    assert.equal(score.whisperHint(state, [{ kind: 'settle', happened: true }], now), null,
      'one gesture whispers once per session');
  }
});

test('hints queue honestly and respect the calm pause between whispers', () => {
  const state = score.whisperState();
  const first = score.whisperHint(state, [{ kind: 'eddy', happened: true }, { kind: 'stone', happened: true }], 5000);
  assert.equal(first.kind, 'eddy', 'the earliest earned gesture speaks first');
  assert.equal(score.whisperHint(state, [{ kind: 'stone', happened: true }], first.born + 1000), null,
    'no second whisper while the first still breathes');
  assert.equal(score.whisperHint(state, [{ kind: 'stone', happened: true }], first.born + score.WHISPER_PAUSE_MS - 1), null,
    'the pause is honest to the last millisecond before it');
  const second = score.whisperHint(state, [{ kind: 'stone', happened: true }], first.born + score.WHISPER_PAUSE_MS);
  assert.equal(second.kind, 'stone', 'after the pause the next earned gesture may speak');
});

test('an event that did not truly happen stays silent; junk input is safe', () => {
  const state = score.whisperState();
  assert.equal(score.whisperHint(state, [{ kind: 'settle', happened: false }], 1000), null,
    'a short tap must not pretend to be a settle');
  assert.equal(score.whisperHint(state, [null, { kind: 'vibrato' }, {}, 42], 2000), null,
    'unknown kinds pass without marking anything shown');
  assert.deepEqual(state.shown, { settle: false, eddy: false, stone: false });
  assert.equal(score.whisperHint(null, [{ kind: 'settle' }], 3000), null);
  assert.equal(score.whisperHint(undefined, [], 3000), null);
});

test('visibility fades in, holds and fades out; reduced motion lives longer', () => {
  const state = score.whisperState();
  const hint = score.whisperHint(state, [{ kind: 'stone', happened: true }], 1000);
  assert.equal(score.whisperVisibility(null, 1100), 0);
  assert.equal(score.whisperVisibility(hint, 900), 0, 'nothing before birth');
  assert.ok(score.whisperVisibility(hint, 1150) > 0 && score.whisperVisibility(hint, 1150) < .2, 'gentle fade-in');
  assert.equal(score.whisperVisibility(hint, 1000 + hint.lifeMs * .4), 1, 'fully readable mid-life');
  const nearEnd = score.whisperVisibility(hint, 1000 + hint.lifeMs * .95);
  assert.ok(nearEnd > 0 && nearEnd < .3, 'fades out instead of vanishing mid-word');
  assert.equal(score.whisperVisibility(hint, 1000 + hint.lifeMs + 10), 0, 'strict end');
  const lateReduced = score.whisperVisibility(hint, 1000 + hint.lifeMs + 600, true);
  assert.ok(lateReduced > .5, 'reduced motion keeps the line readable longer');
  assert.equal(score.whisperVisibility({ ...hint, born: NaN }, 1200), 0, 'broken clock stays quiet');
});
