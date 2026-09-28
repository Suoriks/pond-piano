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

  // The surface is the instrument, so the water itself takes the colour of the
  // chosen course instead of looking the same everywhere. Each palette is a few
  // honest numbers (three stops of the water, the two ripple streaks, the tone
  // of the caustics and of the tidal field) so a change of course can be walked
  // calmly instead of snapped. Dawn is the water the pond has always had.
  const COURSE_WATER = Object.freeze({
    dawn: Object.freeze({
      id: 'dawn',
      inner: Object.freeze({ h: 175, s: 46, l: 16 }),
      mid: Object.freeze({ h: 178, s: 58, l: 10 }),
      outer: Object.freeze({ h: 180, s: 65, l: 5 }),
      cool: Object.freeze({ h: 161, s: 34, l: 66 }),
      warm: Object.freeze({ h: 47, s: 48, l: 70 }),
      moteHue: 150, moteRange: 18,
      tideHue: 148, tideSpread: 26
    }),
    dusk: Object.freeze({
      id: 'dusk',
      inner: Object.freeze({ h: 205, s: 42, l: 15 }),
      mid: Object.freeze({ h: 209, s: 54, l: 9 }),
      outer: Object.freeze({ h: 214, s: 60, l: 4.5 }),
      cool: Object.freeze({ h: 192, s: 30, l: 62 }),
      warm: Object.freeze({ h: 30, s: 52, l: 68 }),
      moteHue: 198, moteRange: 16,
      tideHue: 202, tideSpread: 24
    }),
    mist: Object.freeze({
      id: 'mist',
      inner: Object.freeze({ h: 156, s: 26, l: 20 }),
      mid: Object.freeze({ h: 159, s: 26, l: 14 }),
      outer: Object.freeze({ h: 162, s: 24, l: 8 }),
      cool: Object.freeze({ h: 158, s: 20, l: 72 }),
      warm: Object.freeze({ h: 62, s: 20, l: 76 }),
      moteHue: 150, moteRange: 10,
      tideHue: 152, tideSpread: 18
    })
  });
  const COURSE_WATER_DEFAULT = 'dawn';
  const PALETTE_STOPS = Object.freeze(['inner', 'mid', 'outer', 'cool', 'warm']);

  function isPalette(value) {
    return Boolean(value) && typeof value === 'object'
      && typeof value.id === 'string' && Boolean(COURSE_WATER[value.id])
      && PALETTE_STOPS.every(key => value[key] && Number.isFinite(value[key].h));
  }

  // An unknown course never invents its own water: it honestly reads as dawn,
  // exactly like PondMusic.normalizeScaleFamily falls back to the same family.
  function courseWater(family) {
    return Object.prototype.hasOwnProperty.call(COURSE_WATER, family)
      ? COURSE_WATER[family]
      : COURSE_WATER[COURSE_WATER_DEFAULT];
  }

  // Hues travel the short way round the wheel, everything else straight, so a
  // crossfade between two courses never sweeps through a colour nobody chose.
  const isHueKey = key => key === 'h' || /Hue$/.test(key);
  const shortestHue = (from, to) => from + ((((to - from) % 360) + 540) % 360) - 180;

  function blendStop(from, to, progress) {
    const out = {};
    for (const key of Object.keys(to)) {
      const start = from ? from[key] : undefined;
      const end = to[key];
      if (Number.isFinite(start) && Number.isFinite(end)) {
        const target = isHueKey(key) ? shortestHue(start, end) : end;
        out[key] = start + (target - start) * progress;
      } else out[key] = end;
    }
    return Object.freeze(out);
  }

  // Deterministic in-between pigment for a calm crossfade. Both endpoints come
  // back untouched, a broken endpoint is ignored rather than invented, and an
  // out-of-range clock is clamped instead of extrapolated.
  function blendWaterPalette(from, to, progress) {
    const start = isPalette(from) ? from : null;
    const end = isPalette(to) ? to : null;
    if (!start) return end || courseWater(COURSE_WATER_DEFAULT);
    if (!end) return start;
    const t = Number.isFinite(progress) ? clamp(progress) : 1;
    if (t <= 0) return start;
    if (t >= 1) return end;
    const out = { id: end.id };
    for (const key of Object.keys(end)) {
      if (key === 'id') continue;
      const startValue = start[key];
      const endValue = end[key];
      if (startValue && typeof startValue === 'object' && endValue && typeof endValue === 'object') {
        out[key] = blendStop(startValue, endValue, t);
      } else if (Number.isFinite(startValue) && Number.isFinite(endValue)) {
        const target = isHueKey(key) ? shortestHue(startValue, endValue) : endValue;
        out[key] = startValue + (target - startValue) * t;
      } else out[key] = endValue;
    }
    return Object.freeze(out);
  }

  return Object.freeze({
    DEFAULT_SWELLS,
    MAX_STIRS,
    STIR_LIFE_MS,
    COURSE_WATER,
    COURSE_WATER_DEFAULT,
    courseWater,
    blendWaterPalette,
    createSwells,
    stir,
    updateTide,
    tideVisual
  });
});