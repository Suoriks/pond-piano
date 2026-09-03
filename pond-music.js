((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PondMusic = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const BASE_FREQUENCY = 130.81278265; // C3
  const OCTAVES = 3;
  const SHADE_CYCLE = 3;
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
  // A fresh accent may carry one short noise splash: the sound of water
  // receiving the drop. It rides on top of the tonal drop, never replaces it.
  const SPLASH_MIN_DURATION_SECONDS = .1;
  const SPLASH_MAX_DURATION_SECONDS = .17;
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
    if (!Number.isFinite(value)) return 0;
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
    const dropScale = material && Number.isFinite(material.dropScale) ? material.dropScale : 1;
    const durationSeconds = (DROP_MIN_DURATION_SECONDS + depth * (DROP_MAX_DURATION_SECONDS - DROP_MIN_DURATION_SECONDS)) * dropScale;
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

  function waterSplash(normalizedDepth, intensity = .28, material = null) {
    const depth = clamp(normalizedDepth);
    const force = clamp(intensity);
    const brightness = material && Number.isFinite(material.brightness)
      ? clamp(material.brightness, -1, 1)
      : 0;
    const active = .5 + brightness * .5; // 0 in hollow deep, 1 in glassy shallows
    const dropScale = material && Number.isFinite(material.dropScale) ? material.dropScale : 1;
    return {
      durationSeconds: (SPLASH_MIN_DURATION_SECONDS + depth * (SPLASH_MAX_DURATION_SECONDS - SPLASH_MIN_DURATION_SECONDS)) * dropScale,
      peakGain: (.014 + force * .026) * (.82 + active * .3),
      lowHz: 320 - depth * 60 - active * 100,
      highHz: 2100 - depth * 900 + active * 500,
      attackSeconds: .006 + depth * .004,
      decaySeconds: .075 + depth * .045
    };
  }

  // A note must leave the water the way it lived: a quick tap departs with
  // the brisk material exit it always had, while a long-settled note sinks
  // away on a longer, warmer tail. Pure timing only - the shell keeps every
  // node, the fade shape and the six-voice budget; this decides only how
  // long the departure is allowed to take.
  const RELEASE_MIN_SECONDS = .42;
  const RELEASE_MAX_SECONDS = 1.15;
  const RELEASE_HOLD_FULL_MS = 1600;
  const RELEASE_DEPTH_REACH = .18;

  function waterRelease(holdMilliseconds = 0, normalizedDepth = .5, materialBaseSeconds = .5) {
    const hold = Math.max(0, Number.isFinite(holdMilliseconds) ? holdMilliseconds : 0);
    const depth = Number.isFinite(normalizedDepth) ? clamp(normalizedDepth) : .5;
    const base = Math.max(.05, Math.min(RELEASE_MAX_SECONDS,
      Number.isFinite(materialBaseSeconds) ? materialBaseSeconds : .5));
    const settle = smoothstep(0, RELEASE_HOLD_FULL_MS, hold);
    return Math.max(base, Math.min(RELEASE_MAX_SECONDS,
      base + depth * RELEASE_DEPTH_REACH * settle));
  }

  // The drop must be seen as it is heard: a small splash corona
  // that honestly follows the note. Shallow water throws a thin bright
  // spark straight up; a deep note folds into a wide warm crown. Direction
  // of entry only cants the spray a little — the drop itself falls down.
  function dropSpray(normalizedX, normalizedY, directionX = 0, intensity = .28) {
    const depth = clamp(normalizedY);
    const force = clamp(intensity);
    const tiltX = clamp(Number.isFinite(directionX) ? directionX : 0, -1, 1);
    const spread = .42 + depth * 1.05;           // shallow: tight spear; deep: broad crown
    const hop = 1.18 - depth * .5;               // shallow leaps higher, deep sits low
    const travel = (6 + force * 11) * (1.3 - depth * .55);
    const life = .5 - depth * .42;               // shallow lingers, deep folds fast
    const count = Math.round(3 + force * 5);     // 3 .. 8 rays, one bounded set
    const baseAngle = -Math.PI / 2 + tiltX * .85; // mostly upward, cradled by motion
    const rays = [];
    for (let index = 0; index < count; index += 1) {
      const pro = count === 1 ? 0 : index / (count - 1) - .5;
      const angle = baseAngle + pro * spread;
      const reach = travel * (.72 + (index % 3) * .16);
      const light = .3 + (1 - depth) * .62;      // shallow sparks are brighter
      rays.push({
        dx: Math.cos(angle) * reach,
        dy: Math.sin(angle) * reach * hop,
        size: (1.05 + depth * 1.6) * (1 + force * .6),
        life: life * (.8 + (index % 2) * .18),
        light
      });
    }
    return { normalizedX: clamp(normalizedX), depth, force, rays };
  }


  // A fresh note takes the next subtle shade in a fixed cycle so repeated
  // taps stay recognisably the same gesture but never ring as one identical
  // oscillator. Fully deterministic: only the phrase's note count and depth
  // decide the colour, with no presets, no randomness and no immediate repeat.
  function noteShade(phraseIndex, normalizedDepth = 0.5) {
    const depth = clamp(normalizedDepth);
    const order = Math.max(0, Math.trunc(Number.isFinite(phraseIndex) ? phraseIndex : 0));
    const tint = order % SHADE_CYCLE;
    const clear = tint === 0;
    const deep = tint === 2;
    return Object.freeze({
      tint,
      depth,
      overtoneBias: clear ? .055 : deep ? -.05 : 0,
      gainLift: clear ? 1.05 : deep ? .94 : 1,
      cutoffTone: clear ? 1.09 : deep ? .88 : 1,
      dropScale: clear ? .9 : deep ? 1.1 : 1,
      label: clear ? 'clear' : deep ? 'deep' : 'neutral'
    });
  }

  // The bank answers a returning ring with a quieter, softer lap than a
  // full pearl: shorter, lower, less peak, so a ripple reaching the shore
  // reads as a gentle fold rather than a second impact. Shallow lapping stays
  // herbal and bright; a deep return folds warmer and a touch longer.
  function farSkim(parentFrequency, normalizedDepth, energy = .3, familyId = DEFAULT_SCALE_FAMILY) {
    // The far edge is the delicate mirror: a skim is higher, thinner and
    // quieter than the warm bottom lap. It folds fast and stays glassy, so it
    // reads as a cool upper bank rather than a second warm shore.
    const source = Math.max(BASE_FREQUENCY, Number.isFinite(parentFrequency) ? parentFrequency : BASE_FREQUENCY);
    const depth = clamp(normalizedDepth);
    const force = clamp(energy);
    const current = mapPitch(normalizedAtFrequency(source), 980, 0, familyId);
    const frequency = current.frequency * 1.06; // the top sits a touch higher
    return {
      frequency,
      startFrequency: frequency * (1.22 - depth * .06),
      durationSeconds: .075 + depth * .04 + force * .018,
      peakGain: .0026 + force * .006,       // quieter than the bottom lap
      cutoffHz: 1700 + (1 - depth) * 1500,  // thinner, brighter glass
      scaleFamily: current.scaleFamily
    };
  }

  function shoreLap(parentFrequency, normalizedDepth, energy = .3, familyId = DEFAULT_SCALE_FAMILY) {
    const source = Math.max(BASE_FREQUENCY, Number.isFinite(parentFrequency) ? parentFrequency : BASE_FREQUENCY);
    const depth = clamp(normalizedDepth);
    const force = clamp(energy);
    const current = mapPitch(normalizedAtFrequency(source), 980, 0, familyId);
    const frequency = current.frequency * .96;
    return {
      frequency,
      startFrequency: frequency * (1.16 - depth * .08),
      durationSeconds: .10 + depth * .05 + force * .02,
      peakGain: .0032 + force * .008,
      cutoffHz: 1500 + (1 - depth) * 1400,
      scaleFamily: current.scaleFamily
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

  // A settled chord gets one shared breath, not another sustained voice.
  // The logarithmic centre preserves the interval shape, then the selected
  // current gently seats that centre in the same pitch family as the pond.
  function chordBloomTone(frequencies, normalizedDepth, energy = .5, familyId = DEFAULT_SCALE_FAMILY) {
    const valid = Array.isArray(frequencies)
      ? frequencies.filter(frequency => Number.isFinite(frequency) && frequency >= 20 && frequency <= 20000).slice(0, 6)
      : [];
    if (valid.length < 3) return null;
    const depth = clamp(normalizedDepth);
    const force = clamp(energy);
    const geometricMean = Math.exp(valid.reduce((sum, frequency) => sum + Math.log(frequency), 0) / valid.length);
    const current = mapPitch(normalizedAtFrequency(geometricMean), 980, 0, familyId);
    const frequency = current.frequency * .5; // a low shared root under the held notes
    return Object.freeze({
      frequency,
      overtoneFrequency: frequency * (2.01 + (1 - depth) * .035),
      durationSeconds: .72 + depth * .24 + force * .18,
      peakGain: .003 + force * .0045,
      overtoneGain: .18 + (1 - depth) * .1,
      cutoffHz: 1050 + (1 - depth) * 1250,
      scaleFamily: current.scaleFamily
    });
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

  // A crossed phrase wakes as a small plucked figure: each anchor of the
  // stored gesture sounds once, quieter and softer than the last, so the
  // echo reads as a fading memory rather than a new performance.
  function echoNote(pitchX, normalizedDepth, energy = .5, index = 0, total = 3) {
    const depth = clamp(normalizedDepth);
    const force = clamp(energy);
    const position = Math.max(0, Math.min(1, Number.isFinite(pitchX) ? pitchX : .5));
    const step = Math.max(0, Math.trunc(Number.isFinite(index) ? index : 0));
    const count = Math.max(1, Math.trunc(Number.isFinite(total) ? total : 3));
    const fade = Math.pow(.72, step); // later anchors answer more quietly
    return {
      frequency: frequencyAt(position),
      startFrequency: frequencyAt(position) * (1.24 - depth * .08),
      durationSeconds: .16 + depth * .05 + force * .03 - Math.min(step, 4) * .012,
      peakGain: (.006 + force * .009) * fade,
      cutoffHz: 2100 + (1 - depth) * 2400 - Math.min(step, 4) * 160,
      delayMs: 150 + step * 130,
      steps: clamp(count, 1)
    };
  }

  function initialBrushBias(deltaX = 0, deltaY = 0, speedPerSecond = 0) {
    const distance = Math.hypot(deltaX, deltaY);
    if (!Number.isFinite(distance) || distance < .001) return 0;
    const verticalDirection = clamp(deltaY / distance, -1, 1);
    const intention = smoothstep(.1, .8, Math.max(0, Number.isFinite(speedPerSecond) ? speedPerSecond : 0));
    return verticalDirection * intention;
  }

  function waterMaterial(normalizedDepth, brushBias = 0, shade = null) {
    const depth = clamp(normalizedDepth);
    const bias = clamp(Number.isFinite(brushBias) ? brushBias : 0, -1, 1);
    const effectiveDepth = clamp(depth + bias * MATERIAL_BRUSH_DEPTH);
    const glass = 1 - smoothstep(.15, .5, effectiveDepth);
    const hollow = smoothstep(.5, .88, effectiveDepth);
    const living = Math.max(0, 1 - glass - hollow);
    const weights = [glass, living, hollow];
    const overtoneBias = shade?.overtoneBias ?? 0;
    const gainLift = shade?.gainLift ?? 1;
    const cutoffTone = shade?.cutoffTone ?? 1;
    const dropScale = shade?.dropScale ?? 1;
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
      cutoffHz: blend(weights, [5100, 2450, 760]) * cutoffTone,
      overtoneRatio: blend(weights, [2.008, 1.502, 1.008]) + overtoneBias,
      overtoneGain: blend(weights, [.19, .14, .09]),
      filterQ: blend(weights, [.55, 1.35, .82]),
      attackSeconds: blend(weights, [.032, .044, .058]),
      releaseSeconds: blend(weights, [.42, .5, .58]),
      levelCompensation: blend(weights, [.94, 1, 1.06]) * gainLift,
      dropScale: clamp(Number.isFinite(dropScale) ? dropScale : 1, .8, 1.2)
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
    chordBloomTone,
    collisionPearl,
    shoreLap,
    farSkim,
    echoNote,
    depthReflection,
    hasExpressivePressure,
    heldTexture,
    initialBrushBias,
    mapPitch,
    movementSpeed,
    neighboringCurrents,
    noteShade,
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
    waterSplash,
    waterRelease,
    RELEASE_MIN_SECONDS,
    RELEASE_MAX_SECONDS,
    dropSpray,
    frequencyAt
  });
});
