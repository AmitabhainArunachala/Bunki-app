// Node-side controls for the event-delivery follow-up (1830/1834, corrected per W2 1853). No browser: the served-source
// probes run in a sandbox, the page recorder runs on Node's own EventTarget/Event (or a spy Event), and the classifier
// gets synthetic evidence. A synthetic lifecycle validates the recorder and the classifier only; it never stands in
// for the real route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EVENT_PROBES, EVENT_PROBE_VERSION, PROBE_VERSION, applyProbes, probeOnlyDiff } from './publisher-context-probes.mjs';
import { installEventDiagnostics, classifyOpen, EVENT_RECORDER_VERSION } from './publisher-event-diagnostics.mjs';

const source = readFileSync(new URL('../corridor.js', import.meta.url), 'utf8');
const sha = (text) => createHash('sha256').update(Buffer.from(text)).digest('hex');
const keepEventPrototype = () => {
  const saved = ['stopPropagation', 'stopImmediatePropagation', 'preventDefault'].map((name) => [name, Event.prototype[name]]);
  return () => { for (const [name, fn] of saved) Event.prototype[name] = fn; };
};

test('the context-only served bytes are unchanged by the event probes (slot 1 body b8592e3d)', () => {
  assert.equal(sha(source), '70b35fdb78ccc87d66eba530017b7c294901286a876e41fb45c3ee9675f4c423');
  assert.equal(sha(applyProbes(source).source), 'b8592e3d2340b7565d47af44eae83690b7eabeed8fba05c428fcd9e64c096809');
});

test('every event-probe anchor is exact-once; a removed or doubled anchor refuses', () => {
  const { applied } = applyProbes(source, { events: true });
  assert.deepEqual(applied.slice(-3), ['render', 'reg-save', 'reg-open']);
  for (const probe of EVENT_PROBES) {
    assert.equal(source.split(probe.from).length - 1, 1, probe.id);
    assert.throws(() => applyProbes(source.replace(probe.from, ''), { events: true }), new RegExp(`probe ${probe.id}: anchor occurs 0 times`));
    assert.throws(() => applyProbes(source.replace(probe.from, probe.from + probe.from), { events: true }), new RegExp(`probe ${probe.id}: anchor occurs 2 times`));
  }
});

test('the events-mode served source differs from the original only by the probes, and the modes do not mix', () => {
  const probed = applyProbes(source, { events: true }).source;
  assert.equal(probeOnlyDiff(source, probed, { events: true }), true);
  assert.equal(probeOnlyDiff(source, probed), false, 'an events-mode body is not a context-mode body');
  assert.equal(probeOnlyDiff(source, applyProbes(source).source, { events: true }), false);
  assert.equal(probeOnlyDiff(source, probed.replace('openSaved.type = \'button\';', 'openSaved.type = "button";'), { events: true }), false);
  assert.equal(probed.split(`window.__ctxDiagVersion = ${JSON.stringify(EVENT_PROBE_VERSION)};\n`).length - 1, 1);
  assert.notEqual(EVENT_PROBE_VERSION, PROBE_VERSION);
});

/** Run the probed Open-button block once with stubs; returns its records, the bound listeners and the button. */
function runOpenBlock(probed) {
  const start = probed.indexOf("  const openSaved = biLabel('button', 'chip', '保存した文をひらく', 'open saved context');");
  const endMark = '  controls.push(openSaved); actions.append(openSaved);\n';
  const end = probed.indexOf(endMark, start);
  assert(start >= 0 && end > start, 'the Open block is present once');
  const ids = new WeakMap(); let next = 0;
  const eventIds = new WeakMap(); let nextEvent = 100;
  const calls = [];
  const button = { listeners: [], addEventListener(type, fn) { this.listeners.push([type, fn]); } };
  const sandbox = {
    window: { __diagId: (node) => { if (!ids.has(node)) ids.set(node, ++next); return ids.get(node); },
      __diagEventId: (event) => { if (!eventIds.has(event)) eventIds.set(event, ++nextEvent); return eventIds.get(event); } },
    performance: { now: () => 7 }, biLabel: () => button, keepSelection: (...args) => { calls.push(args); return Promise.resolve(true); },
    controls: [], actions: { append() {} }, section: { name: 'section' }, controlPrefix: 'publisher',
  };
  vm.createContext(sandbox);
  vm.runInContext(probed.slice(start, end + endMark.length), sandbox);
  return { sandbox, button, calls, rows: () => JSON.parse(JSON.stringify(sandbox.window.__ctxDiag || [])) };
}

test('the probed Open block records its registration and its listener entry with the node id and the event id, before keepSelection', () => {
  const { button, calls, rows, sandbox } = runOpenBlock(applyProbes(source, { events: true }).source);
  assert.deepEqual(rows().map((row) => row.id), ['reg-open']);
  const node = rows()[0].node;
  const event = { isTrusted: true, eventPhase: 2, currentTarget: button, target: { child: true } };
  button.listeners[0][1](event);
  const after = rows();
  assert.deepEqual(after.map((row) => row.id), ['reg-open', 'listener-open']);
  assert.equal(after[1].node, node);
  assert.equal(after[1].current, node);
  assert.notEqual(after[1].target, node, 'a click on a child of the button keeps the child\'s own id');
  assert.equal(after[1].event, sandbox.window.__diagEventId(event), 'the listener entry carries the same private event id');
  assert.deepEqual([calls.length, calls[0][0], calls[0][1] === button], [1, true, true]);
});

/** A minimal window on Node's own EventTarget, enough for the recorder's non-DOM paths. */
function fakeWindow(overrides = {}) {
  const win = new EventTarget();
  Object.assign(win, { Event, performance, location: { href: 'https://127.0.0.1/index.html' },
    document: { querySelectorAll: () => [], getElementById: () => null, elementFromPoint: () => null, visibilityState: 'visible' } }, overrides);
  return win;
}

test('the recorder observes capture and bubble with one event id, records stops with a stack, and keeps their effect', () => {
  const restore = keepEventPrototype();
  try {
    const win = fakeWindow();
    installEventDiagnostics(win);
    assert.equal(win.__evDiag.version, EVENT_RECORDER_VERSION);
    win.addEventListener('click', function swallowsTheOpenClick(event) { event.stopPropagation(); event.preventDefault(); });
    const event = new Event('click', { cancelable: true });
    win.dispatchEvent(event);
    assert.equal(event.cancelBubble, true);
    assert.equal(event.defaultPrevented, true);
    const rows = win.__evDiag.rows;
    for (const id of ['install', 'capture', 'bubble', 'stopPropagation', 'preventDefault']) assert(rows.some((row) => row.id === id), id);
    const ids = new Set(rows.filter((row) => row.id !== 'install').map((row) => row.event));
    assert.deepEqual([...ids], [win.__diagEventId(event)], 'capture, bubble and stop rows share the event id');
    assert(rows.find((row) => row.id === 'stopPropagation').stack.some((line) => line.includes('swallowsTheOpenClick')));
    assert.equal(win.__evDiag.fault, null);
  } finally { restore(); }
});

test('EV2-1: a failing recorder clock faults the recorder once, and the native stop/prevent still take effect', () => {
  const restore = keepEventPrototype();
  try {
    const win = fakeWindow({ performance: { now: () => { throw new Error('clock gone'); } } });
    installEventDiagnostics(win);
    assert.deepEqual(win.__evDiag.fault, { where: 'install', message: 'clock gone' });
    win.addEventListener('click', (event) => { event.stopPropagation(); event.preventDefault(); });
    const event = new Event('click', { cancelable: true });
    assert.doesNotThrow(() => win.dispatchEvent(event));
    assert.equal(event.defaultPrevented, true, 'preventDefault still ran');
    assert.equal(event.cancelBubble, true, 'stopPropagation still ran');
    assert.equal(win.__evDiag.rows.length, 0, 'no row is written after the fault');
    assert.deepEqual(classifyOpen(evidence({ recorder: { ...win.__evDiag, docId: DOC } })).reasons.filter((r) => r.includes('faulted')), ['the event recorder faulted (install)']);
  } finally { restore(); }
});

test('EV2-1: the wrapped method calls the original exactly once with the same receiver and arguments, and keeps its return and its throw', () => {
  for (const clockWorks of [true, false]) {
    const calls = [];
    class SpyEvent { constructor(type) { this.type = type; this.timeStamp = 1; } }
    SpyEvent.prototype.preventDefault = function preventDefault(...args) { calls.push([this, args]); return 'native-return'; };
    SpyEvent.prototype.stopPropagation = function stopPropagation(...args) { calls.push([this, args]); throw new Error('native-throw'); };
    SpyEvent.prototype.stopImmediatePropagation = function stopImmediatePropagation() { calls.push([this, []]); };
    const win = fakeWindow({ Event: SpyEvent, performance: clockWorks ? performance : { now: () => { throw new Error('clock gone'); } } });
    installEventDiagnostics(win);
    const event = new SpyEvent('click');
    assert.equal(event.preventDefault('a', 1), 'native-return');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], event);
    assert.deepEqual(calls[0][1], ['a', 1]);
    assert.throws(() => event.stopPropagation('b'), /native-throw/, 'a native exception is never swallowed');
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1][1], ['b']);
    assert.equal(win.__evDiag.fault === null, clockWorks);
  }
});

test('private node ids tell a same-id replacement apart, and truncation is INCONCLUSIVE for that reason alone', () => {
  const restore = keepEventPrototype();
  try {
    const win = fakeWindow();
    installEventDiagnostics(win, 3);
    const first = { id: 'publisher-context-open' }, replacement = { id: 'publisher-context-open' };
    assert.equal(win.__diagId(first), win.__diagId(first));
    assert.notEqual(win.__diagId(first), win.__diagId(replacement));
    for (let i = 0; i < 4; i += 1) win.dispatchEvent(new Event('click'));
    assert.equal(win.__evDiag.rows.length, 3);
    assert.equal(win.__evDiag.truncated, true);
    const recorder = { ...win.__evDiag, docId: DOC, rows: win.__evDiag.rows.map((r) => (r.id === 'install' ? { ...r, docId: DOC } : r)) };
    const result = classifyOpen(evidence({ recorder }));
    assert.equal(result.verdict, 'INCONCLUSIVE');
    assert.deepEqual(result.reasons, ['the event recorder was truncated']);
  } finally { restore(); }
});

/* ---------------------------------------------------------------- classifier (synthetic evidence) */
const DOC = 'doc-1', REG = 11, REPLACED = 12, EV = 101;
const open = (node) => ({ node: [node, 'button#publisher-context-open.chip'], connected: true, disabled: false, current: true, duplicates: 1 });
const row = (id, type, extra = {}) => ({ id, type, now: 200, t: 200, event: EV, trusted: true, target: [REG, 'button#publisher-context-open.chip'], open: open(REG), ...extra });
const PRE = { now: 100, docId: DOC, byId: [REG, 'button#publisher-context-open'], live: [[REG, 'b']], hitInside: true, disabled: false };
const POST = { now: 300, docId: DOC, byId: [REG, 'button#publisher-context-open'], live: [[REG, 'b']], hitInside: true, disabled: false };
function evidence({ ctx = null, recorder = null, rows = null, pre = PRE, post = POST, click = { ok: true }, page = {} } = {}) {
  return {
    ctx: ctx ?? [{ id: 'reg-open', t: 5, node: REG }, { id: 'enter', t: 50, discuss: false }],
    recorder: recorder ?? { version: EVENT_RECORDER_VERSION, docId: DOC, truncated: false, fault: null, rows: [{ id: 'install', now: 1, docId: DOC }, ...(rows ?? [])] },
    pre, post, click, page,
  };
}
const fullClick = [row('capture', 'pointerdown', { event: 98 }), row('capture', 'pointerup', { event: 99 }), row('capture', 'click'), row('bubble', 'click')];
const classOf = (input) => { const result = classifyOpen(input); assert.equal(result.verdict, 'OBSERVED', JSON.stringify(result.reasons)); return result.classification; };

test('classifier: each delivery outcome of the one trusted action click has its own class', () => {
  const listener = (event) => [{ id: 'reg-open', t: 5, node: REG }, { id: 'listener-open', t: 210, node: REG, event }];
  assert.equal(classOf(evidence({ rows: fullClick, ctx: [...listener(EV), { id: 'enter', t: 211, discuss: true }] })), 'listener-ran-and-keepSelection-entered');
  assert.equal(classOf(evidence({ rows: fullClick, ctx: listener(EV) })), 'listener-ran-without-keepSelection-entry');
  assert.equal(classOf(evidence({ rows: [], click: { ok: false, error: 'TimeoutError: locator.click' }, post: null })), 'native-click-failed');
  assert.equal(classOf(evidence({ rows: [] })), 'no-native-input-observed');
  assert.equal(classOf(evidence({ rows: [row('capture', 'pointerdown', { event: 98 }), row('capture', 'pointerup', { event: 99 })] })), 'press-without-click');
  assert.equal(classOf(evidence({ rows: [row('capture', 'click', { target: [40, 'div.card'], open: null })] })), 'click-landed-outside-open-button');
  assert.equal(classOf(evidence({ rows: [row('capture', 'click', { open: open(REPLACED) }), row('bubble', 'click', { open: open(REPLACED) })] })), 'clicked-unregistered-open-node');
  assert.equal(classOf(evidence({ rows: [row('capture', 'click'), row('stopPropagation', 'click', { current: [30, 'section.publisher-context-selection'], phase: 1, stack: ['at swallow'] })] })), 'click-propagation-stopped');
  assert.equal(classOf(evidence({ rows: [row('capture', 'click')] })), 'bubble-not-observed', 'a missing bubble alone names no stopper');
  assert.equal(classOf(evidence({ rows: fullClick })), 'click-reached-registered-node-but-listener-did-not-run');
});

test('EV2-3: only the trusted click inside the action interval is attributed; synthetic, late, mismatched and other-event rows stay evidence', () => {
  const synthetic = classifyOpen(evidence({ rows: [row('capture', 'click', { trusted: false, event: 7, open: open(REPLACED) }), row('bubble', 'click', { trusted: false, event: 7 })] }));
  assert.equal(synthetic.classification, 'no-native-input-observed', 'an untrusted click is never the native action');
  assert.equal(synthetic.facts.ignoredUntrusted, 1);
  assert.equal(classOf(evidence({ rows: [row('capture', 'click', { now: 400 }), row('bubble', 'click', { now: 400 })] })), 'no-native-input-observed', 'a click after the post read is not the action');
  assert.equal(classOf(evidence({ rows: [row('capture', 'click'), row('stopPropagation', 'click', { event: 999 })] })), 'bubble-not-observed', 'a stop on another event names no stopper');
  assert.equal(classOf(evidence({ rows: [row('capture', 'click'), row('bubble', 'click', { event: 999 })] })), 'bubble-not-observed', 'another event\'s bubble is not this one\'s');
  assert.equal(classOf(evidence({ rows: fullClick, ctx: [{ id: 'reg-open', t: 5, node: REG }, { id: 'listener-open', t: 210, node: REG, event: 999 }, { id: 'enter', t: 211, discuss: true }] })),
    'click-reached-registered-node-but-listener-did-not-run', 'a listener entry for another event does not count');
  const ambiguous = classifyOpen(evidence({ rows: [row('capture', 'click'), row('capture', 'click', { event: 102 })] }));
  assert.equal(ambiguous.verdict, 'INCONCLUSIVE');
  assert.match(ambiguous.reasons[0], /2 trusted click candidates/);
});

test('EV2-2: a failed post read after a successful click is INCONCLUSIVE; a failed click is only its action result; product errors stay evidence', () => {
  for (const post of [null, { snapshotError: 'Execution context was destroyed' }]) {
    const result = classifyOpen(evidence({ rows: fullClick, post }));
    assert.equal(result.verdict, 'INCONCLUSIVE');
    assert(result.reasons.includes('the Open button state could not be read after a successful click'));
  }
  const failed = classifyOpen(evidence({ rows: fullClick, click: { ok: false, error: 'TimeoutError' }, post: null }));
  assert.deepEqual([failed.verdict, failed.classification], ['OBSERVED', 'native-click-failed']);
  assert.equal(failed.facts.listenerRan, undefined, 'no delivery fact is derived from a failed action');
  assert.equal(classOf(evidence({ rows: [...fullClick, { id: 'error', now: 150, message: 'TypeError: product bug' }] })), 'click-reached-registered-node-but-listener-did-not-run');
});

test('classifier: a replaced same-id node differs from the registered one; a missing listener differs from covered/inert/no click', () => {
  const registered = classOf(evidence({ rows: fullClick }));
  const replaced = classOf(evidence({ rows: [row('capture', 'click', { open: open(REPLACED) }), row('bubble', 'click', { open: open(REPLACED) })] }));
  assert.notEqual(registered, replaced);
  const covered = classOf(evidence({ rows: [row('capture', 'pointerdown', { target: [41, 'div.overlay'], open: null }), row('capture', 'pointerup', { event: 99, target: [41, 'div.overlay'], open: null })] }));
  const none = classOf(evidence({ rows: [] }));
  assert.equal(new Set([registered, covered, none]).size, 3);
});

test('classifier: missing, truncated, faulted, unreadable or foreign-document evidence is INCONCLUSIVE, never a class', () => {
  const recorderWith = (patch) => ({ version: EVENT_RECORDER_VERSION, docId: DOC, truncated: false, fault: null, rows: [{ id: 'install', now: 1, docId: DOC }, ...fullClick], ...patch });
  const bad = [
    ['recorder missing', evidence({ recorder: { captureError: 'Target closed' } })],
    ['recorder version', evidence({ recorder: recorderWith({ version: 'publisher-event-diagnostics/1' }) })],
    ['recorder faulted', evidence({ recorder: recorderWith({ fault: { where: 'capture', message: 'x' } }) })],
    ['recorder truncated', evidence({ recorder: recorderWith({ truncated: true }) })],
    ['install row missing', evidence({ recorder: recorderWith({ rows: fullClick }) })],
    ['probe records unreadable', { ...evidence(), ctx: null }],
    ['no registration', evidence({ ctx: [{ id: 'enter', t: 50, discuss: false }] })],
    ['open not reached', evidence({ pre: null, click: null })],
    ['pre read failed', evidence({ pre: { snapshotError: 'Execution context was destroyed' } })],
    ['post read missing after success', evidence({ rows: fullClick, post: null })],
    ['other document at capture', evidence({ pre: { ...PRE, docId: 'doc-0' } })],
    ['document changed during action', evidence({ post: { ...POST, docId: 'doc-2' } })],
    ['page crashed', evidence({ page: { crashed: true } })],
    ['page closed', evidence({ page: { closed: true } })],
    ['ambiguous candidates', evidence({ rows: [row('capture', 'click'), row('capture', 'click', { event: 102 })] })],
  ];
  for (const [label, input] of bad) {
    const result = classifyOpen(input);
    assert.equal(result.verdict, 'INCONCLUSIVE', label);
    assert.equal(result.classification, null, label);
    assert(result.reasons.length > 0, label);
  }
});
