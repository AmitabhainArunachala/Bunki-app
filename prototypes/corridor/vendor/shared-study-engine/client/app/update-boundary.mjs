/** Token-bound app hold for an automatic update. A request arms synchronously;
 * readiness is reported only after the app's own action flights and blockers
 * settle. Releasing a held token runs the stored continuation exactly once. */
export function createUpdateBoundary({
  readBlockers = () => [],
  readFlights = () => 0,
  onHold = () => {},
  onRelease = () => {},
} = {}) {
  let token = null, held = false, continuation = null, lastKey = null, disposed = false;
  const listeners = new Set();

  function snapshot() {
    const blockers = readBlockers();
    return { token, held, ready: held && readFlights() === 0 && blockers.length === 0, blockers };
  }

  function publish(next = null) {
    if (disposed) return;
    const state = next ?? snapshot();
    const key = JSON.stringify(state);
    if (key === lastKey) return;
    lastKey = key;
    for (const listener of [...listeners]) {
      try { listener(state); } catch { /* a listener cannot break the hold */ }
    }
  }

  function sync() {
    if (disposed || token === null && !held) return;
    const blockers = readBlockers();
    if (held) {
      // A blocker that appears while no action flight is left (a failed write
      // can leave an unsaved draft or preference) cannot clear itself behind
      // the inert UI. Release and resume instead of freezing forever; the
      // blocker values themselves stay untouched.
      if (readFlights() === 0 && blockers.length > 0) {
        release(token);
        return;
      }
      publish();
      return;
    }
    if (token !== null && readFlights() === 0 && blockers.length === 0) {
      held = true;
      continuation = null;
      onHold();
    }
    publish();
  }

  function request(nextToken) {
    if (typeof nextToken !== 'string' || !nextToken) return snapshot();
    if (disposed) return snapshot();
    if (held) {
      if (nextToken === token) publish();
      return snapshot();
    }
    if (token !== nextToken) {
      token = nextToken;
      continuation = null;
    }
    sync();
    return snapshot();
  }

  // The grade-success boundary calls this synchronously. Action flights that
  // are already tracked may keep draining (readiness waits for them), but a
  // dirty draft, unresolved operation or other non-flight blocker must defer
  // the hold so the normal grade continuation can advance first.
  function hold(nextContinuation) {
    if (disposed || held || token === null) return false;
    if (readBlockers().some(blocker => !String(blocker).startsWith('flight:'))) return false;
    held = true;
    continuation = typeof nextContinuation === 'function' ? nextContinuation : null;
    onHold();
    publish();
    return true;
  }

  function release(nextToken) {
    if (disposed || token === null || nextToken !== token) return false;
    const run = continuation;
    token = null;
    held = false;
    continuation = null;
    onRelease();
    try { if (run) run(); }
    finally { publish(); }
    return true;
  }

  function subscribe(listener) {
    if (disposed || typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    token = null;
    held = false;
    continuation = null;
    listeners.clear();
    onRelease();
  }

  return Object.freeze({
    request,
    read: snapshot,
    hold,
    release,
    sync,
    subscribe,
    dispose,
    get held() { return held; },
    get armed() { return token !== null; },
  });
}
