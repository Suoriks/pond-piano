((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PondScore = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const MAX_MEMORIES = 12;
  const MAX_POINTS = 24;
  const FULL_LIFE_MS = 18000;
  const REDUCED_LIFE_MS = 9000;
  const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const smoothstep = (from, to, value) => {
    const t = clamp((value - from) / Math.max(1, to - from));
    return t * t * (3 - 2 * t);
  };

  function compactPoints(samples) {
    const clean = (Array.isArray(samples) ? samples : [])
      .filter(sample => sample && Number.isFinite(sample.x) && Number.isFinite(sample.y))
      .map(sample => ({
        x: clamp(sample.x), y: clamp(sample.y),
        at: Number.isFinite(sample.at) ? sample.at : 0,
        pressure: clamp(Number.isFinite(sample.pressure) ? sample.pressure : .42)
      }));
    if (clean.length <= MAX_POINTS) return clean;
    const result = [];
    for (let index = 0; index < MAX_POINTS; index += 1) {
      result.push(clean[Math.round(index * (clean.length - 1) / (MAX_POINTS - 1))]);
    }
    return result;
  }

  function createMemory(samples, releasedAt) {
    const points = compactPoints(samples);
    if (!points.length || !Number.isFinite(releasedAt)) return null;
    const first = points[0], last = points[points.length - 1];
    const durationMs = Math.max(80, Math.min(8000, releasedAt - first.at));
    const pressure = points.reduce((sum, point) => sum + point.pressure, 0) / points.length;
    return Object.freeze({
      born: releasedAt,
      durationMs,
      pitch: last.x,
      depth: last.y,
      pressure,
      points: Object.freeze(points.map(Object.freeze))
    });
  }

  function lifeMs(reducedMotion = false) {
    return reducedMotion ? REDUCED_LIFE_MS : FULL_LIFE_MS;
  }

  function visibility(memory, now, reducedMotion = false) {
    if (!memory || !Number.isFinite(now)) return 0;
    const age = now - memory.born;
    const life = lifeMs(reducedMotion);
    if (age < 0 || age >= life) return 0;
    const arrive = smoothstep(0, 260, age);
    const leave = 1 - smoothstep(life * .32, life, age);
    return arrive * leave;
  }

  function append(memories, memory, maximum = MAX_MEMORIES) {
    if (!memory) return Array.isArray(memories) ? memories.slice(-maximum) : [];
    return [...(Array.isArray(memories) ? memories : []), memory].slice(-Math.max(1, maximum));
  }

  return Object.freeze({ MAX_MEMORIES, MAX_POINTS, createMemory, lifeMs, visibility, append });
});
