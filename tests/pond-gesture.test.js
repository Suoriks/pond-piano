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

console.log('pond-gesture: circular eddy and bounded straight-release skipping gesture verified');
