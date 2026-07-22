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

const normalizedRoundTrip = .413;
assert.ok(Math.abs(music.normalizedAtFrequency(music.frequencyAt(normalizedRoundTrip)) - normalizedRoundTrip) < 1e-12,
  'frequency conversion must preserve the logarithmic pond coordinate');

const unarmedPrecision = music.precisionMotion({
  previousRawX: .4, rawX: .405, pitchX: .4, holdMilliseconds: 180, speedPerSecond: .08
});
assert.equal(unarmedPrecision.active, false, 'fresh movement must stay free even when it is slow');
assert.equal(unarmedPrecision.pitchX, .405);

const settledX = music.normalizedAtFrequency(held.frequency);
const enteredPrecision = music.precisionMotion({
  previousRawX: .413, rawX: .418, pitchX: settledX, holdMilliseconds: 900, speedPerSecond: .08
});
assert.equal(enteredPrecision.active, true, 'slow movement after a hold must enter precision naturally');
assert.equal(enteredPrecision.entered, true);
assert.ok(enteredPrecision.gain < 1 && enteredPrecision.gain >= music.PRECISION_MIN_GAIN);
assert.ok(Math.abs(enteredPrecision.pitchX - settledX) < Math.abs(.418 - settledX),
  'precision must steer from the sounding settled current rather than jumping back to raw position');

const continuedPrecision = music.precisionMotion({
  previousRawX: .418, rawX: .422, pitchX: enteredPrecision.pitchX,
  originRawX: enteredPrecision.originRawX, holdMilliseconds: 12, speedPerSecond: .09, active: true
});
assert.equal(continuedPrecision.active, true, 'precision stays engaged across a slow continuous stroke');
assert.ok(continuedPrecision.pitchX - enteredPrecision.pitchX < .004);

const releasedPrecision = music.precisionMotion({
  previousRawX: .422, rawX: .47, pitchX: continuedPrecision.pitchX,
  originRawX: continuedPrecision.originRawX, holdMilliseconds: 8, speedPerSecond: .9, active: true
});
assert.equal(releasedPrecision.active, false, 'a broad stroke must immediately restore free glissando');
assert.equal(releasedPrecision.released, true);
assert.equal(releasedPrecision.pitchX, .47, 'free glissando must align pitch with the visible contact again');

const distanceReleasedPrecision = music.precisionMotion({
  previousRawX: .2, rawX: .25, pitchX: .2,
  holdMilliseconds: 900, speedPerSecond: .02, active: true
});
assert.equal(distanceReleasedPrecision.active, false, 'one broad sample must release precision even with an unreliable timestamp');
assert.equal(distanceReleasedPrecision.pitchX, .25);

let packetPitch = .4, packetRaw = .4, packetOrigin = .4, packetActive = true;
for (let index = 0; index < 10; index += 1) {
  const nextRaw = packetRaw + .005;
  const packet = music.precisionMotion({
    previousRawX: packetRaw, rawX: nextRaw, pitchX: packetPitch, originRawX: packetOrigin,
    holdMilliseconds: 20, speedPerSecond: .02, active: packetActive
  });
  packetPitch = packet.pitchX; packetOrigin = packet.originRawX; packetActive = packet.active; packetRaw = nextRaw;
}
assert.equal(packetActive, false, 'broad excursion must release precision independent of coalesced-event packet size');
assert.equal(packetPitch, packetRaw);

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

const shallowReflection = music.depthReflection(0);
const middleReflection = music.depthReflection(.5);
const deepReflection = music.depthReflection(1);
assert.ok(shallowReflection.sendGain < middleReflection.sendGain && middleReflection.sendGain < deepReflection.sendGain,
  'deeper water must feed more of the shared reflection without changing the direct voice');
assert.ok(shallowReflection.sendGain >= .015 && deepReflection.sendGain <= .16, 'reflection sends must remain quiet and bounded');
assert.equal(music.depthReflection(-4).sendGain, shallowReflection.sendGain, 'reflection depth clamps below the pond');
assert.equal(music.depthReflection(4).sendGain, deepReflection.sendGain, 'reflection depth clamps above the pond');
assert.ok(deepReflection.delaySeconds > .045 && deepReflection.delaySeconds < .09,
  'the first reflection must arrive after the direct attack but remain a short water response');
assert.ok(deepReflection.feedback > 0 && deepReflection.feedback <= .12, 'feedback must not build a delay wash');
assert.ok(deepReflection.wetGain > 0 && deepReflection.wetGain <= .36, 'the shared return must stay below the dry path');
assert.ok(deepReflection.sendGain * deepReflection.wetGain < .057, 'the deepest first return must remain under 5.7% of dry');
assert.ok(deepReflection.sendGain * deepReflection.wetGain * deepReflection.feedback < .007,
  'the second return must decay below 0.7% of dry');
const lightBus = music.depthReflection(.2), darkBus = music.depthReflection(.8);
assert.deepEqual(
  { delaySeconds: lightBus.delaySeconds, feedback: lightBus.feedback, wetGain: lightBus.wetGain },
  { delaySeconds: darkBus.delaySeconds, feedback: darkBus.feedback, wetGain: darkBus.wetGain },
  'only the per-voice send may depend on depth; the shared bus itself must stay stable'
);

console.log('pond-music: pitch currents, shared precision, expressive attack, spatial place, held texture, and depth reflection verified');
