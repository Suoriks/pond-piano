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

test('collision glint is a bounded flare that follows depth and energy', () => {
  const glint = waves.collisionGlint(.8, 1, 380, 0);
  assert.equal(glint.life, waves.GLINT_LIFE_MS);
  assert.ok(glint.progress > 0 && glint.progress < 1);
  assert.ok(glint.fade > 0);
  assert.ok(glint.radius > 0);
  assert.equal(glint.alpha, glint.fade);

  const shallowWeak = waves.collisionGlint(.2, 0, 190, 0);
  const deepStrong = waves.collisionGlint(1, 1, 190, 0);
  assert.ok(deepStrong.fade > shallowWeak.fade, 'stronger meeting throws a brighter flare');
  assert.ok(deepStrong.radius > shallowWeak.radius, 'deeper water spreads the flare wider');
  assert.ok(deepStrong.warmth > shallowWeak.warmth, 'deep folds amber, shallow stays herbal');
});

test('collision glint ends exactly on schedule and handles broken clocks', () => {
  const finished = waves.collisionGlint(.5, .5, 2000, 1000);
  assert.equal(finished.age, waves.GLINT_LIFE_MS);
  assert.equal(finished.progress, 1);
  assert.equal(finished.fade, 0);
  assert.equal(finished.radius, 0);
  assert.equal(finished.alpha, 0);

  const broken = waves.collisionGlint(NaN, NaN, NaN, NaN);
  assert.ok(Number.isFinite(broken.fade));
  assert.ok(Number.isFinite(broken.radius));
  assert.ok(Number.isFinite(broken.warmth));
  assert.equal(broken.age, 0);

  const beforeBirth = waves.collisionGlint(.5, .5, 100, 300);
  assert.equal(beforeBirth.age, 0, 'a glint cannot age before it is born');
  assert.equal(beforeBirth.fade, 0);
});

test('reduced motion keeps a calm still glow with no expansion', () => {
  const calm = waves.collisionGlint(.9, 1, 300, 0, true);
  const lively = waves.collisionGlint(.9, 1, 300, 0, false);
  assert.ok(calm.radius < lively.radius, 'reduced motion must not expand the flare');
  assert.ok(calm.alpha < lively.alpha, 'reduced motion keeps the glow quieter');
  assert.ok(calm.fade > 0 && calm.alpha > 0, 'but the answer still shows on the water');
});

test('release glint lives exactly as long as the note\'s stretched departure', () => {
  const tap = waves.releaseGlint(0, .5, 150, 0);
  assert.equal(tap.life, Math.round(waves.releaseLifeSeconds(0, .5) * 1000));
  assert.ok(tap.progress > 0 && tap.progress < 1);
  assert.equal(tap.alpha, tap.fade);
  assert.ok(tap.fade > 0);
  assert.ok(tap.sink > 0, 'the light visibly descends while it fades');

  const quick = waves.releaseLifeSeconds(0, .5);
  const settledDeep = waves.releaseLifeSeconds(1, .8);
  assert.ok(settledDeep > quick, 'a long-settled deep note departs visibly longer');
  assert.ok(settledDeep <= waves.RELEASE_LIFE_MAX_S && quick >= waves.RELEASE_LIFE_MIN_S,
    'the visible life stays bounded like the audio tail');
});

test('release glint dims monotonically and sinks further with progress', () => {
  const early = waves.releaseGlint(.6, .7, 100, 0);
  const late = waves.releaseGlint(.6, .7, early.life * .75, 0);
  assert.ok(late.fade < early.fade, 'the pool keeps dimming toward silence');
  assert.ok(late.sink > early.sink, 'and keeps descending while it dims');
  const mid = waves.releaseGlint(.2, .5, 10, 0);
  assert.ok(mid.sink > 0 && mid.sink < 1, 'sink stays a bounded progress value');
});

test('release glint ends on schedule and survives broken inputs', () => {
  const life = waves.releaseLifeSeconds(.5, .6) * 1000;
  const finished = waves.releaseGlint(.5, .6, 5000 + life + 1, 5000);
  assert.equal(finished.progress, 1);
  assert.equal(finished.fade, 0);
  assert.equal(finished.radius, 0);
  assert.equal(finished.alpha, 0);

  const beforeDeparture = waves.releaseGlint(.5, .6, 900, 1200);
  assert.equal(beforeDeparture.age, 0, 'light cannot sink before the note leaves');
  assert.equal(beforeDeparture.fade, 0);

  const junk = waves.releaseGlint(NaN, NaN, NaN, NaN);
  [junk.fade, junk.sink, junk.radius, junk.warmth].every(v => assert.ok(Number.isFinite(v)));
  assert.ok(junk.life / 1000 >= waves.RELEASE_LIFE_MIN_S && junk.life / 1000 <= waves.RELEASE_LIFE_MAX_S);
});

test('reduced motion lets the departure rest instead of sinking', () => {
  const calm = waves.releaseGlint(.9, 1.05, 260, 0, true);
  const lively = waves.releaseGlint(.9, 1.05, 260, 0, false);
  assert.equal(calm.sink, 0, 'no descent under reduced motion');
  assert.ok(calm.fade > 0 && calm.alpha > 0, 'but the light still rests on the water');
  assert.ok(calm.radius < lively.radius, 'and stays more gathered than the drifting pool');
});

test('predicts a ripple ring lapping the near shore', () => {
  const wave = waves.createWave({ id: 9, x: 120, y: 620, born: 1000, pressure: .95, strength: 1, frequency: 330 });
  const bounds = { width: 390, height: 844, shoreTop: 690 };
  const lap = waves.predictShore(wave, 1000, bounds);
  assert.ok(lap, 'a rising ring below the bank should fold');
  assert.ok(lap.at > 1000 && lap.delayMs <= waves.MAX_COLLISION_DELAY_MS);
  assert.equal(lap.y, 690, 'the fold lands on the shoreline');
  assert.ok(lap.energy > 0 && lap.energy <= 1, 'energy stays bounded');
  assert.equal(lap.parentFrequency, 330, 'the lap keeps the ring\'s pitch');
});

test('shore prediction stays quiet for resting, expired and broken rings', () => {
  const resting = waves.createWave({ id: 'r', x: 100, y: 780, born: 0, pressure: .5 });
  assert.equal(waves.predictShore(resting, 0, { width: 390, height: 844, shoreTop: 690 }), null,
    'a ring already on the bank does not lap again');
  const expired = waves.createWave({ id: 'e', x: 60, y: 200, born: 0, pressure: .5 });
  assert.equal(waves.predictShore(expired, 9000, { width: 390, height: 844, shoreTop: 690 }), null,
    'an expired ring cannot reach the shore');
  const broken = waves.createWave({ id: 'b', x: NaN, y: 100, born: 0 });
  assert.equal(waves.predictShore(broken, 0, { width: 390, height: 844, shoreTop: 690 }), null,
    'broken rings never fold');
  assert.equal(waves.predictShore(null, 0, { width: 390, height: 844, shoreTop: 690 }), null);
});

test('shore fold is a bounded quiet return curl', () => {
  const fold = waves.shoreFold(.5, .6, 200, 0);
  assert.ok(fold.progress > 0 && fold.progress < 1);
  assert.ok(fold.alpha > 0 && fold.fade > 0, 'the lap shows while it returns');
  assert.ok(fold.fold > 0 && fold.fold < 1, 'return curl is a bounded progress');
  const late = waves.shoreFold(.5, .6, 5000 + waves.SHORE_FOLD_MS, 5000);
  assert.equal(late.progress, 1);
  assert.equal(late.fade, 0);
  assert.equal(late.alpha, 0);
  const before = waves.shoreFold(.5, .6, 900, 1100);
  assert.equal(before.age, 0, 'no lap before the ring reaches the bank');
  const junk = waves.shoreFold(NaN, NaN, NaN, NaN);
  [junk.fade, junk.fold, junk.radius, junk.warmth].every(v => assert.ok(Number.isFinite(v)));
});

test('reduced motion calms the lapping return', () => {
  const calm = waves.shoreFold(.9, .5, 200, 0, true);
  const lively = waves.shoreFold(.9, .5, 200, 0, false);
  assert.equal(calm.fold, 0, 'no returning motion under reduced motion');
  assert.ok(calm.fade > 0 && calm.alpha > 0, 'but the lap still shows on the water');
  assert.ok(calm.radius < lively.radius, 'and stays gathered');
});

// The pond reads its own score: a ripple whose ring first touches a still
// readable ink line is predicted in pure geometry, exact px, earliest time.
const mkLine = (points, born = 0, life = 60000) => ({
  born, life,
  points: points.map(([x, y, pitch]) => ({
    x, y, pitch: Number.isFinite(pitch) ? pitch : x
  }))
});

test('predicts the first crossing of a ripple with a readable ink line', () => {
  // A line running down the middle of the pond; a ring born at the left.
  const line = mkLine([[.5, .3], [.5, .8]], 0, 60000);
  const wave = waves.createWave({ id: 'w', x: 150, y: 420, born: 0, pressure: .5, frequency: 330 });
  const read = waves.predictInkRead(wave, 0, line, { width: 390, height: 844 });
  assert.ok(read, 'a ring near a fresh line must predict a crossing');
  assert.ok(read.at > 0 && read.delayMs > 0, 'crossing lies in the future');
  assert.ok(Math.abs(read.nx - .5) < .02, 'crossing sits on the vertical line');
  assert.ok(read.nx >= 0 && read.nx <= 1 && read.ny >= 0 && read.ny <= 1, 'normalized inside the pond');
  assert.ok(read.energy > 0 && read.energy <= 1, 'energy stays bounded');
  assert.equal(read.parentFrequency, 330, 'keeps the ripple pitch');
});

test('no prediction for standing, expired or misplaced ink', () => {
  // A line whose endpoint sits exactly under the born ring: already touching.
  const atOrigin = mkLine([[60 / 390, 200 / 844], [.15, .3]], 0, 60000);
  const wave = waves.createWave({ id: 'w', x: 60, y: 200, born: 0, pressure: .5, frequency: 220 });
  assert.equal(waves.predictInkRead(wave, 0, atOrigin, { width: 390, height: 844 }), null,
    'a ring already past the spot cannot read it');
  // Fresh ripple but the line is already gone before either can meet.
  const dying = mkLine([[.5, .3], [.5, .8]], 100000, 60000);
  assert.equal(waves.predictInkRead(wave, 0, dying, { width: 390, height: 844 }), null,
    'a line that died before the meeting never answers');
  // Ripple already expired.
  assert.equal(waves.predictInkRead(wave, 9000, atOrigin, { width: 390, height: 844 }), null);
  // Broken inputs.
  const goodLine = mkLine([[.5, .3], [.5, .8]], 0, 60000);
  assert.equal(waves.predictInkRead(null, 0, goodLine, { width: 390, height: 844 }), null);
  assert.equal(waves.predictInkRead(wave, 0, { points: [] }, { width: 390, height: 844 }), null);
  assert.equal(waves.predictInkRead(wave, 0, mkLine([[.5, .3]]), { width: 390, height: 844 }), null);
});
