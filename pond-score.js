((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PondScore = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const MAX_MEMORIES = 12;
  const MAX_POINTS = 24;
  const MOTIF_GAP_MS = 1400;
  const FULL_LIFE_MS = 18000;
  const REDUCED_LIFE_MS = 9000;
  const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const smoothstep = (from, to, value) => {
    const t = clamp((value - from) / Math.max(1, to - from));
    return t * t * (3 - 2 * t);
  };

  function compactPoints(samples) {
    const clean = (Array.isArray(samples) ? samples : [])
      .filter(sample => sample && Number.isFinite(sample.x) && Number.isFinite(sample.y))
      .map(sample => ({
        x: clamp(sample.x), y: clamp(sample.y),
        pitch: Number.isFinite(sample.pitch) ? clamp(sample.pitch) : clamp(sample.x),
        at: Number.isFinite(sample.at) ? sample.at : 0,
        pressure: clamp(Number.isFinite(sample.pressure) ? sample.pressure : .42)
      }));
    if (clean.length <= MAX_POINTS) return clean;
    const result = [];
    for (let index = 0; index < MAX_POINTS; index += 1) {
      result.push(clean[Math.round(index * (clean.length - 1) / (MAX_POINTS - 1))]);
    }
    return result;
  }

  function createMemory(samples, releasedAt) {
    const points = compactPoints(samples);
    if (!points.length || !Number.isFinite(releasedAt)) return null;
    const first = points[0], last = points[points.length - 1];
    const durationMs = Math.max(80, Math.min(8000, releasedAt - first.at));
    const pressure = points.reduce((sum, point) => sum + point.pressure, 0) / points.length;
    return Object.freeze({
      startedAt: first.at,
      born: releasedAt,
      durationMs,
      pitch: last.pitch,
      depth: last.y,
      pressure,
      points: Object.freeze(points.map(Object.freeze))
    });
  }

  function lifeMs(reducedMotion = false) {
    return reducedMotion ? REDUCED_LIFE_MS : FULL_LIFE_MS;
  }

  // A crossed phrase wakes as a small melodic figure: evenly spaced anchor
  // points of the stored gesture, always ending on its real final point.
  function melodyAnchors(memory, maximum = 3) {
    const limit = Math.max(1, Math.min(4, Math.trunc(Number.isFinite(maximum) ? maximum : 3)));
    const points = Array.isArray(memory?.points) ? memory.points.filter(point =>
      point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.pitch)) : [];
    if (!points.length) return [];
    if (points.length === 1 || limit === 1) return [points[points.length - 1]];
    const anchors = [];
    for (let index = 0; index < limit; index += 1) {
      const position = Math.round(index * (points.length - 1) / (limit - 1));
      const anchor = points[position];
      if (anchor !== anchors[anchors.length - 1]) anchors.push(anchor);
    }
    return anchors;
  }

  function visibility(memory, now, reducedMotion = false) {
    if (!memory || !Number.isFinite(now)) return 0;
    const age = now - memory.born;
    const life = lifeMs(reducedMotion);
    if (age < 0 || age >= life) return 0;
    const arrive = smoothstep(0, 260, age);
    const leave = 1 - smoothstep(life * .32, life, age);
    return arrive * leave;
  }

  function append(memories, memory, maximum = MAX_MEMORIES) {
    if (!memory) return Array.isArray(memories) ? memories.slice(-maximum) : [];
    return [...(Array.isArray(memories) ? memories : []), memory].slice(-Math.max(1, maximum));
  }

  function groupMotifs(memories, gapMs = MOTIF_GAP_MS) {
    const gap = Math.max(0, Number.isFinite(gapMs) ? gapMs : MOTIF_GAP_MS);
    const groups = [];
    const chronological = (Array.isArray(memories) ? memories : [])
      .filter(memory => memory && Number.isFinite(memory.startedAt) && Number.isFinite(memory.born))
      .slice().sort((a, b) => a.startedAt - b.startedAt || a.born - b.born);
    for (const memory of chronological) {
      const previous = groups.at(-1);
      if (!previous || memory.startedAt > previous.endedAt + gap) {
        groups.push({ startedAt: memory.startedAt, endedAt: memory.born, memories: [memory] });
      } else {
        previous.startedAt = Math.min(previous.startedAt, memory.startedAt);
        previous.endedAt = Math.max(previous.endedAt, memory.born);
        previous.memories.push(memory);
      }
    }
    return groups.map(group => Object.freeze({
      startedAt: group.startedAt,
      endedAt: group.endedAt,
      memories: Object.freeze(group.memories.slice())
    }));
  }

  function pointSegmentDistance(point, start, end) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= .000001) return Math.hypot(point.x - start.x, point.y - start.y);
    const amount = Math.max(0, Math.min(1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (start.x + dx * amount), point.y - (start.y + dy * amount));
  }

  function orientation(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  function within(value, start, end) {
    return value >= Math.min(start, end) - .000001 && value <= Math.max(start, end) + .000001;
  }

  function segmentsIntersect(a, b, c, d) {
    const abC = orientation(a, b, c), abD = orientation(a, b, d);
    const cdA = orientation(c, d, a), cdB = orientation(c, d, b);
    if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
        ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
    for (const [value, p, q, r] of [[abC, c, a, b], [abD, d, a, b], [cdA, a, c, d], [cdB, b, c, d]]) {
      if (Math.abs(value) <= .000001 && within(p.x, q.x, r.x) && within(p.y, q.y, r.y)) return true;
    }
    return false;
  }

  function segmentDistance(a, b, c, d) {
    if (segmentsIntersect(a, b, c, d)) return 0;
    return Math.min(
      pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d),
      pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b)
    );
  }

  function findCrossedMemory(memories, from, to, now, options = {}) {
    if (![from?.x, from?.y, to?.x, to?.y, now].every(Number.isFinite)) return null;
    const width = Math.max(1, Number.isFinite(options.width) ? options.width : 1);
    const height = Math.max(1, Number.isFinite(options.height) ? options.height : 1);
    const radiusPx = Math.max(1, Number.isFinite(options.radiusPx) ? options.radiusPx : 18);
    const reducedMotion = options.reducedMotion === true;
    const scale = point => ({ x: clamp(point.x) * width, y: clamp(point.y) * height });
    const strokeStart = scale(from), strokeEnd = scale(to);
    if (Math.hypot(strokeEnd.x - strokeStart.x, strokeEnd.y - strokeStart.y) < 4) return null;
    let closest = null;

    for (const memory of Array.isArray(memories) ? memories : []) {
      const visible = visibility(memory, now, reducedMotion);
      if (visible <= .035 || !Array.isArray(memory?.points) || !memory.points.length) continue;
      const points = memory.points.map(scale);
      if (points.length === 1) points.push(points[0]);
      for (let index = 1; index < points.length; index += 1) {
        const distancePx = segmentDistance(strokeStart, strokeEnd, points[index - 1], points[index]);
        if (distancePx <= radiusPx && (!closest || distancePx < closest.distancePx)) {
          closest = { memory, distancePx, segmentIndex: index - 1, visibility: visible };
        }
      }
    }
    return closest ? Object.freeze(closest) : null;
  }

  function serializePhrase(memories, nowPerf, nowEpoch) {
    const stamped = Number.isFinite(nowPerf) ? nowPerf : 0;
    const epoch = Number.isFinite(nowEpoch) ? nowEpoch : 0;
    const visible = (Array.isArray(memories) ? memories : [])
      .filter(memory => memory && Number.isFinite(memory.born) &&
        Number.isFinite(memory.startedAt) && stamped - memory.born > 0 &&
        stamped - memory.born < FULL_LIFE_MS)
      .slice(-MAX_MEMORIES);
    if (!visible.length) return null;
    return JSON.stringify({
      v: 1,
      savedAt: epoch,
      memories: visible.map(memory => ({
        born: epoch - Math.max(0, stamped - memory.born),
        startedAt: epoch - Math.max(0, stamped - memory.startedAt),
        durationMs: memory.durationMs,
        pitch: memory.pitch,
        depth: memory.depth,
        pressure: memory.pressure,
        points: memory.points.map(point => ({
          x: point.x, y: point.y, pitch: point.pitch,
          at: epoch - Math.max(0, stamped - point.at), pressure: point.pressure
        }))
      }))
    });
  }

  // ---- The pond's quiet diary ---------------------------------------------
  // Finished phrases stay in a small local diary: each entry is one fading
  // ink line drawn straight on the water. The pond keeps writing while it
  // plays; the reader only decides when to pour an older line back.

  const MAX_INK = 8;
  const INK_LIFE_MS = 54000;

  // Pure summary of one finished phrase: a bounded polyline, its depth,
  // force and hue anchor - enough to redraw the line without the audio
  // engine, the score memories or the DOM.
  function phraseInk(memory) {
    if (!memory || !Array.isArray(memory.points)) return null;
    const points = memory.points.filter(point =>
      point && Number.isFinite(point.x) && Number.isFinite(point.y)).slice(0, MAX_POINTS)
      .map(point => ({ x: clamp(point.x), y: clamp(point.y), pressure: clamp(Number.isFinite(point.pressure) ? point.pressure : .42) }));
    if (points.length < 2 || !Number.isFinite(memory.born)) return null;
    return {
      born: memory.born,
      durationMs: Math.max(80, Math.min(8000, Number.isFinite(memory.durationMs) ? memory.durationMs : 1200)),
      depth: clamp(memory.depth),
      pressure: clamp(memory.pressure),
      pitch: clamp(memory.pitch),
      points: points.map(point => Object.freeze(point))
    };
  }

  // Append one ink entry, dropping expired lines first and keeping the
  // diary bounded; broken input never grows or corrupts the diary.
  function appendPhraseInk(ink, entry, now = 0, lifeMsValue = INK_LIFE_MS) {
    const current = Array.isArray(ink) ? ink : [];
    if (!entry?.points?.length) return current;
    const life = Math.max(1, Number.isFinite(lifeMsValue) ? lifeMsValue : INK_LIFE_MS);
    const stamp = Number.isFinite(now) ? now : 0;
    const alive = current.filter(line =>
      line && Array.isArray(line.points) && line.points.length >= 2 && stamp - line.born < life);
    return [...alive, entry].slice(-MAX_INK);
  }

  function inkLifeMs(reducedMotion = false) {
    return reducedMotion ? Math.round(INK_LIFE_MS / 2) : INK_LIFE_MS;
  }

  // How much of an ink line is still on the water: a slow arrival, a long
  // calm plateau and then a patient dissolve into the surface.
  function inkVisibility(entry, now, reducedMotion = false) {
    if (!entry || !Number.isFinite(now)) return 0;
    const age = now - entry.born;
    const life = inkLifeMs(reducedMotion);
    if (!Number.isFinite(age) || age < 0 || age >= life) return 0;
    const arrive = smoothstep(0, 420, age);
    const leave = 1 - smoothstep(life * .5, life, age);
    return arrive * leave;
  }

  // The diary entries that can still be poured back: visible lines only,
  // oldest first so the panel reads like a small chronicle.
  function pourableInk(ink, now, reducedMotion = false) {
    return (Array.isArray(ink) ? ink : [])
      .filter(entry => inkVisibility(entry, now, reducedMotion) > .02)
      .sort((a, b) => a.born - b.born);
  }

  const LOOP_FIRST_DELAY_MS = 900;
  const LOOP_PASS_GAP_MS = 1500;
  const MAX_LOOP_PASSES = 6;
  // Shared constants for the rehearsal double-tap: what the surface counts as
  // a single calm tap far enough apart from a held chord or drag, how recent
  // the rhythm must be, and how much history the pond keeps around.
  const REHEARSAL_TAP_HOLD_MS = 260;
  const REHEARSAL_TAP_MOVE = 7;
  const REHEARSAL_WINDOW_MS = 1100;
  const REHEARSAL_MAX_TAPS = 4;

  function rehearsalDecision(taps = [], ink = [], now = 0, reducedMotion = false, options = {}) {
    const windowMs = Math.max(200, Math.min(2500, Number.isFinite(options.windowMs) ? options.windowMs : REHEARSAL_WINDOW_MS));
    const calmMove = Math.max(2, Math.min(30, Number.isFinite(options.calmMove) ? options.calmMove : 9));
    // taps are normalized to the surface (0..1), so the place spread is too
    const spread = Math.max(0.05, Math.min(1, Number.isFinite(options.spread) ? options.spread : 0.3));
    const minGap = Math.max(40, Math.min(600, Number.isFinite(options.minGap) ? options.minGap : 140));
    if (!Array.isArray(taps) || !Array.isArray(ink) || !Number.isFinite(now)) return null;
    const recent = taps
      .filter(tap => tap && Number.isFinite(tap.at) && now - tap.at <= windowMs && now - tap.at >= 0)
      .sort((a, b) => a.at - b.at);
    if (recent.length !== 2) return null;
    if (recent.some(tap => !Number.isFinite(tap.moved) || tap.moved > calmMove)) return null;
    const [first, second] = recent;
    if (second.at - first.at < minGap) return null;
    if (!Number.isFinite(first.x) || !Number.isFinite(first.y) ||
        !Number.isFinite(second.x) || !Number.isFinite(second.y)) return null;
    if (Math.hypot(second.x - first.x, second.y - first.y) > spread) return null;
    const line = pourableInk(ink, now, reducedMotion)
      .filter(entry => inkVisibility(entry, now, reducedMotion) > .25)
      .reduce((newest, entry) => newest === null || entry.born > newest.born ? entry : newest, null);
    if (!line) return null;
    return { line, at: second.at };
  }


  // arriving wider apart (triangular spacing keeps the circulation
  // breathing instead of metronomic), that never outlives the line's
  // visibility. Broken input and expired lines produce no schedule.
  function loopSchedule(line, now = 0, maximumPasses = MAX_LOOP_PASSES, reducedMotion = false) {
    if (!line || !Array.isArray(line.points) || line.points.length < 2 || !Number.isFinite(now)) return [];
    const life = inkLifeMs(reducedMotion);
    const remaining = life - Math.max(0, now - line.born);
    if (!Number.isFinite(remaining) || remaining <= 0) return [];
    const cap = Math.max(1, Math.min(8, Math.trunc(Number.isFinite(maximumPasses) ? maximumPasses : MAX_LOOP_PASSES)));
    const passes = [];
    for (let index = 0; index < cap; index += 1) {
      const at = LOOP_FIRST_DELAY_MS + LOOP_PASS_GAP_MS * index * (index + 1) / 2;
      if (at > remaining) break;
      passes.push(Object.freeze({ pass: index, at }));
    }
    return passes;
  }

  // A looping line is readable on the water itself: one warm point travels
  // the contour while the whole line breathes gently, so the circling state
  // survives even when the diary panel is closed. Reduced motion keeps a
  // still point and no breath (feedback stays, motion goes). Expired or
  // broken lines produce no probe.
  function loopProbe(line, now = 0, reducedMotion = false, options = {}) {
    if (!line || !Array.isArray(line.points) || line.points.length < 2 || !Number.isFinite(now)) return null;
    const visible = inkVisibility(line, now, reducedMotion);
    if (visible <= 0) return null;
    const travelMs = Math.max(800, Math.min(12000, Number.isFinite(options.travelMs) ? options.travelMs : 3600));
    const breathMs = Math.max(400, Math.min(8000, Number.isFinite(options.breathMs) ? options.breathMs : 2600));
    const travelPhase = reducedMotion ? 0 : (((now % travelMs) + travelMs) % travelMs) / travelMs;
    const breath = reducedMotion ? 0 : Math.sin((((now % breathMs) + breathMs) % breathMs) / breathMs * Math.PI * 2) * .5 + .5;
    return Object.freeze({ progress: travelPhase, breath, visible });
  }

  // A finished phrase can leave the pond as a compact self-contained scroll:
  // its real path, sounding pitch and depth, duration, pressure and chosen
  // current remain transportable without the audio engine or the DOM. Pure
  // geometry only, so the same fragment reads on any shell that understands it.
  const SCROLL_KEYS = 3;
  const round3 = value => Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;

  function phraseScroll(line, family = null) {
    if (!line || !Array.isArray(line.points) || line.points.length < 2) return null;
    const points = line.points
      .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
      .slice(0, MAX_POINTS)
      .map(point => ({
        x: clamp(point.x), y: clamp(point.y),
        pressure: clamp(Number.isFinite(point.pressure) ? point.pressure : .42)
      }));
    if (points.length < 2) return null;
    const last = points.at(-1);
    return Object.freeze({
      kind: 'pond-phrase-scroll',
      v: 1,
      path: Object.freeze(points.map(point => Object.freeze(point))),
      pitch: round3(Number.isFinite(line.pitch) ? clamp(line.pitch) : last.x),
      depth: round3(Number.isFinite(line.depth) ? clamp(line.depth) : last.y),
      durationMs: Math.max(80, Math.min(8000, Number.isFinite(line.durationMs) ? Math.round(line.durationMs) : 1200)),
      pressure: round3(Number.isFinite(line.pressure) ? clamp(line.pressure) : .42),
      family: typeof family === 'string' && family ? family : 'dawn',
      length: points.length
    });
  }

  // One quiet human line for carrying a phrase off the pond: a short numeric
  // contour (readable in plain text), then the essence already stored. This is
  // what the diary's third action lifts into the clipboard.
  function phraseScrollText(scroll) {
    if (!scroll || scroll.kind !== 'pond-phrase-scroll' || !Array.isArray(scroll.path) || scroll.path.length < 2) return null;
    const contour = scroll.path.map(point => `${round3(point.x)} ${round3(point.y)}`).join(' · ');
    return `Пруд-пианино · фраза\nконтур: ${contour}\nвысота ${Math.round(scroll.pitch * 100)} · глубина ${Math.round(scroll.depth * 100)} · ход ${(scroll.durationMs / 1000).toFixed(1)} с · течение ${scroll.family}`;
  }

  const FAMILY_KEYS = Object.freeze({ dawn: 'dawn', dusk: 'dusk', mist: 'mist', 'рассвет': 'dawn', 'сумерки': 'dusk', 'туман': 'mist' });
  const TAG_RE = /^пруд-пианино\s*·\s*фраза\s*$/i;
  const CONTOUR_RE = /^контур\s*:\s*(.+)$/;
  const ESSENCE_RE = /высота\s+(\d+)\s*·\s*глубина\s+(\d+)\s*·\s*ход\s+([\d.]+)\s*с\s*·\s*течение\s+(\S+)/;

  // The inverse of phraseScrollText: a pasted human line is read back into
  // a pure scroll shape, bounded and immune to damage. Unknown names, missing
  // contour points or malformed lines produce no scroll instead of garbage.
  function parseScrollText(text) {
    if (typeof text !== 'string' || !text.trim()) return null;
    const lines = text.split(/\r?\n/).map(line => line.trim());
    if (!lines.some(line => TAG_RE.test(line))) return null;
    const contourLine = lines.find(line => CONTOUR_RE.test(line));
    const essenceLine = lines.find(line => ESSENCE_RE.test(line));
    if (!contourLine || !essenceLine) return null;
    const points = [];
    for (const token of contourLine.match(CONTOUR_RE)[1].split('·')) {
      const [xRaw, yRaw] = token.trim().split(/\s+/);
      const x = Number(xRaw), y = Number(yRaw);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      points.push(Object.freeze({ x: clamp(x), y: clamp(y), pressure: .42 }));
    }
    if (points.length < 2) return null;
    const essence = essenceLine.match(ESSENCE_RE);
    const familyKey = essence[4].trim().toLowerCase();
    const family = FAMILY_KEYS[familyKey] ?? 'dawn';
    const durationMs = Math.max(80, Math.min(8000, Math.round(Number(essence[3]) * 1000)));
    return Object.freeze({
      kind: 'pond-phrase-scroll',
      v: 2,
      path: Object.freeze(points),
      pitch: round3(Math.max(0, Math.min(1, Number(essence[1]) / 100))),
      depth: round3(Math.max(0, Math.min(1, Number(essence[2]) / 100))),
      durationMs,
      pressure: .42,
      family,
      length: points.length
    });
  }

  // Turn a parsed scroll back into a fresh read-ink entry so a phrase that
  // left the pond can come home: the carried contour is re-seated as a new
  // line with a fresh birth time, ready to age and dissolve like any other.
  function inkFromScroll(scroll, now = 0) {
    if (!scroll || scroll.kind !== 'pond-phrase-scroll' || !Array.isArray(scroll.path) || scroll.path.length < 2) return null;
    const stamp = Number.isFinite(now) ? now : 0;
    const points = scroll.path
      .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
      .map(point => Object.freeze({ x: clamp(point.x), y: clamp(point.y), pressure: .42 }));
    if (points.length < 2) return null;
    const last = points.at(-1);
    return {
      born: stamp,
      durationMs: Math.max(80, Math.min(8000, Number.isFinite(scroll.durationMs) ? Math.round(scroll.durationMs) : 1200)),
      depth: clamp(Number.isFinite(scroll.depth) ? scroll.depth : last.y),
      pressure: .42,
      pitch: clamp(Number.isFinite(scroll.pitch) ? scroll.pitch : last.x),
      points: points.map(point => Object.freeze(point))
    };
  }

  // A carried scroll must stay readable even when it never meets a
  // clipboard: one bounded summary turns any parsed scroll - freshly
  // built or read back from pasted text - into the same quiet human
  // lines the shore leaf displays, plus plain numbers for probes.
  function scrollSummary(scroll) {
    if (!scroll || scroll.kind !== 'pond-phrase-scroll' ||
        !Array.isArray(scroll.path) || scroll.path.length < 2) return null;
    const points = scroll.path.filter(point =>
      point && Number.isFinite(point.x) && Number.isFinite(point.y));
    if (points.length < 2) return null;
    const pitch = Math.round(clamp(Number.isFinite(scroll.pitch) ? scroll.pitch : points.at(-1).x) * 100);
    const depth = Math.round(clamp(Number.isFinite(scroll.depth) ? scroll.depth : points.at(-1).y) * 100);
    const durationMs = Math.max(80, Math.min(8000,
      Number.isFinite(scroll.durationMs) ? Math.round(scroll.durationMs) : 1200));
    const family = typeof scroll.family === 'string' && FAMILY_KEYS[scroll.family]
      ? FAMILY_KEYS[scroll.family] : 'dawn';
    return Object.freeze({
      lines: Object.freeze([
        `Фраза: контур из ${points.length} точек`,
        `высота ${pitch} · глубина ${depth} · ход ${(durationMs / 1000).toFixed(1)} с · течение ${family}`
      ]),
      points: points.length,
      pitch, depth, durationMs, family
    });
  }

  // The pond must invite the first gesture itself: one quiet breathing ring
  // of light on the water plus a soft text line, both fading forever once
  // the water has actually sounded. Pure timing only — persistence and the
  // audio gate stay with the shell.
  const INVITE_BREATH_MS = 3400;
  const INVITE_RING_MS = 4600;
  function invitation(now = 0, reducedMotion = false) {
    if (!Number.isFinite(now) || now < 0) {
      return Object.freeze({ alpha: .5, radius: 1, text: 1 });
    }
    // The whole invitation fades out over its last seconds so it never
    // snaps away mid-gaze; reduced motion shares the same quiet exit.
    const fadeStart = INVITE_RING_MS * .55;
    const fade = now < fadeStart ? 1 : 1 - smoothstep(fadeStart, INVITE_RING_MS, now);
    if (reducedMotion) {
      return Object.freeze({ alpha: .5 * fade, radius: 1, text: fade });
    }
    const breathPhase = (((now % INVITE_BREATH_MS) + INVITE_BREATH_MS) % INVITE_BREATH_MS) / INVITE_BREATH_MS;
    const breath = Math.sin(breathPhase * Math.PI * 2) * .5 + .5;
    return Object.freeze({
      alpha: (0.34 + breath * .3) * fade,
      radius: 1 + breath * .16,
      text: fade
    });
  }

  // ---- The water whisper -------------------------------------------------
  // After the first invitation is gone, the pond still knows gestures the
  // surface never names: a long hold settles into precision, a small circle
  // raises an eddy, a fast straight release sends a skipping stone. A new
  // player deserves to meet them, so each real gesture may leave one short,
  // quiet hint on the water - once per session per gesture, never while a
  // hand is still down, and never two whispers at once.

  const WHISPER_HOLD_MS = 900;
  const WHISPER_PAUSE_MS = 16000;
  const WHISPER_LIFE_MS = 6200;
  const WHISPER_REDUCED_LIFE_MS = 9800;
  const WHISPER_MAX_SHOWN = 5;
  const WHISPER_KEYS = ['settle', 'eddy', 'stone', 'chord', 'gather'];
  const WHISPER_TEXTS = Object.freeze({
    settle: 'Задержите касание — вода подскажет высоту точнее',
    eddy: 'Обведите малый круг — родится тихий водоворот',
    stone: 'Быстрый прямой взмах отпускает камешек',
    chord: 'Задержите три и больше касаний — аккорд раскроет общий цветок',
    gather: 'Сведите два касания навстречу — родится светлая жемчужина'
  });

  function whisperState() {
    return {
      shown: { settle: false, eddy: false, stone: false, chord: false, gather: false },
      lastShownAt: -Infinity
    };
  }

  function whisperHint(state, events, now = 0) {
    if (!state || typeof state !== 'object' || !state.shown) return null;
    const list = (Array.isArray(events) ? events : []).filter(Boolean);
    for (const event of list) {
      if (!event || !WHISPER_KEYS.includes(event.kind)) continue;
      if (event.happened === false || state.shown[event.kind]) continue;
      if (!(now - state.lastShownAt >= WHISPER_PAUSE_MS)) return null;
      state.shown[event.kind] = true;
      state.lastShownAt = now;
      return {
        kind: event.kind,
        text: WHISPER_TEXTS[event.kind],
        born: Number.isFinite(now) ? now : 0,
        lifeMs: WHISPER_LIFE_MS,
        reducedLifeMs: WHISPER_REDUCED_LIFE_MS
      };
    }
    return null;
  }

  function whisperVisibility(hint, now = 0, reduced = false) {
    if (!hint || !Number.isFinite(now) || now < hint.born) return 0;
    const lifeMs = reduced ? hint.reducedLifeMs : hint.lifeMs;
    const age = now - hint.born;
    if (age >= lifeMs) return 0;
    const fadeIn = smoothstep(0, 700, age);
    const fadeOut = 1 - smoothstep(lifeMs * .62, lifeMs, age);
    return Math.max(0, Math.min(1, Math.min(fadeIn, fadeOut)));
  }

  function restorePhrase(serialized, nowPerf, nowEpoch) {
    const stamped = Number.isFinite(nowPerf) ? nowPerf : 0;
    const epoch = Number.isFinite(nowEpoch) ? nowEpoch : 0;
    if (typeof serialized !== 'string' || !serialized) return [];
    let parsed;
    try { parsed = JSON.parse(serialized); } catch { return []; }
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.memories)) return [];
    return parsed.memories
      .filter(memory => memory && Number.isFinite(memory.born) && Number.isFinite(memory.startedAt))
      .map(memory => {
        const points = (Array.isArray(memory.points) ? memory.points : [])
          .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
          .map(point => Object.freeze({
            x: clamp(point.x), y: clamp(point.y),
            pitch: clamp(Number.isFinite(point.pitch) ? point.pitch : point.x),
            at: stamped - Math.max(0, epoch - (Number.isFinite(point.at) ? point.at : epoch)),
            pressure: clamp(Number.isFinite(point.pressure) ? point.pressure : .42)
          }));
        return Object.freeze({
          startedAt: stamped - Math.max(0, epoch - memory.startedAt),
          born: stamped - Math.max(0, epoch - memory.born),
          durationMs: Math.max(80, Math.min(8000, Number.isFinite(memory.durationMs) ? memory.durationMs : 80)),
          pitch: clamp(Number.isFinite(memory.pitch) ? memory.pitch : (points.at(-1)?.pitch ?? .5)),
          depth: clamp(Number.isFinite(memory.depth) ? memory.depth : (points.at(-1)?.y ?? .5)),
          pressure: clamp(Number.isFinite(memory.pressure) ? memory.pressure : .42),
          points
        });
      })
      .filter(memory => { const age = stamped - memory.born; return Number.isFinite(age) && age > 0 && age < FULL_LIFE_MS; });
  }

  return Object.freeze({
    MAX_MEMORIES, MAX_POINTS, MOTIF_GAP_MS,
    createMemory, lifeMs, visibility, append, groupMotifs, findCrossedMemory,
    melodyAnchors, serializePhrase, restorePhrase,
    MAX_INK, INK_LIFE_MS, phraseInk, appendPhraseInk, inkLifeMs, inkVisibility, pourableInk,
    LOOP_FIRST_DELAY_MS, LOOP_PASS_GAP_MS, MAX_LOOP_PASSES, loopSchedule, loopProbe,
    rehearsalDecision, REHEARSAL_TAP_HOLD_MS, REHEARSAL_TAP_MOVE, REHEARSAL_WINDOW_MS, REHEARSAL_MAX_TAPS,
    INVITE_BREATH_MS, INVITE_RING_MS, invitation,
    phraseScroll, phraseScrollText, parseScrollText, inkFromScroll, scrollSummary,
    whisperState, whisperHint, whisperVisibility,
    WHISPER_HOLD_MS, WHISPER_PAUSE_MS, WHISPER_LIFE_MS, WHISPER_REDUCED_LIFE_MS, WHISPER_MAX_SHOWN, WHISPER_TEXTS
  });
});
