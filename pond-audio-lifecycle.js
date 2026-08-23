((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PondAudioLifecycle = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  function create({ createEngine, primeEngine = () => {}, retireEngine = () => {}, onState = () => {}, isVisible = () => true }) {
    if (typeof createEngine !== 'function') throw new TypeError('createEngine must be a function');
    let engine = null;
    let backgrounded = false;
    let resumeToken = 0;
    let resumePending = false;

    const report = (reason, error = null) => onState({
      reason,
      error,
      engine,
      state: engine?.context?.state ?? 'uninitialized',
      backgrounded,
      resumePending
    });

    function retire(reason) {
      if (engine) retireEngine(engine, reason);
    }

    function contextStateChanged() {
      if (!engine) return;
      const state = engine.context.state;
      if (state === 'closed') {
        retire('closed');
        report('closed');
      } else if (state === 'interrupted' || (state === 'suspended' && !backgrounded && isVisible() && !resumePending)) {
        retire(state);
        report('gesture-required');
      } else {
        report('context-state');
      }
    }

    function attachContextListener(context) {
      if (typeof context.addEventListener === 'function') context.addEventListener('statechange', contextStateChanged);
      else context.onstatechange = contextStateChanged;
    }

    function activateFromGesture() {
      backgrounded = false;
      if (!engine) {
        engine = createEngine();
        if (!engine?.context) return null;
        attachContextListener(engine.context);
        report('created');
      }
      const context = engine.context;
      if (context.state === 'closed') {
        report('closed');
        return null;
      }
      if (context.state !== 'running') {
        try { primeEngine(engine); } catch (error) { report('prime-failed', error); }
        const token = ++resumeToken;
        resumePending = true;
        let attempt;
        try {
          attempt = context.resume();
        } catch (error) {
          resumePending = false;
          retire('resume-failed');
          report('resume-failed', error);
          return null;
        }
        Promise.resolve(attempt).then(() => {
          if (token !== resumeToken) return;
          if (context.state !== 'running') {
            retire('resume-incomplete');
            report('gesture-required');
          }
        }).catch(error => {
          if (token !== resumeToken) return;
          retire('resume-failed');
          report('resume-failed', error);
        }).finally(() => {
          if (token !== resumeToken) return;
          resumePending = false;
          report('resume-settled');
        });
      }
      report('gesture');
      return engine;
    }

    function background(reason = 'background') {
      if (backgrounded) return;
      backgrounded = true;
      resumeToken += 1;
      resumePending = false;
      retire(reason);
      report('background');
    }

    function foreground() {
      if (!backgrounded && engine?.context?.state === 'running') return;
      backgrounded = false;
      report(engine && engine.context.state !== 'running' ? 'gesture-required' : 'foreground');
    }

    return Object.freeze({
      activateFromGesture,
      background,
      foreground,
      getEngine: () => engine,
      snapshot: () => ({
        initialized: Boolean(engine),
        state: engine?.context?.state ?? 'uninitialized',
        backgrounded,
        resumePending
      })
    });
  }

  // Pure policy for the wake lock: true when the shell should keep the screen awake.
  // The lock may only be sought while a gesture is audible. backgrounding or silence
  // must release it so a phone can sleep naturally.
  function keepScreenAwake({ visible, soundingVoices }) {
    return Boolean(visible) && soundingVoices > 0;
  }

  return Object.freeze({ create, keepScreenAwake });
});
