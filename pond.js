(() => {
  const canvas = document.querySelector('#pond');
  const ctx = canvas.getContext('2d', { alpha: false });
  const status = document.querySelector('#status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const music = window.PondMusic;
  if (!music) throw new Error('Pond music mapping did not load');
  const MAX_VOICES = 6;
  const ripples = [], trails = [], pointers = new Map();
  const keyboard = { x: .5, y: .52, pressure: .48, sounding: false, born: 0, lastMotion: 0, motionSpeed: 0, mapping: null };
  let audio = null;
  let width = 0, height = 0, dpr = 1, last = performance.now(), announced = false;

  function pitchAt(x) {
    return music.frequencyAt(x / Math.max(1, width));
  }

  function depthAt(y) {
    const normalized = 1 - Math.max(0, Math.min(1, y / Math.max(1, height)));
    return { cutoff: 520 + 4300 * normalized * normalized, brightness: .08 + normalized * .14 };
  }

  function ensureAudio() {
    if (!audio) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      const context = new AudioContext({ latencyHint: 'interactive' });
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      master.gain.value = .72;
      compressor.threshold.value = -18; compressor.knee.value = 16;
      compressor.ratio.value = 6; compressor.attack.value = .006; compressor.release.value = .24;
      master.connect(compressor).connect(context.destination);
      audio = { context, master, voices: new Map() };
    }
    if (audio.context.state === 'suspended') audio.context.resume();
    return audio;
  }

  function balanceVoices(engine) {
    const sounding = [...engine.voices.values()].filter(voice => !voice.releasing).length;
    const level = .72 / Math.sqrt(Math.max(1, sounding));
    engine.master.gain.setTargetAtTime(level, engine.context.currentTime, .045);
  }

  function startVoice(id, x, y, pressure = .42, frequency = pitchAt(x)) {
    const engine = ensureAudio();
    if (!engine || engine.voices.has(id) || engine.voices.size >= MAX_VOICES) return false;
    const now = engine.context.currentTime;
    const oscillator = engine.context.createOscillator();
    const overtone = engine.context.createOscillator();
    const overtoneGain = engine.context.createGain();
    const filter = engine.context.createBiquadFilter();
    const gain = engine.context.createGain();
    const depth = depthAt(y);
    oscillator.type = 'sine'; overtone.type = 'sine'; filter.type = 'lowpass'; filter.Q.value = .7;
    oscillator.frequency.value = frequency; overtone.frequency.value = frequency * 2.01;
    overtoneGain.gain.value = depth.brightness;
    filter.frequency.value = depth.cutoff;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.055 + pressure * .085, now + .045);
    gain.gain.exponentialRampToValueAtTime(.04 + pressure * .055, now + .32);
    oscillator.connect(filter); overtone.connect(overtoneGain).connect(filter);
    filter.connect(gain).connect(engine.master);
    oscillator.start(); overtone.start();
    const voice = { oscillator, overtone, filter, gain, targetFrequency: frequency, releasing: false };
    engine.voices.set(id, voice);
    oscillator.addEventListener('ended', () => {
      if (engine.voices.get(id) !== voice) return;
      engine.voices.delete(id);
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
      voice.overtone.frequency.setTargetAtTime(frequency * 2.01, now, .026);
      voice.targetFrequency = frequency;
    }
    voice.filter.frequency.setTargetAtTime(depth.cutoff, now, .035);
    voice.gain.gain.setTargetAtTime(.04 + pressure * .065, now, .04);
  }

  function endVoice(id) {
    const voice = audio?.voices.get(id);
    if (!voice || voice.releasing) return;
    const now = audio.context.currentTime;
    voice.releasing = true;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(.0001, now, .1);
    voice.oscillator.stop(now + .48); voice.overtone.stop(now + .48);
    balanceVoices(audio);
  }

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

  function pressureOf(event) { return event.pressure > 0 ? event.pressure : .42; }

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

  function start(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const p = point(event), now = performance.now();
    const pressure = pressureOf(event);
    const sounding = startVoice(event.pointerId, p.x, p.y, pressure);
    pointers.set(event.pointerId, {
      ...p, pressure, sounding, born: now, lastMotion: now, movedAt: now, motionSpeed: 0,
      mapping: null, currentAnnounced: false, sampledX: p.x, sampledY: p.y, sampledAt: now
    });
    addRipple(p.x, p.y, pressureOf(event));
    document.body.classList.add('has-played');
    const chordSize = [...pointers.values()].filter(pointer => pointer.sounding).length;
    if (!sounding) status.textContent = `Пруд удерживает до ${MAX_VOICES} голосов; отпустите касание для следующей ноты`;
    else if (chordSize > 1) status.textContent = `Аккорд: ${chordSize} независимых ${voiceWord(chordSize)}`;
    else if (!announced) { status.textContent = 'Вода зазвучала; ведите касание, чтобы менять высоту и глубину'; announced = true; }
    canvas.setPointerCapture?.(event.pointerId);
  }

  function glide(event) {
    const active = pointers.get(event.pointerId);
    if (!active) return;
    const samples = event.getCoalescedEvents?.() || [event];
    for (const sample of samples) {
      const p = point(sample), now = performance.now();
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
        const elapsed = Math.max(8, now - active.movedAt);
        active.motionSpeed = (moved / Math.max(1, width)) * (1000 / elapsed);
        active.lastMotion = now; active.movedAt = now;
      }
      active.x = p.x; active.y = p.y;
      active.pressure = pressureOf(sample);
      moveVoice(event.pointerId, p.x, p.y, pressureOf(sample));
    }
  }

  function end(event) {
    const active = pointers.get(event.pointerId);
    if (!active) return;
    addRipple(active.x, active.y, pressureOf(event), .55);
    endVoice(event.pointerId);
    pointers.delete(event.pointerId);
  }

  function keyboardPoint() { return { x: keyboard.x * width, y: keyboard.y * height }; }

  canvas.addEventListener('keydown', event => {
    const movement = { ArrowLeft: [-.025, 0], ArrowRight: [.025, 0], ArrowUp: [0, -.035], ArrowDown: [0, .035] }[event.key];
    if (movement) {
      event.preventDefault();
      keyboard.x = Math.max(.04, Math.min(.96, keyboard.x + movement[0]));
      keyboard.y = Math.max(.08, Math.min(.9, keyboard.y + movement[1]));
      const p = keyboardPoint(), now = performance.now();
      keyboard.lastMotion = now; keyboard.motionSpeed = .22; keyboard.currentAnnounced = false;
      if (keyboard.sounding) { moveVoice('keyboard', p.x, p.y, .48); trails.push({ x: p.x, y: p.y, fromX: p.x - movement[0] * width, fromY: p.y - movement[1] * height, born: now, pressure: .48, speed: .55, hue: 152 + 30 * (1 - p.y / height) }); }
    }
    if ((event.code === 'Space' || event.key === 'Enter') && !event.repeat && !keyboard.sounding) {
      event.preventDefault();
      const now = performance.now();
      keyboard.sounding = true; keyboard.born = now; keyboard.lastMotion = now; keyboard.motionSpeed = 0; keyboard.currentAnnounced = false;
      const p = keyboardPoint(); startVoice('keyboard', p.x, p.y, .48); addRipple(p.x, p.y, .48);
      document.body.classList.add('has-played'); status.textContent = 'Звук воды звучит; стрелками меняйте высоту и глубину';
    }
  });
  canvas.addEventListener('keyup', event => {
    if ((event.code === 'Space' || event.key === 'Enter') && keyboard.sounding) {
      event.preventDefault(); keyboard.sounding = false;
      const p = keyboardPoint(); endVoice('keyboard'); addRipple(p.x, p.y, .48, .55);
    }
  });
  canvas.addEventListener('blur', () => { if (keyboard.sounding) { keyboard.sounding = false; endVoice('keyboard'); } });

  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', glide);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', event => { endVoice(event.pointerId); pointers.delete(event.pointerId); });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  addEventListener('resize', resize, { passive: true });

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

  function updatePitchMapping(contact, id, x, y, now) {
    const idle = Math.max(0, now - contact.lastMotion);
    const decayedSpeed = contact.motionSpeed * Math.exp(-idle / 180);
    contact.mapping = music.mapPitch(x / Math.max(1, width), idle, decayedSpeed);
    if (contact.sounding) moveVoice(id, x, y, contact.pressure, contact.mapping.frequency);
    if (contact.mapping.attraction > .52 && !contact.currentAnnounced) {
      contact.currentAnnounced = true;
      status.textContent = 'Течение мягко удерживает высоту; движение снова освободит звук';
    }
  }

  function drawPitchCurrents(pointer, now) {
    const mapping = pointer.mapping;
    if (!mapping || mapping.attraction < .025) return;
    const visibility = Math.min(1, mapping.attraction / .62);
    const currents = music.neighboringCurrents(mapping.scaleIndex);
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

  function drawContact(pointer, now) {
    const pitch = Math.max(0, Math.min(1, pointer.x / Math.max(1, width)));
    const pulse = reduced.matches ? .5 : .5 + Math.sin((now - pointer.born) * (.004 + pitch * .003)) * .5;
    const radius = 18 + (1 - pitch) * 16 + pointer.pressure * 8;
    const hue = 152 + 30 * (1 - pointer.y / height);
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
    for (let i = trails.length - 1; i >= 0; i--) if (!drawTrail(trails[i], now)) trails.splice(i, 1);

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
