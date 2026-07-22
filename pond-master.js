(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PondMaster = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_VOLUME = 72;

  function clampVolume(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_VOLUME;
    return Math.round(Math.max(0, Math.min(100, numeric)));
  }

  function normalize(value) {
    return Object.freeze({
      volume: clampVolume(value?.volume),
      muted: value?.muted === true
    });
  }

  function parse(serialized) {
    if (typeof serialized !== 'string' || serialized.length > 256) return normalize();
    try {
      return normalize(JSON.parse(serialized));
    } catch {
      return normalize();
    }
  }

  function serialize(value) {
    return JSON.stringify(normalize(value));
  }

  function withVolume(value, volume) {
    const next = clampVolume(volume);
    return normalize({ volume: next, muted: next === 0 ? value?.muted === true : false });
  }

  function toggleMute(value) {
    const current = normalize(value);
    return normalize({
      volume: current.muted && current.volume === 0 ? DEFAULT_VOLUME : current.volume,
      muted: !current.muted
    });
  }

  function gainFor(value, soundingVoices = 0) {
    const current = normalize(value);
    if (current.muted || current.volume === 0) return 0;
    const voices = Math.max(1, Math.floor(Number(soundingVoices) || 0));
    return current.volume / 100 / Math.sqrt(voices);
  }

  return Object.freeze({
    DEFAULT_VOLUME,
    gainFor,
    normalize,
    parse,
    serialize,
    toggleMute,
    withVolume
  });
});
