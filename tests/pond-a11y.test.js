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