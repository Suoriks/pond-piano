((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PondBudget = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  // An honest water frame budget. The pond is dense with light: ripples,
  // living motes, broad swells and diary ink all cost canvas work, and a
  // busy phone can drown. This layer measures the real p95 cost of rendering
  // one frame and, when the pond is genuinely over budget, quietly steps
  // down the most expensive visual layers without ever touching the musical
  // audio voices. When the surface goes quiet and easy again, the same steps
  // unwind so the pond reclaims its full look.
  //
  // The budget is about *quality of the water*, not a blunt fps cap: the
  // cheapest honest response on a dense canvas is to spend the visual budget
  // on the most important thing the water is saying.

  const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));

  // p95 frame budget: with a ~60 fps target we allow roughly 12 ms per frame
  // of canvas work on average; p95 is the honest "even the slower frames stay
  // inside" tail we actually want to tame.
  const BUDGET_P95_MS = 14;
  const BUDGET_FLOOR_MS = 4;
  const HISTORY_LIMIT = 60;
  const DEFAULT_WINDOW_MS = 640;
  const DEFAULT_TICK_MS = 48;
  const EASY_WINDOWS_TO_RECOVER = 26;
  const MAX_STEPS = 5;

  const STEPS = Object.freeze([
    Object.freeze({ rings: 1,    motes: 1,    tide: 1,    ink: 1 }),
    Object.freeze({ rings: .66,  motes: .8,   tide: 1,    ink: .9 }),
    Object.freeze({ rings: .45,  motes: .62,  tide: .75,  ink: .8 }),
    Object.freeze({ rings: .25,  motes: .45,  tide: .5,   ink: .7 }),
    Object.freeze({ rings: 0,    motes: .28,  tide: .25,  ink: .55 })
  ]);
  const MAX_INDEX = STEPS.length - 1;

  function create(options = {}) {
    return {
      p95Ms: BUDGET_P95_MS,
      floorMs: clamp(Number.isFinite(options.floorMs) ? options.floorMs : BUDGET_FLOOR_MS, 2, BUDGET_P95_MS * 2),
      windowMs: Math.max(120, Math.min(2000, Number.isFinite(options.windowMs) ? options.windowMs : DEFAULT_WINDOW_MS)),
      samples: [],
      overflowMs: 0,
      step: 0,
      easyWindows: 0,
      lastDropAt: 0,
      reducedMotion: false,
      lastMs: 0
    };
  }

  // Record one observed render duration (ms). The budget looks at the p95 of
  // recent history so a single slow first frame cannot force a permanent step
  // down, but a sustained stretch over budget will.
  function observe(state, frameMs) {
    if (!state || !Number.isFinite(frameMs)) return 0;
    const ms = Math.max(0, frameMs);
    state.lastMs = ms;
    state.samples = Array.isArray(state.samples) ? state.samples : [];
    state.samples.push(ms);
    if (state.samples.length > HISTORY_LIMIT) state.samples.shift();

    const current = stats(state);
    if (current > state.p95Ms) {
      state.overflowMs += current - state.p95Ms;
      state.easyWindows = 0;
    } else {
      state.overflowMs = Math.max(0, state.overflowMs - (state.p95Ms - current) * .35);
      state.easyWindows += 1;
    }

    const cap = state.reducedMotion ? Math.ceil(MAX_STEPS * .6) : MAX_STEPS;
    if (state.step < cap && state.overflowMs >= state.windowMs) {
      state.step += 1;
      state.easyWindows = 0;
      state.overflowMs = 0;
      state.lastDropAt = nowMs(state);
    } else if (state.step > 0 && state.easyWindows >= EASY_WINDOWS_TO_RECOVER) {
      state.step -= 1;
      state.easyWindows = 0;
      state.overflowMs = 0;
    }
    return state.step;
  }

  function stats(state) {
    const s = state.samples;
    if (!s.length) return 0;
    const sorted = (Array.isArray(s) ? s : []).slice().sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.round(sorted.length * .95));
    return sorted[index] ?? sorted.at(-1);
  }

  // The transitional ramp (0..1) after entering a step, so the change eases
  // instead of snapping; staying at step 0 is always fully calm.
  function stepMobility(state) {
    if (!state || state.step === 0) return 1;
    const age = nowMs(state) - state.lastDropAt;
    const span = clamp(age / (state.windowMs * 1.4), 0, 1);
    return span * span * (3 - 2 * span);
  }

  // The eased multiplier for one visual family at the current step.
  function style(state, family) {
    if (!state) return 1;
    const entry = STEPS[state.step] || STEPS.at(-1);
    const move = stepMobility(state);
    const eased = (to) => 1 + (to - 1) * move;
    switch (family) {
      case 'rippleRings': return eased(entry.rings);
      case 'motes': return eased(entry.motes);
      case 'tide': return eased(entry.tide);
      case 'ink': return eased(entry.ink);
      default: return 1;
    }
  }

  function nowMs(state) {
    return typeof performance !== 'undefined' && performance.now ? performance.now()
      : (Date.now ? Date.now() : 0);
  }

  return Object.freeze({
    STEPS, BUDGET_P95_MS, BUDGET_FLOOR_MS, HISTORY_LIMIT, MAX_STEPS,
    create, observe, style
  });
});