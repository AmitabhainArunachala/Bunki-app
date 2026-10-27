// Diagnostic-only event-delivery recorder for the silent "open saved context" (1830/1834), used by
// verify-publisher-reading in KAIRO_PUBLISHER_EVENT_DIAGNOSTICS=1 mode. installEventDiagnostics runs as an init
// script before any app script: private per-node ids (a WeakMap, shared with the source probes as
// window.__diagId), window capture listeners registered before the app's and bubble listeners after the target,
// every stopPropagation/stopImmediatePropagation/preventDefault on press and click events (the original is always
// called), and a MutationObserver on the document itself. It never prevents, stops, dispatches, focuses, selects
// or awaits anything; a failure inside the recorder sets a durable fault and stops recording, and the original method
// still runs exactly once. Each event object gets a private id shared by all of its rows. openSnapshot reads the Open
// button's state at action time. classifyOpen is pure and gives INCONCLUSIVE whenever the evidence is missing,
// truncated, faulted, unreadable, ambiguous or from another document.

export const EVENT_RECORDER_VERSION = 'publisher-event-diagnostics/2';

export function installEventDiagnostics(win, cap = 5000) {
  if (win.__evDiag) return;
  const ids = new WeakMap();
  let next = 0;
  const idOf = (node) => {
    if (!node || (typeof node !== 'object' && typeof node !== 'function')) return null;
    if (!ids.has(node)) ids.set(node, ++next);
    return ids.get(node);
  };
  // one private id per event object, shared by its capture, bubble and stop/prevent rows and the Open listener entry
  const eventIds = new WeakMap();
  let nextEvent = 0;
  const eventIdOf = (event) => {
    if (!event || typeof event !== 'object') return null;
    if (!eventIds.has(event)) eventIds.set(event, ++nextEvent);
    return eventIds.get(event);
  };
  win.__diagId = idOf;
  win.__diagEventId = eventIdOf;
  const state = { version: 'publisher-event-diagnostics/2', docId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    cap, truncated: false, fault: null, rows: [] };
  win.__evDiag = state;
  // a failure inside the recorder sets one durable fault (no clock, no row) and stops all further recording; it never
  // reaches the page, and never prevents or repeats the original method
  const fail = (where, error) => { if (!state.fault) state.fault = { where, message: String((error && error.message) || error) }; };
  const now = () => win.performance.now();
  const add = (row) => {
    if (state.fault) return;
    if (state.rows.length >= cap) { state.truncated = true; return; }
    state.rows.push({ now: now(), ...row });
  };
  const guarded = (where, fn) => (...args) => {
    if (state.fault) return;
    try { fn(...args); } catch (error) { fail(where, error); }
  };
  const describe = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (node === win) return 'window';
    if (node.nodeType === 9) return 'document';
    if (node.nodeType !== 1) return `node:${node.nodeType}`;
    const cls = typeof node.className === 'string' && node.className.trim() ? `.${node.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${String(node.tagName).toLowerCase()}${node.id ? `#${node.id}` : ''}${cls}${node.isConnected === false ? ' (detached)' : ''}`;
  };
  const ref = (node) => [idOf(node), describe(node)];
  const OPEN = '[id$="-context-open"]', SECTION = '.publisher-context-selection';
  const doc = () => win.document;
  const openButtons = () => Array.from(doc()?.querySelectorAll?.(OPEN) || []);
  const chain = (node) => {
    const out = [];
    for (let n = node, depth = 0; n && n.nodeType === 1 && depth < 12; n = n.parentElement, depth += 1) {
      const style = win.getComputedStyle ? win.getComputedStyle(n) : null;
      out.push({ node: ref(n), disabled: !!n.disabled, inert: !!n.inert, ariaDisabled: n.getAttribute?.('aria-disabled') ?? null,
        pointerEvents: style?.pointerEvents ?? null, visibility: style?.visibility ?? null, display: style?.display ?? null });
    }
    return out;
  };
  const openInfo = (node) => {
    const button = node?.closest?.(OPEN);
    if (!button) return null;
    return { node: ref(button), connected: button.isConnected, disabled: !!button.disabled,
      current: doc()?.getElementById?.(button.id) === button, duplicates: openButtons().length };
  };
  const relevant = (node) => !!(node?.closest?.(OPEN) || node?.closest?.(SECTION));
  const TYPES = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'pointercancel', 'touchstart', 'touchend'];
  const listen = (phase) => (event) => {
    const target = event.target;
    const row = { id: phase, event: eventIdOf(event), t: event.timeStamp, type: event.type, trusted: event.isTrusted, button: event.button ?? null,
      pointerType: event.pointerType ?? null, x: event.clientX ?? null, y: event.clientY ?? null, target: ref(target),
      defaultPrevented: event.defaultPrevented, cancelBubble: event.cancelBubble, open: openInfo(target) };
    if (phase === 'capture') {
      row.path = (event.composedPath?.() || []).slice(0, 14).map(ref);
      if (relevant(target) || event.type === 'click') {
        const at = typeof event.clientX === 'number' && doc()?.elementFromPoint ? doc().elementFromPoint(event.clientX, event.clientY) : null;
        row.hit = at ? { node: ref(at), open: openInfo(at) } : null;
        const live = openButtons();
        row.live = live.map(ref);
        row.chain = live.length ? chain(live[live.length - 1]) : [];
      }
    }
    add(row);
  };
  for (const type of TYPES) {
    win.addEventListener(type, guarded('capture', listen('capture')), true);
    win.addEventListener(type, guarded('bubble', listen('bubble')), false);
  }
  const stack = () => String(new Error().stack || '').split('\n').slice(2, 9).map((line) => line.trim());
  for (const method of ['stopPropagation', 'stopImmediatePropagation', 'preventDefault']) {
    const original = win.Event.prototype[method];
    win.Event.prototype[method] = function observed(...args) {
      if (!state.fault) {
        try {
          if (TYPES.includes(this.type))
            add({ id: method, event: eventIdOf(this), t: this.timeStamp, type: this.type, target: ref(this.target), current: ref(this.currentTarget),
              phase: this.eventPhase, stack: stack() });
        } catch (error) { fail(method, error); }
      }
      // the original, exactly once, with the same receiver and arguments; its return value or exception is the caller's
      return original.apply(this, args);
    };
  }
  win.addEventListener('error', guarded('error', (event) => add({ id: 'error', message: String(event.message || event.error?.message || '') })));
  win.addEventListener('unhandledrejection', guarded('unhandledrejection', (event) => add({ id: 'unhandledrejection', message: String(event.reason?.message || event.reason || '') })));
  for (const type of ['pagehide', 'beforeunload', 'visibilitychange']) win.addEventListener(type, guarded(type, () => add({ id: type, visibility: doc()?.visibilityState ?? null })));
  if (typeof win.MutationObserver === 'function' && doc()) {
    const watched = (node) => node?.nodeType === 1 && (node.matches?.(`${OPEN},${SECTION}`) || !!node.querySelector?.(`${OPEN},${SECTION}`));
    const opensIn = (node) => (node.matches?.(OPEN) ? [node] : Array.from(node.querySelectorAll?.(OPEN) || [])).map(ref);
    new win.MutationObserver(guarded('mutation', (list) => {
      for (const m of list) {
        if (m.type === 'childList') {
          for (const n of m.removedNodes) if (watched(n)) add({ id: 'removed', node: ref(n), parent: ref(m.target), opens: opensIn(n) });
          for (const n of m.addedNodes) if (watched(n)) add({ id: 'added', node: ref(n), parent: ref(m.target), opens: opensIn(n) });
        } else if (openButtons().some((button) => button === m.target || m.target.contains?.(button))) {
          add({ id: 'attribute', node: ref(m.target), name: m.attributeName, value: m.target.getAttribute?.(m.attributeName) ?? null });
        }
      }
    })).observe(doc(), { childList: true, subtree: true, attributes: true,
      attributeFilter: ['disabled', 'inert', 'hidden', 'style', 'class', 'aria-hidden', 'aria-busy', 'aria-expanded'] });
  }
  guarded('install', () => add({ id: 'install', docId: state.docId, url: String(win.location?.href || '') }))();
}

/** Page function (page.evaluate): the Open button's state at action time, read only. */
export function openSnapshot() {
  const idOf = window.__diagId || (() => null);
  const describe = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (node === window) return 'window';
    if (node.nodeType === 9) return 'document';
    if (node.nodeType !== 1) return `node:${node.nodeType}`;
    const cls = typeof node.className === 'string' && node.className.trim() ? `.${node.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${String(node.tagName).toLowerCase()}${node.id ? `#${node.id}` : ''}${cls}${node.isConnected === false ? ' (detached)' : ''}`;
  };
  const ref = (node) => [idOf(node), describe(node)];
  const chain = [];
  const button = document.getElementById('publisher-context-open');
  for (let n = button, depth = 0; n && n.nodeType === 1 && depth < 12; n = n.parentElement, depth += 1) {
    const style = getComputedStyle(n);
    chain.push({ node: ref(n), disabled: !!n.disabled, inert: !!n.inert, ariaDisabled: n.getAttribute('aria-disabled'),
      pointerEvents: style.pointerEvents, visibility: style.visibility, display: style.display });
  }
  const box = button?.getBoundingClientRect();
  const center = box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
  const hit = center ? document.elementFromPoint(center.x, center.y) : null;
  return {
    now: performance.now(), docId: window.__evDiag?.docId ?? null,
    live: Array.from(document.querySelectorAll('[id$="-context-open"]')).map(ref), byId: button ? ref(button) : null,
    rect: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null, center,
    hit: hit ? ref(hit) : null, hitInside: !!(hit && button && button.contains(hit)), disabled: !!button?.disabled, chain,
    active: ref(document.activeElement), expanded: Array.from(document.querySelectorAll('[aria-expanded="true"]')).map(ref),
    dialogs: Array.from(document.querySelectorAll('dialog[open],[role="dialog"]')).map(ref),
    selection: String(window.getSelection?.() || '').slice(0, 80), scrollY: window.scrollY,
  };
}

/** Pure: what the evidence says happened to the Open click. Never classifies from missing, truncated, faulted or
 * unreadable evidence, or from a document other than the one the Open action ran in. Only the one trusted click
 * inside the action interval (the pre read to the post read, same document) is attributed, and its bubble, its
 * stops and the Open listener entry are joined to it by the private event id; untrusted, late or other events stay
 * raw evidence. A failed native click is that action's result, never a delivery cause. */
export function classifyOpen({ ctx, recorder, pre, post = null, click, page = {} }) {
  const reasons = [];
  if (!recorder || recorder.captureError) reasons.push('the event recorder could not be read');
  else {
    if (recorder.version !== EVENT_RECORDER_VERSION) reasons.push('the event recorder is missing or another version');
    if (recorder.fault) reasons.push(`the event recorder faulted (${recorder.fault.where})`);
    if (recorder.truncated) reasons.push('the event recorder was truncated');
    if (!Array.isArray(recorder.rows) || !recorder.rows.some((row) => row.id === 'install' && row.docId === recorder.docId))
      reasons.push('the recorder install row is missing');
  }
  if (!Array.isArray(ctx)) reasons.push('the source probe records could not be read');
  else if (!ctx.some((row) => row.id === 'reg-open')) reasons.push('no Open listener registration was recorded');
  if (!pre || !click) reasons.push('the Open action was not reached');
  else if (pre.snapshotError) reasons.push('the Open button state could not be read before the click');
  else if (recorder && !recorder.captureError && pre.docId !== recorder.docId) reasons.push('the document changed between the Open action and capture');
  const postRead = !!(post && !post.snapshotError);
  if (click?.ok === true && !postRead) reasons.push('the Open button state could not be read after a successful click');
  if (postRead && pre && !pre.snapshotError && post.docId !== pre.docId) reasons.push('the document changed during the Open action');
  if (page.crashed) reasons.push('the page crashed');
  if (page.closed) reasons.push('the page closed before capture');
  if (reasons.length) return { verdict: 'INCONCLUSIVE', reasons, classification: null, facts: null };

  const registered = ctx.filter((row) => row.id === 'reg-open').map((row) => row.node);
  const live = pre.byId?.[0] ?? null;
  const base = { registeredOpen: registered, liveOpen: live, liveRegistered: registered.includes(live), duplicates: pre.live?.length ?? null,
    preHitInside: pre.hitInside, preDisabled: pre.disabled, click: { ok: click.ok === true, error: click.error ?? null } };
  if (click.ok !== true) return { verdict: 'OBSERVED', reasons: [], classification: 'native-click-failed', facts: base };

  const from = pre.now, to = post.now;
  const inAction = recorder.rows.filter((row) => row.now >= from && row.now <= to);
  const candidates = inAction.filter((row) => row.id === 'capture' && row.type === 'click' && row.trusted === true);
  if (candidates.length > 1)
    return { verdict: 'INCONCLUSIVE', reasons: [`${candidates.length} trusted click candidates in the action interval`], classification: null, facts: null };
  const presses = inAction.filter((row) => row.id === 'capture' && row.trusted === true && ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].includes(row.type));
  const ignored = inAction.filter((row) => row.id === 'capture' && row.trusted !== true).length;
  const facts = { ...base, presses: presses.map((row) => ({ type: row.type, target: row.target, open: row.open, hit: row.hit ?? null })), ignoredUntrusted: ignored,
    removedLive: inAction.filter((row) => row.id === 'removed' && row.opens?.some(([id]) => id === live)).length };
  if (!candidates.length)
    return { verdict: 'OBSERVED', reasons: [], classification: presses.length ? 'press-without-click' : 'no-native-input-observed', facts };

  const action = candidates[0], event = action.event;
  const bubble = recorder.rows.find((row) => row.id === 'bubble' && row.event === event) || null;
  const stops = recorder.rows.filter((row) => ['stopPropagation', 'stopImmediatePropagation'].includes(row.id) && row.event === event);
  const listener = ctx.filter((row) => row.id === 'listener-open' && row.event === event);
  const entered = listener.length > 0 && ctx.some((row) => row.id === 'enter' && row.discuss === true && row.t >= listener[0].t && row.t <= to);
  Object.assign(facts, {
    action: { event, target: action.target, open: action.open, hit: action.hit ?? null, path: action.path },
    bubbled: !!bubble, stops: stops.map((row) => ({ method: row.id, current: row.current, phase: row.phase, stack: row.stack })),
    listenerRan: listener.length > 0, enteredOpen: entered,
  });
  let classification;
  if (facts.listenerRan && entered) classification = 'listener-ran-and-keepSelection-entered';
  else if (facts.listenerRan) classification = 'listener-ran-without-keepSelection-entry';
  else if (!action.open) classification = 'click-landed-outside-open-button';
  else if (!registered.includes(action.open.node[0])) classification = 'clicked-unregistered-open-node';
  else if (stops.length) classification = 'click-propagation-stopped';
  else if (!bubble) classification = 'bubble-not-observed';
  else classification = 'click-reached-registered-node-but-listener-did-not-run';
  return { verdict: 'OBSERVED', reasons: [], classification, facts };
}
