'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const a11y = require('../pond-a11y.js');

test('expandedState is honest about a closed or muted panel', () => {
  assert.equal(a11y.expandedState(false), 'false');
  assert.equal(a11y.expandedState(false, true), 'false');
  assert.equal(a11y.expandedState(undefined), 'false');
  assert.equal(a11y.expandedState(null), 'false');
  assert.equal(a11y.expandedState(true), 'true');
  assert.equal(a11y.expandedState(true, true), 'true');
});

test('focus trap wraps forward and backward inside a bounded panel', () => {
  // Three tabbable controls (0,1,2): forward wraps 2 -> 0, backward 0 -> 2.
  assert.equal(a11y.countIndex(0, 3, 'forward'), 1);
  assert.equal(a11y.countIndex(1, 3, 'forward'), 2);
  assert.equal(a11y.countIndex(2, 3, 'forward'), 0);
  assert.equal(a11y.countIndex(0, 3, 'backward'), 2);
  assert.equal(a11y.countIndex(2, 3, 'backward'), 1);
});

test('focus trap resists broken bounds', () => {
  // Zero or negative tabbable count must not invent a target.
  assert.equal(a11y.countIndex(0, 0, 'forward'), null);
  assert.equal(a11y.countIndex(0, -4, 'forward'), null);
  assert.equal(a11y.countIndex(0, 'nope', 'forward'), null);
  // A current index outside the valid range clamps into it.
  assert.equal(a11y.countIndex(99, 3, 'forward'), 0);
  assert.equal(a11y.countIndex(-7, 3, 'backward'), 2);
  // Unknown direction falls back to forward.
  assert.equal(a11y.countIndex(2, 3, 'sideways'), 0);
});

test('opening a panel targets its first control when one exists', () => {
  assert.equal(a11y.openIndex(3), 0);
  assert.equal(a11y.openIndex(1), 0);
  assert.equal(a11y.openIndex(0), null);
  assert.equal(a11y.openIndex(-2), null);
  assert.equal(a11y.openIndex(undefined), null);
});

test('spoken position matches the eleven actual bowl cells and coarse depth', () => {
  assert.equal(a11y.bowlLocation(.5, .52).text, 'чаша 6 из 11, вода: средняя');
  assert.equal(a11y.bowlLocation(.449, .2).index, 5);
  assert.equal(a11y.bowlLocation(.451, .2).index, 6);
  assert.equal(a11y.bowlLocation(.999, .8).text, 'чаша 11 из 11, вода: глубокая');
  assert.equal(a11y.bowlLocation(-2, 0).text, 'чаша 1 из 11, вода: мелкая');
  assert.deepEqual(a11y.bowlLocation(NaN, Infinity), a11y.bowlLocation(1, 1));
  assert.ok(Object.isFrozen(a11y.bowlLocation(.5, .5)));
});

test('keyboard legend names the routes the pond really answers', () => {
  const legend = a11y.keyboardLegend();
  assert.ok(Array.isArray(legend) && Object.isFrozen(legend));
  // Every route is a small immutable record with a real key and a real act,
  // and the list is long enough to cover the whole gesture set.
  assert.ok(legend.length >= 5);
  for (const route of legend) {
    assert.ok(Object.isFrozen(route));
    assert.equal(typeof route.keys, 'string');
    assert.equal(typeof route.text, 'string');
    assert.ok(route.keys.trim().length > 0, 'a route must name its keys');
    assert.ok(route.text.trim().length > 0, 'a route must name its act');
  }
  // No two rows may teach the same key, or a player would read a duplicate.
  const keys = legend.map(route => route.keys);
  assert.equal(new Set(keys).size, keys.length);
  const spoken = legend.map(route => `${route.keys} — ${route.text}`).join('\n');
  assert.match(spoken, /Стрелки/);
  assert.match(spoken, /Пробел или Enter/);
  assert.match(spoken, /Выдержка \+ ↓/);
  assert.match(spoken, /G с зажатой чашей/);
  assert.match(spoken, /H с зажатой чашей/);
  assert.match(spoken, /\?/);
});

test('the keyboard legend is the same list every time, not a rebuild', () => {
  assert.equal(a11y.keyboardLegend(), a11y.keyboardLegend());
});

test('the map introduces itself once, and only to a keyboard stranger', () => {
  // First keyboard visit on a fresh device: yes.
  assert.equal(a11y.shouldIntroduceLegend({ keyboardVisit: true, seen: false }), true);
  // A pointer player is never interrupted by a keyboard map.
  assert.equal(a11y.shouldIntroduceLegend({ keyboardVisit: false, seen: false }), false);
  // Already shown once on this device, or closed by the player: quiet forever.
  assert.equal(a11y.shouldIntroduceLegend({ keyboardVisit: true, seen: true }), false);
  assert.equal(a11y.shouldIntroduceLegend({ keyboardVisit: true, seen: false, dismissed: true }), false);
  // Broken input must fail closed, never open a panel on bad state.
  assert.equal(a11y.shouldIntroduceLegend(), false);
  assert.equal(a11y.shouldIntroduceLegend({}), false);
  assert.equal(a11y.shouldIntroduceLegend({ keyboardVisit: 'yes', seen: false }), false);
});

test('the open map is never taller than the water below its trigger', () => {
  // A phone in landscape: trigger bottom 197, a 390-tall viewport. The panel
  // may take 390 - 197 - 8 gap - 12 edge = 173 px, so the close button stays
  // inside the water and nothing has to scroll the composition up.
  assert.equal(a11y.legendFitHeight(197, 390), 173);
  // A portrait phone has room for the whole map: nothing is clipped there.
  assert.equal(a11y.legendFitHeight(197, 844), 627);
  assert.ok(a11y.legendFitHeight(197, 844) > 469, 'portrait must not clip the seven rows');
  // A small desktop window.
  assert.equal(a11y.legendFitHeight(208, 640), 412);
  // The promise itself: never taller than the honest room left below.
  for (const [bottom, height] of [[197, 390], [208, 640], [100, 300], [197, 844]]) {
    assert.ok(a11y.legendFitHeight(bottom, height) <= height - bottom,
      'the panel must fit between its anchor and the bottom edge');
  }
  // A viewport shorter than the anchor collapses to nothing rather than
  // reporting an imaginary height.
  assert.equal(a11y.legendFitHeight(500, 390), 0);
  assert.equal(a11y.legendFitHeight(390, 390), 0);
  // Broken measurements are answered with silence, never a guessed height.
  assert.equal(a11y.legendFitHeight(NaN, 390), null);
  assert.equal(a11y.legendFitHeight(197, undefined), null);
  assert.equal(a11y.legendFitHeight('tall', 'wide'), null);
});

test('the resting light shows only while the keyboard owns the water', () => {
  // A pointer-only visit, an unfocused canvas, a real sounding contact: no mark.
  assert.equal(a11y.keyboardRest(), null);
  assert.equal(a11y.keyboardRest({ focused: false, x: .5, y: .5 }), null);
  assert.equal(a11y.keyboardRest({ focused: 'yes', x: .5, y: .5 }), null);
  assert.equal(a11y.keyboardRest({ focused: true, sounding: true, x: .5, y: .5 }), null);
  // The water is focused and silent: the mark exists.
  const rest = a11y.keyboardRest({ focused: true, x: .5, y: .52, born: 1000, now: 1000 });
  assert.ok(rest, 'a focused, silent water must show the keyboard where it stands');
  assert.ok(Object.isFrozen(rest), 'the plan is frozen so no layer can drift it');
});

test('the resting light arrives calmly and then rests, bounded', () => {
  const at = elapsed => a11y.keyboardRest({ focused: true, x: .5, y: .52, born: 1000, now: 1000 + elapsed });
  const born = at(0), mid = at(210), settled = at(420), late = at(90000);
  assert.equal(born.arrival, 0);
  assert.ok(mid.arrival > 0 && mid.arrival < 1, 'the mark grows in rather than popping');
  assert.equal(settled.arrival, 1);
  assert.equal(late.arrival, 1, 'a long stay never overshoots');
  assert.ok(born.alpha < mid.alpha && mid.alpha < settled.alpha, 'alpha follows the arrival');
  assert.equal(late.alpha, settled.alpha);
  for (const plan of [born, mid, settled, late]) {
    assert.ok(plan.alpha > 0 && plan.alpha <= .44, 'alpha stays inside its honest band');
    assert.ok(plan.ringAlpha > 0 && plan.ringAlpha <= .52, 'the ring stays inside its band');
    assert.ok(plan.radius >= .012 && plan.radius <= .06, 'the mark never grows beyond the water it marks');
  }
});

test('the resting light breathes, and reduced motion makes it still', () => {
  const breathe = elapsed => a11y.keyboardRest({ focused: true, x: .5, y: .5, born: 0, now: elapsed });
  const a = breathe(700), b = breathe(2200);
  assert.ok(a.pulse !== b.pulse, 'the open mark drifts with the water');
  assert.ok(a.pulse >= 0 && a.pulse <= 1);
  const still = elapsed => a11y.keyboardRest({ focused: true, reducedMotion: true, x: .5, y: .5, born: 0, now: elapsed });
  assert.equal(still(700).pulse, 0);
  assert.equal(still(700).pulse, still(2200).pulse, 'reduced motion holds one still ring');
  assert.ok(still(700).alpha > 0, 'reduced motion still shows the mark');
  assert.equal(still(700).reducedMotion, true);
});

test('the resting light answers broken geometry with a bounded mark', () => {
  const broken = a11y.keyboardRest({ focused: true });
  assert.ok(broken);
  assert.equal(broken.x, .5); assert.equal(broken.y, .5);
  assert.equal(broken.arrival, 0);
  const wild = a11y.keyboardRest({ focused: true, x: 9, y: -9, born: NaN, now: 'soon' });
  assert.equal(wild.x, 1); assert.equal(wild.y, 0);
  assert.ok(wild.radius >= .012 && wild.radius <= .06);
  assert.ok(Number.isFinite(wild.alpha) && Number.isFinite(wild.hue));
  const deep = a11y.keyboardRest({ focused: true, x: .5, y: .95 });
  const shallow = a11y.keyboardRest({ focused: true, x: .5, y: .05 });
  assert.ok(shallow.hue > deep.hue, 'shallow water is warmer, deep water cooler, like the contact light');
});

test('the introduction storage key is versioned and never empty', () => {
  assert.equal(a11y.legendIntroKey(), 'pond-piano.legend-intro.v1');
  assert.equal(a11y.legendIntroKey(2), 'pond-piano.legend-intro.v2');
  // Broken versions fall back to the current one instead of inventing a key.
  assert.equal(a11y.legendIntroKey(0), 'pond-piano.legend-intro.v1');
  assert.equal(a11y.legendIntroKey('nope'), 'pond-piano.legend-intro.v1');
  assert.match(a11y.legendIntroText(), /Карта клавиш/);
  assert.match(a11y.legendIntroText(), /Escape/);
});
