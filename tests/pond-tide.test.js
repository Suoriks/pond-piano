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

test('the water is honest about a course nobody chose', () => {
  assert.equal(tide.courseWater('dawn'), tide.courseWater('dawn'), 'the same course is the same pigment');
  assert.equal(tide.courseWater('dawn').id, tide.COURSE_WATER_DEFAULT);
  for (const wrong of ['unknown', '', null, undefined, 42, {}, [], 'constructor', 'toString']) {
    assert.equal(tide.courseWater(wrong).id, tide.COURSE_WATER_DEFAULT,
      `an unknown course must read as the pond's own water, not invent one: ${String(wrong)}`);
  }
  for (const id of Object.keys(tide.COURSE_WATER)) {
    assert.ok(Object.isFrozen(tide.courseWater(id)), 'a palette is never mutated in place');
    assert.ok(Object.isFrozen(tide.courseWater(id).outer), 'its stops are frozen too');
  }
});

test('each course wears its own water', () => {
  const dawn = tide.courseWater('dawn');
  const dusk = tide.courseWater('dusk');
  const mist = tide.courseWater('mist');
  assert.notEqual(dawn, dusk);
  assert.notEqual(dusk, mist);
  assert.notEqual(dawn, mist);
  assert.notDeepEqual(dawn.outer, dusk.outer);
  assert.notDeepEqual(dawn.outer, mist.outer);
  assert.notDeepEqual(dusk.outer, mist.outer, 'no two courses may paint the same depth');
  assert.ok(mist.outer.l > dawn.outer.l, 'mist is the paler water');
  assert.ok(mist.outer.s < dawn.outer.s, 'mist gives up colour rather than adding it');
  assert.ok(Math.abs(dusk.outer.h - dawn.outer.h) > 20, 'dusk turns the water away from dawn');
  assert.ok(Math.abs(mist.outer.h - dawn.outer.h) > 10, 'mist is its own hue as well');
});

test('every course keeps a calm mineral pigment', () => {
  for (const id of Object.keys(tide.COURSE_WATER)) {
    const water = tide.courseWater(id);
    for (const key of ['inner', 'mid', 'outer']) {
      const stop = water[key];
      assert.ok(stop.h >= 0 && stop.h <= 360, `${id} ${key} hue stays a hue`);
      assert.ok(stop.s >= 8 && stop.s <= 80, `${id} ${key} stays a mineral water, not a poster`);
      assert.ok(stop.l >= 3 && stop.l <= 45, `${id} ${key} stays deep enough to read as water`);
    }
    for (const key of ['cool', 'warm']) {
      const streak = water[key];
      assert.ok(streak.s >= 8 && streak.s <= 60, `${id} ${key} streak stays quiet`);
      assert.ok(streak.l >= 55 && streak.l <= 82, `${id} ${key} streak stays readable above the water`);
    }
    assert.ok(water.moteHue >= 0 && water.moteHue <= 360);
    assert.ok(water.tideHue >= 0 && water.tideHue <= 360);
    assert.ok(water.moteRange >= 0 && water.moteRange <= 60);
    assert.ok(water.tideSpread >= 0 && water.tideSpread <= 60);
  }
});

test('the crossfade keeps both ends and never invents a third colour', () => {
  const dawn = tide.courseWater('dawn');
  const dusk = tide.courseWater('dusk');
  assert.deepEqual(tide.blendWaterPalette(dawn, dusk, 0), dawn, 'the start is untouched');
  assert.deepEqual(tide.blendWaterPalette(dawn, dusk, 1), dusk, 'the end is untouched');
  assert.equal(tide.blendWaterPalette(dawn, dusk, .5).id, dusk.id, 'a blend is heading somewhere named');
  const half = tide.blendWaterPalette(dawn, dusk, .5);
  assert.ok(Math.abs(half.outer.l - (dawn.outer.l + dusk.outer.l) / 2) < 1e-9, 'lightness walks straight');
  assert.ok(half.outer.l > Math.min(dawn.outer.l, dusk.outer.l) && half.outer.l < Math.max(dawn.outer.l, dusk.outer.l));
  let previous = null;
  for (const step of [0, .1, .25, .5, .75, .9, 1]) {
    const look = tide.blendWaterPalette(dawn, dusk, step);
    assert.ok(Object.isFrozen(look), 'a blended frame is frozen like any palette');
    assert.ok(look.outer.l >= Math.min(dawn.outer.l, dusk.outer.l) - 1e-9
      && look.outer.l <= Math.max(dawn.outer.l, dusk.outer.l) + 1e-9, 'the pigment never leaves its two ends');
    if (previous !== null) assert.ok(Math.abs(look.outer.l - dusk.outer.l) <= Math.abs(previous - dusk.outer.l) + 1e-9,
      'the shift always moves toward the course that was chosen, never past it');
    previous = look.outer.l;
  }
  for (const wrong of [-1, -0.001, 2, NaN, Infinity, 'half', null, undefined]) {
    const clamped = tide.blendWaterPalette(dawn, dusk, wrong);
    assert.ok(clamped === dawn || clamped === dusk, `a broken clock is clamped, not extrapolated: ${String(wrong)}`);
  }
  assert.equal(tide.blendWaterPalette(null, dusk, .5), dusk, 'a broken start leaves the honest end');
  assert.equal(tide.blendWaterPalette(dawn, null, .5), dawn, 'a broken end leaves the honest start');
  assert.equal(tide.blendWaterPalette(null, null, .5).id, tide.COURSE_WATER_DEFAULT, 'nothing honest left reads as dawn');
});

test('hues travel the short way round the wheel', () => {
  const water = tide.courseWater('mist');
  for (const a of Object.keys(tide.COURSE_WATER)) {
    for (const b of Object.keys(tide.COURSE_WATER)) {
      const from = tide.courseWater(a), to = tide.courseWater(b);
      if (from.id === to.id) continue;
      const middle = tide.blendWaterPalette(from, to, .5);
      for (const key of ['inner', 'mid', 'outer', 'cool', 'warm']) {
        const delta = middle[key].h - from[key].h;
        assert.ok(Math.abs(delta) <= 180 + 1e-9, `${a}->${b} ${key} must not sweep the long way`);
      }
      assert.ok(Math.abs(middle.moteHue - from.moteHue) <= 180 + 1e-9, `${a}->${b} mote tone stays on the short arc`);
      assert.ok(Math.abs(middle.tideHue - from.tideHue) <= 180 + 1e-9, `${a}->${b} tide tone stays on the short arc`);
    }
  }
  // A wrap that no current course needs, so a future pigment across the seam is
  // covered by the same rule: 350 -> 162 climbs through 0, not back through 180.
  const wrapped = {
    ...water,
    inner: { h: 350, s: water.inner.s, l: water.inner.l },
    moteHue: 350, tideHue: 350
  };
  const blend = tide.blendWaterPalette(wrapped, water, .5);
  const normalize = h => ((h % 360) + 360) % 360;
  // 350 -> 156 is +166 degrees the short way; the long way would be -194.
  const shortClimb = ((((water.inner.h - 350) % 360) + 540) % 360) - 180;
  assert.equal(shortClimb, 166, 'the short way from 350 to 156 really is the climb through 0');
  const expected = normalize(350 + shortClimb / 2);
  assert.equal(expected, 73);
  const midpointOf = (from, to) => normalize(from + (((((to - from) % 360) + 540) % 360) - 180) / 2);
  assert.ok(Math.abs(normalize(blend.inner.h) - expected) < 1e-9, 'the seam is crossed the short way');
  assert.ok(Math.abs(normalize(blend.inner.h) - midpointOf(350, water.inner.h)) < 1e-9);
  assert.ok(Math.abs(normalize(blend.moteHue) - midpointOf(350, water.moteHue)) < 1e-9, 'the mote tone follows the same arc');
  assert.ok(Math.abs(normalize(blend.tideHue) - midpointOf(350, water.tideHue)) < 1e-9, 'the tide tone follows the same arc');
  assert.ok(Math.abs(normalize(blend.inner.h) - 266) > 100, 'it never dives the other way round');
});

test('the diary keeps its own quill on dawn', () => {
  // Dawn must stay byte for byte the ink the pond has always written: the two
  // strokes of the line were hsla(h 46% 60%) and hsla(h 60% 76%), with
  // h = 158 + 26 * (1 - depth). Nothing about the reader's hand may change.
  const water = tide.courseWater('dawn');
  for (const depth of [0, .25, .5, .75, 1]) {
    const tone = tide.inkTone(water, depth);
    assert.equal(tone.hue, 158 + 26 * (1 - depth), `depth ${depth} keeps the ink hue the pond wrote`);
    assert.equal(tone.soft.s, 46);
    assert.equal(tone.soft.l, 60);
    assert.equal(tone.fine.s, 60);
    assert.equal(tone.fine.l, 76);
  }
  assert.ok(Object.isFrozen(tide.inkTone(water, .5)), 'a tone is frozen like any palette');
  assert.ok(Object.isFrozen(tide.inkTone(water, .5).soft), 'its strokes are frozen too');
});

test('each course hands the diary its own quill', () => {
  const tones = {};
  for (const id of Object.keys(tide.COURSE_WATER)) {
    tones[id] = tide.inkTone(tide.courseWater(id), .5);
  }
  assert.ok(Math.abs(tones.dusk.hue - tones.dawn.hue) > 25, 'dusk writes the diary in its own cool blue');
  assert.ok(Math.abs(tones.mist.hue - tones.dawn.hue) > 1, 'mist is its own hand as well');
  assert.ok(tones.mist.soft.s < tones.dawn.soft.s, 'mist writes with a thinner, paler quill');
  assert.ok(tones.mist.fine.l > tones.dawn.fine.l, 'but it stays readable above the water');
});

test('the ink is honest about water it cannot read', () => {
  const dawnInk = tide.inkTone(tide.courseWater('dawn'), .5);
  for (const wrong of ['unknown', '', null, undefined, 42, {}, [], 'constructor']) {
    assert.deepEqual(tide.inkTone(wrong, .5), dawnInk,
      `water nobody chose must write in the pond's own ink: ${String(wrong)}`);
  }
});

test('a deeper phrase still writes deeper, whatever the quill', () => {
  for (const id of Object.keys(tide.COURSE_WATER)) {
    const water = tide.courseWater(id);
    const shallow = tide.inkTone(water, 0);
    const deep = tide.inkTone(water, 1);
    assert.equal(shallow.hue - deep.hue, tide.INK_DEPTH_SPAN, `${id} keeps the full depth span`);
    for (const broken of [-3, 9, NaN, Infinity, 'deep', null, undefined]) {
      const tone = tide.inkTone(water, broken);
      assert.ok(tone.hue >= deep.hue - 1e-9 && tone.hue <= shallow.hue + 1e-9,
        `${id} never leaves its own span on a broken depth: ${String(broken)}`);
    }
    // A missing depth is read as the middle of the pond, never as the loudest.
    assert.equal(tide.inkTone(water, NaN).hue, tide.inkTone(water, .5).hue);
  }
});