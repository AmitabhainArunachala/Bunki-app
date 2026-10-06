/** Serialized into the browser by the verifier before the answer is triggered.
 * Observe one real overlay's lifecycle without changing its DOM or timers. The
 * caller retains its existing appearance/detachment deadlines and disposes this
 * handle even if those waits fail. Screenshot latency cannot erase an occurrence.
 */
export function observeGuidedMomentPhases() {
  const startedAt = performance.now();
  const state = { matched: false, ended: false, invalid: '', transitions: [] };
  let root = null;
  let previous = '';
  let observer;
  const sample = () => {
    if (state.ended || state.invalid) return;
    const overlays = [...document.querySelectorAll('.samurai-effect')];
    if (!root) root = overlays[0] || null;
    if (!root) return;
    const connected = root.isConnected;
    const impact = root.classList.contains('samurai-effect--impact');
    const resolve = root.classList.contains('samurai-effect--resolve');
    const signature = JSON.stringify([connected, overlays.length, impact, resolve]);
    if (signature !== previous) {
      state.transitions.push({
        ms: Math.round(performance.now() - startedAt),
        connected,
        overlays: overlays.length,
        impact,
        resolve,
      });
      previous = signature;
    }
    if (connected && overlays.length === 1 && overlays[0] === root && impact && resolve)
      state.matched = true;
    if (!connected) {
      state.ended = true;
      observer.disconnect();
    }
  };
  if (document.querySelector('.samurai-effect'))
    state.invalid = 'overlay existed before the answer';
  observer = new MutationObserver(sample);
  if (!state.invalid)
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  return {
    finish() {
      sample();
      observer.disconnect();
      return { ...state, pass: state.matched && state.ended && !state.invalid };
    },
    dispose() {
      observer.disconnect();
    },
  };
}
