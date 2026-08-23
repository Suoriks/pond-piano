'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const budget = require('../pond-budget.js');

test('budget starts calm and reports the full intended level', () => {
  const state = budget.create();
  assert.equal(state.step, 0);
  assert.equal(budget.style(state, 'rippleRings'), 1);
  assert.equal(budget.style(state, 'motes'), 1);
  assert.equal(budget.style(state, 'tide'), 1);
  assert.equal(budget.style(state, 'ink'), 1);
});

test('a single slow frame does not step the budget down', () => {
  const state = budget.create({ windowMs: 400 });
  const step = budget.observe(state, budget.BUDGET_P95_MS + 1);
  assert.equal(step, 0, 'one over-budget frame must not alone force degradation');
});

test('a sustained stretch over budget steps down step by step', () => {
  const state = budget.create({ windowMs: 400 });
  let step = 0;
  const heavy = budget.BUDGET_P95_MS * 2;
  // Feed a long hot streak; every observe sees the same slow p95.
  for (let i = 0; i < 90; i += 1) step = budget.observe(state, heavy);
  assert.ok(step > 0, 'sustained load must degrade the water');
  assert.ok(state.step > 0);
  // The first step eases the visual families, cheaper-first.
  assert.ok(budget.style(state, 'rippleRings') < 1);
  assert.ok(budget.style(state, 'motes') <= 1);
  assert.ok(budget.style(state, 'tide') <= 1);
  assert.ok(budget.style(state, 'ink') <= 1);
});

test('reduced motion floors the worst case instead of going to zero light', () => {
  const state = budget.create({ windowMs: 400 });
  state.reducedMotion = true;
  let step = 0;
  for (let i = 0; i < 90; i += 1) step = budget.observe(state, budget.BUDGET_P95_MS * 3);
  assert.ok(state.step > 0, 'reduced motion still degrades under real load');
  // Even at a heavy reduced-motion step the pond keeps a legible floor.
  assert.ok(budget.style(state, 'rippleRings') >= 0, 'rings may fall to zero only as the honest last resort');
  assert.ok(budget.style(state, 'motes') >= 0.28 * 0.5, 'motes keep a quiet readable presence');
  assert.ok(budget.style(state, 'ink') >= 0.55 * 0.5, 'ink stays legible even under load');
});

test('an easy sustained stretch refunds steps so the look returns', () => {
  const state = budget.create({ windowMs: 400 });
  for (let i = 0; i < 90; i += 1) budget.observe(state, budget.BUDGET_P95_MS * 2); // load
  const dropped = state.step;
  assert.ok(dropped > 0);
  for (let i = 0; i < 240; i += 1) budget.observe(state, 1); // very easy for a while
  assert.ok(state.step < dropped, 'easy stretch must refund steps so the look returns');
  assert.equal(budget.style(state, 'rippleRings'), 1, 'fully recovered water shows the full look');
});

test('style stays calm and finite for an unknown family', () => {
  const state = budget.create();
  assert.equal(budget.style(state, 'unknown-family'), 1);
  assert.equal(budget.style(null, 'rippleRings'), 1);
});