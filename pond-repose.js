((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PondRepose = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  // The pond survives a change of screen. When the window is resized, every
  // live artifact keeps its *place on the water* (its normalized position)
  // and lands in the new pixel space, so pitch, depth and stereo meaning of
  // what is already sounding stay identical. Pure geometry only: no DOM, no
  // audio, no clocks. Damaged inputs stay bounded instead of throwing.
  const MIN_SPAN = 1;

  function span(size) {
    return Math.max(MIN_SPAN, Number.isFinite(size) ? size : MIN_SPAN);
  }

  function scalePoint(point, from, to) {
    return {
      x: point.x / span(from.w) * span(to.w),
      y: point.y / span(from.h) * span(to.h)
    };
  }

  // Scale a polar pair (radius + angle) by the same relative stretch as the
  // surface itself, so a wave stays an honest ellipse in the new space.
  function scalePolar(radius, angle, from, to) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return {
      x: radius / span(from.w) * span(to.w) * cos,
      y: radius / span(from.h) * span(to.h) * sin
    };
  }

  function finiteOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  // Ripples/waves carry their own pressure/strength/frequency; only their
  // center moves with the water.
  function reposeWaves(wavesList, from, to) {
    if (!Array.isArray(wavesList)) return [];
    return wavesList.map(wave => wave && typeof wave === 'object'
      ? { ...wave, ...scalePoint(wave, from, to) }
      : wave);
  }

  // Glide trails remember the segment they were born from.
  function reposeTrails(trailsList, from, to) {
    if (!Array.isArray(trailsList)) return [];
    return trailsList.map(trail => trail && typeof trail === 'object'
      ? { ...trail, ...scalePoint(trail, from, to), fromX: finiteOr(trail.fromX, trail.x) / span(from.w) * span(to.w), fromY: finiteOr(trail.fromY, trail.y) / span(from.h) * span(to.h) }
      : trail);
  }

  // Splash fans keep their launch direction; only the fan's reach follows
  // the water's stretch.
  function reposeSplashes(splashesList, from, to) {
    if (!Array.isArray(splashesList)) return [];
    return splashesList.map(splash => splash && typeof splash === 'object'
      ? { ...splash, ...scalePoint(splash, from, to), angle: finiteOr(splash.angle, 0) }
      : splash);
  }

  // Drop coronas carry a bounded spray plan (per-ray dx/dy); the whole plan
  // rides the same stretch.
  function reposeCoronas(coronasList, from, to) {
    if (!Array.isArray(coronasList)) return [];
    return coronasList.map(corona => {
      if (!corona || typeof corona !== 'object') return corona;
      const center = scalePoint(corona, from, to);
      const rays = Array.isArray(corona.spray?.rays)
        ? corona.spray.rays.map(ray => {
          if (!ray || typeof ray !== 'object') return ray;
          const dx = finiteOr(ray.dx, 0), dy = finiteOr(ray.dy, 0);
          return { ...ray, dx: dx / span(from.w) * span(to.w), dy: dy / span(from.h) * span(to.h) };
        })
        : [];
      return {
        ...corona,
        ...center,
        spray: { ...(corona.spray ?? {}), depth: finiteOr(corona.spray?.depth, .5), rays }
      };
    });
  }

  // Pearls and glints are single points with their own life.
  function reposePoints(pointsList, from, to) {
    if (!Array.isArray(pointsList)) return [];
    return pointsList.map(item => item && typeof item === 'object'
      ? { ...item, ...scalePoint(item, from, to) }
      : item);
  }

  // A skipping stone flies through planned contacts; the whole flight path
  // lands in the new space.
  function reposeFlights(flightsList, from, to) {
    if (!Array.isArray(flightsList)) return [];
    return flightsList.map(flight => {
      if (!flight || typeof flight !== 'object') return flight;
      const safeOrigin = flight.origin && typeof flight.origin === 'object' ? flight.origin : { x: 0, y: 0 };
      return {
        ...flight,
        origin: scalePoint(safeOrigin, from, to),
        contacts: Array.isArray(flight.contacts)
          ? flight.contacts.map(contact => contact && typeof contact === 'object'
            ? { ...contact, ...scalePoint(contact, from, to) }
            : contact)
          : []
      };
    });
  }

  // An active pointer contact keeps its place, its last sampled point and
  // its gesture origin; its eddy (if any) re-arms around the moved center.
  function reposePointer(pointer, from, to) {
    if (!pointer || typeof pointer !== 'object') return pointer;
    const next = {
      ...pointer,
      ...scalePoint(pointer, from, to),
      sampledX: finiteOr(pointer.sampledX, pointer.x) / span(from.w) * span(to.w),
      sampledY: finiteOr(pointer.sampledY, pointer.y) / span(from.h) * span(to.h),
      originX: finiteOr(pointer.originX, pointer.x) / span(from.w) * span(to.w),
      originY: finiteOr(pointer.originY, pointer.y) / span(from.h) * span(to.h)
    };
    if (next.eddy && typeof next.eddy === 'object' &&
        Number.isFinite(next.eddy.centerX) && Number.isFinite(next.eddy.centerY)) {
      const center = scalePoint({ x: next.eddy.centerX, y: next.eddy.centerY }, from, to);
      const armRadius = finiteOr(next.eddy.radius, 0);
      const arm = scalePolar(armRadius, finiteOr(next.eddy.angle, 0), from, to);
      next.eddy = {
        ...next.eddy,
        centerX: center.x,
        centerY: center.y,
        lastX: center.x + arm.x,
        lastY: center.y + arm.y
      };
    }
    return next;
  }

  function reposePointers(pointersMap, from, to) {
    if (!(pointersMap instanceof Map)) return pointersMap;
    const next = new Map();
    for (const [id, pointer] of pointersMap) next.set(id, reposePointer(pointer, from, to));
    return next;
  }

  return Object.freeze({
    MIN_SPAN,
    span,
    scalePoint,
    scalePolar,
    reposeWaves,
    reposeTrails,
    reposeSplashes,
    reposeCoronas,
    reposePoints,
    reposeFlights,
    reposePointer,
    reposePointers
  });
});
