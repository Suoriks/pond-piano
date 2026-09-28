'use strict';
// Iteration 0084: a live layer that is drawn but never fed dies in silence.
//
// The finite bowls replaced the continuous tail in 0057 and stopped pushing the
// departing light, yet `releaseGlints` stayed declared, reposed, drawn, pruned
// and counted: the array looked alive while the feature was gone, and only a
// stale smoke noticed. This holds the structural rule that would have caught
// it: every collection the frame loop prunes must receive at least one real
// push of a new item, not only the re-seed a window resize performs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const POND = path.resolve(__dirname, '..', 'pond.js');
const source = fs.readFileSync(POND, 'utf8');

const pruned = new Set();
for (const match of source.matchAll(/for \(let i = (\w+)\.length - 1;/g)) pruned.add(match[1]);

// A re-seed (`arr.push(...moved)`) keeps a live layer alive across a resize but
// proves nothing about it being fed; only a push of a fresh item does.
function freshPushes(name) {
  const pattern = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.push\\(', 'g');
  let count = 0;
  for (const match of source.matchAll(pattern)) {
    const after = match.index + match[0].length;
    if (source.slice(after, after + 3) !== '...') count += 1;
  }
  return count;
}

function bodyOf(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, `pond.js declares ${name}`);
  return source.slice(start, start + 1600);
}

test('the frame loop still prunes a real set of live collections', () => {
  assert.ok(pruned.size >= 10, 'the render loop prunes the live layers: ' + pruned.size);
});

test('every collection pruned in the frame receives a real push of a new item', () => {
  const offenders = [...pruned].filter(name => freshPushes(name) === 0).sort();
  assert.deepEqual(offenders, [],
    `these arrays are drawn and pruned but never fed: ${offenders.join(', ')}`);
});

test('the departing light returns at the honest moment', () => {
  const endVoice = bodyOf('endVoice');
  assert.ok(freshPushes('releaseGlints') >= 1, 'a fresh glint is pushed somewhere');
  assert.match(endVoice, /releaseGlints\.push\(\{/, 'endVoice seats the departing light where the voice sounded');
  assert.match(endVoice, /releaseSeconds:\s*remaining/, 'its life rides the honest remaining decay');
  assert.match(endVoice, /startsWith\('inspect:'\)/, 'the shore inspection still leaves no departing light');
});