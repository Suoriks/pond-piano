((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PondGesture = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const EDDY_ARM_HOLD_MS = 520;
  const EDDY_CANDIDATE_TIMEOUT_MS = 1900;
  const EDDY_MIN_RADIUS = .018;
  const EDDY_MAX_RADIUS = .105;
  const EDDY_ACTIVATION_TURNS = .55;
  const EDDY_CAPTURE_RADIANS = .42;
  const EDDY_RELEASE_SPEED = 1.35;
  const TAU = Math.PI * 2;

  const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
  const wrapAngle = angle => {
    let wrapped = angle;
    while (wrapped > Math.PI) wrapped -= TAU;
    while (wrapped < -Math.PI) wrapped += TAU;
    return wrapped;
  };

  function beginEddy(centerX, centerY, now = 0) {
    return {
      centerX,
      centerY,
      born: now,
      lastX: centerX,
      lastY: centerY,
      lastAngle: null,
      winding: 0,
      angularTravel: 0,
      pathLength: 0,
      radiusTotal: 0,
      radiusSamples: 0,
      minimumRadius: Infinity,
      maximumRadius: 0,
      direction: 0,
      active: false,
      intensity: 0
    };
  }

  function updateEddy(state, { x, y, now = 0, span = 1, speedPerSecond = 0 } = {}) {
    if (!state || ![x, y, now, span].every(Number.isFinite) || span <= 0) {
      return { state: null, active: false, activated: false, released: false, capturesMotion: false };
    }
    const dx = x - state.centerX;
    const dy = y - state.centerY;
    const radius = Math.hypot(dx, dy) / span;
    const step = Math.hypot(x - state.lastX, y - state.lastY) / span;
    const timedOut = !state.active && now - state.born > EDDY_CANDIDATE_TIMEOUT_MS;
    const escaped = radius > EDDY_MAX_RADIUS || speedPerSecond >= EDDY_RELEASE_SPEED;
    if (timedOut || escaped) {
      return {
        state: null,
        active: false,
        activated: false,
        released: state.active,
        capturesMotion: false,
        reason: timedOut ? 'timeout' : 'broad-stroke'
      };
    }

    const next = { ...state, lastX: x, lastY: y, pathLength: state.pathLength + step };
    let angleDelta = 0;
    if (radius >= EDDY_MIN_RADIUS * .42) {
      const angle = Math.atan2(dy, dx);
      if (Number.isFinite(state.lastAngle)) {
        angleDelta = wrapAngle(angle - state.lastAngle);
        // A real small circle advances in short arcs. Ignore teleports across the centre.
        if (Math.abs(angleDelta) <= 1.32) {
          const establishedDirection = state.direction || Math.sign(angleDelta);
          const followsDirection = !establishedDirection || Math.sign(angleDelta) === establishedDirection;
          next.winding += followsDirection ? angleDelta : angleDelta * .28;
          next.angularTravel += Math.abs(angleDelta);
          if (!next.direction && Math.abs(next.winding) > .18) next.direction = Math.sign(next.winding);
        }
      }
      next.lastAngle = angle;
      next.radiusTotal += radius;
      next.radiusSamples += 1;
      next.minimumRadius = Math.min(next.minimumRadius, radius);
      next.maximumRadius = Math.max(next.maximumRadius, radius);
    }

    const meanRadius = next.radiusSamples ? next.radiusTotal / next.radiusSamples : 0;
    const radiusSpread = next.radiusSamples > 2 ? next.maximumRadius - next.minimumRadius : 0;
    const turns = Math.abs(next.winding) / TAU;
    const enoughArc = turns >= EDDY_ACTIVATION_TURNS;
    const enoughPath = next.pathLength >= Math.max(.055, meanRadius * 2.75);
    const roundEnough = meanRadius >= EDDY_MIN_RADIUS && radiusSpread <= Math.max(.045, meanRadius * 1.15);
    const activated = !next.active && enoughArc && enoughPath && roundEnough;
    next.active = next.active || activated;
    next.intensity = next.active
      ? clamp(.34 + (turns - EDDY_ACTIVATION_TURNS) / .85 * .66, .34, 1)
      : 0;

    return {
      state: next,
      active: next.active,
      activated,
      released: false,
      capturesMotion: next.active || next.angularTravel >= EDDY_CAPTURE_RADIANS,
      centerX: next.centerX,
      centerY: next.centerY,
      radius: radius * span,
      turns,
      direction: next.direction || Math.sign(next.winding) || 1,
      intensity: next.intensity
    };
  }

  function eddyExpression(intensity = 0, direction = 1) {
    const amount = clamp(intensity);
    return {
      amount,
      rateHz: 4.15 + amount * 1.55,
      gainDepth: .0035 + amount * .0085,
      visualTurns: (direction < 0 ? -1 : 1) * (.72 + amount * .5)
    };
  }

  return Object.freeze({
    EDDY_ARM_HOLD_MS,
    EDDY_CANDIDATE_TIMEOUT_MS,
    EDDY_MIN_RADIUS,
    EDDY_MAX_RADIUS,
    EDDY_ACTIVATION_TURNS,
    EDDY_CAPTURE_RADIANS,
    EDDY_RELEASE_SPEED,
    beginEddy,
    updateEddy,
    eddyExpression
  });
});
