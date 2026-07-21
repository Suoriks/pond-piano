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
  assert.equal(events.at(-1), 'gesture-required');
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

  console.log('pond-audio-lifecycle: explicit unlock, one-context resume, background cleanup, and interruption recovery verified');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
