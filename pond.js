(() => {
  const canvas = document.querySelector('#pond');
  const ctx = canvas.getContext('2d', { alpha: false });
  const status = document.querySelector('#status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const music = window.PondMusic;
  const score = window.PondScore;
  const masterModel = window.PondMaster;
  const audioLifecycleFactory = window.PondAudioLifecycle;
  if (!music) throw new Error('Pond music mapping did not load');
  if (!score) throw new Error('Pond score mapping did not load');
  if (!masterModel) throw new Error('Pond master control did not load');
  if (!audioLifecycleFactory) throw new Error('Pond audio lifecycle did not load');
  const volumeControl = document.querySelector('.shore-control');
  const volumeStone = document.querySelector('#volume-stone');
  const volumePanel = document.querySelector('#volume-panel');
  const volumeRange = document.querySelector('#master-volume');
  const volumeValue = document.querySelector('#volume-value');
  const muteButton = document.querySelector('#mute-water');
  const tuningInputs = [...document.querySelectorAll('input[name="tuning-family"]')];
  const tuningValue = document.querySelector('#tuning-value');
  const MASTER_STORAGE_KEY = 'pond-piano.master.v1';
  const TUNING_STORAGE_KEY = 'pond-piano.tuning.v1';
  const MAX_VOICES = 6;
  const ECHO_COOLDOWN_MS = 3200;
  const ripples = [], trails = [], splashes = [], scoreEchoes = [], pointers = new Map();
  const echoCooldowns = new WeakMap();
  let memories = [];
  const keyboard = { x: .5, y: .52, pitchX: .5, pressure: .48, sounding: false, born: 0, lastMotion: 0, motionSpeed: 0, mapping: null, precisionActive: false, precisionAmount: 0, precisionOriginX: null, scoreSamples: [], distanceTraveled: 0, resonanceX: 0, resonanceY: 0, resonatedMemories: new Set() };
  let audio = null;
  let audioLifecycle = null;
  let masterState = loadMasterState();
  let tuningFamily = loadTuningFamily();
  let echoSerial = 0;
  let width = 0, height = 0, dpr = 1, last = performance.now(), announced = false, scoreAnnounced = false, dynamicsAnnounced = false, textureAnnounced = false, precisionAnnounced = false, freedomAnnounced = false;

  function pitchAt(x) {
    return music.frequencyAt(x / Math.max(1, width));
  }

  function depthAt(y) {
    const normalizedDepth = Math.max(0, Math.min(1, y / Math.max(1, height)));
    const clarity = 1 - normalizedDepth;
    return { normalizedDepth, cutoff: 520 + 4300 * clarity * clarity, brightness: .08 + clarity * .14 };
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
    audio = { context, master, reflection, voices: new Map() };
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
      voice.filterDrift, voice.overtoneDrift, voice.panner, voice.reflectionSend];
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
      for (const oscillator of [voice.oscillator, voice.overtone, voice.undertow]) {
        try { oscillator.stop(now); } catch {}
      }
      disconnectVoice(voice);
    }
    balanceVoices(engine);
    for (const pointerId of pointers.keys()) {
      try { canvas.releasePointerCapture?.(pointerId); } catch {}
    }
    pointers.clear();
    keyboard.sounding = false;
    if ((reason === 'visibility-hidden' || reason === 'pagehide') && engine.context.state === 'running') {
      Promise.resolve(engine.context.suspend()).catch(() => {});
    }
  }

  function reflectAudioState(event) {
    canvas.dataset.audioState = event.state;
    canvas.dataset.audioVoices = String(event.engine?.voices?.size ?? 0);
    if (event.reason === 'gesture-required') {
      status.textContent = 'Звук пруда уснул; коснитесь воды, чтобы мягко разбудить его';
    } else if (event.reason === 'resume-failed') {
      status.textContent = 'Браузер пока не вернул звук; коснитесь воды ещё раз';
    } else if (event.reason === 'closed') {
      status.textContent = 'Аудиосистема закрыта браузером; перезагрузите пруд, чтобы снова играть';
    }
  }

  function startVoice(id, x, y, pressure = .42, frequency = pitchAt(x), attack = pressure, engine = audio) {
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
    const pan = music.spatialPan(x / Math.max(1, width));
    const texture = music.heldTexture(depth.normalizedDepth, music.TEXTURE_BLOOM_END_MS);
    const reflection = music.depthReflection(depth.normalizedDepth);
    oscillator.type = 'sine'; overtone.type = 'sine'; undertow.type = 'sine'; filter.type = 'lowpass'; filter.Q.value = .7;
    oscillator.frequency.value = frequency; overtone.frequency.value = frequency * 2;
    undertow.frequency.value = texture.rateHz;
    overtoneGain.gain.value = depth.brightness;
    filter.frequency.value = depth.cutoff;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.055 + attack * .085, now + .045);
    gain.gain.exponentialRampToValueAtTime(.04 + pressure * .055, now + .32);
    oscillator.connect(filter); overtone.connect(overtoneGain).connect(filter);
    undertow.connect(filterDrift).connect(filter.frequency);
    undertow.connect(overtoneDrift).connect(overtoneGain.gain);
    filter.connect(gain);
    let output = gain;
    if (panner) {
      panner.pan.value = pan;
      gain.connect(panner);
      output = panner;
    }
    output.connect(engine.master);
    if (reflectionSend) {
      reflectionSend.gain.value = reflection.sendGain;
      output.connect(reflectionSend).connect(engine.reflection.input);
    }
    scheduleTextureBloom(filterDrift.gain, texture.filterSweepHz, now);
    scheduleTextureBloom(overtoneDrift.gain, texture.overtonePulse, now);
    oscillator.start(); overtone.start(); undertow.start();
    const voice = {
      oscillator, overtone, overtoneGain, filter, gain, undertow, filterDrift, overtoneDrift, panner, reflectionSend,
      born: now, textureDepth: depth.normalizedDepth, targetFrequency: frequency,
      targetPan: pan, attack, accentUntil: now + .32, releasing: false
    };
    engine.voices.set(id, voice);
    canvas.dataset.audioVoices = String(engine.voices.size);
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

  function moveVoice(id, x, y, pressure = .42, mappedFrequency = null) {
    const voice = audio?.voices.get(id);
    if (!voice) return;
    const now = audio.context.currentTime, frequency = mappedFrequency ?? pitchAt(x), depth = depthAt(y);
    if (Math.abs(frequency - voice.targetFrequency) > .08) {
      voice.oscillator.frequency.setTargetAtTime(frequency, now, .026);
      voice.overtone.frequency.setTargetAtTime(frequency * 2, now, .026);
      voice.targetFrequency = frequency;
    }
    const pan = music.spatialPan(x / Math.max(1, width));
    if (voice.panner && Math.abs(pan - voice.targetPan) > .002) {
      voice.panner.pan.setTargetAtTime(pan, now, .045);
      voice.targetPan = pan;
    }
    voice.filter.frequency.setTargetAtTime(depth.cutoff, now, .035);
    voice.overtoneGain.gain.setTargetAtTime(depth.brightness, now, .06);
    if (voice.reflectionSend) {
      voice.reflectionSend.gain.setTargetAtTime(music.depthReflection(depth.normalizedDepth).sendGain, now, .08);
    }
    retargetTexture(voice, depth.normalizedDepth, now);
    if (now >= voice.accentUntil) voice.gain.gain.setTargetAtTime(.04 + pressure * .065, now, .04);
  }

  function accentVoice(id, intensity) {
    const voice = audio?.voices.get(id);
    if (!voice || voice.releasing || intensity <= voice.attack + .025) return false;
    const now = audio.context.currentTime;
    const current = Math.max(.0001, voice.gain.gain.value);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(current, now);
    voice.gain.gain.exponentialRampToValueAtTime(.055 + intensity * .085, now + .026);
    voice.gain.gain.exponentialRampToValueAtTime(.063, now + .23);
    voice.attack = intensity;
    voice.accentUntil = now + .23;
    return true;
  }

  function endVoice(id) {
    const voice = audio?.voices.get(id);
    if (!voice || voice.releasing) return;
    const now = audio.context.currentTime;
    voice.releasing = true;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(.0001, now, .1);
    voice.oscillator.stop(now + .48); voice.overtone.stop(now + .48); voice.undertow.stop(now + .48);
    balanceVoices(audio);
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
    volumeControl.classList.toggle('is-open', open);
    volumeStone.setAttribute('aria-expanded', String(open));
  }

  volumeStone.addEventListener('click', () => setVolumePanelOpen(true));
  volumeControl.addEventListener('focusin', () => volumeStone.setAttribute('aria-expanded', 'true'));
  volumeControl.addEventListener('focusout', () => {
    requestAnimationFrame(() => {
      if (!volumeControl.contains(document.activeElement) && !volumeControl.classList.contains('is-open')) {
        volumeStone.setAttribute('aria-expanded', 'false');
      }
    });
  });
  document.addEventListener('pointerdown', event => {
    if (!volumeControl.contains(event.target)) setVolumePanelOpen(false);
  });
  volumeControl.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    setVolumePanelOpen(false);
    canvas.focus();
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

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    width = innerWidth; height = innerHeight;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  function addRipple(x, y, pressure, strength = 1) {
    ripples.push({ x, y, born: performance.now(), pressure, strength, hue: 152 + 30 * (1 - y / height) });
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

  function playScoreEcho(memory, crossing, now) {
    const id = `score-echo-${++echoSerial}`;
    const x = memory.pitch * width, y = memory.depth * height;
    const pressure = .2 + memory.pressure * .18;
    const attack = .18 + memory.pressure * .16;
    if (!startVoice(id, x, y, pressure, music.frequencyAt(memory.pitch), attack)) return false;
    scoreEchoes.push({ memory, crossing, segmentIndex: crossing.segmentIndex, born: now });
    if (scoreEchoes.length > 8) scoreEchoes.shift();
    addRipple(x, y, pressure, .55);
    setTimeout(() => endVoice(id), 420);
    return true;
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
    contact.resonatedMemories.add(crossing.memory);
    echoCooldowns.set(crossing.memory, now);
    status.textContent = 'Жест пересёк водный след; сохранённая нота мягко отозвалась';
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
    const sounding = startVoice(event.pointerId, p.x, p.y, pressure, pitchAt(p.x), attack, engine);
    pointers.set(event.pointerId, {
      ...p, pressure, pressureAvailable, attack, splashPlayed: false, sounding, born: now, lastMotion: now, movedAt: now, motionSpeed: 0,
      pitchX: p.x / Math.max(1, width), mapping: null, precisionActive: false, precisionAmount: 0, precisionOriginX: null,
      currentAnnounced: false, sampledX: p.x, sampledY: p.y, sampledAt: now,
      distanceTraveled: 0, resonanceX: p.x, resonanceY: p.y, resonatedMemories: new Set(),
      scoreSamples: sounding ? [{ x: p.x / Math.max(1, width), y: p.y / Math.max(1, height), pitch: p.x / Math.max(1, width), at: now, pressure: attack }] : []
    });
    addRipple(p.x, p.y, attack);
    document.body.classList.add('has-played');
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
        const elapsed = Math.max(8, now - active.movedAt);
        active.motionSpeed = music.movementSpeed(moved, elapsed, Math.max(1, Math.min(width, height)));
        if (heldBeforeMovement >= music.PRECISION_HOLD_MS && Number.isFinite(active.mapping?.frequency)) {
          active.pitchX = music.normalizedAtFrequency(active.mapping.frequency);
        }
        const steering = music.precisionMotion({
          previousRawX,
          rawX: p.x / Math.max(1, width),
          pitchX: active.pitchX,
          originRawX: active.precisionOriginX,
          holdMilliseconds: heldBeforeMovement,
          speedPerSecond: active.motionSpeed,
          active: active.precisionActive
        });
        active.pitchX = steering.pitchX;
        active.precisionActive = steering.active;
        active.precisionAmount = steering.amount;
        active.precisionOriginX = steering.originRawX;
        if (steering.entered && !precisionAnnounced) {
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
              addRipple(p.x, p.y, attack, .42 + attack * .55);
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
      moveVoice(event.pointerId, p.x, p.y, active.pressure, active.mapping.frequency);
    }
  }

  function end(event) {
    const active = pointers.get(event.pointerId);
    if (!active) return;
    const now = performance.now(), pressure = active.pressureAvailable ? active.pressure : active.attack;
    addRipple(active.x, active.y, pressure, .55);
    rememberContact(active, active.x, active.y, now, pressure);
    endVoice(event.pointerId);
    pointers.delete(event.pointerId);
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
        moveVoice('keyboard', p.x, p.y, .48, keyboard.mapping.frequency);
        captureScoreSample(keyboard, p.x, p.y, now, .48);
        tryScoreResonance(keyboard, p, now);
        trails.push({ x: p.x, y: p.y, fromX: p.x - movement[0] * width, fromY: p.y - movement[1] * height, born: now, pressure: .48, speed: .55, hue: 152 + 30 * (1 - p.y / height) });
      }
    }
    if ((event.code === 'Space' || event.key === 'Enter') && !event.repeat && !keyboard.sounding) {
      event.preventDefault();
      const now = performance.now();
      keyboard.sounding = true; keyboard.born = now; keyboard.lastMotion = now; keyboard.motionSpeed = 0; keyboard.currentAnnounced = false;
      keyboard.pitchX = keyboard.x; keyboard.mapping = null; keyboard.precisionActive = false; keyboard.precisionAmount = 0; keyboard.precisionOriginX = null;
      const p = keyboardPoint();
      keyboard.distanceTraveled = 0; keyboard.resonanceX = p.x; keyboard.resonanceY = p.y; keyboard.resonatedMemories = new Set();
      keyboard.scoreSamples = [{ x: keyboard.x, y: keyboard.y, pitch: keyboard.pitchX, at: now, pressure: .48 }];
      const engine = audioLifecycle.activateFromGesture();
      keyboard.sounding = startVoice('keyboard', p.x, p.y, .48, pitchAt(p.x), .48, engine);
      if (!keyboard.sounding) keyboard.scoreSamples = [];
      addRipple(p.x, p.y, .48);
      document.body.classList.add('has-played'); status.textContent = 'Звук воды звучит; стрелками меняйте высоту и глубину';
    }
  });
  canvas.addEventListener('keyup', event => {
    if ((event.code === 'Space' || event.key === 'Enter') && keyboard.sounding) {
      event.preventDefault();
      const p = keyboardPoint(), now = performance.now();
      rememberContact(keyboard, p.x, p.y, now, .48);
      keyboard.sounding = false; endVoice('keyboard'); addRipple(p.x, p.y, .48, .55);
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

  function water(now) {
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

  function drawRipple(r, now) {
    const age = Math.max(0, (now - r.born) / 1000), life = (reduced.matches ? .55 : 2.7) * (.7 + r.strength * .3);
    if (age > life) return false;
    const fade = Math.pow(1 - age / life, 1.7) * r.strength;
    const spread = reduced.matches ? 34 : 24 + age * (96 + r.pressure * 52);
    const rings = reduced.matches ? 1 : 3;
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
    contact.mapping = {
      ...music.mapPitch(Number.isFinite(contact.pitchX) ? contact.pitchX : x / Math.max(1, width), idle, decayedSpeed, tuningFamily),
      precision: contact.precisionAmount || 0
    };
    if (contact.sounding) moveVoice(id, x, y, contact.pressure, contact.mapping.frequency);
    if (contact.mapping.attraction > .52 && !contact.currentAnnounced) {
      contact.currentAnnounced = true;
      status.textContent = 'Течение мягко удерживает высоту; движение снова освободит звук';
    }
    const texture = music.heldTexture(y / Math.max(1, height), now - contact.born);
    if (texture.bloom > .52 && !textureAnnounced) {
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
    const dt = Math.min((now - last) / 1000, .05); last = now;
    water(now + dt);
    memories = memories.filter(memory => now >= memory.born && now < memory.born + score.lifeMs(reduced.matches));
    for (const motif of score.groupMotifs(memories)) drawMotifUndercurrent(motif, now);
    for (const memory of memories) drawScoreMemory(memory, now);
    for (let i = scoreEchoes.length - 1; i >= 0; i--) if (!drawScoreEcho(scoreEchoes[i], now)) scoreEchoes.splice(i, 1);
    for (let i = trails.length - 1; i >= 0; i--) if (!drawTrail(trails[i], now)) trails.splice(i, 1);
    for (let i = splashes.length - 1; i >= 0; i--) if (!drawSplash(splashes[i], now)) splashes.splice(i, 1);

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
    for (let i = ripples.length - 1; i >= 0; i--) if (!drawRipple(ripples[i], now)) ripples.splice(i, 1);
    for (const pointer of pointers.values()) drawContact(pointer, now);
    if (keyboardVisual) drawContact(keyboardVisual, now);
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
