'use strict';

const assert = require('node:assert/strict');
const music = require('../pond-music.js');

const moving = music.mapPitch(.413, 1200, .3);
assert.equal(moving.attraction, 0, 'a moving gesture must remain continuous');
assert.equal(moving.frequency, moving.continuous);

const fresh = music.mapPitch(.413, 200, 0);
assert.equal(fresh.attraction, 0, 'attraction must not begin on contact');

const held = music.mapPitch(.413, 1400, 0);
assert.ok(held.attraction > .83 && held.attraction <= .84);
assert.ok(Math.abs(held.frequency - held.target) < Math.abs(held.continuous - held.target), 'a held voice must approach its current');
assert.notEqual(held.frequency, held.target, 'the current stays soft rather than hard-quantizing');

const currents = music.neighboringCurrents(held.scaleIndex);
assert.ok(currents.length >= 2 && currents.length <= 3);
assert.equal(currents.filter(current => current.isTarget).length, 1);
assert.ok(currents.every((current, index) => index === 0 || current.normalizedX > currents[index - 1].normalizedX));

assert.equal(music.frequencyAt(-1), music.BASE_FREQUENCY);
assert.ok(Math.abs(music.frequencyAt(1) / music.BASE_FREQUENCY - 8) < 1e-9);

console.log('pond-music: hold attraction and local currents verified');
