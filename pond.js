(() => {
  const canvas = document.querySelector('#pond');
  const ctx = canvas.getContext('2d', { alpha: false });
  const status = document.querySelector('#status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ripples = [], trails = [], pointers = new Map();
  let width = 0, height = 0, dpr = 1, last = performance.now(), announced = false;

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

  function addRipple(x, y, pressure, strength = 1) {
    ripples.push({ x, y, born: performance.now(), pressure, strength, hue: 152 + 30 * (1 - y / height) });
    if (ripples.length > 32) ripples.shift();
  }

  function start(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const p = point(event), now = performance.now();
    pointers.set(event.pointerId, { ...p, sampledX: p.x, sampledY: p.y, sampledAt: now });
    addRipple(p.x, p.y, pressureOf(event));
    document.body.classList.add('has-played');
    if (!announced) { status.textContent = 'Вода отозвалась; ведите касание, чтобы оставить след'; announced = true; }
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
      active.x = p.x; active.y = p.y;
    }
  }

  function end(event) {
    const active = pointers.get(event.pointerId);
    if (!active) return;
    addRipple(active.x, active.y, pressureOf(event), .55);
    pointers.delete(event.pointerId);
  }

  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', glide);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', event => pointers.delete(event.pointerId));
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
    const age = (now - mark.born) / 1000, life = reduced.matches ? .34 : 1.15;
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
    const age = (now - r.born) / 1000, life = (reduced.matches ? .55 : 2.7) * (.7 + r.strength * .3);
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

  function frame(now) {
    const dt = Math.min((now - last) / 1000, .05); last = now;
    water(now + dt);
    for (let i = trails.length - 1; i >= 0; i--) if (!drawTrail(trails[i], now)) trails.splice(i, 1);
    for (let i = ripples.length - 1; i >= 0; i--) if (!drawRipple(ripples[i], now)) ripples.splice(i, 1);
    requestAnimationFrame(frame);
  }
  resize(); requestAnimationFrame(frame);
})();
