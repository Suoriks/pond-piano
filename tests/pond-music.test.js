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

assert.equal(music.spatialPan(.5), 0, 'the centre of the pond must remain centred');
assert.equal(music.spatialPan(0), -music.MAX_STEREO_PAN);
assert.equal(music.spatialPan(1), music.MAX_STEREO_PAN);
assert.equal(music.spatialPan(-4), -music.MAX_STEREO_PAN, 'spatial width must stay safely bounded');
assert.ok(music.spatialPan(.7) > 0 && music.spatialPan(.7) < .4, 'small visual moves need subtle spatial motion');

assert.equal(music.hasExpressivePressure('mouse', .5), false, 'mouse fallback pressure is not expressive');
assert.equal(music.hasExpressivePressure('touch', .5), false, 'spec fallback touch pressure is not expressive');
assert.equal(music.hasExpressivePressure('touch', .73), true, 'varying touch pressure is preserved when available');
assert.equal(music.hasExpressivePressure('pen', .18), true, 'pen pressure always wins over velocity');

const calmAttack = music.attackIntensity({ speedPerSecond: 0 });
const brushedAttack = music.attackIntensity({ speedPerSecond: .7 });
const fastAttack = music.attackIntensity({ speedPerSecond: 9 });
assert.equal(calmAttack, .28, 'a still contact must begin calmly');
assert.ok(brushedAttack > calmAttack && brushedAttack < fastAttack, 'movement velocity must add bounded expression');
assert.ok(Math.abs(fastAttack - .94) < 1e-9, 'a fast stroke must stay below the hard output ceiling');
assert.ok(Math.abs(music.attackIntensity({ pressure: 1, speedPerSecond: 4, pressureAvailable: true }) - .94) < 1e-9);
assert.ok(music.attackIntensity({ pressure: .12, speedPerSecond: 4, pressureAvailable: true }) < .4,
  'a light pen must remain light even when it moves quickly');
assert.equal(music.movementSpeed(0, 16, 390), 0);
assert.ok(Math.abs(music.movementSpeed(39, 100, 390) - 1) < 1e-9);
assert.equal(music.movementSpeed(1000, 1, 390), 4, 'movement speed must be capped');

const freshTexture = music.heldTexture(.7, 300);
const bloomingTexture = music.heldTexture(.7, 1900);
const deepTexture = music.heldTexture(1, 5000);
const shallowTexture = music.heldTexture(0, 5000);
assert.equal(freshTexture.bloom, 0, 'water texture must not colour a fresh attack');
assert.equal(freshTexture.filterSweepHz, 0);
assert.ok(bloomingTexture.bloom > 0 && bloomingTexture.bloom < 1, 'the undertow must grow gradually');
assert.equal(deepTexture.bloom, 1);
assert.equal(shallowTexture.bloom, 1);
assert.ok(deepTexture.rateHz < shallowTexture.rateHz, 'deep water must breathe more slowly');
assert.ok(deepTexture.filterSweepHz < shallowTexture.filterSweepHz, 'bright water can carry a wider safe filter drift');
assert.ok(deepTexture.overtonePulse > 0 && shallowTexture.overtonePulse <= .02, 'overtone motion must stay subtle and bounded');
assert.ok(deepTexture.visualReach > shallowTexture.visualReach, 'deep undertow should read by shape, not colour alone');
assert.ok([deepTexture, shallowTexture].every(texture => texture.rateHz >= .12 && texture.rateHz <= .19));

console.log('pond-music: pitch currents, expressive attack, spatial place, and held-water texture verified');
