// Node-side controls for the event-delivery follow-up (1830/1834). No browser: the served-source probes run in a
// sandbox, the page recorder runs on Node's own EventTarget/Event, and the classifier gets synthetic evidence.
// A synthetic lifecycle validates the recorder and the classifier only; it never stands in for the real route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EVENT_PROBES, EVENT_PROBE_VERSION, PROBE_VERSION, applyProbes, probeOnlyDiff } from './publisher-context-probes.mjs';
import { installEventDiagnostics, classifyOpen, EVENT_RECORDER_VERSION } from './publisher-event-diagnostics.mjs';

const source = readFileSync(new URL('../corridor.js', import.meta.url), 'utf8');
const sha = (text) => createHash('sha256').update(Buffer.from(text)).digest('hex');

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
  const calls = [];
  const button = { listeners: [], addEventListener(type, fn) { this.listeners.push([type, fn]); }, cloneNode() { return { addEventListener() {} }; } };
  const sandbox = {
    window: { __diagId: (node) => { if (!ids.has(node)) ids.set(node, ++next); return ids.get(node); } },
    performance: { now: () => 7 }, biLabel: () => button, keepSelection: (...args) => { calls.push(args); return Promise.resolve(true); },
    controls: [], actions: { append() {} }, section: { name: 'section' }, controlPrefix: 'publisher',
  };
  vm.createContext(sandbox);
  vm.runInContext(probed.slice(start, end + endMark.length), sandbox);
  return { sandbox, button, calls, rows: () => JSON.parse(JSON.stringify(sandbox.window.__ctxDiag || [])) };
}

test('the probed Open block records its registration with the node id, and its listener entry before keepSelection', () => {
  const { button, calls, rows } = runOpenBlock(applyProbes(source, { events: true }).source);
  assert.deepEqual(rows().map((row) => row.id), ['reg-open']);
  const node = rows()[0].node;
  assert.equal(typeof node, 'number');
  assert.equal(button.listeners.length, 1);
  button.listeners[0][1]({ isTrusted: true, eventPhase: 2, currentTarget: button, target: { child: true } });
  const after = rows();
  assert.deepEqual(after.map((row) => row.id), ['reg-open', 'listener-open']);
  assert.equal(after[1].node, node);
  assert.equal(after[1].current, node);
  assert.notEqual(after[1].target, node, 'a click on a child of the button keeps the child\'s own id');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], true);
  assert.equal(calls[0][1], button);
});

/** A minimal window on Node's own EventTarget, enough for the recorder's non-DOM paths. */
function fakeWindow() {
  const win = new EventTarget();
  Object.assign(win, { Event, performance, location: { href: 'https://127.0.0.1/index.html' },
    document: { querySelectorAll: () => [], getElementById: () => null, elementFromPoint: () => null, visibilityState: 'visible' } });
  return win;
}

test('the recorder observes capture and bubble, records stopPropagation and preventDefault with a stack, and keeps their effect', () => {
  const originals = { stop: Event.prototype.stopPropagation, prevent: Event.prototype.preventDefault, immediate: Event.prototype.stopImmediatePropagation };
  try {
    const win = fakeWindow();
    installEventDiagnostics(win);
    assert.equal(win.__evDiag.version, EVENT_RECORDER_VERSION);
    win.addEventListener('click', function swallowsTheOpenClick(event) { event.stopPropagation(); event.preventDefault(); });
    const event = new Event('click', { cancelable: true });
    win.dispatchEvent(event);
    assert.equal(event.cancelBubble, true, 'the original stopPropagation still ran');
    assert.equal(event.defaultPrevented, true, 'the original preventDefault still ran');
    const ids = win.__evDiag.rows.map((row) => row.id);
    assert.deepEqual(ids.slice(0, 1), ['install']);
    for (const id of ['capture', 'bubble', 'stopPropagation', 'preventDefault']) assert(ids.includes(id), id);
    const stop = win.__evDiag.rows.find((row) => row.id === 'stopPropagation');
    assert(stop.stack.some((line) => line.includes('swallowsTheOpenClick')), 'the stack names the stopping listener');
    const other = new Event('keydown');
    win.dispatchEvent(other);
    other.stopPropagation();
    assert(!win.__evDiag.rows.some((row) => row.type === 'keydown'), 'only press and click events are recorded');
  } finally {
    Event.prototype.stopPropagation = originals.stop;
    Event.prototype.preventDefault = originals.prevent;
    Event.prototype.stopImmediatePropagation = originals.immediate;
  }
});

test('private node ids tell a same-id replacement apart, and the recorder marks truncation instead of dropping silently', () => {
  const originals = { stop: Event.prototype.stopPropagation, prevent: Event.prototype.preventDefault, immediate: Event.prototype.stopImmediatePropagation };
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
    assert.deepEqual(result.reasons, ['the event recorder was truncated'], 'inconclusive for the truncation itself, not another reason');
  } finally {
    Event.prototype.stopPropagation = originals.stop;
    Event.prototype.preventDefault = originals.prevent;
    Event.prototype.stopImmediatePropagation = originals.immediate;
  }
});

/* ---------------------------------------------------------------- classifier (synthetic evidence) */
const DOC = 'doc-1', REG = 11, REPLACED = 12;
const open = (node) => ({ node: [node, 'button#publisher-context-open.chip'], connected: true, disabled: false, current: true, duplicates: 1 });
const row = (id, type, extra = {}) => ({ id, type, now: 200, t: 200, target: [REG, 'button#publisher-context-open.chip'], open: open(REG), ...extra });
function evidence({ ctx = null, recorder = null, rows = null, pre = undefined, post = null, click = { ok: true }, page = {} } = {}) {
  const base = [{ id: 'install', now: 1, docId: DOC }];
  return {
    ctx: ctx ?? [{ id: 'reg-open', t: 5, node: REG }, { id: 'enter', t: 50, discuss: false }],
    recorder: recorder ?? { version: EVENT_RECORDER_VERSION, docId: DOC, truncated: false, rows: [...base, ...(rows ?? [])] },
    pre: pre === undefined ? { now: 100, docId: DOC, byId: [REG, 'button#publisher-context-open'], live: [[REG, 'b']], hitInside: true, disabled: false } : pre,
    post, click, page,
  };
}
const fullClick = [row('capture', 'pointerdown'), row('capture', 'pointerup'), row('capture', 'click'), row('bubble', 'click')];

test('classifier: each delivery failure has its own class', () => {
  const cases = [
    ['listener-ran-and-keepSelection-entered', evidence({ rows: fullClick, ctx: [{ id: 'reg-open', t: 5, node: REG }, { id: 'listener-open', t: 210, node: REG }, { id: 'enter', t: 211, discuss: true }] })],
    ['listener-ran-without-keepSelection-entry', evidence({ rows: fullClick, ctx: [{ id: 'reg-open', t: 5, node: REG }, { id: 'listener-open', t: 210, node: REG }] })],
    ['native-click-failed', evidence({ rows: [], click: { ok: false, error: 'TimeoutError: locator.click' } })],
    ['no-native-input-observed', evidence({ rows: [] })],
    ['press-without-click', evidence({ rows: [row('capture', 'pointerdown'), row('capture', 'pointerup')] })],
    ['click-landed-outside-open-button', evidence({ rows: [row('capture', 'click', { target: [40, 'div.card'], open: null })] })],
    ['clicked-unregistered-open-node', evidence({ rows: [row('capture', 'click', { open: open(REPLACED), target: [REPLACED, 'button#publisher-context-open.chip'] }), row('bubble', 'click', { open: open(REPLACED) })] })],
    ['click-propagation-stopped', evidence({ rows: [row('capture', 'click'), row('stopPropagation', 'click', { current: [30, 'section.publisher-context-selection'], phase: 1, stack: ['at swallow'] })] })],
    ['click-propagation-stopped', evidence({ rows: [row('capture', 'click')] })],
    ['click-reached-registered-node-but-listener-did-not-run', evidence({ rows: fullClick })],
  ];
  for (const [expected, input] of cases) {
    const result = classifyOpen(input);
    assert.equal(result.verdict, 'OBSERVED', expected);
    assert.equal(result.classification, expected);
  }
});

test('classifier: a replaced same-id node differs from the registered one; a missing listener differs from covered/inert/no click', () => {
  const registered = classifyOpen(evidence({ rows: fullClick })).classification;
  const replaced = classifyOpen(evidence({ rows: [row('capture', 'click', { open: open(REPLACED) }), row('bubble', 'click', { open: open(REPLACED) })] })).classification;
  assert.notEqual(registered, replaced);
  const covered = classifyOpen(evidence({ rows: [row('capture', 'pointerdown', { target: [41, 'div.overlay'], open: null }), row('capture', 'pointerup', { target: [41, 'div.overlay'], open: null })] })).classification;
  const none = classifyOpen(evidence({ rows: [] })).classification;
  assert.equal(new Set([registered, covered, none]).size, 3);
});

test('classifier: missing, truncated, unreadable or foreign-document evidence is INCONCLUSIVE, never a class', () => {
  const bad = [
    ['recorder missing', evidence({ recorder: { captureError: 'Target closed' } })],
    ['recorder version', evidence({ recorder: { version: 'other/1', docId: DOC, truncated: false, rows: [{ id: 'install', now: 1, docId: DOC }] } })],
    ['recorder truncated', evidence({ recorder: { version: EVENT_RECORDER_VERSION, docId: DOC, truncated: true, rows: [{ id: 'install', now: 1, docId: DOC }, ...fullClick] } })],
    ['install row missing', evidence({ recorder: { version: EVENT_RECORDER_VERSION, docId: DOC, truncated: false, rows: fullClick } })],
    ['probe records unreadable', evidence({ ctx: { captureError: 'x' } })],
    ['no registration', evidence({ ctx: [{ id: 'enter', t: 50, discuss: false }] })],
    ['open not reached', evidence({ pre: null, click: null })],
    ['pre snapshot failed', evidence({ pre: { snapshotError: 'Execution context was destroyed' } })],
    ['other document at capture', evidence({ pre: { now: 100, docId: 'doc-0', byId: [REG, 'b'], live: [], hitInside: true, disabled: false } })],
    ['document changed during action', evidence({ post: { docId: 'doc-2' } })],
    ['page crashed', evidence({ page: { crashed: true } })],
    ['page closed', evidence({ page: { closed: true } })],
  ];
  for (const [label, input] of bad) {
    const result = classifyOpen({ ...input, ctx: Array.isArray(input.ctx) ? input.ctx : input.ctx?.captureError ? null : input.ctx });
    assert.equal(result.verdict, 'INCONCLUSIVE', label);
    assert.equal(result.classification, null, label);
    assert(result.reasons.length > 0, label);
  }
});
