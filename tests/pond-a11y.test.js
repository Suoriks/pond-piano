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

test('the introduction storage key is versioned and never empty', () => {
  assert.equal(a11y.legendIntroKey(), 'pond-piano.legend-intro.v1');
  assert.equal(a11y.legendIntroKey(2), 'pond-piano.legend-intro.v2');
  // Broken versions fall back to the current one instead of inventing a key.
  assert.equal(a11y.legendIntroKey(0), 'pond-piano.legend-intro.v1');
  assert.equal(a11y.legendIntroKey('nope'), 'pond-piano.legend-intro.v1');
  assert.match(a11y.legendIntroText(), /Карта клавиш/);
  assert.match(a11y.legendIntroText(), /Escape/);
});
