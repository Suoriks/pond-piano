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
  const SKIP_SAMPLE_WINDOW_MS = 180;
  const SKIP_MIN_SPEED = .72;
  const SKIP_MIN_STRAIGHTNESS = .86;
  const SKIP_MIN_TRAVEL = .055;
  const GATHER_MIN_HOLD_MS = 240;
  const GATHER_MIN_START_DISTANCE = .22;
  const GATHER_MAX_START_DISTANCE = .72;
  const GATHER_MAX_END_DISTANCE = .18;
  const GATHER_TRIGGER_RATIO = .52;
  const GATHER_MIN_INWARD_TRAVEL = .055;
  const GATHER_MAX_MIDPOINT_DRIFT = .09;
  const GATHER_LIFE_MS = 1120;
  const GATHER_REDUCED_LIFE_MS = 1480;
  const TAU = Math.PI * 2;

  const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
  const smoothstep = value => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
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

  function skippingStone(samples, releasedAt, { width = 1, height = 1 } = {}) {
    if (![releasedAt, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    const span = Math.min(width, height);
    const recent = (Array.isArray(samples) ? samples : [])
      .filter(sample => sample && [sample.x, sample.y, sample.at].every(Number.isFinite) &&
        sample.at <= releasedAt && sample.at >= releasedAt - SKIP_SAMPLE_WINDOW_MS)
      .map(sample => ({ x: clamp(sample.x) * width, y: clamp(sample.y) * height, at: sample.at }))
      .sort((a, b) => a.at - b.at);
    if (recent.length < 2 || releasedAt - recent.at(-1).at > 72) return null;

    let pathLength = 0;
    for (let index = 1; index < recent.length; index += 1) {
      pathLength += Math.hypot(recent[index].x - recent[index - 1].x, recent[index].y - recent[index - 1].y);
    }
    const first = recent[0], last = recent.at(-1);
    const dx = last.x - first.x, dy = last.y - first.y;
    const distance = Math.hypot(dx, dy);
    const elapsedMs = Math.max(8, releasedAt - first.at);
    const speed = distance / span * 1000 / elapsedMs;
    const straightness = distance / Math.max(1, pathLength);
    if (distance / span < SKIP_MIN_TRAVEL || speed < SKIP_MIN_SPEED || straightness < SKIP_MIN_STRAIGHTNESS) return null;

    const directionX = dx / distance, directionY = dy / distance;
    const insetX = Math.min(width * .12, Math.max(12, span * .045));
    const insetY = Math.min(height * .12, Math.max(12, span * .06));
    const limits = [];
    if (directionX > .001) limits.push((width - insetX - last.x) / directionX);
    else if (directionX < -.001) limits.push((insetX - last.x) / directionX);
    if (directionY > .001) limits.push((height - insetY - last.y) / directionY);
    else if (directionY < -.001) limits.push((insetY - last.y) / directionY);
    const room = Math.max(0, Math.min(...limits.filter(Number.isFinite)));
    const travel = Math.min(room * .92, span * clamp(.17 + speed * .075, .18, .36));
    if (travel < span * .13) return null;

    const threeSkips = speed >= 1.22 && travel >= span * .23;
    const portions = threeSkips ? [.34, .68, 1] : [.48, 1];
    const delays = threeSkips ? [62, 148, 258] : [68, 166];
    const energy = clamp(.34 + speed * .18, .42, .86);
    const contacts = portions.map((portion, index) => Object.freeze({
      x: clamp((last.x + directionX * travel * portion) / width),
      y: clamp((last.y + directionY * travel * portion) / height),
      delayMs: delays[index],
      energy: energy * Math.pow(.7, index),
      index
    }));

    return Object.freeze({
      speed,
      straightness,
      directionX,
      directionY,
      origin: Object.freeze({ x: clamp(last.x / width), y: clamp(last.y / height) }),
      contacts: Object.freeze(contacts)
    });
  }

  function gatheringContacts(contacts) {
    if (!Array.isArray(contacts)) return [];
    return contacts.filter(contact => contact && contact.sounding !== false &&
      (typeof contact.id === 'string' || Number.isFinite(contact.id)) &&
      [contact.x, contact.y, contact.originX, contact.originY, contact.born, contact.frequency]
        .every(Number.isFinite) && contact.frequency > 0);
  }

  function gatheringKey(contacts) {
    const pair = gatheringContacts(contacts);
    if (pair.length !== 2) return null;
    return pair.map(contact => String(contact.id)).sort().join('|');
  }

  // Two live currents can be deliberately pulled into one pearl. Both
  // contacts must begin safely apart, travel towards their original shared
  // midpoint, and close most of the distance without dragging that midpoint
  // across the pond. This rejects parallel swipes, ordinary two-note chords,
  // edge pinches and a third finger before the browser layer ever makes sound.
  function gatheringPearl(contacts, now, bounds) {
    const width = Number(bounds?.width), height = Number(bounds?.height);
    if (!Number.isFinite(now) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    const pair = gatheringContacts(contacts);
    if (pair.length !== 2 || pair.some(contact => now - contact.born < GATHER_MIN_HOLD_MS)) return null;
    const span = Math.max(1, Math.min(width, height));
    const [a, b] = pair;
    const startDx = b.originX - a.originX, startDy = b.originY - a.originY;
    const startDistance = Math.hypot(startDx, startDy);
    const startRatio = startDistance / span;
    if (startRatio < GATHER_MIN_START_DISTANCE || startRatio > GATHER_MAX_START_DISTANCE) return null;

    const startMidX = (a.originX + b.originX) / 2, startMidY = (a.originY + b.originY) / 2;
    const endMidX = (a.x + b.x) / 2, endMidY = (a.y + b.y) / 2;
    const endDistance = Math.hypot(b.x - a.x, b.y - a.y);
    const endRatio = endDistance / span;
    const closure = 1 - endDistance / startDistance;
    if (endRatio > GATHER_MAX_END_DISTANCE || endDistance / startDistance > GATHER_TRIGGER_RATIO) return null;
    if (Math.hypot(endMidX - startMidX, endMidY - startMidY) / span > GATHER_MAX_MIDPOINT_DRIFT) return null;

    const inwardTravel = pair.map(contact => {
      const inwardX = startMidX - contact.originX, inwardY = startMidY - contact.originY;
      const inwardLength = Math.max(1e-6, Math.hypot(inwardX, inwardY));
      return ((contact.x - contact.originX) * inwardX + (contact.y - contact.originY) * inwardY) / inwardLength / span;
    });
    if (inwardTravel.some(distance => distance < GATHER_MIN_INWARD_TRAVEL)) return null;

    const x = clamp(endMidX, 0, width), y = clamp(endMidY, 0, height);
    const energy = clamp(.34 + closure * .52 + Math.min(...inwardTravel) * .8, .42, .88);
    return Object.freeze({
      key: gatheringKey(pair),
      x,
      y,
      depth: clamp(y / height),
      energy,
      closure: clamp(closure),
      frequencies: Object.freeze(pair.map(contact => contact.frequency)),
      arms: Object.freeze(pair.map(contact => Object.freeze({
        x: clamp(contact.originX / width),
        y: clamp(contact.originY / height)
      }))),
      born: now
    });
  }

  function gatheringVisual(pearl, now, reducedMotion = false) {
    const born = Number.isFinite(pearl?.born) ? pearl.born : 0;
    const life = reducedMotion ? GATHER_REDUCED_LIFE_MS : GATHER_LIFE_MS;
    const beforeBirth = !Number.isFinite(now) || now < born;
    const age = beforeBirth ? 0 : clamp(now - born, 0, life);
    const progress = age / life;
    const envelope = beforeBirth || progress >= 1 ? 0 : Math.sin(progress * Math.PI);
    const energy = clamp(Number.isFinite(pearl?.energy) ? pearl.energy : .5);
    return Object.freeze({
      life,
      progress,
      alpha: envelope * (.28 + energy * .34),
      fold: reducedMotion ? .82 : smoothstep(Math.min(1, progress * 2.7)),
      radius: 3.5 + energy * 4.5 + (reducedMotion ? 0 : smoothstep(progress) * 3.5),
      halo: 14 + energy * 18 + (reducedMotion ? 0 : smoothstep(progress) * 16),
      alive: !beforeBirth && progress < 1
    });
  }

  return Object.freeze({
    EDDY_ARM_HOLD_MS,
    EDDY_CANDIDATE_TIMEOUT_MS,
    EDDY_MIN_RADIUS,
    EDDY_MAX_RADIUS,
    EDDY_ACTIVATION_TURNS,
    EDDY_CAPTURE_RADIANS,
    EDDY_RELEASE_SPEED,
    SKIP_SAMPLE_WINDOW_MS,
    SKIP_MIN_SPEED,
    SKIP_MIN_STRAIGHTNESS,
    SKIP_MIN_TRAVEL,
    GATHER_MIN_HOLD_MS,
    GATHER_MIN_START_DISTANCE,
    GATHER_MAX_START_DISTANCE,
    GATHER_MAX_END_DISTANCE,
    GATHER_TRIGGER_RATIO,
    GATHER_MIN_INWARD_TRAVEL,
    GATHER_MAX_MIDPOINT_DRIFT,
    GATHER_LIFE_MS,
    GATHER_REDUCED_LIFE_MS,
    beginEddy,
    updateEddy,
    eddyExpression,
    skippingStone,
    gatheringKey,
    gatheringPearl,
    gatheringVisual
  });
});
