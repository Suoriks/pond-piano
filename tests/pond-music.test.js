'use strict';

const assert = require('node:assert/strict');
const music = require('../pond-music.js');

assert.deepEqual(Object.keys(music.SCALE_FAMILIES), ['dawn', 'dusk', 'mist']);
assert.equal(music.normalizeScaleFamily('dusk'), 'dusk');
assert.equal(music.normalizeScaleFamily('unknown-current'), music.DEFAULT_SCALE_FAMILY);
assert.equal(music.parseScaleFamily(music.serializeScaleFamily('mist')), 'mist', 'the chosen current must survive local storage');
assert.equal(music.parseScaleFamily('{"family":"lost"}'), music.DEFAULT_SCALE_FAMILY, 'damaged stored choices must fall back safely');
assert.ok(Object.isFrozen(music.scaleSemitones('dawn')) && Object.isFrozen(music.SCALE_FAMILIES.dawn.intervals));

for (const family of Object.keys(music.SCALE_FAMILIES)) {
  const free = music.mapPitch(.413, 1400, .3, family);
  assert.equal(free.attraction, 0, `${family} must not quantize a moving gesture`);
  assert.equal(free.frequency, free.continuous, `${family} must preserve continuous glissando`);
}

const dawnHeld = music.mapPitch(.413, 1400, 0, 'dawn');
const duskHeld = music.mapPitch(.413, 1400, 0, 'dusk');
assert.notEqual(dawnHeld.target, duskHeld.target, 'different shoreline currents must offer a real musical choice');
assert.equal(dawnHeld.scaleFamily, 'dawn');
assert.equal(duskHeld.scaleFamily, 'dusk');
assert.deepEqual(
  music.neighboringCurrents(duskHeld.scaleIndex, 1, 'dusk').map(current => current.frequency),
  music.neighboringCurrents(duskHeld.scaleIndex, 1, duskHeld.scaleFamily).map(current => current.frequency),
  'visible currents must use the same scale family as the sounding attraction'
);

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

const shallowPearl = music.collisionPearl(Math.sqrt(220 * 440), .1, .28, 'dawn');
const deepPearl = music.collisionPearl(Math.sqrt(220 * 440), .9, .8, 'dusk');
assert.ok(shallowPearl.peakGain >= .0045 && deepPearl.peakGain <= .0165,
  'a collision pearl must remain much quieter than a sustained voice');
assert.ok(shallowPearl.durationSeconds < deepPearl.durationSeconds && deepPearl.durationSeconds < .26,
  'deep collisions may settle longer but must remain short');
assert.ok(shallowPearl.startFrequency > shallowPearl.frequency,
  'the pearl must fall into its derived parent pitch');
assert.equal(deepPearl.scaleFamily, 'dusk', 'the current shoreline family must guide the pearl pitch');

const firstSkip = music.stoneSkip(440, .18, .72, 0);
const lastSkip = music.stoneSkip(660, .82, .35, 2);
assert.ok(firstSkip.startFrequency > firstSkip.frequency && firstSkip.endFrequency < firstSkip.frequency,
  'a skipping contact must settle through its visible pitch rather than become a sustained voice');
assert.ok(lastSkip.durationSeconds > firstSkip.durationSeconds && lastSkip.durationSeconds < .2,
  'deeper and later contacts may settle longer but must stay transient');
assert.ok(firstSkip.peakGain > lastSkip.peakGain && firstSkip.peakGain <= .016,
  'successive contacts must decay far below a held voice');
assert.ok(firstSkip.cutoffHz > lastSkip.cutoffHz && lastSkip.cutoffHz >= 1500,
  'depth and bounce order may darken the stone without losing the water click');

const firstEcho = music.echoNote(0.2, 0.012, 0.7, 0, 3);
const lastEcho = music.echoNote(0.7, 0.8, 0.35, 2, 3);
assert.equal(lastEcho.frequency, music.frequencyAt(0.7),
  'a melodic echo must settle to its recorded pitch, not wander to a hidden key');
assert.ok(firstEcho.startFrequency > firstEcho.frequency && lastEcho.frequency <= music.frequencyAt(0.7) * 1.5,
  'the pluck contour must fall toward the anchor, never above its visible pitch');
assert.ok(firstEcho.peakGain > lastEcho.peakGain && firstEcho.peakGain <= 0.1,
  'later anchors must answer softer and stay far below any held voice');
assert.ok(lastEcho.durationSeconds > .11 && lastEcho.durationSeconds < .28, 'every echo must stay a short pluck');
assert.ok(firstEcho.cutoffHz > lastEcho.cutoffHz && lastEcho.cutoffHz >= 1500,
  'depth and echo order may darken the pluck without losing it');
assert.ok(lastEcho.delayMs > firstEcho.delayMs, 'anchors must not all fire in the same instant');
assert.ok(music.echoNote(0.5, 9, 0.5, 0, 3).durationSeconds <= 0.35,
  'depth must stay clamped so a durable echo cannot lengthen forever');

const calmShallowDrop = music.waterDrop(440, 0, calmAttack);
const strongDeepDrop = music.waterDrop(440, 1, fastAttack);
assert.equal(calmShallowDrop.durationSeconds, music.DROP_MIN_DURATION_SECONDS);
assert.equal(strongDeepDrop.durationSeconds, music.DROP_MAX_DURATION_SECONDS);
assert.ok(strongDeepDrop.durationSeconds > calmShallowDrop.durationSeconds,
  'deep water should let the droplet settle slightly longer');
assert.ok(strongDeepDrop.peakGain > calmShallowDrop.peakGain && strongDeepDrop.peakGain < .04,
  'gesture intensity must brighten the droplet without overtaking the sustained voice');
assert.ok(calmShallowDrop.startFrequency > strongDeepDrop.startFrequency,
  'shallow water should begin with the brighter pitch contour');
assert.ok(calmShallowDrop.dipFrequency < calmShallowDrop.settleFrequency,
  'the transient should dip below and return to the played pitch like a water drop');
assert.equal(music.waterDrop(440, -4, calmAttack).durationSeconds, calmShallowDrop.durationSeconds);
assert.equal(music.waterDrop(440, 4, fastAttack).durationSeconds, strongDeepDrop.durationSeconds);

const glassMaterial = music.waterMaterial(0);
const livingMaterial = music.waterMaterial(.5);
const hollowMaterial = music.waterMaterial(1);
assert.deepEqual([glassMaterial.dominant, livingMaterial.dominant, hollowMaterial.dominant], ['glass', 'living', 'hollow']);
assert.ok(glassMaterial.cutoffHz > livingMaterial.cutoffHz && livingMaterial.cutoffHz > hollowMaterial.cutoffHz,
  'depth must move continuously from bright glass to a dark hollow body');
assert.ok(glassMaterial.overtoneRatio > livingMaterial.overtoneRatio && livingMaterial.overtoneRatio > hollowMaterial.overtoneRatio,
  'the second oscillator must change spectral relationship rather than only losing treble');
assert.ok(glassMaterial.overtoneGain > livingMaterial.overtoneGain && livingMaterial.overtoneGain > hollowMaterial.overtoneGain);
assert.ok(livingMaterial.filterQ > glassMaterial.filterQ && livingMaterial.filterQ > hollowMaterial.filterQ,
  'the middle water material should have its own living resonant character');
assert.ok(glassMaterial.attackSeconds < livingMaterial.attackSeconds && livingMaterial.attackSeconds < hollowMaterial.attackSeconds);
assert.ok(glassMaterial.releaseSeconds < livingMaterial.releaseSeconds && livingMaterial.releaseSeconds < hollowMaterial.releaseSeconds);
assert.ok([glassMaterial, livingMaterial, hollowMaterial].every(material =>
  material.cutoffHz >= 700 && material.cutoffHz <= 5200 &&
  material.overtoneRatio >= 1 && material.overtoneRatio <= 2.01 &&
  material.overtoneGain >= .08 && material.overtoneGain <= .2 &&
  material.levelCompensation >= .9 && material.levelCompensation <= 1.1
), 'every material parameter must stay inside the mobile voice budget');

for (let depth = 0; depth < 1; depth += .01) {
  const here = music.waterMaterial(depth);
  const next = music.waterMaterial(depth + .01);
  assert.ok(Math.abs(next.cutoffHz - here.cutoffHz) < 230, 'material cutoff must not jump between hidden zones');
  assert.ok(Math.abs(next.overtoneRatio - here.overtoneRatio) < .055, 'harmonic colour must blend rather than switch presets');
}

const downwardBias = music.initialBrushBias(4, 28, .9);
const upwardBias = music.initialBrushBias(4, -28, .9);
const sidewaysBias = music.initialBrushBias(28, 1, .9);
assert.ok(downwardBias > .9 && upwardBias < -.9, 'the first vertical brush must preserve direction');
assert.ok(Math.abs(sidewaysBias) < .05, 'horizontal pitch motion must not accidentally recolour the material');
assert.equal(music.initialBrushBias(0, 30, 0), 0, 'a slow accidental drift must not count as an intentional brush');
const brushedDown = music.waterMaterial(.5, downwardBias);
const brushedUp = music.waterMaterial(.5, upwardBias);
assert.ok(brushedDown.effectiveDepth > livingMaterial.effectiveDepth && brushedUp.effectiveDepth < livingMaterial.effectiveDepth);
assert.ok(brushedDown.effectiveDepth - brushedUp.effectiveDepth <= music.MATERIAL_BRUSH_DEPTH * 2 + 1e-9,
  'gesture colour stays a small bias and cannot replace the visible Y depth axis');

const shade0 = music.noteShade(0, .2);
const shade1 = music.noteShade(1, .2);
const shade2 = music.noteShade(2, .2);
const shade3 = music.noteShade(3, .2);
assert.equal(shade0.tint, 0); assert.equal(shade1.tint, 1); assert.equal(shade2.tint, 2);
assert.equal(shade3.tint, 0, 'the shade cycle must repeat fully deterministically');
assert.ok(shade0.label !== shade1.label && shade1.label !== shade2.label && shade2.label !== shade0.label,
  'successive clear, warm and deep notes must be distinguishable');
assert.ok(shade0.gainLift > shade1.gainLift && shade2.gainLift < shade1.gainLift,
  'a clear note may lift level, a deep note must sit a hair lower');
assert.ok(shade0.cutoffTone > shade2.cutoffTone, 'a clear shade keeps more treble than a deep one');
assert.deepEqual(music.noteShade(-3, .5), music.noteShade(0, .5), 'a broken index must fall back like the first note');
assert.equal(music.noteShade(3, 9).depth, 1, 'depth must stay clamped inside the shade model');
// The shading must stay a small deterministic tint within the voice budget.
const tinted = music.waterMaterial(.5, 0, shade0);
const base = music.waterMaterial(.5);
assert.ok(Math.abs(tinted.overtoneRatio - base.overtoneRatio) <= .05, 'shade must nudge the harmonic, not replace it');
assert.ok(Math.abs(tinted.cutoffHz - base.cutoffHz) < 260, 'shade may tint the cutoff within the budget');
assert.ok(tinted.levelCompensation >= .9 && tinted.levelCompensation <= 1.1,
  'a tinted shade must never leave the safe level range');

console.log('pond-music: pitch currents, precision, water materials, drop/pearl/stone transients, space, held texture, reflection, and note shades verified');
