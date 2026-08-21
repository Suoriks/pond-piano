((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PondMusic = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const BASE_FREQUENCY = 130.81278265; // C3
  const OCTAVES = 3;
  const ATTACK_WINDOW_MS = 240;
  const TEXTURE_BLOOM_START_MS = 620;
  const TEXTURE_BLOOM_END_MS = 3600;
  const MAX_STEREO_PAN = .68;
  const REFLECTION_DELAY_SECONDS = .072;
  const REFLECTION_FEEDBACK = .12;
  const REFLECTION_WET_GAIN = .36;
  const PRECISION_HOLD_MS = 420;
  const PRECISION_RELEASE_SPEED = .42;
  const PRECISION_RELEASE_DISTANCE = .045;
  const PRECISION_MIN_GAIN = .24;
  const DROP_MIN_DURATION_SECONDS = .115;
  const DROP_MAX_DURATION_SECONDS = .16;
  const MATERIAL_BRUSH_DEPTH = .09;
  const DEFAULT_SCALE_FAMILY = 'dawn';
  const SCALE_FAMILIES = Object.freeze({
    dawn: Object.freeze({
      id: 'dawn', name: 'Рассвет', description: 'светлая открытая пентатоника',
      intervals: Object.freeze([0, 2, 4, 7, 9])
    }),
    dusk: Object.freeze({
      id: 'dusk', name: 'Сумерки', description: 'тёплая минорная пентатоника',
      intervals: Object.freeze([0, 3, 5, 7, 10])
    }),
    mist: Object.freeze({
      id: 'mist', name: 'Туман', description: 'подвешенная просторная пентатоника',
      intervals: Object.freeze([0, 2, 5, 7, 10])
    })
  });
  const SCALE_CACHE = new Map();

  const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
  const smoothstep = (minimum, maximum, value) => {
    const t = clamp((value - minimum) / Math.max(.000001, maximum - minimum));
    return t * t * (3 - 2 * t);
  };
  const frequencyAt = normalizedX => BASE_FREQUENCY * Math.pow(2, clamp(normalizedX) * OCTAVES);
  const normalizedAtFrequency = frequency => clamp(Math.log2(Math.max(BASE_FREQUENCY, frequency) / BASE_FREQUENCY) / OCTAVES);
  const spatialPan = normalizedX => (clamp(normalizedX) * 2 - 1) * MAX_STEREO_PAN;
  const normalizedAtSemitones = semitones => clamp(semitones / (OCTAVES * 12));
  const frequencyAtSemitones = semitones => BASE_FREQUENCY * Math.pow(2, semitones / 12);
  const blend = (weights, values) => weights.reduce((sum, weight, index) => sum + weight * values[index], 0);

  function normalizeScaleFamily(value) {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SCALE_FAMILIES, value)
      ? value
      : DEFAULT_SCALE_FAMILY;
  }

  function parseScaleFamily(serialized) {
    if (typeof serialized !== 'string' || !serialized) return DEFAULT_SCALE_FAMILY;
    try {
      const parsed = JSON.parse(serialized);
      return normalizeScaleFamily(typeof parsed === 'string' ? parsed : parsed?.family);
    } catch {
      return normalizeScaleFamily(serialized);
    }
  }

  function serializeScaleFamily(value) {
    return JSON.stringify({ family: normalizeScaleFamily(value) });
  }

  function scaleSemitones(familyId = DEFAULT_SCALE_FAMILY) {
    const id = normalizeScaleFamily(familyId);
    if (SCALE_CACHE.has(id)) return SCALE_CACHE.get(id);
    const scale = [];
    for (let octave = 0; octave <= OCTAVES; octave += 1) {
      for (const interval of SCALE_FAMILIES[id].intervals) {
        const semitones = octave * 12 + interval;
        if (semitones <= OCTAVES * 12) scale.push(semitones);
      }
    }
    if (scale[scale.length - 1] !== OCTAVES * 12) scale.push(OCTAVES * 12);
    const frozen = Object.freeze(scale);
    SCALE_CACHE.set(id, frozen);
    return frozen;
  }

  function hasExpressivePressure(pointerType, pressure) {
    if (!Number.isFinite(pressure) || pressure <= 0) return false;
    if (pointerType === 'pen') return true;
    // Pointer Events specifies .5 while active when touch hardware cannot report pressure.
    return pointerType === 'touch' && Math.abs(pressure - .5) > .08;
  }

  function movementSpeed(distancePixels, elapsedMilliseconds, viewportSpan) {
    if (![distancePixels, elapsedMilliseconds, viewportSpan].every(Number.isFinite)) return 0;
    if (distancePixels <= 0 || elapsedMilliseconds <= 0 || viewportSpan <= 0) return 0;
    return clamp((distancePixels / viewportSpan) * (1000 / elapsedMilliseconds), 0, 4);
  }

  function attackIntensity({ pressure = .5, speedPerSecond = 0, pressureAvailable = false } = {}) {
    if (pressureAvailable) {
      return .22 + Math.pow(clamp(pressure), .72) * .72;
    }
    return .28 + smoothstep(.12, 2.2, Math.max(0, speedPerSecond)) * .66;
  }

  function heldTexture(normalizedDepth, holdMilliseconds = 0) {
    const depth = clamp(normalizedDepth);
    const clarity = 1 - depth;
    const bloom = smoothstep(TEXTURE_BLOOM_START_MS, TEXTURE_BLOOM_END_MS, Math.max(0, holdMilliseconds));
    return {
      bloom,
      rateHz: .12 + clarity * .07,
      filterSweepHz: bloom * (42 + clarity * 96),
      overtonePulse: bloom * (.008 + clarity * .012),
      visualReach: bloom * (11 + depth * 9)
    };
  }

  function depthReflection(normalizedDepth) {
    const depth = clamp(normalizedDepth);
    return {
      sendGain: .018 + smoothstep(.08, .94, depth) * .14,
      delaySeconds: REFLECTION_DELAY_SECONDS,
      feedback: REFLECTION_FEEDBACK,
      wetGain: REFLECTION_WET_GAIN
    };
  }

  function waterDrop(frequency, normalizedDepth, intensity = .28, material = null) {
    const pitch = Math.max(20, Number.isFinite(frequency) ? frequency : BASE_FREQUENCY);
    const depth = clamp(normalizedDepth);
    const force = clamp(intensity);
    const durationSeconds = DROP_MIN_DURATION_SECONDS + depth * (DROP_MAX_DURATION_SECONDS - DROP_MIN_DURATION_SECONDS);
    // A quick tap is mostly this transient, so let the water material tint it:
    // glassy shallows pluck bright and high, a hollow deep falls warmer and lower.
    const brightness = material && Number.isFinite(material.brightness)
      ? clamp(material.brightness, -1, 1)
      : 0;
    const active = .5 + brightness * .5; // 0 in hollow, 1 in glass
    return {
      durationSeconds,
      peakGain: (.012 + force * .028) * (.9 + active * .16),
      startFrequency: pitch * (1.58 - depth * .2 + brightness * .42),
      dipFrequency: pitch * (.92 + depth * .03 - brightness * .08),
      settleFrequency: pitch,
      dipAtSeconds: durationSeconds * (.34 + depth * .06 - active * .05),
      brightness
    };
  }

  function collisionPearl(parentFrequency, normalizedDepth, energy = .35, familyId = DEFAULT_SCALE_FAMILY) {
    const source = Math.max(BASE_FREQUENCY, Number.isFinite(parentFrequency) ? parentFrequency : BASE_FREQUENCY);
    const depth = clamp(normalizedDepth);
    const force = clamp(energy);
    const current = mapPitch(normalizedAtFrequency(source), 980, 0, familyId);
    const frequency = current.frequency;
    return {
      frequency,
      startFrequency: frequency * (1.38 - depth * .12),
      durationSeconds: .14 + depth * .075 + force * .035,
      peakGain: .0045 + force * .012,
      cutoffHz: 1900 + (1 - depth) * 1800,
      scaleFamily: current.scaleFamily
    };
  }

  function stoneSkip(frequency, normalizedDepth, energy = .45, index = 0) {
    const pitch = Math.max(20, Number.isFinite(frequency) ? frequency : BASE_FREQUENCY);
    const depth = clamp(normalizedDepth);
    const force = clamp(energy);
    const bounce = Math.max(0, Math.min(2, Math.trunc(Number.isFinite(index) ? index : 0)));
    return {
      frequency: pitch,
      startFrequency: pitch * (1.28 - depth * .1 - bounce * .035),
      endFrequency: pitch * (.985 - bounce * .012),
      durationSeconds: .105 + depth * .035 + bounce * .018,
      peakGain: .004 + force * .012,
      cutoffHz: 1850 + (1 - depth) * 2650 - bounce * 180
    };
  }

  function initialBrushBias(deltaX = 0, deltaY = 0, speedPerSecond = 0) {
    const distance = Math.hypot(deltaX, deltaY);
    if (!Number.isFinite(distance) || distance < .001) return 0;
    const verticalDirection = clamp(deltaY / distance, -1, 1);
    const intention = smoothstep(.1, .8, Math.max(0, Number.isFinite(speedPerSecond) ? speedPerSecond : 0));
    return verticalDirection * intention;
  }

  function waterMaterial(normalizedDepth, brushBias = 0) {
    const depth = clamp(normalizedDepth);
    const bias = clamp(Number.isFinite(brushBias) ? brushBias : 0, -1, 1);
    const effectiveDepth = clamp(depth + bias * MATERIAL_BRUSH_DEPTH);
    const glass = 1 - smoothstep(.15, .5, effectiveDepth);
    const hollow = smoothstep(.5, .88, effectiveDepth);
    const living = Math.max(0, 1 - glass - hollow);
    const weights = [glass, living, hollow];
    const names = ['glass', 'living', 'hollow'];
    const dominant = names[weights.indexOf(Math.max(...weights))];
    return {
      depth,
      effectiveDepth,
      brushBias: bias,
      dominant,
      glass,
      living,
      hollow,
      cutoffHz: blend(weights, [5100, 2450, 760]),
      overtoneRatio: blend(weights, [2.008, 1.502, 1.008]),
      overtoneGain: blend(weights, [.19, .14, .09]),
      filterQ: blend(weights, [.55, 1.35, .82]),
      attackSeconds: blend(weights, [.032, .044, .058]),
      releaseSeconds: blend(weights, [.42, .5, .58]),
      levelCompensation: blend(weights, [.94, 1, 1.06])
    };
  }

  function nearestScaleIndex(frequency, familyId) {
    const scale = scaleSemitones(familyId);
    const semitones = 12 * Math.log2(Math.max(BASE_FREQUENCY, frequency) / BASE_FREQUENCY);
    let nearest = 0;
    for (let index = 1; index < scale.length; index += 1) {
      if (Math.abs(scale[index] - semitones) < Math.abs(scale[nearest] - semitones)) nearest = index;
    }
    return nearest;
  }

  function mapPitch(normalizedX, holdMilliseconds = 0, speedPerSecond = 0, familyId = DEFAULT_SCALE_FAMILY) {
    const scaleFamily = normalizeScaleFamily(familyId);
    const scale = scaleSemitones(scaleFamily);
    const continuous = frequencyAt(normalizedX);
    const scaleIndex = nearestScaleIndex(continuous, scaleFamily);
    const target = frequencyAtSemitones(scale[scaleIndex]);
    const settled = smoothstep(360, 980, holdMilliseconds);
    const unhurried = 1 - smoothstep(.025, .16, Math.max(0, speedPerSecond));
    const attraction = .84 * settled * unhurried;
    const frequency = continuous * Math.pow(target / continuous, attraction);
    return { frequency, continuous, target, attraction, scaleIndex, scaleFamily };
  }

  function precisionMotion({
    rawX = 0,
    previousRawX = rawX,
    pitchX = previousRawX,
    originRawX = previousRawX,
    holdMilliseconds = 0,
    speedPerSecond = 0,
    active = false
  } = {}) {
    const raw = clamp(rawX);
    const previousRaw = clamp(previousRawX);
    const controlled = clamp(pitchX);
    const origin = active && Number.isFinite(originRawX) ? clamp(originRawX) : previousRaw;
    const distance = Math.abs(raw - previousRaw);
    const excursion = Math.abs(raw - origin);
    const speed = Math.max(0, Number.isFinite(speedPerSecond) ? speedPerSecond : 0);
    const broadStroke = speed >= PRECISION_RELEASE_SPEED || distance >= PRECISION_RELEASE_DISTANCE ||
      (active && excursion >= PRECISION_RELEASE_DISTANCE);
    if (broadStroke) {
      return { pitchX: raw, originRawX: null, active: false, amount: 0, gain: 1, entered: false, released: active };
    }

    const canEnter = active || holdMilliseconds >= PRECISION_HOLD_MS;
    if (!canEnter) {
      return { pitchX: raw, originRawX: null, active: false, amount: 0, gain: 1, entered: false, released: false };
    }

    const readiness = active ? 1 : smoothstep(PRECISION_HOLD_MS, 780, holdMilliseconds);
    const slowness = 1 - smoothstep(.055, .32, speed);
    const amount = clamp(Math.max(.28, readiness) * Math.max(.28, slowness));
    const gain = 1 - amount * (1 - PRECISION_MIN_GAIN);
    return {
      pitchX: clamp(controlled + (raw - previousRaw) * gain),
      originRawX: origin,
      active: true,
      amount,
      gain,
      entered: !active,
      released: false
    };
  }

  function neighboringCurrents(scaleIndex, radius = 1, familyId = DEFAULT_SCALE_FAMILY) {
    const scale = scaleSemitones(familyId);
    const currents = [];
    for (let index = Math.max(0, scaleIndex - radius); index <= Math.min(scale.length - 1, scaleIndex + radius); index += 1) {
      currents.push({
        scaleIndex: index,
        normalizedX: normalizedAtSemitones(scale[index]),
        frequency: frequencyAtSemitones(scale[index]),
        isTarget: index === scaleIndex
      });
    }
    return currents;
  }

  return Object.freeze({
    BASE_FREQUENCY,
    OCTAVES,
    DEFAULT_SCALE_FAMILY,
    SCALE_FAMILIES,
    ATTACK_WINDOW_MS,
    TEXTURE_BLOOM_START_MS,
    TEXTURE_BLOOM_END_MS,
    MAX_STEREO_PAN,
    REFLECTION_DELAY_SECONDS,
    REFLECTION_FEEDBACK,
    REFLECTION_WET_GAIN,
    PRECISION_HOLD_MS,
    PRECISION_RELEASE_SPEED,
    PRECISION_RELEASE_DISTANCE,
    PRECISION_MIN_GAIN,
    DROP_MIN_DURATION_SECONDS,
    DROP_MAX_DURATION_SECONDS,
    MATERIAL_BRUSH_DEPTH,
    attackIntensity,
    collisionPearl,
    depthReflection,
    hasExpressivePressure,
    heldTexture,
    initialBrushBias,
    mapPitch,
    movementSpeed,
    neighboringCurrents,
    normalizedAtFrequency,
    normalizeScaleFamily,
    parseScaleFamily,
    precisionMotion,
    scaleSemitones,
    serializeScaleFamily,
    spatialPan,
    stoneSkip,
    waterMaterial,
    waterDrop,
    frequencyAt
  });
});
