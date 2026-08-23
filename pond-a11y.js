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

  return Object.freeze({
    expandedState, countIndex: trapIndex, openIndex
  });
});