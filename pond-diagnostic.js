((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PondDiagnostic = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  // ---- The shore that examines itself -------------------------------------
  // The pond has one honest question left that no unit test can answer: how it
  // behaves on a real phone. This layer does not pretend to answer it. It turns
  // raw observations into calm, truthful lines, and says plainly when the water
  // has not been asked at all. Nothing here touches the DOM, the audio graph or
  // the diary; the shell only reads the answers out loud.

  const UNKNOWN_VALUE = 'вода ещё не знает';
  const FINGER_CAP = 6;
  const TAIL_MS = 3600; // The longest bowl tail (3.4-4.8 s) rounded down.

  const POINTER_NAMES = Object.freeze({ touch: 'палец', pen: 'перо', mouse: 'мышь' });

  function number(value) {
    return Number.isFinite(value) ? value : null;
  }

  // Russian counts, so an honest sentence never reads as a translated template.
  function fingerWord(count) {
    const n = Math.abs(Math.trunc(Number.isFinite(count) ? count : 0));
    const tens = n % 100;
    const ones = n % 10;
    if (tens >= 11 && tens <= 14) return 'пальцев';
    if (ones === 1) return 'палец';
    if (ones >= 2 && ones <= 4) return 'пальца';
    return 'пальцев';
  }

  // How many fingers the water actually held is the one device fact the pond
  // can gather by itself. A missing measurement is not zero fingers: it means
  // the hand was never seen, and that is said as nothing at all.
  function fingersHeld(best) {
    const held = number(best);
    if (held === null) return null;
    const n = Math.max(0, Math.trunc(held));
    if (n === 0) return 'вода ещё не держала пальцев';
    if (n === 1) return 'вода держала один палец';
    if (n >= FINGER_CAP) return `вода держала ${n} ${fingerWord(n)} — до самого предела`;
    return `вода держала ${n} ${fingerWord(n)}`;
  }

  function entry(id, label, value, state) {
    return Object.freeze({ id, label, value, state });
  }

  function movementEntry(reducedMotion) {
    if (reducedMotion === true) return entry('movement', 'движение', 'покой запрошен: рябь и следы сдержанны', 'measured');
    if (reducedMotion === false) return entry('movement', 'движение', 'покой не запрошен: вода движется полностью', 'measured');
    return entry('movement', 'движение', UNKNOWN_VALUE, 'unknown');
  }

  function waterEntry(audioState, sampleRate) {
    const rate = number(sampleRate);
    const hertz = rate === null ? null : `${Math.round(rate)} Гц`;
    if (audioState === 'running') {
      return entry('water', 'вода', hertz ? `проснулась, ${hertz}` : 'проснулась', hertz ? 'measured' : 'unknown');
    }
    if (audioState === 'suspended') return entry('water', 'вода', 'спит после жеста', 'measured');
    if (audioState === 'closed') return entry('water', 'вода', 'закрыта платформой', 'measured');
    if (audioState === 'uninitialized') return entry('water', 'вода', 'ещё не проснулась — первого жеста не было', 'measured');
    return entry('water', 'вода', UNKNOWN_VALUE, 'unknown');
  }

  function responseEntry(baseLatency) {
    const seconds = number(baseLatency);
    if (seconds === null || seconds < 0) return entry('response', 'отклик', UNKNOWN_VALUE, 'unknown');
    return entry('response', 'отклик', `${Math.round(seconds * 1000)} мс объявлено платформой`, 'measured');
  }

  function handEntry(vibrate) {
    if (vibrate === true) return entry('hand', 'рука', 'платформа умеет ответить толчком', 'measured');
    if (vibrate === false) return entry('hand', 'рука', 'толчка нет — вода отвечает только ухом', 'measured');
    return entry('hand', 'рука', UNKNOWN_VALUE, 'unknown');
  }

  function pointerEntry(pointerTypes) {
    if (!Array.isArray(pointerTypes)) return entry('pointers', 'указатели', UNKNOWN_VALUE, 'unknown');
    const seen = [];
    for (const kind of pointerTypes) {
      const name = POINTER_NAMES[kind] || (typeof kind === 'string' && kind ? kind : null);
      if (name && !seen.includes(name)) seen.push(name);
    }
    if (!seen.length) return entry('pointers', 'указатели', 'вода ещё не видела касаний', 'measured');
    return entry('pointers', 'указатели', seen.join(', '), 'measured');
  }

  function fingerEntry(maxFingers) {
    const text = fingersHeld(maxFingers);
    if (text === null) return entry('fingers', 'пальцы', UNKNOWN_VALUE, 'unknown');
    return entry('fingers', 'пальцы', text, 'measured');
  }

  function environmentReport(probe) {
    const source = probe && typeof probe === 'object' ? probe : {};
    return Object.freeze([
      movementEntry(source.reducedMotion),
      waterEntry(source.audioState, source.sampleRate),
      responseEntry(source.baseLatency),
      handEntry(source.vibrate),
      pointerEntry(source.pointerTypes),
      fingerEntry(source.maxFingers)
    ]);
  }

  // ---- What a human ear still has to judge --------------------------------
  // The same material the listening gate asks about, written as deterministic
  // plans so a phone plays exactly what was recorded: no random preset, no
  // diary entry, no new audio node type. The shell only schedules these
  // strikes through the ordinary bowl path.

  function strike(at, x, y, options = {}) {
    return Object.freeze({
      at: Math.max(0, at),
      x, y,
      holdMs: Math.max(0, number(options.holdMs) ?? 0),
      pressure: number(options.pressure) ?? .48,
      shade: Math.max(0, Math.trunc(number(options.shade) ?? 0))
    });
  }

  function scenario(id, title, sentence, strikes) {
    const span = strikes.reduce((end, item) => Math.max(end, item.at + item.holdMs), 0) + TAIL_MS;
    return Object.freeze({ id, title, sentence, spanMs: span, strikes: Object.freeze(strikes) });
  }

  function acceptanceScenarios() {
    const taps = [];
    const columnX = [.12, .3, .48, .66, .84, .2, .38, .56, .74, .88, .26, .62];
    const rowY = [.3, .62, .44, .74, .36, .68, .5, .58, .4, .7, .55, .46];
    for (let index = 0; index < columnX.length; index += 1) {
      taps.push(strike(index * 260, columnX[index], rowY[index], { pressure: .46 + (index % 3) * .04, shade: index % 3 }));
    }

    return Object.freeze([
      scenario('taps', 'Короткие касания',
        'двенадцать коротких касаний вразброс: родственны ли чаши по характеру или звучат одной',
        taps),
      scenario('hold', 'Долгая вода',
        'одно долгое удержание: раскрывается ли материал и не превращается ли в завывание',
        [strike(0, .5, .64, { holdMs: 6500, pressure: .52 })]),
      scenario('chord', 'Плотная ладонь',
        'пять пальцев разом: держится ли спокойствие вместо непрерывного звона',
        [
          strike(0, .28, .55, { holdMs: 900, pressure: .5, shade: 0 }),
          strike(0, .39, .5, { holdMs: 900, pressure: .5, shade: 1 }),
          strike(0, .5, .45, { holdMs: 900, pressure: .52, shade: 2 }),
          strike(0, .61, .5, { holdMs: 900, pressure: .5, shade: 0 }),
          strike(0, .72, .55, { holdMs: 900, pressure: .5, shade: 1 })
        ]),
      scenario('pearls', 'Встреча волн',
        'кольца встречаются на воде: слышна ли тихая жемчужина или только гул',
        [
          strike(0, .25, .4, { pressure: .5 }),
          strike(60, .31, .43, { pressure: .5 }),
          strike(420, .6, .5, { pressure: .5 }),
          strike(480, .66, .53, { pressure: .5 }),
          strike(840, .45, .68, { pressure: .5 }),
          strike(900, .51, .71, { pressure: .5 })
        ])
    ]);
  }

  function scenarioById(id) {
    return acceptanceScenarios().find(item => item.id === id) || null;
  }

  // ---- What only a human ear can decide -----------------------------------
  // The platform can be measured; how the water sounds cannot. These verdicts
  // are the listener's own words, kept on this shore and carried off it
  // unchanged. A scene nobody listened to is recorded as unheard, because a
  // silence is not an approval, and judging starts no sound of its own.

  const VERDICTS = Object.freeze(['unheard', 'sounds', 'off']);
  const VERDICT_LABELS = Object.freeze({ unheard: 'не слушал', sounds: 'звучит', off: 'мимо' });
  const NOTE_TITLE = 'Береговая записка пруда-пианино';

  function verdictLabel(value) {
    return typeof value === 'string' && VERDICT_LABELS[value] ? VERDICT_LABELS[value] : null;
  }

  function normalizeVerdict(value) {
    return verdictLabel(value) ? value : 'unheard';
  }

  function nextVerdict(current) {
    const here = normalizeVerdict(current);
    return VERDICTS[(VERDICTS.indexOf(here) + 1) % VERDICTS.length];
  }

  // Only the four real scenes are remembered; junk keys and junk values are
  // dropped instead of becoming a judgement nobody made.
  function normalizeVerdicts(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const kept = {};
    for (const scene of acceptanceScenarios()) kept[scene.id] = normalizeVerdict(source[scene.id]);
    return Object.freeze(kept);
  }

  function verdictLine(sceneId, value) {
    const scene = typeof sceneId === 'string' ? scenarioById(sceneId) : null;
    if (!scene) return null;
    return `Сцена «${scene.title}»: ${verdictLabel(normalizeVerdict(value))}`;
  }

  function verdictSummary(raw) {
    const judged = normalizeVerdicts(raw);
    const counts = { sounds: 0, off: 0, unheard: 0 };
    for (const scene of acceptanceScenarios()) counts[judged[scene.id]] += 1;
    return Object.freeze({ ...counts, judged: counts.sounds + counts.off });
  }

  // The shore keeps a fixed UTC+3 with no daylight shift, so the stamp is
  // written in that zone rather than in whatever the device happens to think.
  function momentStamp(at, offsetMinutes) {
    const ms = number(at);
    if (ms === null) return null;
    const offset = Number.isFinite(offsetMinutes) ? Math.trunc(offsetMinutes) : 0;
    const pad = value => String(value).padStart(2, '0');
    const clock = new Date(ms + offset * 60000);
    const zone = `UTC${offset < 0 ? '−' : '+'}${pad(Math.trunc(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
    return `${pad(clock.getUTCDate())}.${pad(clock.getUTCMonth() + 1)}.${clock.getUTCFullYear()}, ` +
      `${pad(clock.getUTCHours())}:${pad(clock.getUTCMinutes())} ${zone}`;
  }

  // One compact note, built only from what was really measured and from the
  // listener's own verdicts. Unknown readings are carried as unknown, never as
  // zero, and a missing clock drops the stamp instead of inventing a time.
  function shoreNote(source) {
    const input = source && typeof source === 'object' ? source : {};
    const report = environmentReport(input.probe);
    const judged = normalizeVerdicts(input.verdicts);
    const lines = [NOTE_TITLE];
    const stamp = momentStamp(input.at, input.offsetMinutes);
    if (stamp) lines.push(stamp);
    for (const entry of report) lines.push(`${entry.label}: ${entry.value}`);
    lines.push('суд уха:');
    for (const scene of acceptanceScenarios()) lines.push(`— ${verdictLine(scene.id, judged[scene.id])}`);
    const summary = verdictSummary(judged);
    lines.push(`Итог: ${summary.sounds} звучит, ${summary.off} мимо, ${summary.unheard} не слушал`);
    return Object.freeze({
      title: NOTE_TITLE,
      text: lines.join('\n'),
      lines: Object.freeze(lines),
      verdicts: judged,
      summary,
      measured: report.filter(entry => entry.state === 'measured').length,
      unknown: report.filter(entry => entry.state === 'unknown').length
    });
  }

  return Object.freeze({
    UNKNOWN_VALUE, FINGER_CAP, TAIL_MS,
    fingerWord, fingersHeld, environmentReport,
    acceptanceScenarios, scenarioById,
    VERDICTS, VERDICT_LABELS, NOTE_TITLE,
    verdictLabel, normalizeVerdict, nextVerdict, normalizeVerdicts,
    verdictLine, verdictSummary, momentStamp, shoreNote
  });
});