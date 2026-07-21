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
      pitch: last.x,
      depth: last.y,
      pressure,
      points: Object.freeze(points.map(Object.freeze))
    });
  }

  function lifeMs(reducedMotion = false) {
    return reducedMotion ? REDUCED_LIFE_MS : FULL_LIFE_MS;
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

  return Object.freeze({
    MAX_MEMORIES, MAX_POINTS, MOTIF_GAP_MS,
    createMemory, lifeMs, visibility, append, groupMotifs, findCrossedMemory
  });
});
