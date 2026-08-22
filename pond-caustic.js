((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PondCaustic = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const TAU = Math.PI * 2;
  const DEFAULT_COUNT = 22;
  const MAX_COUNT = 48;
  const WARMTH_RECAY_PER_SECOND = .2;
  const WARMTH_RADIUS_01 = .14;
  const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));

  // Deterministic tiny PRNG so the light field is stable across a viewport,
  // never shifting between frames and never needing a seeded RNG at draw time.
  function makeRandom(seed) {
    let state = (Number.isFinite(seed) ? Math.trunc(seed) : 7) >>> 0 || 1;
    return () => {
      state += 0x6D2B79F5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Motes live in normalized 0..1 coordinates so one field survives any layout.
  // Anchor oscillation makes them tremble around a place, reading as light on
  // the water rather than drifting dust.
  function createMotes(count = DEFAULT_COUNT, seed = 7) {
    const amount = Math.max(8, Math.min(DEFAULT_COUNT, Number.isFinite(count) ? Math.trunc(count) : DEFAULT_COUNT));
    const rnd = makeRandom(seed);
    const motes = [];
    for (let index = 0; index < amount; index += 1) {
      motes.push(Object.freeze({
        x: rnd(),
        y: rnd(),
        amplitude: .5 + rnd() * .9,
        jitter: .5 + rnd() * 1.4,
        rate: .6 + rnd() * 1.1,
        phase: rnd() * TAU,
        size: .5 + rnd() * .5,
        warmth: 0
      }));
    }
    return motes;
  }

  // One frame of the living field: motes breathe and let momentary brightness
  // decay back into the quiet water.
  function updateMotes(motes, dtSeconds) {
    if (!Array.isArray(motes)) return [];
    const dt = Math.max(0, Math.min(.2, Number.isFinite(dtSeconds) ? dtSeconds : 0));
    const decay = Math.pow(WARMTH_RECAY_PER_SECOND, dt);
    return motes.map(mote => {
      if (!mote) return null;
      return {
        ...mote,
        phase: mote.phase + dt * mote.rate,
        warmth: clamp(mote.warmth * decay)
      };
    }).filter(Boolean);
  }

  // A note or visible happening brightens near motes: each caught mote grows a
  // warmer pool, so the surface visibly gathers light where music is born.
  function gatherMotes(motes, x, y, strength = .5, radius = WARMTH_RADIUS_01) {
    if (!Array.isArray(motes) || ![x, y, strength].every(Number.isFinite)) return motes ?? [];
    const reach = Math.max(.004, Number.isFinite(radius) ? Math.abs(radius) : WARMTH_RADIUS_01);
    const gain = clamp(Number.isFinite(strength) ? strength : .5, 0, 1.4);
    return motes.map(mote => {
      if (!mote) return null;
      const distance = Math.hypot(mote.x - x, mote.y - y);
      const falloff = Math.max(0, 1 - distance / reach);
      if (falloff <= 0) return mote;
      return { ...mote, warmth: clamp(mote.warmth + falloff * gain) };
    }).filter(Boolean);
  }

  // Deterministic visual state for one mote right now. Reduced motion holds the
  // light steady; the brightness still answers the music.
  function moteVisual(mote, now = 0, reduced = false) {
    if (!mote) return null;
    const jitterX = reduced ? 0 : Math.sin(mote.phase + now * .00034 * mote.rate);
    const jitterY = reduced ? 0 : Math.cos(mote.phase + now * .00029 * mote.rate);
    const span = wicket(mote.jitter, .0032);
    return Object.freeze({
      x: clamp(mote.x + jitterX * span),
      y: clamp(mote.y + jitterY * span),
      size: .5 + mote.size * .5,
      alpha: clamp(.045 + mote.warmth * .6)
    });
  }

  // Small private multiplier helper so moteVisual stays readable.
  function wicket(gain, base) {
    return Math.max(0, Math.min(1, Number.isFinite(gain) ? gain : .5)) * base;
  }

  return Object.freeze({
    DEFAULT_COUNT,
    MAX_COUNT,
    WARMTH_RECAY_PER_SECOND,
    WARMTH_RADIUS_01,
    createMotes,
    updateMotes,
    gatherMotes,
    moteVisual
  });
});