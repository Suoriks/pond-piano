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

  return Object.freeze({
    expandedState, countIndex: trapIndex, openIndex, bowlLocation, keyboardLegend
  });
});