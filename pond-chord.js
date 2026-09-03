((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PondChord = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const MIN_VOICES = 3;
  const MAX_VOICES = 6;
  const HOLD_MS = 520;
  const CALM_MS = 180;
  const BLOOM_LIFE_MS = 1450;
  const REDUCED_BLOOM_LIFE_MS = 1750;

  const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
  const finite = value => Number.isFinite(value);
  const smoothstep = value => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };

  function soundingContacts(contacts) {
    if (!Array.isArray(contacts)) return [];
    return contacts
      .filter(contact => contact && contact.sounding !== false &&
        (typeof contact.id === 'string' || finite(contact.id)) &&
        [contact.x, contact.y, contact.frequency].every(finite) && contact.frequency > 0)
      .slice(0, MAX_VOICES);
  }

  function membershipKey(contacts) {
    const sounding = soundingContacts(contacts);
    if (sounding.length < MIN_VOICES) return null;
    return sounding.map(contact => String(contact.id)).sort().join('|');
  }

  function chordBloom(contacts, now, bounds) {
    const width = Number(bounds?.width), height = Number(bounds?.height);
    if (!finite(now) || !finite(width) || !finite(height) || width <= 0 || height <= 0) return null;
    const sounding = soundingContacts(contacts);
    if (sounding.length < MIN_VOICES) return null;
    if (sounding.some(contact => !finite(contact.born) || !finite(contact.lastMotion) ||
      now - contact.born < HOLD_MS || now - contact.lastMotion < CALM_MS)) return null;

    let weightTotal = 0, x = 0, y = 0, pressureTotal = 0;
    for (const contact of sounding) {
      const pressure = clamp(finite(contact.pressure) ? contact.pressure : .42);
      const weight = .72 + pressure * .28;
      weightTotal += weight;
      pressureTotal += pressure;
      x += clamp(contact.x, 0, width) * weight;
      y += clamp(contact.y, 0, height) * weight;
    }
    x /= weightTotal;
    y /= weightTotal;
    const span = Math.max(1, Math.min(width, height));
    const distances = sounding.map(contact => Math.hypot(clamp(contact.x, 0, width) - x, clamp(contact.y, 0, height) - y));
    const spread = clamp(distances.reduce((sum, distance) => sum + distance, 0) / sounding.length / span, .06, .42);
    const meanPressure = pressureTotal / sounding.length;
    const energy = clamp(.28 + meanPressure * .34 + spread * .72 + (sounding.length - MIN_VOICES) * .055, .32, .86);
    const petals = sounding.map(contact => Math.atan2(clamp(contact.y, 0, height) - y, clamp(contact.x, 0, width) - x));

    return Object.freeze({
      key: membershipKey(sounding),
      count: sounding.length,
      x,
      y,
      depth: clamp(y / height),
      spread,
      energy,
      frequencies: Object.freeze(sounding.map(contact => contact.frequency)),
      petals: Object.freeze(petals),
      born: now
    });
  }

  function bloomVisual(bloom, now, reducedMotion = false) {
    const born = finite(bloom?.born) ? bloom.born : 0;
    const life = reducedMotion ? REDUCED_BLOOM_LIFE_MS : BLOOM_LIFE_MS;
    const beforeBirth = !finite(now) || now < born;
    const age = beforeBirth ? 0 : clamp(now - born, 0, life);
    const progress = age / life;
    const envelope = beforeBirth || progress >= 1 ? 0 : Math.sin(progress * Math.PI);
    const energy = clamp(finite(bloom?.energy) ? bloom.energy : .4);
    const spread = clamp(finite(bloom?.spread) ? bloom.spread : .15, .06, .42);
    return Object.freeze({
      life,
      age,
      progress,
      alpha: envelope * (.18 + energy * .32),
      radius: (reducedMotion ? .58 : .32 + smoothstep(progress) * .68) * (18 + spread * 86),
      opening: reducedMotion ? .58 : smoothstep(Math.min(1, progress * 2.2)),
      rotation: reducedMotion ? 0 : progress * (.22 + energy * .18),
      alive: !beforeBirth && progress < 1
    });
  }

  return Object.freeze({
    MIN_VOICES,
    MAX_VOICES,
    HOLD_MS,
    CALM_MS,
    BLOOM_LIFE_MS,
    REDUCED_BLOOM_LIFE_MS,
    membershipKey,
    chordBloom,
    bloomVisual
  });
});
