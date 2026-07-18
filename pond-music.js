((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PondMusic = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const BASE_FREQUENCY = 130.81278265; // C3
  const OCTAVES = 3;
  const PENTATONIC = [0, 2, 4, 7, 9];
  const SCALE = [];

  for (let octave = 0; octave <= OCTAVES; octave += 1) {
    for (const interval of PENTATONIC) {
      const semitones = octave * 12 + interval;
      if (semitones <= OCTAVES * 12) SCALE.push(semitones);
    }
  }
  if (SCALE[SCALE.length - 1] !== OCTAVES * 12) SCALE.push(OCTAVES * 12);

  const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
  const smoothstep = (minimum, maximum, value) => {
    const t = clamp((value - minimum) / Math.max(.000001, maximum - minimum));
    return t * t * (3 - 2 * t);
  };
  const frequencyAt = normalizedX => BASE_FREQUENCY * Math.pow(2, clamp(normalizedX) * OCTAVES);
  const normalizedAtSemitones = semitones => clamp(semitones / (OCTAVES * 12));
  const frequencyAtSemitones = semitones => BASE_FREQUENCY * Math.pow(2, semitones / 12);

  function nearestScaleIndex(frequency) {
    const semitones = 12 * Math.log2(Math.max(BASE_FREQUENCY, frequency) / BASE_FREQUENCY);
    let nearest = 0;
    for (let index = 1; index < SCALE.length; index += 1) {
      if (Math.abs(SCALE[index] - semitones) < Math.abs(SCALE[nearest] - semitones)) nearest = index;
    }
    return nearest;
  }

  function mapPitch(normalizedX, holdMilliseconds = 0, speedPerSecond = 0) {
    const continuous = frequencyAt(normalizedX);
    const scaleIndex = nearestScaleIndex(continuous);
    const target = frequencyAtSemitones(SCALE[scaleIndex]);
    const settled = smoothstep(360, 980, holdMilliseconds);
    const unhurried = 1 - smoothstep(.025, .16, Math.max(0, speedPerSecond));
    const attraction = .84 * settled * unhurried;
    const frequency = continuous * Math.pow(target / continuous, attraction);
    return { frequency, continuous, target, attraction, scaleIndex };
  }

  function neighboringCurrents(scaleIndex, radius = 1) {
    const currents = [];
    for (let index = Math.max(0, scaleIndex - radius); index <= Math.min(SCALE.length - 1, scaleIndex + radius); index += 1) {
      currents.push({
        scaleIndex: index,
        normalizedX: normalizedAtSemitones(SCALE[index]),
        frequency: frequencyAtSemitones(SCALE[index]),
        isTarget: index === scaleIndex
      });
    }
    return currents;
  }

  return Object.freeze({
    BASE_FREQUENCY,
    OCTAVES,
    mapPitch,
    neighboringCurrents,
    frequencyAt
  });
});
