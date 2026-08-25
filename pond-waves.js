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

  const GLINT_LIFE_MS = 760;
  const SHORE_FOLD_MS = 640;
  const RELEASE_LIFE_MIN_S = .45;
  const RELEASE_LIFE_MAX_S = 1.9;

  // A wave meeting answers with one quiet pearl *and a local glint on the
  // water itself*: a bounded soft radial flare at the collision node. Pure
  // timing and colour only, so the browser layer can draw it without the
  // audio engine or the score layer. Reduced motion keeps a calm still glow
  // (no expansion) that still curls away on the same short schedule. Broken
  // clocks and absent events stay bounded.
  function collisionGlint(energy = .35, depth = .5, now = 0, born = 0, reducedMotion = false) {
    const force = clamp(Number.isFinite(energy) ? energy : .35);
    const at = Number.isFinite(now) ? now : 0;
    const start = Number.isFinite(born) ? born : at;
    const age = Math.min(Math.max(0, at - start), GLINT_LIFE_MS);
    if (age >= GLINT_LIFE_MS) {
      return Object.freeze({ age, life: GLINT_LIFE_MS, progress: 1, fade: 0, radius: 0, alpha: 0 });
    }
    if (age <= 0) {
      // Not born yet: the water has not answered; keep the node silent.
      return Object.freeze({ age: 0, life: GLINT_LIFE_MS, progress: 0, fade: 0, radius: 0, alpha: 0, warmth: .72 });
    }
    const progress = age / GLINT_LIFE_MS;
    // Rise fast, then curl off; a strong meeting throws a wider warmer pool.
    const fade = Math.pow(1 - progress, 1.6) * (.45 + force * .4);
    const depthValue = clamp(Number.isFinite(depth) ? depth : .5);
    const spread = reducedMotion ? .34 : .55 + force * .3 + progress * (depthValue * .45);
    return Object.freeze({
      age, life: GLINT_LIFE_MS, progress, fade,
      radius: spread,
      alpha: reducedMotion ? fade * .8 : fade,
      warmth: .72 + depthValue * .5  // shallow stays herbal, deep folds amber
    });
  }

  // The visible departure: after a note ends, its resting light sinks away
  // along the same stretched tail the sound uses (iteration 0044 taught the
  // ear; this teaches the eye). Life derives from the real waterRelease
  // seconds plus the water depth, stays bounded, and the pool drifts
  // downward as it dims. Reduced motion keeps a calm still glow with no
  // sink. Broken clocks and junk inputs stay bounded.
  function releaseLifeSeconds(depth = .5, releaseSeconds = .55) {
    const depthValue = clamp(Number.isFinite(depth) ? depth : .5);
    const base = Number.isFinite(releaseSeconds) && releaseSeconds > 0 ? releaseSeconds : .55;
    return Math.min(RELEASE_LIFE_MAX_S, Math.max(RELEASE_LIFE_MIN_S, base * (1 + depthValue * .35)));
  }

  function releaseGlint(depth = .5, releaseSeconds = .55, now = 0, born = 0, reducedMotion = false) {
    const life = Math.round(releaseLifeSeconds(depth, releaseSeconds) * 1000);
    const depthValue = clamp(Number.isFinite(depth) ? depth : .5);
    const at = Number.isFinite(now) ? now : 0;
    const start = Number.isFinite(born) ? born : at;
    const warmth = .72 + depthValue * .5; // shallow herbal, deep folds amber
    if (at < start) {
      // Not yet departed: the water has not answered.
      return Object.freeze({ age: 0, life, progress: 0, fade: 0, sink: 0, radius: 0, alpha: 0, warmth });
    }
    const age = Math.min(at - start, life);
    if (age >= life) {
      return Object.freeze({ age: life, life, progress: 1, fade: 0, sink: 0, radius: 0, alpha: 0, warmth });
    }
    const progress = age / life;
    const fade = Math.pow(1 - progress, 1.5) * (.5 + depthValue * .38);
    // Settle first, then descend: smoothstep keeps the very start calm.
    const eased = progress * progress * (3 - 2 * progress);
    return Object.freeze({
      age,
      life,
      progress,
      fade,
      sink: reducedMotion ? 0 : eased,
      radius: reducedMotion ? .42 : .42 + progress * .3,
      alpha: reducedMotion ? fade * .85 : fade,
      warmth
    });
  }

  // The visible bank is part of the instrument. When a ripple's expanding
  // ring first reaches the near shoreline it does not stop flat: it folds
  // back as one quiet lapping return, bounded and cheap, so a loud meeting
  // near the shore can be heard without a ripple track crossing the whole
  // water. Broken clocks, far births and already-past rings produce no lap.
  function shoreFold(energy = .3, depth = .5, now = 0, born = 0, reducedMotion = false) {
    const force = clamp(Number.isFinite(energy) ? energy : .3);
    const depthValue = clamp(Number.isFinite(depth) ? depth : .5);
    const at = Number.isFinite(now) ? now : 0;
    const start = Number.isFinite(born) ? born : at;
    if (at < start) return Object.freeze({ age: 0, life: SHORE_FOLD_MS, progress: 0, fold: 0, fade: 0, alpha: 0 });
    const age = Math.min(Math.max(0, at - start), SHORE_FOLD_MS);
    if (age >= SHORE_FOLD_MS) {
      return Object.freeze({ age: SHORE_FOLD_MS, life: SHORE_FOLD_MS, progress: 1, fold: 0, fade: 0, alpha: 0 });
    }
    const progress = age / SHORE_FOLD_MS;
    // Fold in quickly (a lap returns), then rest; strong shallow meetings lap
    // a little wider and brighter.
    const fade = Math.pow(1 - progress, 1.5) * (.4 + force * .32);
    const fold = reducedMotion ? 0 : progress;
    return Object.freeze({
      age, life: SHORE_FOLD_MS, progress, fold, fade,
      radius: reducedMotion ? .3 : .3 + fold * .4,
      alpha: reducedMotion ? fade * .7 : fade,
      warmth: .7 + depthValue * .5
    });
  }

  function predictShore(a, now = a?.born ?? 0, bounds = {}) {
    if (!a || !Number.isFinite(now) || !Number.isFinite(bounds.height) || !Number.isFinite(bounds.width)) return null;
    const beginsAt = Math.max(now, a.born);
    if (!isAlive(a, beginsAt)) return null;
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return null;
    const shoreTop = Number.isFinite(bounds.shoreTop) ? bounds.shoreTop : bounds.height * .78;
    if (a.y >= shoreTop) return null; // already resting on the bank
    const ry = radiusAt(a, beginsAt) * Y_RADIUS_RATIO;
    const gap = shoreTop - (a.y + ry); // pixels of ring travel left to the shore
    if (gap <= 0) return null; // ring is already lapping
    const delayMs = gap / (speed(a) * Y_RADIUS_RATIO) * 1000;
    if (delayMs < MIN_COLLISION_DELAY_MS || delayMs > MAX_COLLISION_DELAY_MS) return null;
    const at = beginsAt + delayMs;
    if (!isAlive(a, at)) return null;
    const energy = clamp(
      a.pressure * (1 - delayMs / (MAX_COLLISION_DELAY_MS * 1.35)), 0, 1
    );
    if (energy < .12) return null;
    return Object.freeze({
      key: `shore:${a.id}`,
      at,
      delayMs,
      x: a.x,
      y: shoreTop,
      energy,
      parentFrequency: a.frequency
    });
  }

  // The pond reads its own score while it plays. A ripple whose expanding
  // ring first touches a still-readable ink polyline is predicted here, in
  // pure geometry: the earliest wall-clock crossing inside both the ripple's
  // life and the line's remaining life, in exact px. The caller re-strikes
  // the phrase's own place there. Broken inputs stay bounded (return null).
  // `line` carries normalized points plus a `born` and a `life` (ink life ms).
  function predictInkRead(a, now, line, bounds = {}) {
    if (!a || !line || !Number.isFinite(now) ||
        !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) ||
        ![a.x, a.y, a.born].every(Number.isFinite)) return null;
    const beginsAt = Math.max(now, a.born);
    if (!isAlive(a, beginsAt)) return null;
    const points = Array.isArray(line?.points) ? line.points.filter(pt =>
      pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) : [];
    if (points.length < 2) return null;
    const w = bounds.width, h = bounds.height;
    const lineBorn = Number.isFinite(line.born) ? line.born : beginsAt;
    const lineLife = Math.max(80, Number.isFinite(line.life) ? line.life : 0);
    // Closest approach of the ring to each segment, in the same y-compressed
    // plane collisions use, so the ring stays an ellipse against the shore.
    let best = null;
    for (let index = 0; index + 1 < points.length; index += 1) {
      const p1 = { x: points[index].x * w, y: points[index].y * h };
      const p2 = { x: points[index + 1].x * w, y: points[index + 1].y * h };
      const sx = p2.x - p1.x, sy = p2.y - p1.y;
      const lenSq = sx * sx + sy * sy;
      let t = lenSq > 0 ? clamp(((a.x - p1.x) * sx + (a.y - p1.y) * sy) / lenSq) : 0;
      const cx = p1.x + sx * t, cy = p1.y + sy * t;
      const dx = a.x - cx, dy = (a.y - cy) / Y_RADIUS_RATIO;
      const dScaled = Math.hypot(dx, dy);
      const gap = dScaled - BASE_RADIUS_PX;
      if (gap < 0) continue; // ring already past this spot
      const delayMs = gap / speed(a) * 1000;
      if (!Number.isFinite(delayMs)) continue;
      const at = beginsAt + delayMs;
      if (at < lineBorn || at >= lineBorn + lineLife || !isAlive(a, at)) continue;
      if (!best || at < best.at) {
        // Local pitch: blend the segment's endpoint pitch by the touch `t`.
        const pa = Number.isFinite(points[index].pitch) ? points[index].pitch : points[index].x;
        const pb = Number.isFinite(points[index + 1].pitch) ? points[index + 1].pitch : points[index + 1].x;
        best = {
          at,
          delayMs,
          x: cx,
          y: cy,
          pitch: clamp(pa + (pb - pa) * t),
          energy: clamp(a.pressure * (1 - delayMs / 1800), .04, 1)
        };
      }
    }
    if (!best) return null;
    return Object.freeze({
      key: `ink:${a.id}:${line.born}`,
      at: best.at,
      delayMs: best.delayMs,
      x: best.x,
      y: best.y,
      nx: best.x / w,
      ny: best.y / h,
      pitch: best.pitch,
      energy: best.energy,
      parentFrequency: a.frequency
    });
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
    predictInkRead,
    predictShore,
    shoreFold,
    SHORE_FOLD_MS,
    radiusAt,
    speed,
    GLINT_LIFE_MS,
    collisionGlint,
    RELEASE_LIFE_MIN_S,
    RELEASE_LIFE_MAX_S,
    releaseLifeSeconds,
    releaseGlint
  });
});
