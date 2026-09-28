((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PondA11y = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));

  // ---- Honest disclosure -------------------------------------------------
  // A popover's expanded state must never claim open while the panel is
  // actually closed. Keeping this a pure coercion makes the browser wiring
  // testable without a DOM: the shell asks "is it really open?" and only the
  // answer drives aria-expanded.

  function expandedState(open, muted = false) {
    // Muted is not an open state: the volume stone may be muted while the
    // panel stays closed, and expanded must still read false.
    return open === true ? 'true' : 'false';
  }

  // ---- Focus trap ----------------------------------------------------------
  // While an open modal panel holds focus, Tab and Shift+Tab must stay inside
  // it. The pure model only computes the next target index from a bounded
  // tabbable count; the browser layer applies real focus. Broken input falls
  // back to keeping the current index.
  function trapIndex(current, count, direction = 'forward') {
    const size = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
    if (size <= 0) return null;
    const at = Math.max(0, Math.min(size - 1, Math.trunc(Number.isFinite(current) ? current : 0)));
    const step = direction === 'backward' ? -1 : 1;
    return (at + step + size) % size;
  }

  // When a panel is opened, focus should move into it (into its first
  // interactive control) rather than resting on the trigger. When it closes,
  // focus should return to the element that opened it. These just shape the
  // intent; the browser applies focus to the real nodes.
  function openIndex(count) {
    return count > 0 ? 0 : null;
  }

  // Describe the eleven actual struck-bowl cells, not an imaginary
  // continuous pitch: this is the same round-to-nearest mapping as bowlFrequency.
  // Depth is a coarse spoken landmark rather than a second hidden keyboard.
  function bowlLocation(x, y) {
    const horizontal = clamp(x), depth = clamp(y);
    const index = Math.round(horizontal * 10) + 1;
    const depthName = depth < 1 / 3 ? 'мелкая' : depth < 2 / 3 ? 'средняя' : 'глубокая';
    return Object.freeze({ index, depthName,
      text: `чаша ${index} из 11, вода: ${depthName}` });
  }

  // ---- The keyboard's own slate -------------------------------------------
  // The pond answers more than a strike: arrows choose a bowl and a depth, the
  // held dive sinks, G folds two currents into a pearl, H opens the three-voice
  // flower. A sighted keyboard player had no way to discover any of that, and
  // screen readers only heard one long sentence. This is the same honest list
  // for both: every route names a key the shell really handles, in the order a
  // new player needs them, and the copy is rendered as text rather than baked
  // into markup so it cannot drift from the layer that proves it.
  const KEYBOARD_LEGEND = Object.freeze([
    Object.freeze({ keys: 'Стрелки', text: 'выбрать одну из 11 чаш и глубину следующего удара' }),
    Object.freeze({ keys: 'Пробел или Enter', text: 'ударить выбранную чашу' }),
    Object.freeze({ keys: 'Выдержка + ↓', text: 'после спокойной выдержки нырнуть в глубину' }),
    Object.freeze({ keys: 'G с зажатой чашей', text: 'открыть второе течение и свести его в жемчужину' }),
    Object.freeze({ keys: 'H с зажатой чашей', text: 'открыть два соседних течения и удержать общий цветок' }),
    Object.freeze({ keys: '?', text: 'открыть или закрыть эту карту' }),
    Object.freeze({ keys: 'Escape', text: 'закрыть карту или панель берега' })
  ]);

  function keyboardLegend() {
    return KEYBOARD_LEGEND;
  }

  // ---- The pond teaches its keyboard once --------------------------------
  // A sighted player who tabs into the water had to guess that "?" exists;
  // screen readers already hear the whole sentence. The map may introduce
  // itself exactly once on the first honest keyboard visit, but only while
  // it is still a stranger: after the player has played by keyboard, closed
  // it, or been told once before on this device, it stays quiet. The decision
  // is pure so the shell never has to re-derive it from the DOM.
  const LEGEND_INTRO_VERSION = 1;

  function legendIntroKey(version = LEGEND_INTRO_VERSION) {
    const v = Number.isFinite(version) && version > 0 ? Math.trunc(version) : LEGEND_INTRO_VERSION;
    return `pond-piano.legend-intro.v${v}`;
  }

  function shouldIntroduceLegend(state = {}) {
    const keyboardVisit = state.keyboardVisit === true;
    const seen = state.seen === true;
    const dismissed = state.dismissed === true;
    return keyboardVisit && !seen && !dismissed;
  }

  function legendIntroText() {
    return 'Карта клавиш открылась сама: стрелки, пробел и G с H — вода отвечает. Закройте Escape или просто играйте.';
  }

  // ---- The map never pushes the pond -------------------------------------
  // The slate hangs below its trigger. On a short viewport — a phone in
  // landscape, a small window — a fixed panel runs past the water's bottom
  // edge, and then revealing the close button scrolls the whole composition
  // up and cuts the title off the top: the pond moved to make room for a
  // document. The panel may only be as tall as the honest room left below its
  // anchor, so the water stays where it is and the list scrolls inside. The
  // shell measures; the model decides.
  const LEGEND_FIT_GAP = 8;
  const LEGEND_FIT_EDGE = 12;

  function legendFitHeight(anchorBottom, viewportHeight, options = {}) {
    const gap = Number.isFinite(options.gap) ? options.gap : LEGEND_FIT_GAP;
    const edge = Number.isFinite(options.edge) ? options.edge : LEGEND_FIT_EDGE;
    const bottom = Number(anchorBottom), height = Number(viewportHeight);
    if (!Number.isFinite(bottom) || !Number.isFinite(height)) return null;
    return Math.max(0, Math.round(height - bottom - gap - edge));
  }

  // ---- The water shows where the keyboard stands ---------------------------
  // A finger landing on the water meets a contact light at once; a sighted
  // keyboard player who tabbed in saw only the canvas focus ring — "focused",
  // not "here, this bowl, this depth". The resting light gives the keyboard
  // the same quiet pre-contact mark: it shows while the water owns focus and
  // yields the moment a strike really sounds, so the two lights never stack.
  // Pure geometry, bounded: a calm arrival, a breathing ring that stops under
  // reduced motion, and an honest null when the water is not focused.
  const REST_ARRIVAL_MS = 420;
  const REST_RADIUS_SHARE = .038;
  const REST_MIN_RADIUS = .012;
  const REST_MAX_RADIUS = .06;

  function restPlace(value) {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .5;
  }

  function keyboardRest(state = {}) {
    if (state.focused !== true || state.sounding === true) return null;
    const x = restPlace(state.x), y = restPlace(state.y);
    const now = Number(state.now), born = Number(state.born);
    const elapsed = Math.max(0, Number.isFinite(now) && Number.isFinite(born) ? now - born : 0);
    const reducedMotion = state.reducedMotion === true;
    const arrival = Math.min(1, elapsed / REST_ARRIVAL_MS);
    const pulse = reducedMotion ? 0 : .5 + Math.sin(elapsed * .0016) * .5;
    const radius = Math.max(REST_MIN_RADIUS, Math.min(REST_MAX_RADIUS,
      REST_RADIUS_SHARE * (.55 + (1 - x) * .45) * (.62 + arrival * .38)));
    return Object.freeze({
      x, y, radius, arrival, pulse, reducedMotion,
      alpha: .18 + .26 * arrival,
      ringAlpha: .22 + .3 * arrival,
      hue: 152 + 30 * (1 - y)
    });
  }

  return Object.freeze({
    expandedState, countIndex: trapIndex, openIndex, bowlLocation, keyboardLegend,
    legendIntroKey, shouldIntroduceLegend, legendIntroText, legendFitHeight, keyboardRest
  });
});