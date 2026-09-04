'use strict';

const assert = require('node:assert/strict');
const gesture = require('../pond-gesture.js');

function traceCircle({ radius = 18, turns = .82, direction = 1, steps = 22, speedPerSecond = .28 } = {}) {
  const centerX = 120, centerY = 240, span = 390;
  let state = gesture.beginEddy(centerX, centerY, 1000);
  let result = null;
  for (let index = 0; index <= steps; index += 1) {
    const angle = direction * turns * Math.PI * 2 * index / steps;
    result = gesture.updateEddy(state, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      now: 1010 + index * 28,
      span,
      speedPerSecond
    });
    state = result.state;
    if (!state) break;
  }
  return result;
}

const clockwise = traceCircle();
assert.equal(clockwise.active, true, 'a small deliberate circle must become an eddy');
assert.equal(clockwise.activated || clockwise.state.active, true);
assert.equal(clockwise.direction, 1);
assert.ok(clockwise.turns > gesture.EDDY_ACTIVATION_TURNS);
assert.ok(clockwise.intensity >= .34 && clockwise.intensity <= 1);
assert.equal(clockwise.capturesMotion, true, 'an established arc should protect pitch from circular raw X motion');

const anticlockwise = traceCircle({ direction: -1 });
assert.equal(anticlockwise.active, true, 'both circular directions must work');
assert.equal(anticlockwise.direction, -1);

const shortArc = traceCircle({ turns: .28, steps: 8 });
assert.equal(shortArc.active, false, 'a curved glissando must not accidentally become tremolo');

let broad = gesture.beginEddy(100, 100, 0);
broad = gesture.updateEddy(broad, { x: 115, y: 100, now: 20, span: 390, speedPerSecond: .2 }).state;
const broadExit = gesture.updateEddy(broad, { x: 165, y: 100, now: 45, span: 390, speedPerSecond: .5 });
assert.equal(broadExit.state, null);
assert.equal(broadExit.reason, 'broad-stroke', 'a wide stroke must immediately return control to free glissando');

const fastExit = gesture.updateEddy(gesture.beginEddy(100, 100, 0), {
  x: 108, y: 108, now: 16, span: 390, speedPerSecond: 2
});
assert.equal(fastExit.state, null);
assert.equal(fastExit.reason, 'broad-stroke');

const stale = gesture.updateEddy(gesture.beginEddy(100, 100, 0), {
  x: 112, y: 100, now: gesture.EDDY_CANDIDATE_TIMEOUT_MS + 1, span: 390, speedPerSecond: .1
});
assert.equal(stale.state, null, 'an abandoned partial circle must not stay armed forever');

const soft = gesture.eddyExpression(0);
const full = gesture.eddyExpression(1, -1);
assert.ok(soft.rateHz >= 4 && full.rateHz < 6, 'eddy tremolo must remain a bounded organic flutter');
assert.ok(soft.gainDepth > 0 && full.gainDepth <= .012, 'tremolo depth must stay below the voice envelope');
assert.ok(full.rateHz > soft.rateHz && full.gainDepth > soft.gainDepth);
assert.ok(full.visualTurns < 0, 'visual winding must preserve circular direction without relying on colour');

const straightFlick = gesture.skippingStone([
  { x: .18, y: .52, at: 1000 },
  { x: .31, y: .515, at: 1050 },
  { x: .44, y: .51, at: 1090 }
], 1100, { width: 390, height: 844 });
assert.ok(straightFlick, 'a recent fast straight release must become a skipping stone');
assert.equal(straightFlick.contacts.length, 3, 'a fast flick with open water should receive three bounded contacts');
assert.ok(straightFlick.straightness > .98);
assert.ok(straightFlick.contacts.every(contact => contact.x > straightFlick.origin.x && contact.x < 1));
assert.ok(straightFlick.contacts.every((contact, index, all) =>
  index === 0 || contact.x > all[index - 1].x && contact.energy < all[index - 1].energy && contact.delayMs > all[index - 1].delayMs
), 'contacts must advance while energy decays');

const slowStroke = gesture.skippingStone([
  { x: .2, y: .5, at: 1000 }, { x: .3, y: .5, at: 1390 }
], 1400, { width: 390, height: 844 });
assert.equal(slowStroke, null, 'ordinary glissando must not trigger release echoes');

const hookedStroke = gesture.skippingStone([
  { x: .2, y: .5, at: 1000 }, { x: .32, y: .42, at: 1040 },
  { x: .24, y: .34, at: 1070 }, { x: .36, y: .5, at: 1100 }
], 1110, { width: 390, height: 844 });
assert.equal(hookedStroke, null, 'a curved stroke must remain expressive glissando rather than fake a skip');

const edgeFlick = gesture.skippingStone([
  { x: .78, y: .5, at: 1000 }, { x: .96, y: .5, at: 1080 }
], 1090, { width: 390, height: 844 });
assert.equal(edgeFlick, null, 'a flick without safe landing room must not create off-canvas contacts');

const staleRelease = gesture.skippingStone([
  { x: .2, y: .5, at: 900 }, { x: .4, y: .5, at: 1000 }
], 1120, { width: 390, height: 844 });
assert.equal(staleRelease, null, 'a pause before release must disarm the skipping gesture');

const gatherContact = (id, originX, originY, x, y, frequency, extra = {}) => ({
  id, originX, originY, x, y, frequency, born: 0, sounding: true, ...extra
});
const gatherBounds = { width: 390, height: 844 };
const inwardPair = [
  gatherContact(8, 70, 420, 165, 425, 220),
  gatherContact(3, 320, 420, 225, 415, 440)
];
const gathered = gesture.gatheringPearl(inwardPair, 420, gatherBounds);
assert.ok(gathered, 'two held currents moving meaningfully inward must gather a pearl');
assert.equal(gathered.key, '3|8');
assert.ok(gathered.x > 185 && gathered.x < 205 && gathered.y > 410 && gathered.y < 430);
assert.ok(gathered.depth > 0 && gathered.depth < 1);
assert.ok(gathered.energy >= .42 && gathered.energy <= .88);
assert.equal(gathered.frequencies.length, 2);
assert.equal(gathered.arms.length, 2);
assert.equal(gesture.gatheringKey([...inwardPair].reverse()), '3|8', 'the pair latch must ignore contact order');

const tooFresh = inwardPair.map(contact => ({ ...contact, born: 300 }));
assert.equal(gesture.gatheringPearl(tooFresh, 420, gatherBounds), null, 'a casual fresh pinch must stay an ordinary two-note glide');
const parallel = [
  gatherContact(1, 70, 420, 145, 420, 220),
  gatherContact(2, 320, 420, 380, 420, 440)
];
assert.equal(gesture.gatheringPearl(parallel, 420, gatherBounds), null, 'parallel motion must not masquerade as inward gathering');
const driftingMidpoint = [
  gatherContact(1, 70, 420, 245, 420, 220),
  gatherContact(2, 320, 420, 305, 420, 440)
];
assert.equal(gesture.gatheringPearl(driftingMidpoint, 420, gatherBounds), null, 'a translated pinch must not drag a pearl across the pond');
assert.equal(gesture.gatheringPearl([...inwardPair, gatherContact(4, 195, 200, 195, 200, 330)], 420, gatherBounds), null,
  'three contacts belong to chord grammar, not the two-finger pearl');
assert.equal(gesture.gatheringPearl(inwardPair, NaN, gatherBounds), null);
assert.equal(gesture.gatheringPearl(inwardPair, 420, { width: 0, height: 844 }), null);

const gatherEarly = gesture.gatheringVisual(gathered, gathered.born + 120, false);
const gatherOpen = gesture.gatheringVisual(gathered, gathered.born + 620, false);
const gatherReduced = gesture.gatheringVisual(gathered, gathered.born + 620, true);
assert.ok(gatherEarly.alive && gatherEarly.alpha > 0);
assert.ok(gatherOpen.fold > gatherEarly.fold && gatherOpen.radius > gatherEarly.radius);
assert.equal(gatherReduced.fold, .82, 'reduced motion keeps a calm gathered shape instead of animated convergence');
assert.ok(gatherReduced.alpha > 0);
assert.equal(gesture.gatheringVisual(gathered, gathered.born - 1, false).alpha, 0);
assert.equal(gesture.gatheringVisual(gathered, gathered.born + gesture.GATHER_LIFE_MS, false).alive, false);

const diveStart = gesture.beginDepthDive(180, 310, 1000);
assert.ok(diveStart, 'a calm resting point can arm a depth dive');
const diveWarmup = gesture.updateDepthDive(diveStart, {
  x: 182, y: 325, now: 1060, span: 390, speedPerSecond: .38
});
assert.equal(diveWarmup.activated, false, 'a small downward motion stays armed without firing early');
const dive = gesture.updateDepthDive(diveWarmup.state, {
  x: 184, y: 344, now: 1110, span: 390, speedPerSecond: .72
});
assert.equal(dive.activated, true, 'a quick near-vertical plunge after rest must fold the depth current');
assert.ok(dive.travel >= gesture.DIVE_MIN_TRAVEL && dive.verticality >= gesture.DIVE_MIN_VERTICALITY);
assert.ok(dive.energy >= .4 && dive.energy <= .88);
assert.equal(dive.state, null, 'one accepted plunge consumes its candidate');

const sidewaysDive = gesture.updateDepthDive(diveStart, {
  x: 218, y: 325, now: 1080, span: 390, speedPerSecond: .8
});
assert.equal(sidewaysDive.activated, false);
assert.equal(sidewaysDive.reason, 'off-axis', 'ordinary diagonal glissando must dissolve the dive candidate');
const upwardDive = gesture.updateDepthDive(diveStart, {
  x: 180, y: 290, now: 1080, span: 390, speedPerSecond: .8
});
assert.equal(upwardDive.reason, 'off-axis', 'an upward stroke is not a depth plunge');
const slowDive = gesture.updateDepthDive(diveStart, {
  x: 180, y: 342, now: 1200, span: 390, speedPerSecond: .18
});
assert.equal(slowDive.activated, false, 'slow Y movement remains ordinary continuous timbre control');
assert.equal(slowDive.reason, 'slow');
assert.equal(slowDive.state, null, 'a slow completed descent dissolves instead of waiting to misfire later');
assert.equal(gesture.updateDepthDive(diveStart, {
  x: 180, y: 340, now: 1000 + gesture.DIVE_TIMEOUT_MS + 1, span: 390, speedPerSecond: .8
}).reason, 'timeout');
assert.equal(gesture.beginDepthDive(NaN, 1, 0), null);

const diveEarly = gesture.depthDiveVisual(dive, dive.born + 120, false);
const diveOpen = gesture.depthDiveVisual(dive, dive.born + 620, false);
const diveStill = gesture.depthDiveVisual(dive, dive.born + 620, true);
assert.ok(diveEarly.alive && diveEarly.alpha > 0 && diveEarly.bubbles.length === 3);
assert.ok(diveOpen.fold > diveEarly.fold && diveOpen.sink > diveEarly.sink);
assert.equal(diveStill.sink, 0, 'reduced motion keeps the depth seam resting instead of sinking');
assert.ok(diveStill.bubbles.every(bubble => bubble.rise === 0));
assert.equal(gesture.depthDiveVisual(dive, dive.born - 1, false).alpha, 0);
assert.equal(gesture.depthDiveVisual(dive, dive.born + gesture.DIVE_LIFE_MS, false).alive, false);

console.log('pond-gesture: eddy, skipping release, two-current gathering and held depth dive verified');
