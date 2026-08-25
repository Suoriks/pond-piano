(() => {
  const canvas = document.querySelector('#pond');
  const ctx = canvas.getContext('2d', { alpha: false });
  const status = document.querySelector('#status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const music = window.PondMusic;
  const gesture = window.PondGesture;
  const score = window.PondScore;
  const waves = window.PondWaves;
  const caustic = window.PondCaustic;
  const tide = window.PondTide;
  const budget = window.PondBudget;
  const a11y = window.PondA11y;
  const repose = window.PondRepose;
  const masterModel = window.PondMaster;
  const audioLifecycleFactory = window.PondAudioLifecycle;
  if (!music) throw new Error('Pond music mapping did not load');
  if (!gesture) throw new Error('Pond gesture mapping did not load');
  if (!score) throw new Error('Pond score mapping did not load');
  if (!waves) throw new Error('Pond wave mapping did not load');
  if (!tide) throw new Error('Pond tide mapping did not load');
  if (!masterModel) throw new Error('Pond master control did not load');
  if (!budget) throw new Error('Pond budget mapping did not load');
  if (!a11y) throw new Error('Pond accessibility mapping did not load');
  if (!audioLifecycleFactory) throw new Error('Pond audio lifecycle did not load');
  const volumeControl = document.querySelector('.shore-control');
  const volumeStone = document.querySelector('#volume-stone');
  const volumePanel = document.querySelector('#volume-panel');
  const volumeRange = document.querySelector('#master-volume');
  const volumeValue = document.querySelector('#volume-value');
  const muteButton = document.querySelector('#mute-water');
  const waterBudget = budget.create({ floorMs: 6 });
  const diaryControl = document.querySelector('#diary-control');
  const diaryStone = document.querySelector('#diary-stone');
  const diaryPanel = document.querySelector('#diary-panel');
  const diaryList = document.querySelector('#diary-list');
  const diaryEmpty = document.querySelector('#diary-empty');
  const diaryCount = document.querySelector('#diary-count');
  const diaryLeaf = document.querySelector('#diary-leaf');
  const leafText = document.querySelector('#leaf-text');
  const tuningInputs = [...document.querySelectorAll('input[name="tuning-family"]')];
  const tuningValue = document.querySelector('#tuning-value');
  const MASTER_STORAGE_KEY = 'pond-piano.master.v1';
  const TUNING_STORAGE_KEY = 'pond-piano.tuning.v1';
  const SCORE_STORAGE_KEY = 'pond-piano.score.v1';
  const DIARY_STORAGE_KEY = 'pond-piano.diary.v1';
  const INVITATION_STORAGE_KEY = 'pond-piano.invitation.v1';
  const SCORE_HYDRATE_MAX_AGE_MS = 3600000;
  const epochNow = () => Date.now();
  const bootAt = performance.now();
  const MAX_VOICES = 6;
  const ECHO_COOLDOWN_MS = 3200;
  const COLLISION_RATE_LIMIT_MS = 230;
  const SHORE_RATE_LIMIT_MS = 260;
  const MAX_PENDING_COLLISIONS = 8;
  const MAX_COLLISION_VOICES = 3;
  const SKIP_PLAN_RATE_LIMIT_MS = 240;
  const MAX_PENDING_SKIPS = 3;
  const MAX_SKIP_VOICES = 2;
  const INK_READ_RATE_LIMIT_MS = 380;
  const MAX_ECHO_VOICES = 3;
  const MAX_PENDING_POURS = 6;
  // `pointers` is `let`: a resize re-seats live contacts into a fresh Map
  // via the repose layer, so every closure keeps reading the current one.
  const ripples = [], trails = [], splashes = [], scoreEchoes = [], collisionPearls = [], collisionGlints = [], shoreLapGlints = [], inkReadGlints = [], stoneFlights = [];
  // The visible departure: resting lights of ended notes sinking away.
  const releaseGlints = [];
  const RELEASE_GLINT_MAX = 12;
  let pointers = new Map();
  const coronas = [], pourEchoes = [], pouredInk = [];
  let motes = caustic.createMotes(caustic.DEFAULT_COUNT, 7);
  let tidalSwells = tide.createSwells(tide.DEFAULT_SWELLS, 13);
  let tidalStirs = [];
  const echoCooldowns = new WeakMap();
  const collisionPairs = new Map();
  const collisionTimers = new Map();
  const shoreTimers = new Map();
  const inkReadSeen = new WeakSet();
  const inkReadTimers = new Set();
  const skipTimers = new Set();
  const echoTimers = new Set();
  const pourTimers = new Set();
  const loopPassTimers = new Set();
  let loopingLine = null;
  // A lifted phrase rests on the shore leaf until the water takes it back.
  let heldLeafScroll = null;
  let loopPassesFired = 0;
  let loopEchoesScheduled = 0;
  let memories = score.restorePhrase(loadScorePhrase(), performance.now(), epochNow());
  let phraseInk = loadPhraseDiary();
  let diaryOpen = false;
  let lastInkCount = -1;
  let lastPourAt = -Infinity;
  const keyboard = { x: .5, y: .52, pitchX: .5, pressure: .48, sounding: false, born: 0, lastMotion: 0, motionSpeed: 0, mapping: null, materialBias: null, precisionActive: false, precisionAmount: 0, precisionOriginX: null, scoreSamples: [], distanceTraveled: 0, resonanceX: 0, resonanceY: 0, resonatedMemories: new Set() };
  let audio = null;
  let audioLifecycle = null;
  let masterState = loadMasterState();
  let tuningFamily = loadTuningFamily();
  let echoSerial = 0;
  let rippleSerial = 0;
  let earnedEddyHint = false;
  let collisionSerial = 0;
  let skipSerial = 0;
  let lastCollisionAt = -Infinity;
  let lastShoreAt = -Infinity;
  let lastInkReadAt = -Infinity;
  let lastSkipPlanAt = -Infinity;
  let width = 0, height = 0, dpr = 1, last = performance.now(), announced = false, scoreAnnounced = false, dynamicsAnnounced = false, textureAnnounced = false, precisionAnnounced = false, freedomAnnounced = false, eddyAnnounced = false;
  let pondHasPlayed = false;
  try { pondHasPlayed = localStorage.getItem(INVITATION_STORAGE_KEY) === 'played'; } catch {}
  const invitationLine = document.querySelector('#water-invitation');
  if (invitationLine && pondHasPlayed) invitationLine.classList.add('is-gone');
  let collisionAnnounced = false, skipAnnounced = false, scoreEchoAnnounced = false, pourAnnounced = false;
  let phraseNoteIndex = 0;
  // A soft double-tap on open water wakes the newest readable phrase as a
  // quiet repeated echo. Pure touch history keeps recent taps (any kind), so
  // the decision itself stays in the score layer.
  let tapHistory = [];

  // The water whisper: earned gesture hints, one quiet line at a time.
  let whisper = score.whisperState();
  let whisperHint = null;

  function pitchAt(x) {
    return music.frequencyAt(x / Math.max(1, width));
  }

  function depthAt(y) {
    const normalizedDepth = Math.max(0, Math.min(1, y / Math.max(1, height)));
    return { normalizedDepth };
  }

  function createAudioEngine() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    const context = new AudioContext({ latencyHint: 'interactive' });
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    let reflection = null;
    master.gain.value = masterModel.gainFor(masterState);
    compressor.threshold.value = -18; compressor.knee.value = 16;
    compressor.ratio.value = 6; compressor.attack.value = .006; compressor.release.value = .24;
    master.connect(compressor).connect(context.destination);
    if (typeof context.createDelay === 'function' && typeof context.createBiquadFilter === 'function') {
      try {
        const settings = music.depthReflection(.5);
        const input = context.createGain();
        const delay = context.createDelay(.18);
        const tone = context.createBiquadFilter();
        const feedback = context.createGain();
        const wet = context.createGain();
        delay.delayTime.value = settings.delaySeconds;
        tone.type = 'lowpass'; tone.frequency.value = 2300; tone.Q.value = .38;
        feedback.gain.value = settings.feedback;
        wet.gain.value = settings.wetGain;
        input.connect(delay); delay.connect(tone); tone.connect(wet).connect(master);
        tone.connect(feedback).connect(delay);
        reflection = { input, delay, tone, feedback, wet };
      } catch (error) {
        console.warn('Water reflection is unavailable; keeping the direct voice', error);
      }
    }
    audio = { context, master, reflection, voices: new Map(), collisionVoices: new Set(), skipVoices: new Set(), echoVoices: new Set() };
    return audio;
  }

  function primeAudioEngine(engine) {
    const context = engine.context;
    if (typeof context.createBuffer !== 'function' || typeof context.createBufferSource !== 'function') return;
    const source = context.createBufferSource();
    const silence = context.createGain();
    silence.gain.value = 0;
    source.buffer = context.createBuffer(1, 1, context.sampleRate || 44100);
    source.connect(silence).connect(engine.master);
    const disconnectPrimer = () => {
      try { source.disconnect(); silence.disconnect(); } catch {}
    };
    if (typeof source.addEventListener === 'function') source.addEventListener('ended', disconnectPrimer, { once: true });
    else source.onended = disconnectPrimer;
    source.start(0);
  }

  function balanceVoices(engine) {
    const sounding = [...engine.voices.values()].filter(voice => !voice.releasing).length;
    const level = masterModel.gainFor(masterState, sounding);
    engine.master.gain.setTargetAtTime(level, engine.context.currentTime, .045);
  }

  function scheduleTextureBloom(parameter, target, now) {
    parameter.setValueAtTime(0, now);
    parameter.setValueAtTime(0, now + music.TEXTURE_BLOOM_START_MS / 1000);
    parameter.linearRampToValueAtTime(target, now + music.TEXTURE_BLOOM_END_MS / 1000);
  }

  function retargetTexture(voice, normalizedDepth, now) {
    if (Math.abs(normalizedDepth - voice.textureDepth) < .015) return;
    voice.textureDepth = normalizedDepth;
    const elapsedMs = Math.max(0, (now - voice.born) * 1000);
    const current = music.heldTexture(normalizedDepth, elapsedMs);
    const mature = music.heldTexture(normalizedDepth, music.TEXTURE_BLOOM_END_MS);
    voice.undertow.frequency.setTargetAtTime(mature.rateHz, now, .35);
    for (const [parameter, currentValue, targetValue] of [
      [voice.filterDrift.gain, current.filterSweepHz, mature.filterSweepHz],
      [voice.overtoneDrift.gain, current.overtonePulse, mature.overtonePulse]
    ]) {
      if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
      else {
        const held = parameter.value;
        parameter.cancelScheduledValues(now);
        parameter.setValueAtTime(held, now);
      }
      parameter.setTargetAtTime(currentValue, now, .08);
      const bloomEndsAt = voice.born + music.TEXTURE_BLOOM_END_MS / 1000;
      if (bloomEndsAt > now + .16) parameter.linearRampToValueAtTime(targetValue, bloomEndsAt);
      else parameter.setTargetAtTime(targetValue, now, .22);
    }
  }

  function voiceNodes(voice) {
    return [voice.oscillator, voice.overtone, voice.overtoneGain, voice.filter, voice.gain, voice.undertow,
      voice.filterDrift, voice.overtoneDrift, voice.eddyOscillator, voice.eddyDepth,
      voice.dropOscillator, voice.dropGain, voice.splashSource, voice.splashLowpass,
      voice.splashBandpass, voice.splashGain, voice.panner, voice.reflectionSend];
  }

  // One short pre-rendered noise buffer per context; the splash reads as
  // water receiving the note, not as a sustained hiss.
  function splashNoise(context) {
    if (context.__pondSplashNoise) return context.__pondSplashNoise;
    const length = Math.floor(context.sampleRate * 2);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * .82 + white * .18; // slightly softened white noise
      channel[index] = previous * 3.2;
    }
    context.__pondSplashNoise = buffer;
    return buffer;
  }

  function reflectDropVoices(engine = audio) {
    canvas.dataset.dropVoices = String(engine
      ? [...engine.voices.values()].filter(voice => voice.dropOscillator).length
      : 0);
  }

  function setVoiceEddy(id, expression) {
    const voice = audio?.voices.get(id);
    if (!voice || voice.releasing || !expression?.amount) return false;
    const now = audio.context.currentTime;
    if (!voice.eddyOscillator) {
      const oscillator = audio.context.createOscillator();
      const depth = audio.context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = expression.rateHz;
      depth.gain.value = 0;
      oscillator.connect(depth).connect(voice.gain.gain);
      oscillator.start();
      voice.eddyOscillator = oscillator;
      voice.eddyDepth = depth;
    }
    voice.eddyOscillator.frequency.setTargetAtTime(expression.rateHz, now, .12);
    voice.eddyDepth.gain.setTargetAtTime(expression.gainDepth, now, .08);
    return true;
  }

  function clearVoiceEddy(id) {
    const voice = audio?.voices.get(id);
    if (!voice?.eddyOscillator) return;
    const oscillator = voice.eddyOscillator, depth = voice.eddyDepth;
    const now = audio.context.currentTime;
    voice.eddyOscillator = null; voice.eddyDepth = null;
    try {
      depth.gain.setTargetAtTime(0, now, .035);
      oscillator.stop(now + .14);
      oscillator.addEventListener('ended', () => {
        try { oscillator.disconnect(); depth.disconnect(); } catch {}
      }, { once: true });
    } catch {
      try { oscillator.stop(); oscillator.disconnect(); depth.disconnect(); } catch {}
    }
  }

  function disconnectVoice(voice) {
    for (const node of voiceNodes(voice)) {
      try { node?.disconnect(); } catch {}
    }
  }

  function retireAudioEngine(engine, reason) {
    const now = engine.context.currentTime;
    for (const [id, voice] of engine.voices) {
      engine.voices.delete(id);
      voice.releasing = true;
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(.0001, now);
      } catch {}
      for (const oscillator of [voice.oscillator, voice.overtone, voice.undertow, voice.eddyOscillator, voice.dropOscillator]) {
        try { oscillator?.stop(now); } catch {}
      }
      try { voice.splashSource?.stop(now); } catch {}
      disconnectVoice(voice);
    }
    for (const pearl of engine.collisionVoices ?? []) {
      try { pearl.oscillator.stop(now); } catch {}
      for (const node of pearl.nodes) {
        try { node?.disconnect(); } catch {}
      }
    }
    engine.collisionVoices?.clear();
    for (const skip of engine.skipVoices ?? []) {
      try { skip.oscillator.stop(now); } catch {}
      for (const node of skip.nodes) {
        try { node?.disconnect(); } catch {}
      }
    }
    engine.skipVoices?.clear();
    for (const echo of engine.echoVoices ?? []) {
      try { echo.oscillator.stop(now); } catch {}
      for (const node of echo.nodes) {
        try { node?.disconnect(); } catch {}
      }
    }
    engine.echoVoices?.clear();
    for (const timer of collisionTimers.values()) clearTimeout(timer);
    collisionTimers.clear();
    collisionPairs.clear();
    for (const timer of shoreTimers.values()) clearTimeout(timer);
    shoreTimers.clear();
    for (const timer of skipTimers) clearTimeout(timer);
    skipTimers.clear();
    for (const timer of echoTimers) clearTimeout(timer);
    echoTimers.clear();
    for (const timer of pourTimers) clearTimeout(timer);
    pourTimers.clear();
    pourEchoes.length = 0;
    stopPourLoop();
    hideDiaryLeaf();
    stoneFlights.length = 0;
    canvas.dataset.pearlVoices = '0';
    canvas.dataset.skipVoices = '0';
    canvas.dataset.pendingSkips = '0';
    canvas.dataset.echoVoices = '0';
    canvas.dataset.pendingEchoes = '0';
    canvas.dataset.pendingPours = '0';
    canvas.dataset.loopingLine = '0';
    canvas.dataset.loopPasses = '0';
    balanceVoices(engine);
    for (const pointerId of pointers.keys()) {
      try { canvas.releasePointerCapture?.(pointerId); } catch {}
    }
    pointers.clear();
    canvas.dataset.eddyVoices = '0';
    reflectDropVoices(engine);
    keyboard.sounding = false;
    if ((reason === 'visibility-hidden' || reason === 'pagehide') && engine.context.state === 'running') {
      Promise.resolve(engine.context.suspend()).catch(() => {});
    }
  }

  function reflectAudioState(event) {
    canvas.dataset.audioState = event.state;
    canvas.dataset.audioVoices = String(event.engine?.voices?.size ?? 0);
    scheduleWakeSync();
    if (event.reason === 'gesture-required') {
      status.textContent = 'Звук пруда уснул; коснитесь воды, чтобы мягко разбудить его';
    } else if (event.reason === 'resume-failed') {
      status.textContent = 'Браузер пока не вернул звук; коснитесь воды ещё раз';
    } else if (event.reason === 'closed') {
      status.textContent = 'Аудиосистема закрыта браузером; перезагрузите пруд, чтобы снова играть';
    }
  }

  // Wake lock: keep the screen awake only while the water is actually sounding
  // and visible. A living phrase must not let the phone sleep mid-gesture; a
  // silent or backgrounded pond must release the lock so it can sleep naturally.
  let wakeLock = null;
  let wakeLockPending = false;
  const scheduleWakeLock = { timer: null };

  function soundingVoiceCount(engine) {
    if (!engine?.voices) return 0;
    let count = 0;
    for (const voice of engine.voices.values()) if (!voice.releasing) count += 1;
    return count;
  }

  async function syncWakeLock() {
    const engine = audioLifecycle?.getEngine() ?? null;
    const shouldHold = audioLifecycleFactory.keepScreenAwake({
      visible: document.visibilityState !== 'hidden',
      soundingVoices: soundingVoiceCount(engine)
    });
    if (shouldHold) {
      if (wakeLock || wakeLockPending) return;
      wakeLockPending = true;
      try {
        if (navigator.wakeLock?.request) {
          wakeLock = await navigator.wakeLock.request('screen');
          wakeLock.addEventListener?.('release', () => { wakeLock = null; syncWakeLock(); });
        }
      } catch { /* unsupported or denied: the pond keeps playing; screen may sleep */ }
      wakeLockPending = false;
    } else if (wakeLock) {
      try { await wakeLock.release(); } catch {}
      wakeLock = null;
      wakeLockPending = false;
    }
  }

  function scheduleWakeSync() {
    // Debounce: a fast glissando calls this many times per second.
    if (scheduleWakeLock.timer) return;
    scheduleWakeLock.timer = setTimeout(() => {
      scheduleWakeLock.timer = null;
      syncWakeLock();
    }, 260);
  }

  function startVoice(id, x, y, pressure = .42, frequency = pitchAt(x), attack = pressure, engine = audio, shadeIndex = 0) {
    if (!engine || engine.context.state === 'closed' || engine.voices.has(id) || engine.voices.size >= MAX_VOICES) return false;
    const now = engine.context.currentTime;
    const oscillator = engine.context.createOscillator();
    const overtone = engine.context.createOscillator();
    const overtoneGain = engine.context.createGain();
    const filter = engine.context.createBiquadFilter();
    const gain = engine.context.createGain();
    const undertow = engine.context.createOscillator();
    const filterDrift = engine.context.createGain();
    const overtoneDrift = engine.context.createGain();
    const panner = typeof engine.context.createStereoPanner === 'function' ? engine.context.createStereoPanner() : null;
    const reflectionSend = engine.reflection ? engine.context.createGain() : null;
    const depth = depthAt(y);
    const shade = music.noteShade(shadeIndex, depth.normalizedDepth);
    const material = music.waterMaterial(depth.normalizedDepth, 0, shade);
    const pan = music.spatialPan(x / Math.max(1, width));
    const texture = music.heldTexture(depth.normalizedDepth, music.TEXTURE_BLOOM_END_MS);
    const reflection = music.depthReflection(depth.normalizedDepth);
    const drop = music.waterDrop(frequency, depth.normalizedDepth, attack, material);
    const splash = music.waterSplash(depth.normalizedDepth, attack, material);
    const dropOscillator = engine.context.createOscillator();
    const dropGain = engine.context.createGain();
    let splashSource = null, splashLowpass = null, splashBandpass = null, splashGain = null;
    if (engine.context.createBufferSource && engine.context.createBiquadFilter) {
      try {
        splashSource = engine.context.createBufferSource();
        splashSource.buffer = splashNoise(engine.context);
        splashLowpass = engine.context.createBiquadFilter();
        splashLowpass.type = 'lowpass';
        splashLowpass.Q.value = .0001;
        splashBandpass = engine.context.createBiquadFilter();
        splashBandpass.type = 'bandpass';
        splashBandpass.Q.value = .68;
        splashGain = engine.context.createGain();
      } catch { splashSource = null; }
    }
    oscillator.type = 'sine'; overtone.type = 'sine'; undertow.type = 'sine'; filter.type = 'lowpass'; filter.Q.value = material.filterQ;
    oscillator.frequency.value = frequency; overtone.frequency.value = frequency * material.overtoneRatio;
    undertow.frequency.value = texture.rateHz;
    dropOscillator.type = 'sine';
    dropOscillator.frequency.setValueAtTime(drop.startFrequency, now);
    dropOscillator.frequency.exponentialRampToValueAtTime(drop.dipFrequency, now + drop.dipAtSeconds);
    dropOscillator.frequency.exponentialRampToValueAtTime(drop.settleFrequency, now + drop.durationSeconds);
    dropGain.gain.setValueAtTime(.0001, now);
    dropGain.gain.exponentialRampToValueAtTime(drop.peakGain, now + .008);
    dropGain.gain.exponentialRampToValueAtTime(.0001, now + drop.durationSeconds);
    if (splashSource && splashLowpass && splashBandpass && splashGain) {
      const splashEnd = now + splash.durationSeconds;
      splashSource.playbackRate.value = .92 + depth.normalizedDepth * .16;
      splashLowpass.frequency.setValueAtTime(splash.highHz, now);
      splashLowpass.frequency.exponentialRampToValueAtTime(Math.max(120, splash.lowHz), splashEnd);
      splashBandpass.frequency.value = Math.max(80, splash.lowHz + (splash.highHz - splash.lowHz) * .55);
      splashGain.gain.setValueAtTime(.0001, now);
      splashGain.gain.linearRampToValueAtTime(splash.peakGain, now + splash.attackSeconds);
      splashGain.gain.exponentialRampToValueAtTime(.0001, splashEnd);
    }
    overtoneGain.gain.value = material.overtoneGain;
    filter.frequency.value = material.cutoffHz;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime((.055 + attack * .085) * material.levelCompensation, now + material.attackSeconds);
    gain.gain.exponentialRampToValueAtTime((.04 + pressure * .055) * material.levelCompensation, now + .32);
    oscillator.connect(filter); overtone.connect(overtoneGain).connect(filter);
    undertow.connect(filterDrift).connect(filter.frequency);
    undertow.connect(overtoneDrift).connect(overtoneGain.gain);
    filter.connect(gain);
    let output = gain;
    if (panner) {
      panner.pan.value = pan;
      gain.connect(panner);
      dropGain.connect(panner);
      if (splashGain) splashGain.connect(panner);
      output = panner;
    } else {
      dropGain.connect(engine.master);
      if (splashGain) splashGain.connect(engine.master);
    }
    output.connect(engine.master);
    if (reflectionSend) {
      reflectionSend.gain.value = reflection.sendGain;
      output.connect(reflectionSend).connect(engine.reflection.input);
      if (!panner) dropGain.connect(reflectionSend);
      if (!panner && splashGain) splashGain.connect(reflectionSend);
    }
    scheduleTextureBloom(filterDrift.gain, texture.filterSweepHz, now);
    scheduleTextureBloom(overtoneDrift.gain, texture.overtonePulse, now);
    oscillator.start(); overtone.start(); undertow.start(); dropOscillator.connect(dropGain); dropOscillator.start();
    dropOscillator.stop(now + drop.durationSeconds + .025);
    if (splashSource && splashLowpass && splashBandpass && splashGain) {
      try {
        splashSource.connect(splashLowpass).connect(splashBandpass).connect(splashGain);
        splashSource.start(now, Math.random() * 1.1);
        splashSource.stop(now + splash.durationSeconds + .02);
      } catch {
        for (const node of [splashSource, splashLowpass, splashBandpass, splashGain]) {
          try { node?.disconnect(); } catch {}
        }
        splashSource = null;
      }
    }
    const voice = {
      oscillator, overtone, overtoneGain, filter, gain, undertow, filterDrift, overtoneDrift, panner, reflectionSend,
      dropOscillator, dropGain, splashSource, splashLowpass, splashBandpass, splashGain,
      dropEndsAt: now + drop.durationSeconds, dropIntensity: attack,
      born: now, textureDepth: depth.normalizedDepth, targetFrequency: frequency,
      materialBias: 0, materialDepth: material.effectiveDepth, materialLevel: material.levelCompensation,
      overtoneRatio: material.overtoneRatio, attackSeconds: material.attackSeconds, releaseSeconds: material.releaseSeconds,
      targetPan: pan, attack, accentUntil: now + .32, releasing: false,
      shade
    };
    engine.voices.set(id, voice);
    canvas.dataset.waterMaterial = material.dominant;
    canvas.dataset.materialBias = '0.000';
    reflectDropVoices(engine);
    canvas.dataset.audioVoices = String(engine.voices.size);
    scheduleWakeSync();
    dropOscillator.addEventListener('ended', () => {
      if (voice.dropOscillator !== dropOscillator) return;
      try { dropOscillator.disconnect(); dropGain.disconnect(); } catch {}
      voice.dropOscillator = null; voice.dropGain = null;
      reflectDropVoices(engine);
    }, { once: true });
    if (splashSource) {
      splashSource.addEventListener('ended', () => {
        if (voice.splashSource !== splashSource) return;
        for (const node of [splashSource, splashLowpass, splashBandpass, splashGain]) {
          try { node?.disconnect(); } catch {}
        }
        voice.splashSource = null; voice.splashLowpass = null;
        voice.splashBandpass = null; voice.splashGain = null;
      }, { once: true });
    }
    oscillator.addEventListener('ended', () => {
      if (engine.voices.get(id) !== voice) return;
      engine.voices.delete(id);
      disconnectVoice(voice);
      canvas.dataset.audioVoices = String(engine.voices.size);
      balanceVoices(engine);
    }, { once: true });
    balanceVoices(engine);
    return true;
  }

  function moveVoice(id, x, y, pressure = .42, mappedFrequency = null, materialBias = 0) {
    const voice = audio?.voices.get(id);
    if (!voice) return;
    const now = audio.context.currentTime, frequency = mappedFrequency ?? pitchAt(x), depth = depthAt(y);
    const material = music.waterMaterial(depth.normalizedDepth, materialBias, voice.shade);
    const pitchChanged = Math.abs(frequency - voice.targetFrequency) > .08;
    if (pitchChanged) {
      voice.oscillator.frequency.setTargetAtTime(frequency, now, .026);
      voice.targetFrequency = frequency;
    }
    const overtoneFrequency = frequency * material.overtoneRatio;
    if (pitchChanged || Math.abs(material.overtoneRatio - voice.overtoneRatio) > .0005) {
      voice.overtone.frequency.setTargetAtTime(overtoneFrequency, now, .045);
      voice.overtoneRatio = material.overtoneRatio;
    }
    const pan = music.spatialPan(x / Math.max(1, width));
    if (voice.panner && Math.abs(pan - voice.targetPan) > .002) {
      voice.panner.pan.setTargetAtTime(pan, now, .045);
      voice.targetPan = pan;
    }
    voice.filter.frequency.setTargetAtTime(material.cutoffHz, now, .055);
    voice.filter.Q.setTargetAtTime(material.filterQ, now, .08);
    voice.overtoneGain.gain.setTargetAtTime(material.overtoneGain, now, .06);
    if (voice.reflectionSend) {
      voice.reflectionSend.gain.setTargetAtTime(music.depthReflection(depth.normalizedDepth).sendGain, now, .08);
    }
    // The departure needs the water's real place: remember where the note
    // last rested so its light can sink away from exactly there.
    voice.lastX = x; voice.lastY = y; voice.lastDepth = depth.normalizedDepth;
    voice.materialBias = material.brushBias;
    voice.materialDepth = material.effectiveDepth;
    voice.materialLevel = material.levelCompensation;
    voice.attackSeconds = material.attackSeconds;
    voice.releaseSeconds = material.releaseSeconds;
    canvas.dataset.waterMaterial = material.dominant;
    canvas.dataset.materialBias = material.brushBias.toFixed(3);
    retargetTexture(voice, depth.normalizedDepth, now);
    if (now >= voice.accentUntil) {
      voice.gain.gain.setTargetAtTime((.04 + pressure * .065) * material.levelCompensation, now, .05);
    }
  }

  function accentVoice(id, intensity) {
    const voice = audio?.voices.get(id);
    if (!voice || voice.releasing || intensity <= voice.attack + .025) return false;
    const now = audio.context.currentTime;
    const current = Math.max(.0001, voice.gain.gain.value);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(current, now);
    voice.gain.gain.exponentialRampToValueAtTime((.055 + intensity * .085) * voice.materialLevel, now + Math.min(.04, voice.attackSeconds));
    voice.gain.gain.exponentialRampToValueAtTime(.063 * voice.materialLevel, now + .23);
    if (voice.dropGain && now < voice.dropEndsAt - .018 && intensity > voice.dropIntensity) {
      const drop = music.waterDrop(voice.targetFrequency, voice.materialDepth, intensity, {
        brightness: (voice.materialDepth - .5) * 2
      });
      const remaining = Math.max(.018, voice.dropEndsAt - now);
      if (typeof voice.dropGain.gain.cancelAndHoldAtTime === 'function') voice.dropGain.gain.cancelAndHoldAtTime(now);
      else {
        const held = Math.max(.0001, voice.dropGain.gain.value);
        voice.dropGain.gain.cancelScheduledValues(now);
        voice.dropGain.gain.setValueAtTime(held, now);
      }
      voice.dropGain.gain.exponentialRampToValueAtTime(drop.peakGain, now + Math.min(.012, remaining * .25));
      voice.dropGain.gain.exponentialRampToValueAtTime(.0001, voice.dropEndsAt);
      voice.dropIntensity = intensity;
    }
    voice.attack = intensity;
    voice.accentUntil = now + .23;
    return true;
  }

  function endVoice(id) {
    const voice = audio?.voices.get(id);
    if (!voice || voice.releasing) return;
    const now = audio.context.currentTime;
    voice.releasing = true;
    // The note leaves the water the way it lived: a quick tap departs with
    // the material's brisk exit, a long-settled deep note sinks away on a
    // longer warm tail. The fade time-constant follows the same stretch so
    // the tail stays smooth instead of hissing under a longer stop.
    const holdMs = Math.max(0, (now - voice.born) * 1000);
    const releaseSeconds = music.waterRelease(holdMs, voice.materialDepth, voice.releaseSeconds);
    const fadeTau = releaseSeconds / 3.2;
    canvas.dataset.lastRelease = releaseSeconds.toFixed(3);
    // The visible departure: the resting light of the note sinks away along
    // the same stretched tail the sound uses, from the water's real place.
    if (Number.isFinite(voice.lastX) && Number.isFinite(voice.lastY)) {
      releaseGlints.push({
        x: voice.lastX,
        y: voice.lastY,
        born: performance.now(),
        depth: Number.isFinite(voice.lastDepth) ? voice.lastDepth : voice.materialDepth,
        releaseSeconds
      });
      if (releaseGlints.length > RELEASE_GLINT_MAX) releaseGlints.shift();
    }
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(.0001, now, fadeTau);
    voice.oscillator.stop(now + releaseSeconds); voice.overtone.stop(now + releaseSeconds); voice.undertow.stop(now + releaseSeconds);
    try { voice.dropOscillator?.stop(Math.min(now + .03, voice.dropEndsAt + .025)); } catch {}
    try { voice.splashSource?.stop(now + .02); } catch {}
    try { voice.eddyOscillator?.stop(now + releaseSeconds); } catch {}
    balanceVoices(audio);
    scheduleWakeSync();
  }

  audioLifecycle = audioLifecycleFactory.create({
    createEngine: createAudioEngine,
    primeEngine: primeAudioEngine,
    retireEngine: retireAudioEngine,
    onState: reflectAudioState,
    isVisible: () => document.visibilityState !== 'hidden'
  });

  function loadMasterState() {
    try { return masterModel.parse(localStorage.getItem(MASTER_STORAGE_KEY)); }
    catch { return masterModel.normalize(); }
  }

  function storeMasterState() {
    try { localStorage.setItem(MASTER_STORAGE_KEY, masterModel.serialize(masterState)); }
    catch {}
  }

  function loadTuningFamily() {
    try { return music.parseScaleFamily(localStorage.getItem(TUNING_STORAGE_KEY)); }
    catch { return music.DEFAULT_SCALE_FAMILY; }
  }

  function storeTuningFamily() {
    try { localStorage.setItem(TUNING_STORAGE_KEY, music.serializeScaleFamily(tuningFamily)); }
    catch {}
  }

  function loadScorePhrase() {
    try { return localStorage.getItem(SCORE_STORAGE_KEY); }
    catch { return null; }
  }

  function storeScorePhrase() {
    try { localStorage.setItem(SCORE_STORAGE_KEY, score.serializePhrase(memories, performance.now(), epochNow())); }
    catch {}
  }

  // ---- The pond's quiet diary (browser side) -----------------------------
  // Every finished phrase is written here as one fading ink line. The diary
  // is local and bounded: the pond keeps writing while it plays, and the
  // reader only decides when to pour an older line back onto the water.

  function loadPhraseDiary() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DIARY_STORAGE_KEY) ?? 'null');
      if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.lines) ||
          !Number.isFinite(parsed.savedAt)) return [];
      const epoch = epochNow();
      const savedAge = epoch - parsed.savedAt;
      if (savedAge < 0 || savedAge >= score.INK_LIFE_MS) return [];
      return parsed.lines
        .filter(line => {
          if (!line || !Array.isArray(line.points) || line.points.length < 2 ||
              !Number.isFinite(line.born)) return false;
          const age = epoch - line.born;
          return age >= 0 && age < score.INK_LIFE_MS;
        })
        .map(line => ({
          born: performance.now() - (epoch - line.born),
          durationMs: Math.max(80, Math.min(8000, Number.isFinite(line.durationMs) ? line.durationMs : 1200)),
          depth: Math.max(0, Math.min(1, Number.isFinite(line.depth) ? line.depth : .5)),
          pressure: Math.max(0, Math.min(1, Number.isFinite(line.pressure) ? line.pressure : .42)),
          pitch: Math.max(0, Math.min(1, Number.isFinite(line.pitch) ? line.pitch : .5)),
          points: line.points
            .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
            .slice(0, score.MAX_POINTS)
            .map(point => ({
              x: Math.max(0, Math.min(1, point.x)),
              y: Math.max(0, Math.min(1, point.y)),
              pressure: Math.max(0, Math.min(1, Number.isFinite(point.pressure) ? point.pressure : .42))
            }))
        }))
        .filter(line => line.points.length >= 2)
        .slice(-score.MAX_INK);
    } catch { return []; }
  }

  function storePhraseDiary() {
    try {
      const epoch = epochNow();
      const perf = performance.now();
      localStorage.setItem(DIARY_STORAGE_KEY, JSON.stringify({
        v: 1,
        savedAt: epoch,
        lines: phraseInk.slice(-score.MAX_INK).map(line => ({
          born: epoch - Math.max(0, perf - line.born),
          durationMs: line.durationMs,
          depth: line.depth,
          pressure: line.pressure,
          pitch: line.pitch,
          points: line.points.map(point => ({ x: point.x, y: point.y, pressure: point.pressure }))
        }))
      }));
    } catch {}
  }

  function recordPhraseInk() {
    const latest = memories.at(-1);
    const entry = score.phraseInk(latest);
    if (!entry) return;
    const before = phraseInk.length;
    phraseInk = score.appendPhraseInk(phraseInk, entry, performance.now(), score.inkLifeMs(reduced.matches));
    if (phraseInk.length === before && phraseInk.at(-1) === entry) return;
    storePhraseDiary();
    reflectDiaryCount();
    if (diaryOpen) syncDiaryPanel();
  }

  // Draw one fading ink line on the water: the pond keeps a quiet diary.
  function drawInkLine(line, now) {
    const visible = score.inkVisibility(line, now, reduced.matches);
    if (visible <= 0 || !Array.isArray(line.points) || line.points.length < 2) return;
    // Ink is cheap polyline work, so the budget only softens it faintly on
    // the deepest steps rather than sacrificing the diary's legibility.
    const inkStyle = budget.style(waterBudget, 'ink');
    const inkDim = .82 + .18 * inkStyle;
    const drift = reduced.matches ? 0 : Math.sin(now * .0003 + line.born * .0009) * 1.6;
    const hue = 158 + 26 * (1 - line.depth);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    traceMemoryPath(line.points, drift);
    ctx.strokeStyle = `hsla(${hue} 46% 60% / ${visible * .13 * inkDim})`;
    ctx.lineWidth = 6; ctx.stroke();
    traceMemoryPath(line.points, drift);
    ctx.strokeStyle = `hsla(${hue} 60% 76% / ${visible * .34 * inkDim})`;
    ctx.lineWidth = 1.1; ctx.stroke();
    const end = line.points.at(-1);
    ctx.beginPath(); ctx.arc(end.x * width, end.y * height + drift, 3.1, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue} 62% 80% / ${visible * .4})`;
    ctx.fill();
    // A circling line is readable on the water itself: a warm point travels
    // the contour while the line breathes. Panel open or closed, the loop
    // state stays visible; reduced motion keeps a still mark and no breath.
    if (loopingLine === line) {
      const probe = score.loopProbe(line, now, reduced.matches);
      if (probe) {
        const travel = pointAlongContour(line.points, probe.progress, drift);
        // A genuinely warm amber mark: it must read as motion over the cool
        // dark water, not just a greener echo of the ink line.
        const warmHue = 38 + Math.round(line.depth * 12);
        const pulse = .62 + probe.breath * .38;
        ctx.save();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        traceMemoryPath(line.points, drift);
        ctx.strokeStyle = `hsla(${warmHue} 58% 70% / ${visible * (.12 + probe.breath * .14)})`;
        ctx.lineWidth = 1.4 + probe.breath * 1.2; ctx.stroke();
        ctx.restore();
        const radius = 2.4 + probe.breath * 1.2;
        const glow = ctx.createRadialGradient(travel.x, travel.y, 0, travel.x, travel.y, radius * 4.6);
        glow.addColorStop(0, `hsla(${warmHue} 84% 80% / ${visible * pulse})`);
        glow.addColorStop(.25, `hsla(${warmHue} 70% 66% / ${visible * pulse * .3})`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(travel.x, travel.y, radius * 4.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(travel.x, travel.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${warmHue} 88% 82% / ${visible * pulse})`;
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // A poured phrase sweeps back across the surface as a gentle echo.
  function drawPourEcho(echo, now) {
    const life = reduced.matches ? 560 : 1240;
    const age = now - echo.born;
    if (age < 0 || age >= life) return false;
    const progress = Math.max(0, Math.min(1, age / life));
    const fade = Math.pow(1 - progress, 1.4);
    const points = echo.line.points;
    if (!points || points.length < 2) return false;
    const keep = Math.max(2, Math.ceil(points.length * Math.min(1, progress * 1.6)));
    const slice = points.slice(0, keep);
    const hue = 158 + 26 * (1 - echo.line.depth);
    const drift = reduced.matches ? 0 : Math.sin(now * .00034 + echo.born * .001) * 1.8;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    traceMemoryPath(slice, drift);
    ctx.strokeStyle = `hsla(${hue + 14} 72% 86% / ${fade * .4})`;
    ctx.lineWidth = 2 + echo.line.pressure * 2;
    ctx.stroke();
    const tip = slice.at(-1);
    const radius = 4.5;
    const glow = ctx.createRadialGradient(tip.x * width, tip.y * height + drift, 0, tip.x * width, tip.y * height + drift, radius * 4.4);
    glow.addColorStop(0, `hsla(${hue + 20} 82% 90% / ${fade * .7})`);
    glow.addColorStop(.25, `hsla(${hue} 66% 74% / ${fade * .22})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(tip.x * width, tip.y * height + drift, radius * 4.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return true;
  }

  function setDiaryPanelOpen(open) {
    const hadFocusInside = diaryPanel.contains(document.activeElement) || diaryStone === document.activeElement;
    diaryOpen = open;
    diaryControl.classList.toggle('is-open', open);
    diaryStone.setAttribute('aria-expanded', a11y.expandedState(open));
    if (open) {
      syncDiaryPanel();
      const target = diaryPanelTabTarget();
      if (target) target.focus();
    } else if (hadFocusInside) {
      diaryStone.focus();
    }
  }

  // The stone keeps a quiet count of still-readable lines while closed.
  function reflectDiaryCount() {
    const lines = score.pourableInk(phraseInk, performance.now(), reduced.matches);
    const count = lines.length;
    diaryCount.textContent = String(count);
    diaryStone.setAttribute('aria-label',
      `Дневник пруда: ${count} ${count === 1 ? 'строка' : count >= 2 && count <= 4 ? 'строки' : 'строк'} на воде${count ? '; откройте, чтобы вылить фразу обратно' : ''}`);
    diaryControl.classList.toggle('has-lines', count > 0);
    canvas.dataset.inkLines = String(count);
    lastInkCount = count;
    return count;
  }

  function syncDiaryPanel() {
    const epoch = performance.now();
    const lines = score.pourableInk(phraseInk, epoch, reduced.matches);
    diaryCount.textContent = String(lines.length);
    // Remember where the keyboard player is before the list rebuilds, so a
    // live refresh (new ink while the panel is open) does not drop focus.
    const focusedInside = diaryPanel.contains(document.activeElement);
    const focusedAction = focusedInside ? document.activeElement : null;
    const focusedCirculate = focusedAction?.classList?.contains('diary-loop') ?? false;
    const focusedLeaf = focusedInside && focusedAction instanceof HTMLButtonElement &&
      focusedAction.id === 'leaf-return' && !diaryLeaf.hidden;
    const focusedRow = focusedAction?.closest?.('.diary-row') ?? null;
    const focusedBorn = focusedRow?.dataset?.born ?? null;
    diaryList.textContent = '';
    for (const line of lines) {
      const row = document.createElement('div');
      row.className = 'diary-row';
      row.dataset.born = String(line.born);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'diary-entry';
      const hue = Math.round(158 + 26 * (1 - line.depth));
      const x = Math.round(line.points.at(-1).x * 100);
      const y = Math.round(line.points.at(-1).y * 100);
      const visible = Math.round(score.inkVisibility(line, epoch, reduced.matches) * 100);
      item.textContent = `Фраза на глубине ${Math.round(line.depth * 100)} · остаток ${visible}%`;
      item.setAttribute('aria-label', `Вылить эту фразу обратно на воду: мягкое мелодическое эхо от её контура (около x ${x}, y ${y})`);
      item.style.setProperty('--ink-hue', String(hue));
      item.addEventListener('click', () => pourInkEntry(line));
      row.appendChild(item);

      // A second little stone lets the phrase keep circling while its ink
      // is still on the water: a quiet repeating echo, one loop at a time.
      const circulate = document.createElement('button');
      circulate.type = 'button';
      circulate.className = 'diary-loop';
      circulate.textContent = 'Кружить';
      circulate.style.setProperty('--ink-hue', String(hue));
      const loopingThisLine = loopingLine === line;
      circulate.setAttribute('aria-pressed', String(loopingThisLine));
      circulate.setAttribute('aria-label', loopingThisLine
        ? 'Остановить круговорот этой фразы'
        : `Запустить тихий круговорот этой фразы, пока её чернила ещё на воде (около x ${x}, y ${y})`);
      circulate.classList.toggle('is-looping', loopingThisLine);
      circulate.disabled = !loopingThisLine && loopingLine !== null;
      circulate.addEventListener('click', () => {
        if (loopingLine === line) {
          stopPourLoop(false);
          canvas.dataset.loopingLine = '0';
          canvas.dataset.loopPasses = '0';
          status.textContent = 'Фраза из дневника больше не кружит по воде';
          pourAnnounced = true;
          syncDiaryPanel();
        } else {
          startPourLoop(line);
        }
      });
      row.appendChild(circulate);

      // A third little action lets the phrase leave the pond entirely: the
      // same ink line becomes a compact self-contained string in the clipboard,
      // so the music can travel off the surface.
      const take = document.createElement('button');
      take.type = 'button';
      take.className = 'diary-take';
      take.textContent = 'Забрать';
      take.style.setProperty('--ink-hue', String(hue));
      take.setAttribute('aria-label', `Забрать эту фразу с пруда: скопировать её контур, высоту и глубину в буфер обмена (около x ${x}, y ${y})`);
      take.addEventListener('click', () => copyPhraseScroll(line));
      row.appendChild(take);
      diaryList.appendChild(row);
    }
    diaryEmpty.hidden = lines.length !== 0;
    diaryList.hidden = lines.length === 0;
    // A lifted phrase rests on its own little leaf between the list and the
    // return stone; it belongs to no row, so a list rebuild never takes it
    // away - only the water taking the phrase back does.
    if (!heldLeafScroll || !score.scrollSummary(heldLeafScroll)) hideDiaryLeaf();
    diaryStone.setAttribute('aria-label', `Дневник пруда: ${lines.length} ${lines.length === 1 ? 'строка' : lines.length >= 2 && lines.length <= 4 ? 'строки' : 'строк'} на воде`);
    diaryControl.classList.toggle('has-lines', lines.length > 0);
    // Restore the keyboard player after a live re-render: same row, same
    // action. A vanished row (expired ink) returns focus to the stone so
    // the player is never dropped silently.
    if (focusedInside) {
      if (focusedLeaf && diaryLeaf && !diaryLeaf.hidden) {
        // The player was standing on the leaf: hand them straight back to
        // its action instead of dropping them onto the stone.
        leafReturn?.focus();
        return;
      }
      const retained = [...diaryList.children].find(row => row?.dataset?.born === focusedBorn);
      if (retained) {
        const restored = focusedCirculate
          ? retained.querySelector('.diary-loop')
          : retained.querySelector('.diary-entry');
        if (restored) restored.focus();
      } else {
        diaryStone.focus();
      }
    }
  }

  // The leaf lives only until the phrase comes home: one small paper rest
  // on the shore, cleaned quietly when the water takes the phrase back.
  function hideDiaryLeaf() {
    heldLeafScroll = null;
    if (diaryLeaf) diaryLeaf.hidden = true;
    if (leafText) leafText.textContent = '';
  }

  // One shared landing for any carried scroll - lifted from the clipboard
  // or straight off the leaf: re-seat it as fresh ink with a new birth,
  // persist the diary, and tell the reader the phrase came home. Broken
  // input lands nowhere instead of quietly corrupting the diary.
  function seatReturnedText(scroll) {
    if (!scroll) return false;
    const entry = score.inkFromScroll(scroll, performance.now());
    if (!entry) return false;
    const updated = score.appendPhraseInk(phraseInk, entry, performance.now(), score.inkLifeMs(reduced.matches));
    if (updated === phraseInk) return false;
    phraseInk = updated;
    // The water has taken the phrase home: put the leaf away first, so a
    // live panel refresh honestly returns focus to the shore stone.
    hideDiaryLeaf();
    const summary = score.scrollSummary(scroll);
    storePhraseDiary();
    reflectDiaryCount();
    if (diaryOpen) syncDiaryPanel();
    status.textContent = `Фраза вернулась на воду: контур из ${summary ? summary.points : Number(scroll.length) || '?'} точек с высотой ${Math.round((Number(scroll.pitch) || 0) * 100)}`;
    pourAnnounced = true;
    return true;
  }

  // Order the diary panel's interactive controls for keyboard travel: the
  // row actions first, then each row's circulate stone, then nothing else.
  function diaryPanelControls() {
    const controls = [];
    for (const row of diaryList.children) {
      for (const child of row.children) {
        if (child instanceof HTMLButtonElement) controls.push(child);
      }
    }
    // The leaf's action sits visually between the rows and the return
    // stone, so keyboard travel follows what the eye reads.
    if (diaryLeaf && !diaryLeaf.hidden) {
      const leafAction = document.querySelector('#leaf-return');
      if (leafAction instanceof HTMLButtonElement) controls.push(leafAction);
    }
    const returned = document.querySelector('#diary-return');
    if (returned instanceof HTMLButtonElement) controls.push(returned);
    return controls;
  }

  // Focus the first tabbable control inside the diary panel when it opens,
  // so a keyboard player lands on the row action immediately. Returns null
  // for an empty panel (nothing to focus).
  function diaryPanelTabTarget() {
    const controls = diaryPanelControls();
    const target = controls[0] ?? null;
    if (target) target.focus();
    return target;
  }

  function startPourEcho(line) {
    pourEchoes.push({ line, born: performance.now() });
    if (pourEchoes.length > 6) pourEchoes.shift();
    canvas.dataset.pouredEchoes = String((Number(canvas.dataset.pouredEchoes) || 0) + 1);
  }

  function playPourNote(line, anchor, index, response) {
    const engine = audio;
    if (!engine || engine.context.state !== 'running' ||
        engine.echoVoices.size >= MAX_ECHO_VOICES) return;
    const x = anchor.x * width, y = anchor.y * height;
    const depth = Math.max(0, Math.min(1, anchor.y));
    const now = engine.context.currentTime;
    const oscillator = engine.context.createOscillator();
    const filter = engine.context.createBiquadFilter();
    const gain = engine.context.createGain();
    const panner = typeof engine.context.createStereoPanner === 'function' ? engine.context.createStereoPanner() : null;
    const reflectionSend = engine.reflection ? engine.context.createGain() : null;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(response.startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(response.frequency, now + response.durationSeconds * .42);
    oscillator.frequency.exponentialRampToValueAtTime(response.frequency * .992, now + response.durationSeconds);
    filter.type = 'lowpass'; filter.frequency.value = response.cutoffHz; filter.Q.value = 1.2;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(response.peakGain, now + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, now + response.durationSeconds);
    oscillator.connect(filter).connect(gain);
    let output = gain;
    if (panner) { panner.pan.value = music.spatialPan(anchor.x); gain.connect(panner); output = panner; }
    output.connect(engine.master);
    if (reflectionSend) {
      reflectionSend.gain.value = music.depthReflection(depth).sendGain * .42;
      output.connect(reflectionSend).connect(engine.reflection.input);
    }
    const echo = { oscillator, nodes: [oscillator, filter, gain, panner, reflectionSend] };
    engine.echoVoices.add(echo);
    canvas.dataset.echoVoices = String(engine.echoVoices.size);
    canvas.dataset.peakEchoVoices = String(Math.max(Number(canvas.dataset.peakEchoVoices) || 0, engine.echoVoices.size));
    addRipple(x, y, .12 + line.pressure * .16, .3 + response.peakGain * 7, response.frequency, false);
    if (!pourAnnounced) {
      status.textContent = 'Сохранившаяся фраза вылилась обратно на воду мягким мелодическим эхом';
      pourAnnounced = true;
    }
    oscillator.addEventListener('ended', () => {
      if (engine.echoVoices?.delete(echo)) {
        for (const node of echo.nodes) { try { node?.disconnect(); } catch {} }
        canvas.dataset.echoVoices = String(engine.echoVoices.size);
      }
    }, { once: true });
    oscillator.start();
    oscillator.stop(now + response.durationSeconds + .025);
  }

  // Pour one remembered line back onto the surface as a gentle echo.
  function pourInkEntry(line) {
    const now = performance.now();
    if (score.inkVisibility(line, now, reduced.matches) <= .02) { syncDiaryPanel(); return; }
    const engine = audio;
    if (!engine || engine.context.state !== 'running' || pourTimers.size >= MAX_PENDING_POURS) return;
    const pseudo = {
      ...line, startedAt: line.born,
      points: line.points.map((point, index) => ({
        x: point.x, y: point.y, pitch: point.x,
        pressure: Number.isFinite(point.pressure) ? point.pressure : line.pressure,
        at: line.born + index
      }))
    };
    const anchors = score.melodyAnchors(pseudo, MAX_ECHO_VOICES);
    if (!anchors.length) return;
    let serial = 0;
    anchors.forEach((anchor, index) => {
      const response = music.echoNote(anchor.pitch, anchor.y, .12 + line.pressure * .2, index, anchors.length);
      const at = now + response.delayMs;
      const timer = setTimeout(() => {
        pourTimers.delete(timer);
        canvas.dataset.pendingPours = String(pourTimers.size);
        playPourNote(line, anchor, index, response);
      }, Math.max(0, at - performance.now()));
      pourTimers.add(timer);
      serial += 1;
    });
    if (!serial) return;
    startPourEcho(line);
    canvas.dataset.pendingPours = String(pourTimers.size);
    setDiaryPanelOpen(false);
  }

  // The same gentle echo, but as a repeating circulation: the stored phrase
  // keeps coming back while its ink is still on the water. One global loop at
  // a time, each pass uses the shared echo-voice budget, and the whole thing
  // ends the moment the ink fades, the line disappears, or audio is retired.
  function pourLoopPass(line, pass) {
    const now = performance.now();
    if (!line || score.inkVisibility(line, now, reduced.matches) <= .02) {
      if (loopingLine === line) stopPourLoop();
      return;
    }
    if (!audio || audio.context.state !== 'running' || engineEchoBusy(MAX_ECHO_VOICES)) return;
    const pseudo = {
      ...line, startedAt: line.born,
      points: line.points.map((point, index) => ({
        x: point.x, y: point.y, pitch: point.x,
        pressure: Number.isFinite(point.pressure) ? point.pressure : line.pressure,
        at: line.born + index
      }))
    };
    const anchors = score.melodyAnchors(pseudo, MAX_ECHO_VOICES);
    if (!anchors.length) { stopPourLoop(); return; }
    const quieter = .82 + pass * .05;
    anchors.forEach((anchor, index) => {
      const response = music.echoNote(anchor.pitch, anchor.y, (.1 + line.pressure * .16) / quieter, index, anchors.length);
      const at = now + response.delayMs;
      const timer = setTimeout(() => {
        pourTimers.delete(timer);
        canvas.dataset.pendingPours = String(pourTimers.size);
        playPourNote(line, anchor, index, response, true);
      }, Math.max(0, at - performance.now()));
      pourTimers.add(timer);
    });
    loopPassesFired += 1;
    canvas.dataset.loopPasses = String(loopPassesFired);
    startPourEcho(line);
    if (!pourAnnounced) {
      status.textContent = 'Фраза из дневника теперь тихо кружит по воде';
      pourAnnounced = true;
    }
  }

  function engineEchoBusy(limit = MAX_ECHO_VOICES) {
    return (audio?.echoVoices?.size ?? 0) >= limit;
  }

  function startPourLoop(line) {
    if (loopingLine === line && loopPassTimers.size > 0) return;
    stopPourLoop(false);
    const now = performance.now();
    if (score.inkVisibility(line, now, reduced.matches) <= .02) { syncDiaryPanel(); return; }
    loopingLine = line;
    loopPassesFired = 0;
    loopEchoesScheduled = 0;
    const schedule = score.loopSchedule(line, now, score.MAX_LOOP_PASSES, reduced.matches);
    canvas.dataset.loopingLine = '1';
    canvas.dataset.loopPasses = '0';
    for (const pass of schedule) {
      const timer = setTimeout(() => {
        loopPassTimers.delete(timer);
        pourLoopPass(line, pass.pass);
      }, Math.max(0, pass.at - (performance.now() - now)));
      loopPassTimers.add(timer);
    }
    if (loopPassTimers.size) {
      status.textContent = 'Фраза из дневника начала тихо кружить по воде';
      pourAnnounced = true;
      setDiaryPanelOpen(false);
    }
  }

  function stopPourLoop(reflect = true) {
    for (const timer of loopPassTimers) clearTimeout(timer);
    loopPassTimers.clear();
    loopingLine = null;
    if (reflect) {
      canvas.dataset.loopingLine = '0';
      canvas.dataset.loopPasses = '0';
      if (diaryOpen) syncDiaryPanel();
    }
  }

  // Carry a finished phrase off the pond: one compact self-contained scroll
  // (path, sounding pitch, depth, duration, chosen current) lifted into the
  // clipboard. No network, no audio engine, no score memory — just the phrase
  // itself, so it survives outside the surface and can be pasted anywhere.
  function copyPhraseScroll(line) {
    const scroll = score.phraseScroll(line, tuningFamily);
    if (!scroll) { syncDiaryPanel(); return; }
    const text = score.phraseScrollText(scroll);
    if (!text) { syncDiaryPanel(); return; }
    // Testability hook, like the other dataset probes: the exact carried
    // phrase is visible to an instrumented smoke without depending on the
    // host clipboard.
    canvas.dataset.scrollText = text;
    // The phrase itself rests on a small paper leaf right in the diary
    // panel: its carried text stays readable, and one touch seats it back
    // on the water without ever meeting the host clipboard.
    const summary = score.scrollSummary(scroll);
    if (summary && leafText && diaryLeaf) {
      leafText.textContent = summary.lines.join('\n');
      heldLeafScroll = scroll;
      diaryLeaf.hidden = false;
      try { leafText.scrollIntoView?.({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' }); } catch {}
    }
    const copied = () => {
      try {
        navigator.clipboard?.writeText(text).then(() => {
          canvas.dataset.lastScroll = String(Date.now());
          status.textContent = `Фраза покинула пруд: контур из ${summary ? summary.points : scroll.length} точек с высотой ${Math.round(scroll.pitch * 100)} и глубиной ${Math.round(scroll.depth * 100)} записан на лист в дневнике — можно вставить куда угодно`;
          pourAnnounced = true;
        }).catch(() => announceScrollFallback(text));
      } catch { announceScrollFallback(text); }
    };
    copied();
  }

  // The scroll is not a one-way exit: a phrase that left the pond can come
  // home. This reads the carried text back into a pure scroll, re-seats it
  // as a fresh ink line with a new birth, persists the diary, and tells the
  // reader the pond received it. Broken or unknown text announces a gentle
  // refusal instead of silently dropping a phrase.
  function returnPhraseFromClipboard() {
    const read = () => {
      try { return navigator.clipboard.readText().then(text => { globalThis.__returnedText = text; return text; }); }
      catch { return Promise.resolve(); }
    };
    read().then(text => {
      const scroll = score.parseScrollText(typeof text === 'string' ? text : '');
      if (!scroll) {
        status.textContent = 'В буфере нет фразы пруда — скопируйте её кнопкой «Забрать», а потом верните';
        pourAnnounced = true;
        return;
      }
      seatReturnedText(scroll);
    }).catch(() => {
      status.textContent = 'В буфере нет фразы пруда — скопируйте её кнопкой «Забрать»';
      pourAnnounced = true;
    });
  }

  function announceScrollFallback(text) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand?.('copy');
      document.body.removeChild(textarea);
      status.textContent = 'Фраза покинула пруд и скопирована в буфер обмена';
    } catch {
      status.textContent = 'Скопируйте фразу вручную: она готова в этом окне';
    }
    pourAnnounced = true;
  }

  function reflectTuningFamily(announce = false) {
    const family = music.SCALE_FAMILIES[tuningFamily];
    for (const input of tuningInputs) input.checked = input.value === tuningFamily;
    tuningValue.value = family.name;
    tuningValue.textContent = family.name;
    canvas.dataset.scaleFamily = tuningFamily;
    if (!announce) return;
    for (const pointer of pointers.values()) pointer.currentAnnounced = false;
    keyboard.currentAnnounced = false;
    status.textContent = `Течение «${family.name}»: ${family.description}; свободное скольжение осталось непрерывным`;
  }

  function reflectMasterState(announce = false) {
    const volume = masterState.volume;
    volumeRange.value = String(volume);
    volumeValue.value = `${volume}%`;
    volumeValue.textContent = `${volume}%`;
    muteButton.textContent = masterState.muted ? 'Вернуть звук' : 'Приглушить';
    muteButton.setAttribute('aria-pressed', String(masterState.muted));
    volumeControl.classList.toggle('is-muted', masterState.muted || volume === 0);
    volumeStone.setAttribute('aria-label', masterState.muted
      ? `Громкость пруда: приглушено, сохранено ${volume} процентов`
      : `Громкость пруда: ${volume} процентов`);
    canvas.dataset.masterVolume = String(volume);
    canvas.dataset.masterMuted = String(masterState.muted);
    if (audio) balanceVoices(audio);
    if (announce) status.textContent = masterState.muted
      ? 'Звук пруда приглушён; жесты и водная партитура продолжают жить'
      : `Громкость пруда: ${volume} процентов`;
  }

  function setVolumePanelOpen(open) {
    const hadFocusInside = volumePanel.contains(document.activeElement) || volumeStone === document.activeElement;
    volumeControl.classList.toggle('is-open', open);
    volumeStone.setAttribute('aria-expanded', a11y.expandedState(open));
    if (open && !volumePanel.contains(document.activeElement)) {
      volumeRange.focus();
    } else if (!open && hadFocusInside) {
      volumeStone.focus();
    }
  }

  // The volume panel's interactive controls in tab order: the range first,
  // then the mute stone. The trigger stone lives outside the panel, so the
  // trap only wraps these two.
  function volumePanelControls() {
    const controls = [];
    if (volumeRange instanceof HTMLInputElement) controls.push(volumeRange);
    if (muteButton instanceof HTMLButtonElement) controls.push(muteButton);
    return controls;
  }

  volumeStone.addEventListener('click', () => setVolumePanelOpen(!volumeControl.classList.contains('is-open')));
  // Buttons already fire click on Enter/Space; expanded honesty and the
  // focus move happen inside setVolumePanelOpen on that same click path.
  diaryStone.addEventListener('click', () => setDiaryPanelOpen(!diaryOpen));
  const diaryReturn = document.querySelector('#diary-return');
  if (diaryReturn instanceof HTMLButtonElement) {
    diaryReturn.addEventListener('click', () => returnPhraseFromClipboard());
  }
  const leafReturn = document.querySelector('#leaf-return');
  if (leafReturn instanceof HTMLButtonElement) {
    leafReturn.addEventListener('click', () => seatReturnedText(heldLeafScroll));
  }
  diaryControl.addEventListener('focusout', () => {
    requestAnimationFrame(() => {
      if (!diaryControl.contains(document.activeElement)) setDiaryPanelOpen(false);
    });
  });
  document.addEventListener('pointerdown', event => {
    if (!diaryControl.contains(event.target)) setDiaryPanelOpen(false);
  });
  diaryControl.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); setDiaryPanelOpen(false); return; }
    if (event.key !== 'Tab' || !diaryOpen) return;
    const controls = diaryPanelControls();
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement);
    const direction = event.shiftKey ? 'backward' : 'forward';
    const resolved = a11y.countIndex(current, controls.length, direction);
    event.preventDefault();
    controls[resolved]?.focus();
  });
  volumeControl.addEventListener('focusout', () => {
    requestAnimationFrame(() => {
      if (!volumeControl.contains(document.activeElement)) setVolumePanelOpen(false);
    });
  });
  document.addEventListener('pointerdown', event => {
    if (!volumeControl.contains(event.target)) setVolumePanelOpen(false);
  });
  volumeControl.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setVolumePanelOpen(false);
      volumeStone.focus();
      return;
    }
    if (event.key !== 'Tab' || !volumeControl.classList.contains('is-open')) return;
    const controls = volumePanelControls();
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement);
    const direction = event.shiftKey ? 'backward' : 'forward';
    const resolved = a11y.countIndex(current, controls.length, direction);
    event.preventDefault();
    controls[resolved]?.focus();
  });
  volumeRange.addEventListener('input', () => {
    masterState = masterModel.withVolume(masterState, volumeRange.value);
    reflectMasterState(false);
  });
  volumeRange.addEventListener('change', () => {
    storeMasterState();
    reflectMasterState(true);
  });
  muteButton.addEventListener('click', () => {
    masterState = masterModel.toggleMute(masterState);
    storeMasterState();
    reflectMasterState(true);
  });
  for (const input of tuningInputs) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      tuningFamily = music.normalizeScaleFamily(input.value);
      storeTuningFamily();
      reflectTuningFamily(true);
    });
  }
  reflectMasterState(false);
  reflectTuningFamily(false);
  reflectDiaryCount();

  function resize() {
    // The pond survives a change of screen: every live pixel-space artifact
    // keeps its normalized place on the water and lands in the new space,
    // so pitch, depth and stereo meaning of what already sounds stay put.
    const previousWidth = width, previousHeight = height;
    dpr = Math.min(devicePixelRatio || 1, 2);
    width = innerWidth; height = innerHeight;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!previousWidth || !previousHeight || (previousWidth === width && previousHeight === height)) return;
    const from = { w: previousWidth, h: previousHeight }, to = { w: width, h: height };
    if (repose) {
      const movedWaves = repose.reposeWaves(ripples, from, to);
      ripples.length = 0; ripples.push(...movedWaves);
      const movedTrails = repose.reposeTrails(trails, from, to);
      trails.length = 0; trails.push(...movedTrails);
      const movedSplashes = repose.reposeSplashes(splashes, from, to);
      splashes.length = 0; splashes.push(...movedSplashes);
      const movedCoronas = repose.reposeCoronas(coronas, from, to);
      coronas.length = 0; coronas.push(...movedCoronas);
      const movedPearls = repose.reposePoints(collisionPearls, from, to);
      collisionPearls.length = 0; collisionPearls.push(...movedPearls);
      const movedGlints = repose.reposePoints(collisionGlints, from, to);
      collisionGlints.length = 0; collisionGlints.push(...movedGlints);
      const movedLaps = repose.reposePoints(shoreLapGlints, from, to);
      shoreLapGlints.length = 0; shoreLapGlints.push(...movedLaps);
      const movedReads = repose.reposePoints(inkReadGlints, from, to);
      inkReadGlints.length = 0; inkReadGlints.push(...movedReads);
      // The departing lights keep their place on the new water too.
      const movedReleases = repose.reposePoints(releaseGlints, from, to);
      releaseGlints.length = 0; releaseGlints.push(...movedReleases);
      const movedFlights = repose.reposeFlights(stoneFlights, from, to);
      stoneFlights.length = 0; stoneFlights.push(...movedFlights);
      pointers = repose.reposePointers(pointers, from, to);
    } else {
      // Without the layer the water still refuses to strand its live
      // artifacts in dead coordinates: they leave with the old space.
      ripples.length = 0; trails.length = 0; splashes.length = 0;
      coronas.length = 0; collisionPearls.length = 0;
      collisionGlints.length = 0; shoreLapGlints.length = 0; inkReadGlints.length = 0; stoneFlights.length = 0; pointers.clear();
      releaseGlints.length = 0;
    }
    // Wave appointments were predicted against the old geometry: dissolve
    // them cleanly instead of answering at a place the new water never saw.
    for (const timer of collisionTimers.values()) clearTimeout(timer);
    collisionTimers.clear();
    collisionPairs.clear();
    for (const timer of shoreTimers.values()) clearTimeout(timer);
    shoreTimers.clear();
  }

  // The pond invites its first gesture itself: one breathing ring of light
  // on the water, gone forever once the water has actually sounded.
  function markPondPlayed() {
    if (pondHasPlayed) return;
    pondHasPlayed = true;
    invitationLine?.classList.add('is-gone');
    try { localStorage.setItem(INVITATION_STORAGE_KEY, 'played'); } catch {}
  }

  // The water whisper offers one short lesson after a real gesture earns it.
  // It stays strictly a listener's companion: never while a hand or the
  // keyboard voice is still down, once per session per gesture, and only
  // when the pond has been played at least once (the first visit belongs
  // to the invitation).
  function offerWhisper(events, now) {
    if (!pondHasPlayed) return;
    const soundingPointers = [...pointers.values()].some(pointer => pointer.sounding);
    if (soundingPointers || keyboard.sounding || whisperHint) return;
    const hint = score.whisperHint(whisper, events, now);
    if (!hint) return;
    whisperHint = hint;
    status.textContent = hint.text;
  }

  function drawWhisper(now) {
    if (!whisperHint) { canvas.dataset.whisperAlpha = '0'; return; }
    const alpha = score.whisperVisibility(whisperHint, now, reduced.matches);
    canvas.dataset.whisperAlpha = alpha.toFixed(3);
    if (alpha <= 0 && now > whisperHint.born) {
      whisperHint = null;
      return;
    }
    if (alpha <= 0) return;
    const text = whisperHint.text;
    const texts = Object.values(score.WHISPER_TEXTS);
    ctx.save();
    ctx.font = '500 13px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const widest = Math.ceil(texts.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0));
    const boxWidth = Math.min(width * .86, widest + 34);
    const boxHeight = 40;
    const cx = width / 2, cy = height * .16;
    const radius = 14;
    ctx.globalAlpha = alpha * .78;
    ctx.fillStyle = '#04100e';
    ctx.strokeStyle = 'rgba(190, 214, 182, .30)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(cx - boxWidth / 2, cy - boxHeight / 2, boxWidth, boxHeight, radius);
    } else {
      ctx.moveTo(cx - boxWidth / 2 + radius, cy - boxHeight / 2);
      ctx.arcTo(cx + boxWidth / 2, cy - boxHeight / 2, cx + boxWidth / 2, cy + boxHeight / 2, radius);
      ctx.arcTo(cx + boxWidth / 2, cy + boxHeight / 2, cx - boxWidth / 2, cy + boxHeight / 2, radius);
      ctx.arcTo(cx - boxWidth / 2, cy + boxHeight / 2, cx - boxWidth / 2, cy - boxHeight / 2, radius);
      ctx.arcTo(cx - boxWidth / 2, cy - boxHeight / 2, cx + boxWidth / 2, cy - boxHeight / 2, radius);
      ctx.closePath();
    }
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.stroke();
    ctx.fillStyle = '#dcead8';
    ctx.shadowColor = '#00100d';
    ctx.shadowBlur = 10;
    ctx.fillText(text, cx, cy + 4);
    ctx.restore();
  }

  function drawInvitation(now) {
    if (!width || !height) return;
    if (pondHasPlayed) { canvas.dataset.inviteAlpha = '0'; return; }
    const invite = score.invitation(now - bootAt, reduced.matches);
    canvas.dataset.inviteAlpha = invite.alpha.toFixed(3);
    if (invitationLine && invite.text <= 0 && !invitationLine.classList.contains('is-gone')) {
      invitationLine.classList.add('is-gone');
    }
    if (invite.alpha <= 0) return;
    const cx = width * .5, cy = height * .44, base = Math.min(width, height);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const radius = base * .085 * invite.radius;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.9);
    glow.addColorStop(0, `hsla(152 46% 82% / ${invite.alpha * .5})`);
    glow.addColorStop(.55, `hsla(150 42% 66% / ${invite.alpha * .22})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, radius * 1.9, 0, Math.PI * 2); ctx.fill();
    const ring = radius * (1 + (1 - invite.alpha / .64) * .3);
    ctx.strokeStyle = `hsla(150 48% 78% / ${Math.max(.06, invite.alpha * .5)})`;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([2, 7]);
    ctx.lineDashOffset = -(now * .012) % 9;
    ctx.beginPath(); ctx.arc(cx, cy, ring, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function eventTime(event) {
    const now = performance.now(), stamp = Number(event.timeStamp);
    return Number.isFinite(stamp) && Math.abs(stamp - now) < 60000 ? stamp : now;
  }

  function pressureOf(event, pressureAvailable = music.hasExpressivePressure(event.pointerType, event.pressure)) {
    return pressureAvailable ? Math.max(.04, Math.min(1, event.pressure)) : .42;
  }

  function voiceWord(count) {
    const lastTwo = count % 100, last = count % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return 'голосов';
    if (last === 1) return 'голос';
    if (last >= 2 && last <= 4) return 'голоса';
    return 'голосов';
  }

  function disconnectCollisionVoice(engine, pearl) {
    if (!engine.collisionVoices?.delete(pearl)) return;
    for (const node of pearl.nodes) {
      try { node?.disconnect(); } catch {}
    }
    canvas.dataset.pearlVoices = String(engine.collisionVoices.size);
  }

  function playCollisionPearl(collision) {
    const engine = audio;
    const visualNow = performance.now();
    if (!engine || engine.context.state !== 'running' ||
        engine.collisionVoices.size >= MAX_COLLISION_VOICES ||
        visualNow - lastCollisionAt < COLLISION_RATE_LIMIT_MS) return false;

    const depth = Math.max(0, Math.min(1, collision.y / Math.max(1, height)));
    const response = music.collisionPearl(collision.parentFrequency, depth, collision.energy, tuningFamily);
    const now = engine.context.currentTime;
    const oscillator = engine.context.createOscillator();
    const filter = engine.context.createBiquadFilter();
    const gain = engine.context.createGain();
    const panner = typeof engine.context.createStereoPanner === 'function' ? engine.context.createStereoPanner() : null;
    const reflectionSend = engine.reflection ? engine.context.createGain() : null;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(response.startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(response.frequency, now + response.durationSeconds * .42);
    oscillator.frequency.exponentialRampToValueAtTime(response.frequency * .985, now + response.durationSeconds);
    filter.type = 'lowpass'; filter.frequency.value = response.cutoffHz; filter.Q.value = 1.8;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(response.peakGain, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + response.durationSeconds);
    oscillator.connect(filter).connect(gain);
    let output = gain;
    if (panner) {
      panner.pan.value = music.spatialPan(collision.x / Math.max(1, width));
      gain.connect(panner);
      output = panner;
    }
    output.connect(engine.master);
    if (reflectionSend) {
      reflectionSend.gain.value = music.depthReflection(depth).sendGain * .52;
      output.connect(reflectionSend).connect(engine.reflection.input);
    }
    const pearl = { oscillator, nodes: [oscillator, filter, gain, panner, reflectionSend] };
    engine.collisionVoices.add(pearl);
    canvas.dataset.pearlVoices = String(engine.collisionVoices.size);
    canvas.dataset.peakPearlVoices = String(Math.max(
      Number(canvas.dataset.peakPearlVoices) || 0,
      engine.collisionVoices.size
    ));
    canvas.dataset.waveCollisions = String(++collisionSerial);
    collisionPearls.push({ x: collision.x, y: collision.y, born: visualNow, energy: collision.energy,
      hue: 165 + 24 * (1 - depth) });
    if (collisionPearls.length > 12) collisionPearls.shift();
    collisionGlints.push({ x: collision.x, y: collision.y, born: visualNow, energy: collision.energy, depth });
    if (collisionGlints.length > 6) collisionGlints.shift();
    lastCollisionAt = visualNow;
    oscillator.addEventListener('ended', () => disconnectCollisionVoice(engine, pearl), { once: true });
    oscillator.start();
    oscillator.stop(now + response.durationSeconds + .025);
    if (!collisionAnnounced) {
      status.textContent = 'Два фронта встретились; вода ответила короткой жемчужной нотой';
      collisionAnnounced = true;
    }
    return true;
  }

  // The visible bank answers. A ripple whose ring reaches the near shore
  // folds back as one quiet lap: a softer, shorter note than a pearl (no new
  // sustain voice, shares the collision voice pool) plus a warm returning curl
  // of light right on the shoreline. Rate-limited so a crowded surface can't
  // lap endlessly; reduced motion keeps the curl still.
  function playShoreLap(lap) {
    const engine = audio;
    const visualNow = performance.now();
    if (!engine || engine.context.state !== 'running' ||
        engine.collisionVoices.size >= MAX_COLLISION_VOICES ||
        visualNow - lastShoreAt < SHORE_RATE_LIMIT_MS) return false;
    const depth = Math.max(0, Math.min(1, lap.y / Math.max(1, height)));
    const response = music.shoreLap(lap.parentFrequency, depth, lap.energy, tuningFamily);
    const now = engine.context.currentTime;
    const oscillator = engine.context.createOscillator();
    const filter = engine.context.createBiquadFilter();
    const gain = engine.context.createGain();
    const panner = typeof engine.context.createStereoPanner === 'function' ? engine.context.createStereoPanner() : null;
    const reflectionSend = engine.reflection ? engine.context.createGain() : null;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(response.startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(response.frequency, now + response.durationSeconds * .4);
    oscillator.frequency.exponentialRampToValueAtTime(response.frequency * .99, now + response.durationSeconds);
    filter.type = 'lowpass'; filter.frequency.value = response.cutoffHz; filter.Q.value = 1.5;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(response.peakGain, now + .014);
    gain.gain.exponentialRampToValueAtTime(.0001, now + response.durationSeconds);
    oscillator.connect(filter).connect(gain);
    let output = gain;
    if (panner) {
      panner.pan.value = music.spatialPan(lap.x / Math.max(1, width));
      gain.connect(panner);
      output = panner;
    }
    output.connect(engine.master);
    if (reflectionSend) {
      reflectionSend.gain.value = music.depthReflection(depth).sendGain * .4;
      output.connect(reflectionSend).connect(engine.reflection.input);
    }
    const pearl = { oscillator, nodes: [oscillator, filter, gain, panner, reflectionSend] };
    engine.collisionVoices.add(pearl);
    canvas.dataset.pearlVoices = String(engine.collisionVoices.size);
    canvas.dataset.shoreLaps = String((Number(canvas.dataset.shoreLaps) || 0) + 1);
    shoreLapGlints.push({ x: lap.x, y: lap.y, born: visualNow, energy: lap.energy, depth });
    if (shoreLapGlints.length > 6) shoreLapGlints.shift();
    lastShoreAt = visualNow;
    oscillator.addEventListener('ended', () => disconnectCollisionVoice(engine, pearl), { once: true });
    engine.collisionVoices.delete(pearl); // lap already resigned the pool after its short fold
    oscillator.start();
    oscillator.stop(now + response.durationSeconds + .02);
    return true;
  }

  function scheduleShoreLaps(ripple, now) {
    const lap = waves.predictShore(ripple, now, {
      width, height, shoreTop: Math.max(0, Math.min(height, height * .82))
    });
    if (!lap) return;
    if (shoreTimers.has(lap.key)) return; // already planned one fold for this ripple
    const timer = setTimeout(() => {
      shoreTimers.delete(lap.key);
      playShoreLap(lap);
    }, Math.max(0, lap.at - now));
    shoreTimers.set(lap.key, timer);
  }

  // The pond reads its own score while it plays (iteration 0049). When a
  // ripple's ring first reaches a still-readable ink line, the surface
  // re-strikes one quiet anchor of that same phrase's place: a soft echo of
  // the line's own pitch at the crossing node, plus a warm glint exactly
  // there. Shares the limited echo-voice pool already used by pour/loop so a
  // crowded pond can't ring forever; rate-limited and non-recursive inside
  // addRipple (never calls addRipple). Reduced motion keeps the glint calm.
  function scheduleInkReads(ripple, now) {
    if (!audio || audio.context.state !== 'running') return;
    if (inkReadTimers.size >= MAX_ECHO_VOICES) return;
    for (const line of phraseInk) {
      const read = waves.predictInkRead(ripple, now, { ...line, life: score.inkLifeMs(reduced.matches) }, { width, height });
      if (!read) continue;
      if (inkReadSeen.has(line)) continue; // one quiet answer per readable line
      const timer = setTimeout(() => {
        inkReadTimers.delete(timer);
        if (score.inkVisibility(line, performance.now(), reduced.matches) > .02 && !inkReadSeen.has(line)) {
          playInkRead(line, read);
          inkReadSeen.add(line);
        }
      }, Math.max(0, read.at - performance.now()));
      inkReadTimers.add(timer);
    }
  }

  // One quiet re-strike of a phrase's own place as a ring passes over its ink.
  function playInkRead(line, read) {
    const engine = audio;
    const visualNow = performance.now();
    if (!engine || engine.context.state !== 'running' ||
        engine.echoVoices.size >= MAX_ECHO_VOICES ||
        visualNow - lastInkReadAt < INK_READ_RATE_LIMIT_MS) return false;
    const response = music.echoNote(read.pitch, read.ny, .14 + line.pressure * .18, 0, 1);
    const now = engine.context.currentTime;
    const oscillator = engine.context.createOscillator();
    const filter = engine.context.createBiquadFilter();
    const gain = engine.context.createGain();
    const panner = typeof engine.context.createStereoPanner === 'function' ? engine.context.createStereoPanner() : null;
    const reflectionSend = engine.reflection ? engine.context.createGain() : null;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(response.startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(response.frequency, now + response.durationSeconds * .42);
    oscillator.frequency.exponentialRampToValueAtTime(response.frequency * .992, now + response.durationSeconds);
    filter.type = 'lowpass'; filter.frequency.value = response.cutoffHz; filter.Q.value = 1.2;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(response.peakGain, now + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, now + response.durationSeconds);
    oscillator.connect(filter).connect(gain);
    let output = gain;
    if (panner) { panner.pan.value = music.spatialPan(read.nx); gain.connect(panner); output = panner; }
    output.connect(engine.master);
    if (reflectionSend) {
      reflectionSend.gain.value = music.depthReflection(read.ny).sendGain * .4;
      output.connect(reflectionSend).connect(engine.reflection.input);
    }
    const echo = { oscillator, nodes: [oscillator, filter, gain, panner, reflectionSend] };
    engine.echoVoices.add(echo);
    canvas.dataset.echoVoices = String(engine.echoVoices.size);
    canvas.dataset.peakEchoVoices = String(Math.max(Number(canvas.dataset.peakEchoVoices) || 0, engine.echoVoices.size));
    inkReadGlints.push({
      x: read.x, y: read.y, birth: read.at, born: visualNow, energy: read.energy, depth: read.ny
    });
    if (inkReadGlints.length > 8) inkReadGlints.shift();
    canvas.dataset.inkReads = String((Number(canvas.dataset.inkReads) || 0) + 1);
    lastInkReadAt = visualNow;
    oscillator.addEventListener('ended', () => {
      if (engine.echoVoices?.delete(echo)) {
        for (const node of echo.nodes) { try { node?.disconnect(); } catch {} }
        canvas.dataset.echoVoices = String(engine.echoVoices.size);
      }
    }, { once: true });
    oscillator.start();
    oscillator.stop(now + response.durationSeconds + .025);
    return true;
  }

function disconnectSkipVoice(engine, skip) {
    if (!engine.skipVoices?.delete(skip)) return;
    for (const node of skip.nodes) {
      try { node?.disconnect(); } catch {}
    }
    canvas.dataset.skipVoices = String(engine.skipVoices.size);
  }

  function playStoneSkip(contact) {
    const engine = audio;
    if (!engine || engine.context.state !== 'running' || engine.skipVoices.size >= MAX_SKIP_VOICES) return false;
    const x = contact.x * width, y = contact.y * height;
    const depth = Math.max(0, Math.min(1, contact.y));
    const response = music.stoneSkip(music.frequencyAt(contact.x), depth, contact.energy, contact.index);
    const now = engine.context.currentTime;
    const oscillator = engine.context.createOscillator();
    const filter = engine.context.createBiquadFilter();
    const gain = engine.context.createGain();
    const panner = typeof engine.context.createStereoPanner === 'function' ? engine.context.createStereoPanner() : null;
    const reflectionSend = engine.reflection ? engine.context.createGain() : null;
    oscillator.type = contact.index === 0 ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(response.startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(response.frequency, now + response.durationSeconds * .38);
    oscillator.frequency.exponentialRampToValueAtTime(response.endFrequency, now + response.durationSeconds);
    filter.type = 'lowpass'; filter.frequency.value = response.cutoffHz; filter.Q.value = 1.15;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(response.peakGain, now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + response.durationSeconds);
    oscillator.connect(filter).connect(gain);
    let output = gain;
    if (panner) {
      panner.pan.value = music.spatialPan(contact.x);
      gain.connect(panner);
      output = panner;
    }
    output.connect(engine.master);
    if (reflectionSend) {
      reflectionSend.gain.value = music.depthReflection(depth).sendGain * .38;
      output.connect(reflectionSend).connect(engine.reflection.input);
    }
    const skip = { oscillator, nodes: [oscillator, filter, gain, panner, reflectionSend] };
    engine.skipVoices.add(skip);
    canvas.dataset.skipVoices = String(engine.skipVoices.size);
    canvas.dataset.peakSkipVoices = String(Math.max(Number(canvas.dataset.peakSkipVoices) || 0, engine.skipVoices.size));
    canvas.dataset.skipEvents = String(++skipSerial);
    oscillator.addEventListener('ended', () => disconnectSkipVoice(engine, skip), { once: true });
    oscillator.start();
    oscillator.stop(now + response.durationSeconds + .025);
    addRipple(x, y, .18 + contact.energy * .24, .38 + contact.energy * .24, response.frequency, false);
    return true;
  }

  function scheduleStoneSkips(plan, now) {
    if (!plan?.contacts?.length || now - lastSkipPlanAt < SKIP_PLAN_RATE_LIMIT_MS || skipTimers.size) return false;
    const contacts = plan.contacts.slice(0, MAX_PENDING_SKIPS).map(contact => ({
      ...contact,
      x: Math.max(.03, Math.min(.97, contact.x)),
      y: Math.max(.04, Math.min(.96, contact.y)),
      at: now + contact.delayMs
    }));
    stoneFlights.push({
      born: now,
      origin: { x: plan.origin.x * width, y: plan.origin.y * height },
      contacts: contacts.map(contact => ({ ...contact, x: contact.x * width, y: contact.y * height }))
    });
    if (stoneFlights.length > 4) stoneFlights.shift();
    for (const contact of contacts) {
      const timer = setTimeout(() => {
        skipTimers.delete(timer);
        canvas.dataset.pendingSkips = String(skipTimers.size);
        playStoneSkip(contact);
      }, Math.max(0, contact.at - performance.now()));
      skipTimers.add(timer);
    }
    lastSkipPlanAt = now;
    canvas.dataset.pendingSkips = String(skipTimers.size);
    canvas.dataset.skipPlans = String((Number(canvas.dataset.skipPlans) || 0) + 1);
    if (!skipAnnounced) {
      status.textContent = 'Быстрый прямой отпуск послал камешек прыгать по воде; каждое касание тише предыдущего';
      skipAnnounced = true;
    }
    return true;
  }

  function scheduleWaveCollisions(ripple, now) {
    for (const [key, expiresAt] of collisionPairs) {
      if (expiresAt <= now) collisionPairs.delete(key);
    }
    const candidates = ripples
      .map(previous => waves.predictCollision(previous, ripple, now))
      .filter(Boolean)
      .sort((a, b) => a.at - b.at);
    for (const collision of candidates) {
      if (collisionTimers.size >= MAX_PENDING_COLLISIONS) break;
      if (collisionPairs.has(collision.key)) continue;
      collisionPairs.set(collision.key, collision.at + 1200);
      const timer = setTimeout(() => {
        collisionTimers.delete(collision.key);
        playCollisionPearl(collision);
      }, Math.max(0, collision.at - performance.now()));
      collisionTimers.set(collision.key, timer);
    }
  }

  function addRipple(x, y, pressure, strength = 1, frequency = pitchAt(x), reactive = true) {
    const born = performance.now();
    const ripple = waves.createWave({ id: ++rippleSerial, x, y, born, pressure, strength, frequency });
    if (!ripple) return;
    if (reactive) {
      scheduleWaveCollisions(ripple, born);
      scheduleShoreLaps(ripple, born);
      scheduleInkReads(ripple, born);
    }
    ripples.push({ ...ripple, hue: 152 + 30 * (1 - y / height) });
    // A note stirs the reading: the whole surface keeps a long quiet afterglow near the site.
    tidalStirs = tide.stir(tidalStirs, x / Math.max(1, width), y / Math.max(1, height), .12 + Math.min(.5, pressure * .7));
    // Light answers where music is born: near motes gather a warmer pool.
    motes = caustic.gatherMotes(motes, x / Math.max(1, width), y / Math.max(1, height), .2 + Math.min(.8, pressure * 1.1), caustic.WARMTH_RADIUS_01 * 1.35);
    canvas.dataset.rippleEvents = String(rippleSerial);
    if (ripples.length > 32) ripples.shift();
  }

  function addSplash(x, y, intensity, dx, dy) {
    if (intensity < .5) return;
    splashes.push({
      x, y, born: performance.now(), intensity,
      angle: Math.atan2(dy, dx), hue: 152 + 30 * (1 - y / height)
    });
    if (splashes.length > 14) splashes.shift();
  }

  // A fresh accent shows the drop as it is heard: a small corona whose
  // shape, brightness and reach honestly follow note depth and force.
  function spawnDropCorona(x, y, intensity, directionX = 0) {
    const spray = music.dropSpray(x / Math.max(1, width), y / Math.max(1, height), directionX, intensity);
    if (!spray?.rays?.length) return;
    coronas.push({ x, y, spray, born: performance.now() });
    if (coronas.length > 6) coronas.shift();
    canvas.dataset.coronaEvents = String(coronas.length);
  }

  function playScoreEcho(memory, crossing, now) {
    const anchors = score.melodyAnchors(memory, MAX_ECHO_VOICES);
    if (!anchors.length) return false;
    if (echoTimers.size >= MAX_ECHO_VOICES) return false;
    echoSerial += anchors.length;
    anchors.forEach((anchor, index) => {
      const response = music.echoNote(anchor.pitch, anchor.y, .2 + memory.pressure * .3, index, anchors.length);
      const at = now + response.delayMs;
      const timer = setTimeout(() => {
        echoTimers.delete(timer);
        canvas.dataset.pendingEchoes = String(echoTimers.size);
        playEchoNote(memory, anchor, crossing, index, response);
      }, Math.max(0, at - performance.now()));
      echoTimers.add(timer);
    });
    canvas.dataset.pendingEchoes = String(echoTimers.size);
    canvas.dataset.melodicEchoes = String((Number(canvas.dataset.melodicEchoes) || 0) + 1);
    return true;
  }

  function playEchoNote(memory, anchor, crossing, index, response) {
    const engine = audio;
    if (!engine || engine.context.state !== 'running' ||
        engine.echoVoices.size >= MAX_ECHO_VOICES) return;
    const x = anchor.x * width, y = anchor.y * height;
    const depth = Math.max(0, Math.min(1, anchor.y));
    const now = engine.context.currentTime;
    const oscillator = engine.context.createOscillator();
    const filter = engine.context.createBiquadFilter();
    const gain = engine.context.createGain();
    const panner = typeof engine.context.createStereoPanner === 'function' ? engine.context.createStereoPanner() : null;
    const reflectionSend = engine.reflection ? engine.context.createGain() : null;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(response.startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(response.frequency, now + response.durationSeconds * .42);
    oscillator.frequency.exponentialRampToValueAtTime(response.frequency * .992, now + response.durationSeconds);
    filter.type = 'lowpass'; filter.frequency.value = response.cutoffHz; filter.Q.value = 1.3;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(response.peakGain, now + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, now + response.durationSeconds);
    oscillator.connect(filter).connect(gain);
    let output = gain;
    if (panner) {
      panner.pan.value = music.spatialPan(anchor.x);
      gain.connect(panner);
      output = panner;
    }
    output.connect(engine.master);
    if (reflectionSend) {
      reflectionSend.gain.value = music.depthReflection(depth).sendGain * .46;
      output.connect(reflectionSend).connect(engine.reflection.input);
    }
    const echo = { oscillator, nodes: [oscillator, filter, gain, panner, reflectionSend] };
    engine.echoVoices.add(echo);
    canvas.dataset.echoVoices = String(engine.echoVoices.size);
    canvas.dataset.peakEchoVoices = String(Math.max(Number(canvas.dataset.peakEchoVoices) || 0, engine.echoVoices.size));
    // A small non-reactive ripple marks each sounded anchor on the water.
    addRipple(x, y, .16 + memory.pressure * .2, .34 + response.peakGain * 8, response.frequency, false);
    if (!scoreEchoAnnounced) {
      status.textContent = 'Жест пересёк водный след; сохранённая фраза мягко отозвалась мелодией';
      scoreEchoAnnounced = true;
    }
    oscillator.addEventListener('ended', () => disconnectEchoVoice(engine, echo), { once: true });
    oscillator.start();
    oscillator.stop(now + response.durationSeconds + .025);
    if (index === 0) {
      scoreEchoes.push({ memory, crossing, segmentIndex: crossing.segmentIndex, born: performance.now() });
      if (scoreEchoes.length > 8) scoreEchoes.shift();
    }
  }

  function disconnectEchoVoice(engine, echo) {
    if (!engine.echoVoices?.delete(echo)) return;
    for (const node of echo.nodes) {
      try { node?.disconnect(); } catch {}
    }
    canvas.dataset.echoVoices = String(engine.echoVoices.size);
  }

  function tryScoreResonance(contact, point, now) {
    if (!contact.sounding || contact.distanceTraveled < 22 || now - contact.born < 80) return;
    const from = { x: contact.resonanceX / Math.max(1, width), y: contact.resonanceY / Math.max(1, height) };
    const to = { x: point.x / Math.max(1, width), y: point.y / Math.max(1, height) };
    if (Math.hypot(point.x - contact.resonanceX, point.y - contact.resonanceY) < 7) return;
    contact.resonanceX = point.x; contact.resonanceY = point.y;
    const eligible = memories.filter(memory =>
      !contact.resonatedMemories.has(memory) && now - (echoCooldowns.get(memory) ?? -Infinity) >= ECHO_COOLDOWN_MS
    );
    const crossing = score.findCrossedMemory(eligible, from, to, now, {
      width, height, radiusPx: Math.max(14, Math.min(22, Math.min(width, height) * .045)), reducedMotion: reduced.matches
    });
    if (!crossing || !playScoreEcho(crossing.memory, crossing, now)) return;
  }

  function captureScoreSample(contact, x, y, now, pressure, force = false) {
    if (!contact.sounding) return;
    const mappedPitch = Number.isFinite(contact.mapping?.frequency)
      ? music.normalizedAtFrequency(contact.mapping.frequency)
      : Number.isFinite(contact.pitchX) ? contact.pitchX : x / Math.max(1, width);
    const sample = {
      x: Math.max(0, Math.min(1, x / Math.max(1, width))),
      y: Math.max(0, Math.min(1, y / Math.max(1, height))),
      pitch: mappedPitch,
      at: now,
      pressure
    };
    const previous = contact.scoreSamples.at(-1);
    const distance = previous ? Math.hypot(sample.x - previous.x, sample.y - previous.y) : Infinity;
    if (!force && previous && distance < .012 && now - previous.at < 90) return;
    contact.scoreSamples.push(sample);
    if (contact.scoreSamples.length > 96) {
      contact.scoreSamples = contact.scoreSamples.filter((point, index, all) => index === 0 || index === all.length - 1 || index % 2 === 0);
    }
  }

  function rememberContact(contact, x, y, now, pressure) {
    if (!contact.sounding) return;
    captureScoreSample(contact, x, y, now, pressure, true);
    const previousMotifs = score.groupMotifs(memories).length;
    memories = score.append(memories, score.createMemory(contact.scoreSamples, now));
    canvas.dataset.scoreMemories = String(memories.length);
    storeScorePhrase();
    recordPhraseInk();
    const motifCount = score.groupMotifs(memories).length;
    if (previousMotifs > 0 && motifCount > previousMotifs) {
      status.textContent = 'Пауза отделила новый мотив; вода не связывает его с предыдущим';
    } else if (!scoreAnnounced) {
      status.textContent = 'Отпущенная нота остаётся на воде; сыграйте ещё, чтобы сложить короткую фразу';
      scoreAnnounced = true;
    }
  }

  function start(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const p = point(event), now = eventTime(event);
    const pressureAvailable = music.hasExpressivePressure(event.pointerType, event.pressure);
    const pressure = pressureOf(event, pressureAvailable);
    const attack = music.attackIntensity({ pressure, pressureAvailable });
    const engine = audioLifecycle.activateFromGesture();
    const sounding = startVoice(event.pointerId, p.x, p.y, pressure, pitchAt(p.x), attack, engine, phraseNoteIndex);
    if (sounding) phraseNoteIndex += 1;
    pointers.set(event.pointerId, {
      ...p, pressure, pressureAvailable, attack, splashPlayed: false, sounding, born: now, lastMotion: now, movedAt: now, motionSpeed: 0,
      originX: p.x, originY: p.y, materialBias: null,
      pitchX: p.x / Math.max(1, width), mapping: null, precisionActive: false, precisionAmount: 0, precisionOriginX: null,
      currentAnnounced: false, sampledX: p.x, sampledY: p.y, sampledAt: now,
      eddy: null, eddyVisual: null, eddyPitchX: null, eddyDepthY: null,
      distanceTraveled: 0, movedDuringHold: 0, resonanceX: p.x, resonanceY: p.y, resonatedMemories: new Set(),
      scoreSamples: sounding ? [{ x: p.x / Math.max(1, width), y: p.y / Math.max(1, height), pitch: p.x / Math.max(1, width), at: now, pressure: attack }] : []
    });
    addRipple(p.x, p.y, attack);
    spawnDropCorona(p.x, p.y, attack);
    document.body.classList.add('has-played');
    markPondPlayed();
    const chordSize = [...pointers.values()].filter(pointer => pointer.sounding).length;
    if (!sounding) status.textContent = `Пруд удерживает до ${MAX_VOICES} голосов; отпустите касание для следующей ноты`;
    else if (chordSize > 1) status.textContent = `Аккорд: ${chordSize} независимых ${voiceWord(chordSize)}`;
    else if (!announced) { status.textContent = 'Вода зазвучала; ведите касание, чтобы менять высоту и глубину'; announced = true; }
    try { canvas.setPointerCapture?.(event.pointerId); } catch {}
  }

  function glide(event) {
    const active = pointers.get(event.pointerId);
    if (!active) return;
    const coalesced = event.getCoalescedEvents?.();
    const samples = coalesced?.length ? coalesced : [event];
    for (const sample of samples) {
      const p = point(sample), now = eventTime(sample);
      const dx = p.x - active.sampledX, dy = p.y - active.sampledY;
      const distance = Math.hypot(dx, dy);
      const threshold = reduced.matches ? 28 : 9;
      if (distance >= threshold || now - active.sampledAt > 55) {
        const speed = distance / Math.max(8, now - active.sampledAt);
        trails.push({ x: p.x, y: p.y, fromX: active.sampledX, fromY: active.sampledY, born: now,
          pressure: pressureOf(sample), speed: Math.min(speed, 1.5), hue: 152 + 30 * (1 - p.y / height) });
        if (trails.length > (reduced.matches ? 24 : 110)) trails.shift();
        active.sampledX = p.x; active.sampledY = p.y; active.sampledAt = now;
      }
      const moved = Math.hypot(p.x - active.x, p.y - active.y);
      if (moved > .8) {
        const heldBeforeMovement = Math.max(0, now - active.lastMotion);
        const previousRawX = active.x / Math.max(1, width);
        active.distanceTraveled += moved;
        active.movedDuringHold += moved;
        const elapsed = Math.max(8, now - active.movedAt);
        active.motionSpeed = music.movementSpeed(moved, elapsed, Math.max(1, Math.min(width, height)));
        const brushDistance = Math.hypot(p.x - active.originX, p.y - active.originY);
        if (active.materialBias === null && now - active.born <= music.ATTACK_WINDOW_MS &&
            brushDistance >= Math.max(8, Math.min(width, height) * .018)) {
          active.materialBias = music.initialBrushBias(
            p.x - active.originX, p.y - active.originY, active.motionSpeed
          );
        }
        if (!active.eddy && heldBeforeMovement >= gesture.EDDY_ARM_HOLD_MS) {
          active.eddy = gesture.beginEddy(active.x, active.y, now);
        }
        const hadActiveEddy = Boolean(active.eddy?.active);
        const eddy = active.eddy ? gesture.updateEddy(active.eddy, {
          x: p.x, y: p.y, now, span: Math.max(1, Math.min(width, height)), speedPerSecond: active.motionSpeed
        }) : null;
        active.eddy = eddy?.state ?? null;
        active.eddyVisual = active.eddy && (eddy.active || eddy.capturesMotion) ? eddy : null;
        if (hadActiveEddy && !eddy?.active) {
          clearVoiceEddy(event.pointerId);
          active.eddyPitchX = null; active.eddyDepthY = null;
        }
        if (eddy?.activated) {
          active.eddyPitchX = Number.isFinite(active.mapping?.frequency)
            ? music.normalizedAtFrequency(active.mapping.frequency)
            : active.pitchX;
          active.eddyDepthY = active.eddy.centerY;
          addRipple(active.eddy.centerX, active.eddy.centerY, active.pressure, .48,
            active.mapping?.frequency ?? pitchAt(active.eddy.centerX));
          // A real circle raised a real eddy: its whisper may follow later.
          earnedEddyHint = true;
          if (!eddyAnnounced) {
            status.textContent = 'Малый круг поднял водоворот; звук мягко дрожит, широкий взмах сразу его распустит';
            eddyAnnounced = true;
            textureAnnounced = true;
          }
        }
        if (eddy?.active) setVoiceEddy(event.pointerId, gesture.eddyExpression(eddy.intensity, eddy.direction));
        canvas.dataset.eddyVoices = String([...pointers.values()].filter(pointer => pointer.eddy?.active).length);

        if (heldBeforeMovement >= music.PRECISION_HOLD_MS && Number.isFinite(active.mapping?.frequency)) {
          active.pitchX = music.normalizedAtFrequency(active.mapping.frequency);
        }
        const circularCapture = Boolean(eddy?.capturesMotion);
        const steering = music.precisionMotion({
          previousRawX,
          rawX: p.x / Math.max(1, width),
          pitchX: active.pitchX,
          originRawX: circularCapture ? previousRawX : active.precisionOriginX,
          holdMilliseconds: heldBeforeMovement,
          speedPerSecond: circularCapture ? Math.min(active.motionSpeed, .18) : active.motionSpeed,
          active: active.precisionActive
        });
        active.pitchX = eddy?.active && Number.isFinite(active.eddyPitchX) ? active.eddyPitchX : steering.pitchX;
        active.precisionActive = eddy?.active || steering.active;
        active.precisionAmount = eddy?.active ? Math.max(.72, steering.amount) : steering.amount;
        active.precisionOriginX = eddy?.active ? previousRawX : steering.originRawX;
        if (steering.entered && !precisionAnnounced && !eddy?.active) {
          status.textContent = 'Медленное движение ведёт высоту тонко вдоль ближайшего течения';
          precisionAnnounced = true;
        } else if (steering.released && !freedomAnnounced) {
          status.textContent = 'Широкий взмах сразу освободил непрерывное скольжение';
          freedomAnnounced = true;
        }
        active.lastMotion = now; active.movedAt = now;
        const reportsPressure = music.hasExpressivePressure(sample.pointerType, sample.pressure);
        if (reportsPressure) active.pressureAvailable = true;
        const samplePressure = pressureOf(sample, active.pressureAvailable);
        if (now - active.born <= music.ATTACK_WINDOW_MS) {
          const attack = music.attackIntensity({
            pressure: samplePressure,
            speedPerSecond: active.motionSpeed,
            pressureAvailable: active.pressureAvailable
          });
          if (attack > active.attack) {
            active.attack = attack;
            if (active.scoreSamples[0]) active.scoreSamples[0].pressure = attack;
            if (accentVoice(event.pointerId, attack) && attack >= .5 && !active.splashPlayed) {
              addRipple(p.x, p.y, attack, .42 + attack * .55,
                active.mapping?.frequency ?? pitchAt(p.x));
              addSplash(p.x, p.y, attack, p.x - active.x, p.y - active.y);
              active.splashPlayed = true;
              if (!dynamicsAnnounced) {
                status.textContent = 'Быстрый взмах поднял яркий всплеск; спокойное касание останется мягким';
                dynamicsAnnounced = true;
              }
            }
          }
        }
      }
      active.x = p.x; active.y = p.y;
      active.pressure = pressureOf(sample, active.pressureAvailable);
      active.mapping = {
        ...music.mapPitch(active.pitchX, 0, active.motionSpeed, tuningFamily),
        precision: active.precisionAmount
      };
      const scorePressure = active.pressureAvailable ? active.pressure : active.attack;
      captureScoreSample(active, p.x, p.y, now, scorePressure);
      tryScoreResonance(active, p, now);
      const audioX = active.eddy?.active ? active.eddy.centerX : p.x;
      const audioY = active.eddy?.active ? active.eddyDepthY : p.y;
      moveVoice(event.pointerId, audioX, audioY, active.pressure, active.mapping.frequency, active.materialBias ?? 0);
    }
  }

  function end(event) {
    const active = pointers.get(event.pointerId);
    if (!active) return;
    const now = eventTime(event), pressure = active.pressureAvailable ? active.pressure : active.attack;
    const skipPlan = event.type === 'pointerup' && active.sounding
      ? gesture.skippingStone([...active.scoreSamples, {
        x: active.x / Math.max(1, width), y: active.y / Math.max(1, height), at: now
      }], now, { width, height })
      : null;
    addRipple(active.x, active.y, pressure, .55,
      active.mapping?.frequency ?? pitchAt(active.x));
    rememberContact(active, active.x, active.y, now, pressure);
    endVoice(event.pointerId);
    pointers.delete(event.pointerId);
    canvas.dataset.eddyVoices = String([...pointers.values()].filter(pointer => pointer.eddy?.active).length);
    if (skipPlan) scheduleStoneSkips(skipPlan, now);
    // A quick, calm press-release counts as a tap on the surface. Keep a
    // short rhythm history so a soft double-tap can wake a phrase to circle.
    const heldMsForTap = Math.max(0, now - active.born);
    const movedForTap = active.movedDuringHold ?? 0;
    if (!skipPlan && heldMsForTap <= score.REHEARSAL_TAP_HOLD_MS && movedForTap <= score.REHEARSAL_TAP_MOVE ) {
      tapHistory.push({ at: now, x: active.x / Math.max(1, width), y: active.y / Math.max(1, height), moved: movedForTap });
      const rehearsal = score.rehearsalDecision(tapHistory, phraseInk, now, reduced.matches);
      if (rehearsal && rehearsal.line && loopingLine !== rehearsal.line) {
        tapHistory = tapHistory.filter(tap => now - tap.at <= score.REHEARSAL_WINDOW_MS);
        startPourLoop(rehearsal.line);
        canvas.dataset.rehearsalSummon = '1';
      }
      tapHistory = tapHistory.slice(-score.REHEARSAL_MAX_TAPS);
    }

    // A finished gesture may carry its earned lesson: the eddy it raised,
    // or a fast straight release that became a skipping stone.
    if (pondHasPlayed) {
      const events = [];
      if (earnedEddyHint) { events.push({ kind: 'eddy', happened: true }); earnedEddyHint = false; }
      if (skipPlan) events.push({ kind: 'stone', happened: true });
      const heldMs = Math.max(0, now - active.born);
      if (!skipPlan && heldMs >= score.WHISPER_HOLD_MS && active.movedDuringHold < 8) {
        events.push({ kind: 'settle', happened: true });
      }
      // Born exactly at release time so the very next frame can draw it.
      if (events.length) offerWhisper(events, now);
    }
  }

  function keyboardPoint() { return { x: keyboard.x * width, y: keyboard.y * height }; }

  canvas.addEventListener('keydown', event => {
    const movement = { ArrowLeft: [-.025, 0], ArrowRight: [.025, 0], ArrowUp: [0, -.035], ArrowDown: [0, .035] }[event.key];
    if (movement) {
      event.preventDefault();
      const previousX = keyboard.x, previousY = keyboard.y;
      const now = performance.now(), heldBeforeMovement = Math.max(0, now - keyboard.lastMotion);
      keyboard.x = Math.max(.04, Math.min(.96, keyboard.x + movement[0]));
      keyboard.y = Math.max(.08, Math.min(.9, keyboard.y + movement[1]));
      const p = keyboardPoint();
      const moved = Math.hypot((keyboard.x - previousX) * width, (keyboard.y - previousY) * height);
      keyboard.motionSpeed = music.movementSpeed(moved, Math.max(8, heldBeforeMovement), Math.max(1, Math.min(width, height)));
      if (keyboard.sounding && keyboard.materialBias === null && now - keyboard.born <= music.ATTACK_WINDOW_MS) {
        keyboard.materialBias = music.initialBrushBias(
          movement[0] * width, movement[1] * height, keyboard.motionSpeed
        );
      }
      if (!keyboard.sounding) {
        keyboard.pitchX = keyboard.x;
        keyboard.precisionActive = false;
        keyboard.precisionAmount = 0;
        keyboard.precisionOriginX = null;
      } else if (movement[0]) {
        if (heldBeforeMovement >= music.PRECISION_HOLD_MS && Number.isFinite(keyboard.mapping?.frequency)) {
          keyboard.pitchX = music.normalizedAtFrequency(keyboard.mapping.frequency);
        }
        const steering = music.precisionMotion({
          previousRawX: previousX,
          rawX: keyboard.x,
          pitchX: keyboard.pitchX,
          originRawX: keyboard.precisionOriginX,
          holdMilliseconds: heldBeforeMovement,
          speedPerSecond: keyboard.motionSpeed,
          active: keyboard.precisionActive
        });
        keyboard.pitchX = steering.pitchX;
        keyboard.precisionActive = steering.active;
        keyboard.precisionAmount = steering.amount;
        keyboard.precisionOriginX = steering.originRawX;
      }
      keyboard.lastMotion = now; keyboard.currentAnnounced = false;
      if (keyboard.sounding) {
        keyboard.distanceTraveled += Math.hypot(movement[0] * width, movement[1] * height);
        keyboard.mapping = { ...music.mapPitch(keyboard.pitchX, 0, keyboard.motionSpeed, tuningFamily), precision: keyboard.precisionAmount };
        moveVoice('keyboard', p.x, p.y, .48, keyboard.mapping.frequency, keyboard.materialBias ?? 0);
        captureScoreSample(keyboard, p.x, p.y, now, .48);
        tryScoreResonance(keyboard, p, now);
        trails.push({ x: p.x, y: p.y, fromX: p.x - movement[0] * width, fromY: p.y - movement[1] * height, born: now, pressure: .48, speed: .55, hue: 152 + 30 * (1 - p.y / height) });
      }
    }
    if ((event.code === 'Space' || event.key === 'Enter') && !event.repeat && !keyboard.sounding) {
      event.preventDefault();
      const now = performance.now();
      keyboard.sounding = true; keyboard.born = now; keyboard.lastMotion = now; keyboard.motionSpeed = 0; keyboard.currentAnnounced = false;
      keyboard.pitchX = keyboard.x; keyboard.mapping = null; keyboard.materialBias = null; keyboard.precisionActive = false; keyboard.precisionAmount = 0; keyboard.precisionOriginX = null;
      const p = keyboardPoint();
      keyboard.distanceTraveled = 0; keyboard.resonanceX = p.x; keyboard.resonanceY = p.y; keyboard.resonatedMemories = new Set();
      keyboard.scoreSamples = [{ x: keyboard.x, y: keyboard.y, pitch: keyboard.pitchX, at: now, pressure: .48 }];
      const engine = audioLifecycle.activateFromGesture();
      keyboard.sounding = startVoice('keyboard', p.x, p.y, .48, pitchAt(p.x), .48, engine, phraseNoteIndex);
      if (keyboard.sounding) phraseNoteIndex += 1;
      if (!keyboard.sounding) keyboard.scoreSamples = [];
      addRipple(p.x, p.y, .48);
      spawnDropCorona(p.x, p.y, .48);
      document.body.classList.add('has-played'); markPondPlayed(); status.textContent = 'Звук воды звучит; стрелками меняйте высоту и глубину';
    }
  });
  canvas.addEventListener('keyup', event => {
    if ((event.code === 'Space' || event.key === 'Enter') && keyboard.sounding) {
      event.preventDefault();
      const p = keyboardPoint(), now = performance.now();
      rememberContact(keyboard, p.x, p.y, now, .48);
      const heldMs = Math.max(0, now - keyboard.born), moved = keyboard.distanceTraveled;
      keyboard.sounding = false; endVoice('keyboard');
      addRipple(p.x, p.y, .48, .55, keyboard.mapping?.frequency ?? pitchAt(p.x));
      // The keyboard voice earns the settle lesson by the same measure as
      // a held touch: a long quiet stay before its first movement.
      if (heldMs >= score.WHISPER_HOLD_MS && moved < 8) offerWhisper([{ kind: 'settle', happened: true }], now);
    }
  });
  canvas.addEventListener('blur', () => {
    if (keyboard.sounding) {
      const p = keyboardPoint();
      rememberContact(keyboard, p.x, p.y, performance.now(), .48);
      keyboard.sounding = false; endVoice('keyboard');
    }
  });

  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', glide);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', event => {
    const active = pointers.get(event.pointerId);
    if (active) rememberContact(active, active.x, active.y, performance.now(), active.pressure);
    endVoice(event.pointerId); pointers.delete(event.pointerId);
    canvas.dataset.eddyVoices = String([...pointers.values()].filter(pointer => pointer.eddy?.active).length);
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') audioLifecycle.background('visibility-hidden');
    else audioLifecycle.foreground();
  });
  addEventListener('pagehide', () => audioLifecycle.background('pagehide'));
  addEventListener('pageshow', () => {
    audioLifecycle.foreground();
    resize();
  });

  function drawMotes(now) {
    motes = caustic.updateMotes(motes, Math.max(0, (now - last) / 1000));
    const moteBudget = budget.style(waterBudget, 'motes');
    const drawCount = Math.max(2, Math.round(motes.length * moteBudget));
    ctx.save();
    for (let index = 0; index < drawCount; index += 1) {
      const mote = motes.at(index);
      if (!mote) continue;
      const visual = caustic.moteVisual(mote, now, reduced.matches);
      if (visual.alpha <= .012) continue;
      const x = visual.x * width, y = visual.y * height;
      const radius = Math.max(.7, visual.size * Math.max(1.2, Math.min(width, height) * .0032));
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.2);
      glow.addColorStop(0, `hsla(${150 + visual.y * 18} 70% 92% / ${visual.alpha * .5})`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, radius * 3.2, 0, Math.PI * 2); ctx.fill();
      if (visual.alpha > .05) {
        ctx.fillStyle = `hsla(${150 + visual.y * 18} 72% 94% / ${Math.min(.8, visual.alpha)})`;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }  function water(now) {
    const t = now * .0001;
    const gradient = ctx.createRadialGradient(width * .55, height * .38, 10, width * .52, height * .48, Math.max(width, height) * .78);
    gradient.addColorStop(0, '#163b38'); gradient.addColorStop(.38, '#0b2928'); gradient.addColorStop(1, '#041313');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = .11;
    for (let i = 0; i < 7; i++) {
      const y = height * (.16 + i * .105) + Math.sin(t * (7 + i) + i) * 8;
      ctx.beginPath();
      for (let x = -20; x <= width + 20; x += 18) {
        const yy = y + Math.sin(x * .012 + t * (17 + i * 2)) * (3 + i * .45);
        x === -20 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = i % 2 ? '#8cc6b4' : '#d8c88f'; ctx.lineWidth = .7; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawTide(now) {
    const tideState = tide.updateTide(tidalSwells, tidalStirs, Math.max(0, (now - last) / 1000));
    tidalSwells = tideState.swells;
    tidalStirs = tideState.stirs;
    const field = tide.tideVisual(tidalSwells, tidalStirs, now, reduced.matches);
    // Under load the tide is the broadest cheapest-to-temper layer: ease the
    // field down so the pond keeps its mineral depth without painting every
    // swell at full brilliance.
    const tideBudget = budget.style(waterBudget, 'tide');
    const drawCount = Math.max(1, Math.round(field.length * tideBudget));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let index = 0; index < drawCount; index += 1) {
      const glow = field.at(index);
      if (!glow) continue;
      const radius = Math.max(24, glow.size * Math.max(width, height));
      const ry = radius * glow.spread;
      const cx = glow.x * width, cy = glow.y * height;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(radius, ry));
      const hue = Number.isFinite(glow.hue) ? glow.hue : 148 + glow.tint * 26;
      gradient.addColorStop(0, `hsla(${hue} 44% 74% / ${glow.alpha * .5})`);
      gradient.addColorStop(.4, `hsla(${hue + 8} 40% 62% / ${glow.alpha * .2})`);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.ellipse(cx, cy, radius, ry, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawTrail(mark, now) {
    const age = Math.max(0, (now - mark.born) / 1000), life = reduced.matches ? .34 : 1.15;
    if (age > life) return false;
    const fade = Math.pow(1 - age / life, 1.8);
    const width = 1.2 + mark.pressure * 4 + mark.speed * 1.8;
    const dx = mark.x - mark.fromX, dy = mark.y - mark.fromY;
    const length = Math.max(1, Math.hypot(dx, dy)), nx = -dy / length, ny = dx / length;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(mark.fromX + nx * width * side, mark.fromY + ny * width * side * .35);
      ctx.quadraticCurveTo((mark.fromX + mark.x) / 2 + nx * width * side * 1.5,
        (mark.fromY + mark.y) / 2 + ny * width * side * 1.5, mark.x + nx * width * side, mark.y + ny * width * side);
      ctx.strokeStyle = `hsla(${mark.hue + side * 8} 70% 78% / ${fade * .33})`;
      ctx.lineWidth = Math.max(.6, width * .27); ctx.stroke();
    }
    return true;
  }

  function drawStoneFlight(flight, now) {
    const lastContact = flight.contacts.at(-1);
    if (!lastContact || now > lastContact.at + 360) return false;
    if (reduced.matches) return true;
    let from = flight.origin, startsAt = flight.born;
    for (const contact of flight.contacts) {
      if (now < startsAt) break;
      const duration = Math.max(1, contact.at - startsAt);
      const progress = Math.max(0, Math.min(1, (now - startsAt) / duration));
      const dx = contact.x - from.x, dy = contact.y - from.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / distance, ny = dx / distance;
      const arc = Math.sin(progress * Math.PI) * Math.min(13, distance * .13) * (contact.index % 2 ? -1 : 1);
      const x = from.x + dx * progress + nx * arc;
      const y = from.y + dy * progress + ny * arc;
      const fade = now <= contact.at ? 1 : Math.max(0, 1 - (now - contact.at) / 180);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo((from.x + contact.x) * .5 + nx * arc * 1.35,
        (from.y + contact.y) * .5 + ny * arc * 1.35, contact.x, contact.y);
      ctx.strokeStyle = `hsla(${174 + contact.index * 5} 54% 78% / ${fade * .13})`;
      ctx.lineWidth = .75; ctx.stroke();
      if (now <= contact.at) {
        const angle = Math.atan2(dy, dx);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 12);
        glow.addColorStop(0, `hsla(${184 + contact.index * 4} 68% 91% / ${.36 + contact.energy * .28})`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `hsla(${172 + contact.index * 4} 45% 88% / ${.5 + contact.energy * .32})`;
        ctx.beginPath(); ctx.ellipse(x, y, 4.8 - contact.index * .6, 1.7, angle, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      if (now <= contact.at) return true;
      from = contact; startsAt = contact.at;
    }
    return true;
  }

  function drawRipple(r, now) {
    const age = Math.max(0, (now - r.born) / 1000), life = (reduced.matches ? .55 : 2.7) * (.7 + r.strength * .3);
    if (age > life) return false;
    const fade = Math.pow(1 - age / life, 1.7) * r.strength;
    const spread = reduced.matches ? 34 : 24 + age * (96 + r.pressure * 52);
    // The frame budget eases the ring count down under load: the outermost
    // rings are the cheapest to spare while the core glow and first ring
    // keep the gesture readable.
    const ringBudget = budget.style(waterBudget, 'rippleRings');
    const rings = Math.max(0, Math.min(3, Math.round((reduced.matches ? 1 : 3) * ringBudget)));
    const glow = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, Math.max(8, spread * .45));
    glow.addColorStop(0, `hsla(${r.hue} 72% 82% / ${fade * .48})`);
    glow.addColorStop(.25, `hsla(${r.hue + 18} 68% 66% / ${fade * .17})`); glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(r.x, r.y, spread * .48, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < rings; i++) {
      const radius = Math.max(2, spread - i * 18);
      ctx.beginPath(); ctx.ellipse(r.x, r.y, radius, radius * .42, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${r.hue + i * 7} 70% ${78 - i * 7}% / ${fade * (.68 - i * .13)})`;
      ctx.lineWidth = Math.max(.7, 1.8 - age * .35 - i * .2); ctx.stroke();
    }
    return true;
  }

  function drawCollisionPearl(pearl, now) {
    const age = Math.max(0, (now - pearl.born) / 1000);
    const life = reduced.matches ? .42 : .76;
    if (age > life) return false;
    const progress = age / life;
    const fade = Math.pow(1 - progress, 1.8) * (.48 + pearl.energy * .42);
    const radius = reduced.matches ? 5.5 : 3.5 + Math.sin(progress * Math.PI) * (5 + pearl.energy * 4);
    const glow = ctx.createRadialGradient(pearl.x, pearl.y, 0, pearl.x, pearl.y, radius * 3.2);
    glow.addColorStop(0, `hsla(${pearl.hue + 22} 78% 92% / ${fade})`);
    glow.addColorStop(.22, `hsla(${pearl.hue} 72% 78% / ${fade * .48})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(pearl.x, pearl.y, radius * 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `hsla(${pearl.hue + 18} 70% 94% / ${fade * .92})`;
    ctx.beginPath();
    ctx.ellipse(pearl.x, pearl.y, Math.max(1.2, radius * .52), Math.max(.8, radius * .28), -.28, 0, Math.PI * 2);
    ctx.fill();
    return true;
  }

  // The shower of the meeting: the collision also throws a short bounded
  // flare of light on the water itself, resting right on the node (under the
  // pearl) and following depth/energy. Budget-aware: it yields to the same
  // eased tide the shell measures, and reduced motion keeps a calm still
  // glow with no expansion. Pure timing/colour comes from pond-waves.
  function drawCollisionGlint(glint, now) {
    const tideGate = budget.style(waterBudget, 'ink');
    if (tideGate <= 0.02) return true; // keep the lifetime ticking, stay quiet
    const flare = waves.collisionGlint(glint.energy, glint.depth, now, glint.born, reduced.matches);
    if (flare.alpha <= 0 || flare.radius <= 0) return flare.progress < 1;
    const pxRadius = flare.radius * Math.max(18, Math.min(30, Math.min(width, height) * .05));
    const light = flare.alpha;
    const glow = ctx.createRadialGradient(glint.x, glint.y, 0, glint.x, glint.y, pxRadius * 2.6);
    glow.addColorStop(0, `hsla(${165 + 30 * flare.warmth} 80% 90% / ${light})`);
    glow.addColorStop(.4, `hsla(${165 + 26 * flare.warmth} 74% 84% / ${light * .5})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(glint.x, glint.y, pxRadius * 2.6, 0, Math.PI * 2); ctx.fill();
    return flare.progress < 1;
  }

  // The bank's lapping answer: a warm return curl at the shoreline (iteration
  // 0047). Softer and wider than the collision flare; reduced motion keeps a
  // calm still glow. Pure timing/colour from pond-waves.shoreFold.
  function drawShoreLap(lap, now) {
    const tideGate = budget.style(waterBudget, 'ink');
    if (tideGate <= 0.02) return true;
    const fold = waves.shoreFold(lap.energy, lap.depth, now, lap.born, reduced.matches);
    if (fold.alpha <= 0 || fold.radius <= 0) return fold.progress < 1;
    const pxRadius = fold.radius * Math.max(20, Math.min(34, Math.min(width, height) * .055));
    const light = fold.alpha;
    const y = lap.y;
    const glow = ctx.createRadialGradient(lap.x, y, 0, lap.x, y, pxRadius * 2.4);
    glow.addColorStop(0, `hsla(${172 + 26 * (fold.warmth - .7)} 76% 84% / ${light * .7})`);
    glow.addColorStop(.5, `hsla(${172 + 20 * (fold.warmth - .7)} 70% 78% / ${light * .32})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(lap.x, y, pxRadius * 2.4, 0, Math.PI * 2); ctx.fill();
    return fold.progress < 1;
  }

  // The pool answers as a ring passes over its ink (iteration 0049): a warm
  // crossing glint exactly where the phrase was re-read. Budget-aware and
  // reduced-motion calm like the other glints.
  function drawInkRead(glint, now) {
    const tideGate = budget.style(waterBudget, 'ink');
    if (tideGate <= 0.02) return true; // keep the lifetime ticking, stay quiet
    const flare = waves.collisionGlint(glint.energy, glint.depth, now, glint.born, reduced.matches);
    if (flare.alpha <= 0 || flare.radius <= 0) return flare.progress < 1;
    const pxRadius = flare.radius * Math.max(22, Math.min(36, Math.min(width, height) * .05));
    const light = flare.alpha;
    const glow = ctx.createRadialGradient(glint.x, glint.y, 0, glint.x, glint.y, pxRadius * 2.4);
    glow.addColorStop(0, `hsla(${182 + 26 * flare.warmth} 74% 86% / ${light * .85})`);
    glow.addColorStop(.45, `hsla(${170 + 22 * flare.warmth} 70% 78% / ${light * .34})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(glint.x, glint.y, pxRadius * 2.4, 0, Math.PI * 2); ctx.fill();
    return flare.progress < 1;
  }



  // The visible departure of a note (iteration 0045): a soft pool of light
  // resting where the voice last sounded, sinking gently downward and
  // dimming along the same stretched tail the audio uses. Budget-aware like
  // the collision flare; reduced motion keeps a calm still glow with no
  // sink. Pure timing/colour comes from pond-waves.
  function drawReleaseGlint(glint, now) {
    const tideGate = budget.style(waterBudget, 'ink');
    if (tideGate <= 0.02) return true; // keep the lifetime ticking, stay quiet
    const pool = waves.releaseGlint(glint.depth, glint.releaseSeconds, now, glint.born, reduced.matches);
    if (pool.alpha <= 0 || pool.radius <= 0) return pool.progress < 1;
    const pxRadius = pool.radius * Math.max(22, Math.min(38, Math.min(width, height) * .06));
    const hue = 152 + 30 * (1 - glint.y / Math.max(1, height));
    const light = pool.alpha;
    const sinkPx = pool.sink * Math.max(10, Math.min(34, height * .04));
    const y = glint.y + sinkPx;
    const glow = ctx.createRadialGradient(glint.x, y, 0, glint.x, y, pxRadius * 2.2);
    glow.addColorStop(0, `hsla(${hue + 14 + 26 * (pool.warmth - .72)} 74% 86% / ${light * .8})`);
    glow.addColorStop(.45, `hsla(${hue + 20 * (pool.warmth - .72)} 68% 76% / ${light * .3})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(glint.x, y, pxRadius * 2.2, 0, Math.PI * 2); ctx.fill();
    return pool.progress < 1;
  }

  function drawCorona(corona, now) {
    const { x, y, spray } = corona;
    const age = Math.max(0, (now - corona.born) / 1000);
    const hue = 152 + 30 * (1 - y / height);
    const warm = Math.min(1, spray.depth * 1.4);       // deep water sits deeper and warmer
    const brightHue = hue - warm * 4;                    // shallow stays herbal, deep folds amber
    let alive = false;
    for (const ray of spray.rays) {
      const life = ray.life;
      if (age > life) continue;
      alive = true;
      const progress = age / life;
      const fade = (1 - progress) * (0.5 + ray.light * .3) * (reduced.matches ? .5 : 1);
      const reach = ray.size * (reduced.matches ? .5 : fade * .85);
      const rx = x + ray.dx * progress;
      const ry = y + ray.dy * progress;
      ctx.save();
      ctx.fillStyle = `hsla(${brightHue} 84% ${82 + ray.light * 8}% / ${Math.max(0, fade) * .5})`;
      ctx.beginPath();
      ctx.ellipse(rx, ry, Math.max(.7, reach * .6), Math.max(.5, reach * .42), Math.atan2(ray.dy, ray.dx), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return alive;
  }

  function drawSplash(splash, now) {
    const age = Math.max(0, (now - splash.born) / 1000), life = reduced.matches ? .34 : .78;
    if (age > life) return false;
    const progress = age / life, fade = Math.pow(1 - progress, 1.7);
    const count = reduced.matches ? 1 : 3 + Math.round((splash.intensity - .5) * 5);
    ctx.save(); ctx.fillStyle = `hsla(${splash.hue + 14} 74% 84% / ${fade * .62})`;
    for (let index = 0; index < count; index += 1) {
      const spread = count === 1 ? 0 : (index / (count - 1) - .5) * 1.05;
      const angle = splash.angle + spread;
      const travel = reduced.matches ? 3 : progress * (18 + splash.intensity * 28) * (.72 + index * .09);
      const x = splash.x + Math.cos(angle) * travel;
      const y = splash.y + Math.sin(angle) * travel;
      const radius = Math.max(.8, (2.1 + splash.intensity * 2.2) * (1 - progress * .58));
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 1.45, radius * .62, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return true;
  }

  function traceMemoryPath(points, drift) {
    const first = points[0];
    ctx.beginPath();
    ctx.moveTo(first.x * width, first.y * height + drift);
    if (points.length === 1) return;
    for (let index = 1; index < points.length - 1; index += 1) {
      const point = points[index], next = points[index + 1];
      ctx.quadraticCurveTo(
        point.x * width, point.y * height + drift,
        (point.x + next.x) * width * .5, (point.y + next.y) * height * .5 + drift
      );
    }
    const lastPoint = points.at(-1);
    ctx.lineTo(lastPoint.x * width, lastPoint.y * height + drift);
  }

  // A point traveling the full contour: progress 0..1 walks the polyline by
  // cumulative arc length so the warm mark moves evenly even when points are
  // unevenly spaced.
  function pointAlongContour(points, progress, drift = 0) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const segments = [];
    let total = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index], b = points[index + 1];
      const length = Math.hypot((b.x - a.x) * width, (b.y - a.y) * height);
      segments.push({ a, b, length });
      total += length;
    }
    if (total <= 0) return { x: points[0].x * width, y: points[0].y * height + drift };
    let remaining = (progress % 1) * total;
    for (const segment of segments) {
      if (remaining <= segment.length) {
        const t = segment.length ? remaining / segment.length : 0;
        return { x: (segment.a.x + (segment.b.x - segment.a.x) * t) * width, y: (segment.a.y + (segment.b.y - segment.a.y) * t) * height + drift };
      }
      remaining -= segment.length;
    }
    const last = points.at(-1);
    return { x: last.x * width, y: last.y * height + drift };
  }

  function drawScoreMemory(memory, now) {
    const visibility = score.visibility(memory, now, reduced.matches);
    if (visibility <= 0) return now >= memory.born && now < memory.born + score.lifeMs(reduced.matches);
    const age = now - memory.born;
    const endpoint = memory.points.at(-1);
    const x = endpoint.x * width, y = endpoint.y * height;
    const lowPitchWeight = 1 - memory.pitch;
    const lineWidth = 1.1 + lowPitchWeight * 2.2 + memory.pressure * 1.2;
    const drift = reduced.matches ? 0 : Math.sin(age * .00038 + memory.pitch * 5) * 2.2;
    const hue = 153 + 30 * (1 - memory.depth);
    const alpha = visibility * .34;

    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (memory.points.length > 1) {
      traceMemoryPath(memory.points, drift);
      ctx.strokeStyle = `hsla(${hue + 12} 54% 65% / ${alpha * .22})`;
      ctx.lineWidth = lineWidth * 5.5; ctx.stroke();
      traceMemoryPath(memory.points, drift);
      ctx.strokeStyle = `hsla(${hue} 68% 81% / ${alpha})`;
      ctx.lineWidth = lineWidth; ctx.stroke();
    }

    const radius = 7 + lowPitchWeight * 8 + memory.pressure * 3;
    const rings = memory.durationMs >= 1800 ? 3 : memory.durationMs >= 650 ? 2 : 1;
    const glow = ctx.createRadialGradient(x, y + drift, 0, x, y + drift, radius * 3.2);
    glow.addColorStop(0, `hsla(${hue + 18} 72% 84% / ${alpha * .5})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y + drift, radius * 3.2, 0, Math.PI * 2); ctx.fill();
    for (let index = 0; index < rings; index += 1) {
      const spread = radius + index * 5.5;
      ctx.beginPath(); ctx.ellipse(x, y + drift, spread, spread * .36, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${hue + index * 7} 64% ${78 - index * 5}% / ${alpha * (1 - index * .18)})`;
      ctx.lineWidth = Math.max(.6, lineWidth * .38); ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function echoPoint(echo, progress) {
    const points = echo.memory.points;
    if (points.length === 1) return points[0];
    const start = Math.min(points.length - 1, echo.segmentIndex + 1);
    const position = start + (points.length - 1 - start) * progress;
    const index = Math.min(points.length - 2, Math.floor(position));
    const amount = position - index;
    return {
      x: points[index].x + (points[index + 1].x - points[index].x) * amount,
      y: points[index].y + (points[index + 1].y - points[index].y) * amount
    };
  }

  function drawScoreEcho(echo, now) {
    const life = reduced.matches ? 620 : 1380;
    const age = now - echo.born;
    if (age < 0 || age >= life) return false;
    const progress = Math.max(0, Math.min(1, age / life));
    const fade = Math.pow(1 - progress, 1.35);
    const hue = 153 + 30 * (1 - echo.memory.depth);
    const pulse = reduced.matches ? echo.memory.points.at(-1) : echoPoint(echo, Math.min(1, progress * 1.75));

    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    traceMemoryPath(echo.memory.points, 0);
    ctx.strokeStyle = `hsla(${hue + 16} 74% 87% / ${fade * .42})`;
    ctx.lineWidth = 2.2 + echo.memory.pressure * 2.4; ctx.stroke();
    const x = pulse.x * width, y = pulse.y * height;
    const radius = 9 + (1 - echo.memory.pitch) * 7;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.4);
    glow.addColorStop(0, `hsla(${hue + 20} 82% 90% / ${fade * .72})`);
    glow.addColorStop(.24, `hsla(${hue + 8} 70% 75% / ${fade * .24})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, radius * 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y, radius, radius * .38, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue + 15} 76% 88% / ${fade * .65})`; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.restore();
    return true;
  }

  function traceMotifEndpoints(memories, drift, phase) {
    const endpoints = memories.map(memory => memory.points.at(-1));
    const first = endpoints[0];
    ctx.beginPath(); ctx.moveTo(first.x * width, first.y * height + drift);
    for (let index = 1; index < endpoints.length; index += 1) {
      const previous = endpoints[index - 1], point = endpoints[index];
      const fromX = previous.x * width, fromY = previous.y * height;
      const x = point.x * width, y = point.y * height;
      const dx = x - fromX, dy = y - fromY, distance = Math.max(1, Math.hypot(dx, dy));
      const curl = Math.sin(phase + index * 1.73) * Math.min(22, distance * .11);
      ctx.quadraticCurveTo(
        (fromX + x) * .5 - dy / distance * curl,
        (fromY + y) * .5 + dx / distance * curl + drift,
        x, y + drift
      );
    }
  }

  function drawMotifUndercurrent(motif, now) {
    const visible = motif.memories.filter(memory => score.visibility(memory, now, reduced.matches) > 0);
    if (visible.length < 2) return;
    const strength = visible.reduce((sum, memory) => sum + score.visibility(memory, now, reduced.matches), 0) / visible.length;
    const phase = (motif.startedAt % 997) / 997 * Math.PI * 2;
    const drift = reduced.matches ? 0 : Math.sin(now * .00042 + phase) * 3;
    const meanDepth = visible.reduce((sum, memory) => sum + memory.depth, 0) / visible.length;
    const hue = 153 + 30 * (1 - meanDepth);

    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    traceMotifEndpoints(visible, drift, phase);
    ctx.strokeStyle = `hsla(${hue + 10} 52% 62% / ${strength * .045})`;
    ctx.lineWidth = 12; ctx.stroke();
    traceMotifEndpoints(visible, drift, phase);
    ctx.strokeStyle = `hsla(${hue} 62% 78% / ${strength * .16})`;
    ctx.lineWidth = .75; ctx.stroke();
    ctx.restore();
  }

  function updatePitchMapping(contact, id, x, y, now) {
    const idle = Math.max(0, now - contact.lastMotion);
    const decayedSpeed = contact.motionSpeed * Math.exp(-idle / 180);
    const eddyHoldsPitch = Boolean(contact.eddy?.active && Number.isFinite(contact.eddyPitchX));
    const mappedX = eddyHoldsPitch ? contact.eddyPitchX : (Number.isFinite(contact.pitchX) ? contact.pitchX : x / Math.max(1, width));
    contact.mapping = {
      ...music.mapPitch(mappedX, eddyHoldsPitch ? 0 : idle, eddyHoldsPitch ? 0 : decayedSpeed, tuningFamily),
      precision: contact.precisionAmount || 0
    };
    const audioX = contact.eddy?.active ? contact.eddy.centerX : x;
    const audioY = contact.eddy?.active && Number.isFinite(contact.eddyDepthY) ? contact.eddyDepthY : y;
    if (contact.sounding) moveVoice(id, audioX, audioY, contact.pressure, contact.mapping.frequency, contact.materialBias ?? 0);
    if (contact.mapping.attraction > .52 && !contact.currentAnnounced) {
      contact.currentAnnounced = true;
      status.textContent = 'Течение мягко удерживает высоту; движение снова освободит звук';
    }
    const texture = music.heldTexture(y / Math.max(1, height), now - contact.born);
    if (texture.bloom > .52 && !textureAnnounced && !contact.eddy?.active) {
      textureAnnounced = true;
      status.textContent = 'Удерживаемая нота дышит вместе с глубинным течением';
    }
  }

  function drawPitchCurrents(pointer, now) {
    const mapping = pointer.mapping;
    const currentStrength = Math.max(mapping?.attraction || 0, mapping?.precision || 0);
    if (!mapping || currentStrength < .025) return;
    const visibility = Math.min(1, currentStrength / .62);
    const currents = music.neighboringCurrents(mapping.scaleIndex, 1, mapping.scaleFamily);
    const reach = Math.min(105, height * .15);
    const hue = 157 + 24 * (1 - pointer.y / Math.max(1, height));
    const phase = reduced.matches ? 0 : now * .0012;

    ctx.save();
    ctx.lineCap = 'round';
    for (const current of currents) {
      const x = current.normalizedX * width;
      const emphasis = current.isTarget ? 1 : .36;
      const sway = reduced.matches ? 0 : Math.sin(phase + current.scaleIndex * 1.7) * 4;
      const top = pointer.y - reach, bottom = pointer.y + reach;
      const strands = current.isTarget ? [-3, 3] : [0];
      for (const strand of strands) {
        ctx.beginPath();
        ctx.moveTo(x + strand - sway * .35, top);
        ctx.bezierCurveTo(x + strand + 7 + sway, pointer.y - reach * .45,
          x + strand - 8 - sway, pointer.y + reach * .42, x + strand + sway * .35, bottom);
        ctx.strokeStyle = `hsla(${hue + (current.isTarget ? 16 : 0)} 66% 78% / ${visibility * emphasis * .2})`;
        ctx.lineWidth = current.isTarget ? 1.1 : .7;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(x, pointer.y, current.isTarget ? 11 : 6, current.isTarget ? 3.4 : 2.2, sway * .015, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${hue + 12} 72% 82% / ${visibility * emphasis * .34})`;
      ctx.lineWidth = current.isTarget ? 1 : .65; ctx.stroke();
    }
    ctx.restore();
  }

  function drawHeldUndertow(pointer, now, radius, hue) {
    const texture = music.heldTexture(pointer.y / Math.max(1, height), now - pointer.born);
    if (texture.bloom < .01) return;
    const phase = reduced.matches ? 0 : Math.sin((now - pointer.born) * texture.rateHz * Math.PI * 2 / 1000);
    const reach = radius + texture.visualReach + phase * 3.2;
    const lift = radius * (.32 + texture.bloom * .12);

    ctx.save();
    ctx.translate(pointer.x, pointer.y);
    ctx.rotate((pointer.x / Math.max(1, width) - .5) * .22);
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-reach * .72, side * lift * .45);
      ctx.bezierCurveTo(-reach * .25, side * (lift + phase * 1.8), reach * .26, side * (lift * .86 - phase), reach * .76, side * lift * .18);
      ctx.strokeStyle = `hsla(${hue + 10 + side * 5} 58% 76% / ${texture.bloom * (side > 0 ? .13 : .085)})`;
      ctx.lineWidth = side > 0 ? 1 : .7;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEddy(pointer, now) {
    const eddy = pointer.eddy;
    if (!eddy?.active) return;
    const meanRadius = eddy.radiusSamples ? eddy.radiusTotal / eddy.radiusSamples * Math.max(1, Math.min(width, height)) : 18;
    const radius = Math.max(14, Math.min(42, meanRadius));
    const expression = gesture.eddyExpression(eddy.intensity, eddy.direction);
    const hue = 156 + 26 * (1 - eddy.centerY / Math.max(1, height));
    const phase = reduced.matches ? -.45 : (now - eddy.born) * expression.rateHz * Math.PI * 2 / 1000;

    ctx.save();
    ctx.translate(eddy.centerX, eddy.centerY);
    ctx.scale(1, .48);
    ctx.lineCap = 'round';
    for (let strand = 0; strand < 3; strand += 1) {
      const start = phase + strand * Math.PI * 2 / 3;
      const sweep = expression.visualTurns * Math.PI * 1.32;
      ctx.beginPath();
      for (let step = 0; step <= 24; step += 1) {
        const progress = step / 24;
        const angle = start + sweep * progress;
        const strandRadius = radius * (.32 + progress * .68) + strand * 1.4;
        const x = Math.cos(angle) * strandRadius;
        const y = Math.sin(angle) * strandRadius;
        step ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = `hsla(${hue + strand * 7} 68% ${82 - strand * 6}% / ${.18 + eddy.intensity * .16})`;
      ctx.lineWidth = Math.max(.7, 1.45 - strand * .24);
      ctx.stroke();
    }
    const eye = 2.8 + eddy.intensity * 2.4;
    ctx.beginPath(); ctx.arc(0, 0, eye, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue + 18} 74% 86% / ${.28 + eddy.intensity * .28})`;
    ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  function drawContact(pointer, now) {
    const pitch = Math.max(0, Math.min(1, pointer.x / Math.max(1, width)));
    const pulse = reduced.matches ? .5 : .5 + Math.sin((now - pointer.born) * (.004 + pitch * .003)) * .5;
    const radius = 18 + (1 - pitch) * 16 + pointer.pressure * 8;
    const hue = 152 + 30 * (1 - pointer.y / height);
    drawHeldUndertow(pointer, now, radius, hue);
    const glow = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, radius * 1.8);
    glow.addColorStop(0, `hsla(${hue + 15} 72% 84% / ${pointer.sounding ? .25 : .1})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(pointer.x, pointer.y, radius * 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(pointer.x, pointer.y, radius + pulse * 3, (radius + pulse * 3) * .42, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue} 64% 78% / ${pointer.sounding ? .46 : .2})`;
    ctx.lineWidth = pointer.sounding ? 1.15 : .7; ctx.stroke();
  }

  function drawResonance(a, b, now) {
    const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
    if (distance < 24) return;
    const nx = -dy / distance, ny = dx / distance;
    const phase = reduced.matches ? 0 : Math.sin(now * .004 + distance * .018);
    const hue = 161 + 21 * (1 - (a.y + b.y) / (height * 2));
    const knotRadius = Math.max(2.5, Math.min(6, distance * .018));

    for (const portion of [.28, .5, .72]) {
      const envelope = Math.sin(portion * Math.PI);
      const offset = phase * 6 * envelope;
      const x = a.x + dx * portion + nx * offset;
      const y = a.y + dy * portion + ny * offset;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, knotRadius * 4);
      glow.addColorStop(0, `hsla(${hue + portion * 18} 78% 86% / .3)`);
      glow.addColorStop(.25, `hsla(${hue} 70% 72% / .12)`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, knotRadius * 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `hsla(${hue + portion * 18} 74% 84% / .38)`;
      ctx.beginPath(); ctx.arc(x, y, knotRadius, 0, Math.PI * 2); ctx.fill();
    }

    const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
    ctx.save(); ctx.translate(midX, midY); ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath(); ctx.ellipse(0, 0, Math.min(74, distance * .22), 9 + Math.min(18, distance * .055), 0, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue} 62% 76% / ${reduced.matches ? .16 : .14 + Math.abs(phase) * .08})`;
    ctx.lineWidth = .8; ctx.stroke(); ctx.restore();
  }

  function frame(now) {
    const started = performance.now();
    const dt = Math.min((now - last) / 1000, .05); last = now;
    water(now + dt);
    drawTide(now);
    drawMotes(now);
    drawInvitation(now);
    drawWhisper(now);
    memories = memories.filter(memory => now >= memory.born && now < memory.born + score.lifeMs(reduced.matches));
    phraseInk = phraseInk.filter(line => now >= line.born && now < line.born + score.inkLifeMs(reduced.matches));
    // The stone counts readable lines: their number also changes when ink
    // arrives or dissolves, not only when the diary array itself changes.
    if (score.pourableInk(phraseInk, now, reduced.matches).length !== lastInkCount) reflectDiaryCount();
    for (const line of phraseInk) drawInkLine(line, now);
    for (const motif of score.groupMotifs(memories)) drawMotifUndercurrent(motif, now);
    for (const memory of memories) drawScoreMemory(memory, now);
    for (const line of pourEchoes) if (!drawPourEcho(line, now)) pourEchoes.splice(pourEchoes.indexOf(line), 1);
    for (let i = scoreEchoes.length - 1; i >= 0; i--) if (!drawScoreEcho(scoreEchoes[i], now)) scoreEchoes.splice(i, 1);
    for (let i = trails.length - 1; i >= 0; i--) if (!drawTrail(trails[i], now)) trails.splice(i, 1);
    for (let i = splashes.length - 1; i >= 0; i--) if (!drawSplash(splashes[i], now)) splashes.splice(i, 1);
    for (let i = coronas.length - 1; i >= 0; i--) if (!drawCorona(coronas[i], now)) coronas.splice(i, 1);

    for (const [id, pointer] of pointers) {
      if (pointer.sounding) updatePitchMapping(pointer, id, pointer.x, pointer.y, now);
    }
    let keyboardVisual = null;
    if (keyboard.sounding) {
      const p = keyboardPoint();
      updatePitchMapping(keyboard, 'keyboard', p.x, p.y, now);
      keyboardVisual = { ...keyboard, ...p };
    }

    const soundingPointers = [...pointers.values()].filter(pointer => pointer.sounding);
    if (keyboardVisual) soundingPointers.push(keyboardVisual);
    for (const pointer of soundingPointers) drawPitchCurrents(pointer, now);
    for (let i = 0; i < soundingPointers.length; i++) {
      for (let j = i + 1; j < soundingPointers.length; j++) drawResonance(soundingPointers[i], soundingPointers[j], now);
    }
    for (let i = stoneFlights.length - 1; i >= 0; i--) if (!drawStoneFlight(stoneFlights[i], now)) stoneFlights.splice(i, 1);
    for (let i = ripples.length - 1; i >= 0; i--) if (!drawRipple(ripples[i], now)) ripples.splice(i, 1);
    for (let i = collisionGlints.length - 1; i >= 0; i--) {
      if (!drawCollisionGlint(collisionGlints[i], now)) collisionGlints.splice(i, 1);
    }
    for (let i = shoreLapGlints.length - 1; i >= 0; i--) {
      if (!drawShoreLap(shoreLapGlints[i], now)) shoreLapGlints.splice(i, 1);
    }
    for (let i = inkReadGlints.length - 1; i >= 0; i--) {
      if (!drawInkRead(inkReadGlints[i], now)) inkReadGlints.splice(i, 1);
    }
    for (let i = collisionPearls.length - 1; i >= 0; i--) {
      if (!drawCollisionPearl(collisionPearls[i], now)) collisionPearls.splice(i, 1);
    }
    for (const pointer of pointers.values()) drawEddy(pointer, now);
    // Instrumentation: how many departing lights are alive right now.
    canvas.dataset.releaseGlints = String(releaseGlints.length);
    for (let i = releaseGlints.length - 1; i >= 0; i--) if (!drawReleaseGlint(releaseGlints[i], now)) releaseGlints.splice(i, 1);
    for (const pointer of pointers.values()) drawContact(pointer, now);
    if (keyboardVisual) drawContact(keyboardVisual, now);
    // The water frame budget: record the observed render cost, then let the
    // eased style feed the next frame. Quiet, cheap stretches unwind the
    // steps so the full look returns.
    const frameCost = performance.now() - started;
    const budgetStep = budget.observe(waterBudget, frameCost);
    canvas.dataset.budgetStep = String(budgetStep);
    canvas.dataset.budgetFrameMs = frameCost.toFixed(2);
    requestAnimationFrame(frame);
  }
  resize(); requestAnimationFrame(frame);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(error => {
        console.warn('Offline shell could not be prepared', error);
      });
    }, { once: true });
  }
})();
