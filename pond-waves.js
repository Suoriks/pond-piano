((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PondWaves = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const Y_RADIUS_RATIO = .42;
  const BASE_RADIUS_PX = 24;
  const MIN_SEPARATION_PX = 58;
  const MIN_COLLISION_DELAY_MS = 36;
  const MAX_COLLISION_DELAY_MS = 1800;

  const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));

  function createWave({ id, x, y, born, pressure = .42, strength = 1, frequency = 220 } = {}) {
    if (![x, y, born].every(Number.isFinite)) return null;
    return Object.freeze({
      id: String(id ?? `${born}:${x}:${y}`),
      x,
      y,
      born,
      pressure: clamp(Number.isFinite(pressure) ? pressure : .42, .04, 1),
      strength: clamp(Number.isFinite(strength) ? strength : 1, .2, 1.2),
      frequency: Math.max(20, Number.isFinite(frequency) ? frequency : 220)
    });
  }

  function speed(wave) {
    return 96 + wave.pressure * 52;
  }

  function lifeMs(wave) {
    return 2700 * (.7 + wave.strength * .3);
  }

  function radiusAt(wave, at) {
    const ageSeconds = Math.max(0, at - wave.born) / 1000;
    return BASE_RADIUS_PX + ageSeconds * speed(wave);
  }

  function isAlive(wave, at) {
    return Boolean(wave) && at >= wave.born && at < wave.born + lifeMs(wave);
  }

  function pairKey(a, b) {
    return [String(a?.id), String(b?.id)].sort().join('|');
  }

  function predictCollision(a, b, now = Math.max(a?.born ?? 0, b?.born ?? 0)) {
    if (!a || !b || a.id === b.id || ![now, a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
    const beginsAt = Math.max(now, a.born, b.born);
    if (!isAlive(a, beginsAt) || !isAlive(b, beginsAt)) return null;

    const dx = b.x - a.x;
    const dy = (b.y - a.y) / Y_RADIUS_RATIO;
    const distance = Math.hypot(dx, dy);
    if (distance < MIN_SEPARATION_PX) return null;

    const radiusA = radiusAt(a, beginsAt);
    const radiusB = radiusAt(b, beginsAt);
    const gap = distance - radiusA - radiusB;
    if (gap <= 0) return null;

    const delayMs = gap / (speed(a) + speed(b)) * 1000;
    if (delayMs < MIN_COLLISION_DELAY_MS || delayMs > MAX_COLLISION_DELAY_MS) return null;
    const at = beginsAt + delayMs;
    if (!isAlive(a, at) || !isAlive(b, at)) return null;

    const energy = clamp(
      Math.sqrt(a.pressure * b.pressure * a.strength * b.strength) *
      (1 - delayMs / (MAX_COLLISION_DELAY_MS * 1.35)),
      0,
      1
    );
    if (energy < .16) return null;

    const portion = clamp(radiusAt(a, at) / distance);
    return Object.freeze({
      key: pairKey(a, b),
      at,
      delayMs,
      x: a.x + (b.x - a.x) * portion,
      y: a.y + (b.y - a.y) * portion,
      energy,
      parentFrequency: Math.sqrt(a.frequency * b.frequency)
    });
  }

  return Object.freeze({
    Y_RADIUS_RATIO,
    BASE_RADIUS_PX,
    MIN_SEPARATION_PX,
    MIN_COLLISION_DELAY_MS,
    MAX_COLLISION_DELAY_MS,
    createWave,
    isAlive,
    lifeMs,
    pairKey,
    predictCollision,
    radiusAt,
    speed
  });
});
