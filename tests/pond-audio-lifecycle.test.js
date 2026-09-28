'use strict';

const assert = require('node:assert/strict');
const lifecycleFactory = require('../pond-audio-lifecycle.js');

class FakeContext extends EventTarget {
  constructor() {
    super();
    this.state = 'suspended';
    this.resumeCalls = 0;
  }

  resume() {
    this.resumeCalls += 1;
    this.state = 'running';
    this.dispatchEvent(new Event('statechange'));
    return Promise.resolve();
  }

  changeState(state) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

(async () => {
  let createCount = 0;
  let primeCount = 0;
  let retireCount = 0;
  let visible = true;
  const events = [];
  const context = new FakeContext();
  const engine = { context, voices: new Map() };
  const lifecycle = lifecycleFactory.create({
    createEngine: () => { createCount += 1; return engine; },
    primeEngine: () => { primeCount += 1; },
    retireEngine: () => { retireCount += 1; engine.voices.clear(); },
    onState: event => events.push(event.reason),
    isVisible: () => visible
  });

  assert.equal(lifecycle.snapshot().state, 'uninitialized', 'loading the pond must not create audio');
  const first = lifecycle.activateFromGesture();
  await Promise.resolve();
  assert.equal(first, engine);
  assert.equal(createCount, 1, 'the first explicit gesture creates one context');
  assert.equal(context.resumeCalls, 1, 'the first gesture resumes suspended audio');
  assert.equal(primeCount, 1, 'the iOS unlock primer runs inside the gesture');

  const second = lifecycle.activateFromGesture();
  assert.equal(second, first, 'later gestures reuse the same context');
  assert.equal(createCount, 1);
  assert.equal(context.resumeCalls, 1, 'running audio is not redundantly resumed');

  engine.voices.set('held-note', {});
  visible = false;
  lifecycle.background('visibility-hidden');
  assert.equal(retireCount, 1, 'backgrounding retires every held voice once');
  assert.equal(engine.voices.size, 0, 'no stale note survives a background transition');
  lifecycle.background('pagehide');
  assert.equal(retireCount, 1, 'visibilitychange plus pagehide cannot retire twice');

  context.changeState('suspended');
  visible = true;
  lifecycle.foreground();
  assert.equal(context.resumeCalls, 1, 'foregrounding alone must not violate autoplay policy');
  assert.equal(events.at(-1), 'foreground', 'coming back to merely sleeping water is not a trouble and is not a wake');
  const resumed = lifecycle.activateFromGesture();
  await Promise.resolve();
  assert.equal(resumed, first, 'the post-background note reuses the original context');
  assert.equal(context.resumeCalls, 2);
  assert.equal(primeCount, 2, 'each suspended iOS wake gets a fresh silent primer');
  assert.equal(createCount, 1, 'background recovery never creates a second AudioContext');

  engine.voices.set('interrupted-note', {});
  context.changeState('interrupted');
  assert.equal(retireCount, 2, 'an iOS interruption cannot leave a duplicate held voice');
  assert.equal(engine.voices.size, 0);

  context.changeState('closed');
  assert.equal(lifecycle.activateFromGesture(), null, 'a browser-closed context needs reload, not a hidden replacement context');
  assert.equal(createCount, 1, 'closed audio is never silently replaced');
  // Returning to water the browser closed while the player was away must name
  // the real state: a touch cannot wake a closed context, so the pond may not
  // promise one.
  lifecycle.foreground();
  assert.equal(events.at(-1), 'closed', 'a closed pond is reported closed when the player comes back');
  assert.equal(createCount, 1, 'the return path still creates no second context');

  // keepScreenAwake: the lock is only sought while a gesture is audible and the shell is visible.
  const keep = lifecycleFactory.keepScreenAwake;
  assert.equal(keep({ visible: true, soundingVoices: 1 }), true, 'a living note holds the screen awake');
  assert.equal(keep({ visible: true, soundingVoices: 6 }), true, 'a chord still holds the screen awake');
  assert.equal(keep({ visible: true, soundingVoices: 0 }), false, 'silent water must release the lock');
  assert.equal(keep({ visible: false, soundingVoices: 1 }), false, 'a backgrounded note must never seek the lock');
  assert.equal(keep({ visible: false, soundingVoices: 0 }), false, 'hidden silent water stays unlocked');
  assert.equal(keep({ visible: true, soundingVoices: -1 }), false, 'a negative count is invalid and must not hold be a lock');

  // A device that gives the browser no audio at all (or a context that throws)
  // must report honestly instead of letting the gesture vanish: the shell needs
  // a reason to tell the player that this water is silent.
  const blindEvents = [];
  const noAudio = lifecycleFactory.create({
    createEngine: () => null,
    onState: event => blindEvents.push(event.reason)
  });
  assert.equal(noAudio.activateFromGesture(), null, 'no Web Audio yields no engine');
  assert.deepEqual(blindEvents, ['unsupported'], 'a device without audio is reported, not swallowed');

  const threwEvents = [];
  const refused = lifecycleFactory.create({
    createEngine: () => { throw new Error('no more contexts'); },
    onState: event => threwEvents.push(event.reason)
  });
  assert.equal(refused.activateFromGesture(), null, 'a throwing createEngine must not break the gesture');
  assert.deepEqual(threwEvents, ['unsupported'], 'a refused context is an honest silence too');

  console.log('pond-audio-lifecycle: explicit unlock, one-context resume, background cleanup, interruption recovery, honest silence, and keepScreenAwake verified');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
