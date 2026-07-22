'use strict';

const assert = require('node:assert/strict');
const master = require('../pond-master.js');

assert.deepEqual(master.normalize(), { volume: 72, muted: false });
assert.deepEqual(master.parse('{"volume":46,"muted":true}'), { volume: 46, muted: true });
assert.deepEqual(master.parse('{broken'), { volume: 72, muted: false }, 'invalid local state must fail safely');
assert.deepEqual(master.parse('{"volume":900,"muted":"yes"}'), { volume: 100, muted: false },
  'stored values must be clamped and mute must be an explicit boolean');
assert.equal(master.serialize({ volume: 44.6, muted: true }), '{"volume":45,"muted":true}');

const lowered = master.withVolume({ volume: 72, muted: true }, 38);
assert.deepEqual(lowered, { volume: 38, muted: false }, 'moving an audible range must wake the master');
assert.deepEqual(master.withVolume(lowered, 0), { volume: 0, muted: false }, 'zero volume remains a distinct persisted setting');
assert.deepEqual(master.toggleMute({ volume: 36, muted: false }), { volume: 36, muted: true });
assert.deepEqual(master.toggleMute({ volume: 36, muted: true }), { volume: 36, muted: false });
assert.deepEqual(master.toggleMute({ volume: 0, muted: true }), { volume: 72, muted: false },
  'unmuting a silent master must restore a useful level');

assert.equal(master.gainFor({ volume: 72, muted: false }, 0), .72);
assert.equal(master.gainFor({ volume: 72, muted: true }, 1), 0);
assert.equal(master.gainFor({ volume: 0, muted: false }, 1), 0);
assert.ok(Math.abs(master.gainFor({ volume: 72, muted: false }, 4) - .36) < 1e-12,
  'the persisted master level must compose with voice normalization');

console.log('pond-master: persistence normalization, volume, mute, and polyphonic gain verified');
