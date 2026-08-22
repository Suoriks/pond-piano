((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PondTide = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const TAU = Math.PI * 2;
  const DEFAULT_SWELLS = 3;
  const MAX_STIRS = 10;
  const STIR_LIFE_MS = 14000;
  const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));

  // Deterministic tiny PRNG so the field is stable across a viewport and never
  // shifts between frames without a seed at draw time.
  function makeRandom(seed) {
    let state = (Number.isFinite(seed) ? Math.trunc(seed) : 13) >>> 0 || 1;
    return () => {
      state += 0x6D2B79F5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Broad mineral swells that breathe and drift slowly across the surface.
  // They live in normalized coordinates so one field survives any layout.
  function createSwells(count = DEFAULT_SWELLS, seed = 13) {
    const amount = Math.max(1, Math.min(5, Number.isFinite(count) ? Math.trunc(count) : DEFAULT_SWELLS));
    const rnd = makeRandom(seed);
    const swells = [];
    for (let index = 0; index < amount; index += 1) {
      swells.push(Object.freeze({
        x: rnd(),
        y: rnd(),
        speed: .008 + rnd() * .02,     // normalized span per second
        drift: .004 + rnd() * .014,    // vertical wander rate
        dir: rnd() < .5 ? -1 : 1,      // direction of travel
        warp: Math.PI * (.25 + rnd() * 1.5),
        size: .16 + rnd() * .2,        // normalized width of the glow
        spread: 1 + rnd() * .9,        // vertical elongation
        tint: .82 + rnd() * .36,       // hue offset
        peak: .10 + rnd() * .06,       // base brightness
        phase: rnd() * TAU,
        rate: .06 + rnd() * .16        // breathing rate (cycles per second)
      }));
    }
    return swells;
  }

  // A note or visible happening stirs the reading: it leaves a long soft
  // afterglow near the site that the tide slowly carries and lets fade.
  function stir(stirs, x, y, strength = .5) {
    const source = Array.isArray(stirs) ? stirs : [];
    if (![x, y, strength].every(Number.isFinite)) return source;
    const energy = clamp(Number.isFinite(strength) ? strength : .5, 0, 1.2);
    if (energy < .08) return source;
    const latest = [...source.filter(Boolean)].slice(-(MAX_STIRS - 1));
    latest.push(Object.freeze({ x: clamp(x), y: clamp(y), energy, born: 0 }));
    return latest;
  }

  // Advance the field wall-time: swells wander and breathe, stirs age and fade
  // evenly over the long life so the afterglow lingers quietly.
  function updateTide(swells, stirs, dtSeconds) {
    const dt = Math.max(0, Math.min(.2, Number.isFinite(dtSeconds) ? dtSeconds : 0));
    return {
      swells: (Array.isArray(swells) ? swells : []).map(swell => {
        if (!swell) return null;
        const wander = Math.sin(swell.phase * .37) * swell.drift * dt;
        return {
          ...swell,
          x: (swell.x + swell.speed * swell.dir * dt + 1) % 1,
          y: clamp(swell.y + wander),
          phase: swell.phase + dt * swell.rate
        };
      }).filter(Boolean),
      stirs: (Array.isArray(stirs) ? stirs : []).map(stir => {
        if (!stir) return null;
        const elapsed = stir.born + dt * 1000;
        const remaining = Math.max(0, 1 - elapsed / STIR_LIFE_MS);
        const energy = stir.energy * remaining;
        return energy < .02 ? null : { ...stir, born: elapsed, energy };
      }).filter(Boolean)
    };
  }

  // Deterministic visual state right now. Reduced motion holds every swell
  // still and quietly keeps the afterglow readable without drifting glows.
  function tideVisual(swells, stirs, now = 0, reduced = false) {
    const glow = [];
    for (const swell of Array.isArray(swells) ? swells : []) {
      if (!swell) continue;
      const breath = reduced ? .78 : .52 + .48 * Math.sin(swell.phase + now * .001 * swell.rate);
      const swayX = reduced ? 0 : Math.sin(now * .00023 + swell.warp) * .06;
      const swayY = reduced ? 0 : Math.cos(now * .00019 + swell.warp * .7) * .04;
      glow.push(Object.freeze({
        x: clamp(swell.x + swayX),
        y: clamp(swell.y + swayY),
        size: swell.size,
        spread: swell.spread,
        tint: swell.tint,
        alpha: clamp(swell.peak * breath)
      }));
    }
    for (const stir of Array.isArray(stirs) ? stirs : []) {
      if (!stir || stir.energy < .02) continue;
      const progress = clamp(stir.born / STIR_LIFE_MS);
      const fade = Math.pow(1 - progress, 1.15);
      const hue = 153 + 30 * (1 - stir.y);
      glow.push(Object.freeze({
        x: stir.x, y: stir.y,
        size: .14 + progress * .09,
        spread: .56 + progress * .84,
        hue,
        alpha: clamp(stir.energy * fade * .4)
      }));
    }
    return glow;
  }

  return Object.freeze({
    DEFAULT_SWELLS,
    MAX_STIRS,
    STIR_LIFE_MS,
    createSwells,
    stir,
    updateTide,
    tideVisual
  });
});