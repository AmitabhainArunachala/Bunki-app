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
import { installEventDiagnostics, openSnapshot, classifyOpen, mutationStream, EVENT_RECORDER_VERSION, GEOMETRY_ORDER, GEOMETRY_NODES, MUTATION_LIMITS } from './publisher-event-diagnostics.mjs';

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
function evidence({ ctx = null, recorder = null, rows = null, pre = PRE, post = POST, click = { ok: true }, page = {}, docId = DOC } = {}) {
  return {
    // the action document's own trace: recorder and source probes read together in that document (W2 1928)
    actionDoc: { docId, ctxVersion: EVENT_PROBE_VERSION,
      ctx: ctx ?? [{ id: 'reg-open', t: 5, node: REG }, { id: 'enter', t: 50, discuss: false }],
      recorder: recorder ?? { version: EVENT_RECORDER_VERSION, docId: DOC, truncated: false, fault: null, rows: [{ id: 'install', now: 1, docId: DOC }, ...(rows ?? [])] } },
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
    ['probe records unreadable', evidence({ ctx: 'unreadable' })],
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

/* ---------------------------------------------------------------- EV3 pressGeometry (W2 1937 + addendum 1945) */
/** A fake page with the five live nodes and the source-verified surfaces; every geometry read is logged in order. */
function geometryPage({ log = [], throwRect = null, opens = 1, menus = 1, dropSave = false, disconnect = null, animations = 0, depth = 1 } = {}) {
  const matches = new Map();
  const make = (name, id, y, parent, selectors = []) => {
    const node = { __name: name, nodeType: 1, tagName: 'DIV', id, className: name === 'menu' ? 'vocabulary-list-popover is-save-menu is-inline' : name,
      isConnected: disconnect !== name, hidden: false, parentElement: parent, offsetLeft: 0, offsetWidth: 100, offsetHeight: 45, offsetParent: null,
      get offsetTop() { log.push(`${name}:offsets`); return y; },
      getBoundingClientRect() { log.push(`${name}:rect`); if (throwRect === name) throw new Error('rect gone'); return { x: 10, y, width: 100, height: 45 }; },
      getAnimations() { log.push(`${name}:animations`); return Array.from({ length: name === 'open' ? animations : 0 }, (_, i) => ({ id: `a${i}`, playState: 'running', currentTime: i })); },
      getAttribute: () => null,
      closest(selector) { for (let n = this; n; n = n.parentElement) if (matches.get(n)?.includes(selector)) return n; return null; },
      contains(other) { for (let n = other; n; n = n.parentElement) if (n === this) return true; return false; },
      querySelector(selector) { return selector.includes('teacher-source-quote') ? quote : selector.includes('teacher-note') ? prompt : null; },
    };
    matches.set(node, selectors);
    return node;
  };
  const main = make('main', '', 0, null, ['main']);
  const section = make('section', '', 300, main, ['.publisher-context-selection']);
  const prompt = make('prompt', '', 310, section), quote = make('quote', '', 330, section);
  const actions = make('actions', '', 400, section, ['[data-save-row]']);
  const open = make('open', 'publisher-context-open', 400, actions, ['[id$="-context-open"]']);
  const save = make('save', 'publisher-context-save', 400, actions);
  const menu = make('menu', 'vocabulary-list-popover', 445, section);
  const status = make('status', 'publisher-context-status', 470, section), timed = make('timed', 'publisher-selection-time', 360, section);
  let chain = open;
  for (let i = 1; i < depth; i += 1) { const parent = make(`offset${i}`, '', 0, null); chain.offsetParent = parent; chain = parent; }
  const extraOpen = make('open2', 'source-context-open', 600, actions, ['[id$="-context-open"]']);
  const extraMenu = make('menu2', 'vocabulary-list-popover', 700, section);
  const byId = { 'publisher-context-open': open, 'publisher-context-save': dropSave ? null : save, 'publisher-context-status': status, 'publisher-selection-time': timed };
  const document = {
    get activeElement() { log.push('activeElement'); return open; },
    documentElement: { addEventListener() {} },
    visibilityState: 'visible',
    querySelectorAll(selector) {
      if (selector.includes('context-open')) return opens === 2 ? [open, extraOpen] : [open];
      if (selector.includes('vocabulary-list-popover')) return menus === 2 ? [menu, extraMenu] : menus === 1 ? [menu] : [];
      return [];
    },
    getElementById: (id) => byId[id] ?? null,
    elementFromPoint() { log.push('hit'); return open; },
    getAnimations() { log.push('documentAnimations'); return []; },
  };
  const win = fakeWindow({ document,
    getComputedStyle(node) { log.push(`${node.__name}:style`); return { position: 'static', transform: 'none', translate: 'none', scale: 'none', pointerEvents: 'auto', visibility: 'visible', display: 'flex' }; } });
  // getters stay getters (Object.assign would read them once and copy the values)
  Object.defineProperties(win, {
    scrollX: { get: () => 0 }, scrollY: { get: () => { log.push('scroll'); return 100; } },
    visualViewport: { get: () => { log.push('visualViewport'); return { offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 100, width: 1280, height: 800, scale: 1 }; } },
  });
  const listeners = [];
  const add = win.addEventListener.bind(win);
  win.addEventListener = (type, fn, capture) => { listeners.push({ type, fn, capture: !!capture }); add(type, fn, capture); };
  return { win, log, nodes: { open, save, actions, menu, main }, listeners };
}
const expectedGeometryReads = ['scroll', 'visualViewport', 'activeElement',
  ...['open', 'save', 'actions', 'menu', 'main'].flatMap((name) => [`${name}:rect`, `${name}:offsets`, `${name}:style`, `${name}:animations`]),
  'prompt:rect', 'quote:rect', 'timed:rect', 'status:rect', 'documentAnimations'];
const squash = (log) => log.filter((entry, i) => entry !== log[i - 1]);

test('EV3: the page sampler reads scalars first, then each node and surface in the documented order, and records that order', () => {
  const restore = keepEventPrototype();
  try {
    const { win, log } = geometryPage();
    installEventDiagnostics(win);
    log.length = 0;
    const sample = win.__evDiagGeometry('snapshot:pre');
    assert.deepEqual(squash(log), expectedGeometryReads);
    assert.deepEqual(sample.order, GEOMETRY_ORDER, 'the page order and the exported order are one list');
    assert.deepEqual(Object.keys(sample.nodes), GEOMETRY_NODES);
    assert.equal(sample.nodes.menu.classes, 'vocabulary-list-popover is-save-menu is-inline');
    assert.deepEqual([sample.error, sample.bounded, sample.ambiguous], [null, [], []]);
    assert.equal(win.__evDiag.fault, null);
  } finally { restore(); }
});

test('EV3: a relevant pointerdown reads geometry, then the existing hit once, then geometry again; bubble has geometry and no hit', () => {
  const restore = keepEventPrototype();
  try {
    const { win, log, nodes, listeners } = geometryPage();
    installEventDiagnostics(win);
    const capture = listeners.find((l) => l.type === 'pointerdown' && l.capture).fn;
    const bubble = listeners.find((l) => l.type === 'pointerdown' && !l.capture).fn;
    const event = { type: 'pointerdown', target: nodes.open, currentTarget: win, isTrusted: true, timeStamp: 5, clientX: 20, clientY: 420, button: 0,
      pointerType: 'mouse', eventPhase: 1, composedPath: () => [nodes.open, nodes.actions] };
    log.length = 0;
    capture(event);
    const reads = squash(log);
    const hit = reads.indexOf('hit');
    assert.deepEqual(reads.slice(0, hit), expectedGeometryReads, 'geometry before the hit');
    assert.equal(reads.filter((entry) => entry === 'hit').length, 1, 'the existing hit read happens once');
    assert.deepEqual(reads.slice(hit + 1, hit + 1 + expectedGeometryReads.length), expectedGeometryReads, 'geometry after the hit');
    log.length = 0;
    bubble({ ...event, eventPhase: 3 });
    assert.equal(log.includes('hit'), false, 'bubble adds no hit read');
    const rows = win.__evDiag.rows.filter((row) => row.type === 'pointerdown');
    assert.deepEqual(rows.map((row) => [row.id, row.geometry?.label, row.afterHit?.label ?? null, !!row.hit]),
      [['capture', 'pointerdown:capture:beforeHit', 'pointerdown:capture:afterHit', true], ['bubble', 'pointerdown:bubble', null, false]]);
    assert(rows[0].geometry.seq < rows[0].afterHit.seq && rows[0].afterHit.seq < rows[1].geometry.seq, 'monotonic sampling order');
  } finally { restore(); }
});

test('EV3: a failing getter, a missing or disconnected node, ambiguity and bounds mark the sample; the recorder and native calls go on', () => {
  const restore = keepEventPrototype();
  try {
    const cases = [
      [{ throwRect: 'actions' }, (s) => assert.equal(s.error, 'rect gone')],
      [{ dropSave: true }, (s) => assert.equal(s.nodes.save, null)],
      [{ disconnect: 'actions' }, (s) => assert.equal(s.nodes.actions.connected, false)],
      [{ opens: 2 }, (s) => assert.deepEqual(s.ambiguous, ['open'])],
      [{ menus: 2 }, (s) => assert.deepEqual(s.ambiguous, ['menu'])],
      [{ animations: 17 }, (s) => assert.deepEqual(s.bounded, ['animations:open'])],
      [{ depth: 11 }, (s) => assert.deepEqual(s.bounded, ['offsets:open'])],
    ];
    for (const [options, check] of cases) {
      const { win } = geometryPage(options);
      installEventDiagnostics(win);
      const sample = win.__evDiagGeometry('snapshot:pre');
      check(sample);
      assert(sampleIssues(sample).length > 0, JSON.stringify(options));
      win.addEventListener('click', (event) => event.preventDefault());
      const event = new Event('click', { cancelable: true });
      win.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true, 'the native call still ran');
      assert.equal(win.__evDiag.fault, null, `${JSON.stringify(options)}: a geometry failure is not a recorder fault`);
    }
    const { win } = geometryPage();
    installEventDiagnostics(win);
    for (let i = 0; i < 200; i += 1) win.__evDiagGeometry('fill');
    assert.deepEqual(win.__evDiagGeometry('over'), { label: 'over', truncated: true });
    assert.equal(win.__evDiag.geometryTruncated, true);
  } finally { restore(); }
});

/* synthetic geometry samples for the classifier */
let seqCounter = 0;
const gnode = (id, y, extra = {}) => ({ node: [id, 'n'], connected: true, rect: { x: 10, y, width: 100, height: 45 },
  offsets: [{ node: [id, 'n'], top: y, left: 0, width: 100, height: 45 }], style: { position: 'static', transform: 'none', translate: 'none', scale: 'none' }, animations: [], ...extra });
function gsample({ scrollY = 100, shift = 0, transform = 'none', saveWidth = 100, menu = true, drop = null, label = 's', patch = {} } = {}) {
  const y = (doc) => doc - scrollY;
  // offsetTop is document-relative: it follows a layout shift, never a scroll
  const docOffsets = (node) => ({ ...node, offsets: node.offsets.map((o) => ({ ...o, top: node.rect.y + scrollY })) });
  const nodes = { open: gnode(REG, y(500) + shift, { style: { position: 'static', transform, translate: 'none', scale: 'none' } }),
    save: gnode(13, y(500) + shift, { rect: { x: 120, y: y(500) + shift, width: saveWidth, height: 45 } }), actions: gnode(14, y(500) + shift),
    menu: menu ? { ...gnode(15, y(545) + shift), classes: 'vocabulary-list-popover is-save-menu is-inline' } : null, main: gnode(16, y(0)) };
  for (const name of Object.keys(nodes)) if (nodes[name]) nodes[name] = docOffsets(nodes[name]);
  if (drop) nodes[drop] = null;
  return { seq: ++seqCounter, label, t0: seqCounter, order: GEOMETRY_ORDER, bounded: [], error: null, ambiguous: [], scroll: { x: 0, y: scrollY },
    visualViewport: { offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: scrollY, width: 1280, height: 800, scale: 1 }, active: [52, 'button#copy'],
    nodes, surfaces: { prompt: null, quote: null, timed: null, status: null, sealStrip: null, mini: null, readerLayers: null, layersMark: null },
    documentAnimations: [], ...patch };
}
const sampleIssues = (sample) => {
  const result = classifyOpen(pressEvidence({ samples: { pdBefore: sample } }));
  return result.geometry.verdict === 'INCONCLUSIVE' ? result.geometry.reasons : [];
};
/** The full press in sampling order: pre, pointerdown (before/after hit, brackets, bubble), mousedown (same), post. */
function pressEvidence({ samples = {}, brackets = true, extraPointerdown = false, recorderPatch = {} } = {}) {
  // samples are stamped in sampling order here, so a test's construction order never matters; pinSeq keeps a given seq
  let order = 0;
  const s = (key, opts) => {
    const given = Object.hasOwn(samples, key) ? samples[key] : gsample(opts);
    order += 1;
    return given && !given.truncated && !given.pinSeq ? { ...given, seq: order } : given;
  };
  const pre = { ...PRE, geometry: s('pre', { label: 'pre' }) };
  const pd = { pdBefore: s('pdBefore'), pdAfter: s('pdAfter'), pdLate: s('pdLate'), pdHtml: s('pdHtml'), pdBubble: s('pdBubble') };
  const md = { mdBefore: s('mdBefore'), mdAfter: s('mdAfter'), mdLate: s('mdLate'), mdHtml: s('mdHtml'), mdBubble: s('mdBubble') };
  const post = { ...POST, geometry: s('post', { label: 'post' }) };
  const pressRows = (type, event, g, prefix) => [
    row('capture', type, { event, geometry: g[`${prefix}Before`], afterHit: g[`${prefix}After`], hit: { node: [REG, 'span'], open: open(REG) } }),
    ...(brackets ? [{ id: 'bracket', where: 'window-late', event, now: 200, type, geometry: g[`${prefix}Late`] },
      { id: 'bracket', where: 'html', event, now: 200, type, geometry: g[`${prefix}Html`] }] : []),
    row('bubble', type, { event, geometry: g[`${prefix}Bubble`] })];
  const rows = [...pressRows('pointerdown', 98, pd, 'pd'), ...pressRows('mousedown', 97, md, 'md'),
    ...(extraPointerdown ? [row('capture', 'pointerdown', { event: 96 })] : []),
    row('capture', 'pointerup', { event: 99 }), row('capture', 'click', { target: [42, 'section'], open: null })];
  const input = evidence({ rows, pre, post });
  Object.assign(input.actionDoc.recorder, recorderPatch);
  return input;
}

test('EV3: changed scroll with stable document geometry, stable scroll with changed transform or sibling, both, neither — described, not caused', () => {
  const press = (mdBefore) => classifyOpen(pressEvidence({ samples: { pdBefore: gsample(), mdBefore } })).geometry.press;
  assert.equal(press(gsample()).observed, 'none');
  const scrolled = press(gsample({ scrollY: 124 }));
  assert.deepEqual([scrolled.observed, scrolled.scroll.dy, scrolled.nodes.open.viewport.dy, scrolled.nodes.open.document.dy], ['scroll', 24, -24, 0]);
  const transformed = press(gsample({ transform: 'matrix(1, 0, 0, 1, 0, -24)' }));
  assert.deepEqual([transformed.observed, transformed.nodes.open.styleChanged], ['layout', ['transform']]);
  const sibling = press(gsample({ saveWidth: 140 }));
  assert.deepEqual([sibling.observed, sibling.nodes.save.viewport.dw], ['layout', 40]);
  const menuGone = press(gsample({ menu: false }));
  assert.deepEqual([menuGone.observed, menuGone.nodes.menu.presence], ['layout', 'disappeared']);
  assert.equal(press(gsample({ scrollY: 124, shift: -24 })).observed, 'scroll+layout');
  const result = classifyOpen(pressEvidence({ samples: { pdBefore: gsample(), mdBefore: gsample({ scrollY: 124 }) } }));
  assert.equal(result.classification, 'click-landed-outside-open-button', 'geometry never changes the delivery class');
  assert.equal(result.geometry.verdict, 'OBSERVED');
  assert.equal(JSON.stringify(result.geometry).match(/cause|mover/giu), null, 'no cause label anywhere in the geometry facts');
  assert.deepEqual(result.geometry.firstChange, { from: 'pointerdown:bubble', to: 'mousedown:capture:beforeHit', observed: 'scroll' });
});

test('EV3: unusable, out-of-order, ambiguous-press or truncated geometry is INCONCLUSIVE while the delivery class stands', () => {
  const bad = [
    ['missing sample', pressEvidence({ samples: { mdBubble: null } })],
    ['failed read', pressEvidence({ samples: { pdAfter: gsample({ patch: { error: 'rect gone' } }) } })],
    ['bounded', pressEvidence({ samples: { pre: gsample({ patch: { bounded: ['animations:open'] } }) } })],
    ['ambiguous node', pressEvidence({ samples: { post: gsample({ patch: { ambiguous: ['open'] } }) } })],
    ['missing node', pressEvidence({ samples: { mdBefore: gsample({ drop: 'save' }) } })],
    ['disconnected', pressEvidence({ samples: { pdBefore: gsample({ patch: { nodes: { ...gsample().nodes, actions: { ...gnode(14, 400), connected: false } } } }) } })],
    ['other read order', pressEvidence({ samples: { pdBefore: gsample({ patch: { order: [...GEOMETRY_ORDER].reverse() } }) } })],
    ['truncated sample', pressEvidence({ samples: { mdAfter: { label: 'x', truncated: true } } })],
    ['truncated recorder geometry', pressEvidence({ recorderPatch: { geometryTruncated: true } })],
    ['two pointerdowns', pressEvidence({ extraPointerdown: true })],
  ];
  const outOfOrder = pressEvidence({ samples: { post: { ...gsample(), seq: 0, pinSeq: true } } });
  bad.push(['out of order', outOfOrder]);
  for (const [label, input] of bad) {
    const result = classifyOpen(input);
    assert.equal(result.verdict, 'OBSERVED', label);
    assert.equal(result.classification, 'click-landed-outside-open-button', label);
    assert.equal(result.geometry.verdict, 'INCONCLUSIVE', label);
    assert(result.geometry.reasons.length > 0, label);
  }
});

test('EV3: a missing or misplaced bracket stays unknown; it never invalidates the required samples or names a handler', () => {
  const none = classifyOpen(pressEvidence({ brackets: false })).geometry;
  assert.equal(none.verdict, 'OBSERVED');
  assert.deepEqual(none.unknown, ['pointerdown:window-late: 0 bracket rows', 'pointerdown:html: 0 bracket rows', 'mousedown:window-late: 0 bracket rows', 'mousedown:html: 0 bracket rows']);
  const misplaced = classifyOpen(pressEvidence({ samples: { pdHtml: { ...gsample(), seq: 10_000, pinSeq: true } } })).geometry;
  assert.equal(misplaced.verdict, 'OBSERVED');
  assert(misplaced.unknown.includes('pointerdown:html: out of place in the sampling order'));
  const full = classifyOpen(pressEvidence()).geometry;
  assert.deepEqual(full.unknown, []);
  assert.deepEqual(full.steps.map((step) => step.to), ['pointerdown:capture:beforeHit', 'pointerdown:capture:afterHit', 'pointerdown:window-late', 'pointerdown:html',
    'pointerdown:bubble', 'mousedown:capture:beforeHit', 'mousedown:capture:afterHit', 'mousedown:window-late', 'mousedown:html', 'mousedown:bubble', 'post']);
});

test('EV3 (W2 1928): a successful journey reload keeps the action trace; a missing, partial or later-document trace never stands in', () => {
  const listener = [{ id: 'reg-open', t: 5, node: REG }, { id: 'listener-open', t: 210, node: REG, event: EV }, { id: 'enter', t: 211, discuss: true }];
  const success = evidence({ rows: fullClick, ctx: listener });
  assert.equal(classOf(success), 'listener-ran-and-keepSelection-entered', 'the action document read before the reload classifies the repaired click');
  const later = { version: EVENT_RECORDER_VERSION, docId: 'doc-after-reload', truncated: false, fault: null,
    rows: [{ id: 'install', now: 1, docId: 'doc-after-reload' }, ...fullClick] };
  const cases = [
    ['no action-document trace', { ...success, actionDoc: null }, 'the action-document trace was not captured'],
    ['capture failed', { ...success, actionDoc: { captureError: 'Execution context was destroyed' } }, 'the action-document trace was not captured'],
    ['later document substituted', { ...success, actionDoc: { docId: 'doc-after-reload', recorder: later, ctx: listener } }, 'the document changed between the Open action and capture'],
    ['mixed documents', { ...success, actionDoc: { docId: DOC, recorder: later, ctx: listener } }, 'the action-document trace is not from one document'],
  ];
  for (const [label, input, reason] of cases) {
    const result = classifyOpen(input);
    assert.equal(result.verdict, 'INCONCLUSIVE', label);
    assert(result.reasons.includes(reason), `${label}: ${JSON.stringify(result.reasons)}`);
  }
});

test('EV3: approach rows are sampled only while armed, bounded, and the snapshot arms and disarms after its own reads', () => {
  const restore = keepEventPrototype();
  try {
    const { win, nodes, listeners } = geometryPage();
    installEventDiagnostics(win);
    const move = listeners.find((l) => l.type === 'pointermove' && l.capture).fn;
    const event = (i) => ({ type: 'pointermove', target: nodes.open, relatedTarget: null, isTrusted: true, timeStamp: i, clientX: 20, clientY: 420 });
    move(event(1));
    assert.equal(win.__evDiag.rows.filter((r) => r.id === 'approach').length, 0, 'not armed: nothing sampled');
    win.__evDiagArm(true);
    for (let i = 0; i < 30; i += 1) move(event(i));
    const approach = win.__evDiag.rows.filter((r) => r.id === 'approach');
    assert.equal(approach.length, 24);
    assert.equal(win.__evDiag.approachTruncated, true);
    assert.equal(approach[0].geometry.label, 'pointermove:approach');
    win.__evDiagArm(false);
    move(event(99));
    assert.equal(win.__evDiag.rows.filter((r) => r.id === 'approach').length, 24);
    assert.deepEqual(win.__evDiag.rows.filter((r) => r.id === 'arm').map((r) => r.on), [true, false]);
  } finally { restore(); }
});

test('EV3: the init script and openSnapshot run as page source with no module bindings; the pre read arms after its own reads', () => {
  const restore = keepEventPrototype();
  try {
    const { win } = geometryPage();
    const page = vm.createContext({ window: win, document: win.document, getComputedStyle: win.getComputedStyle, performance });
    vm.runInContext(`(${installEventDiagnostics.toString()})(window);`, page);
    assert.equal(win.__evDiag.version, EVENT_RECORDER_VERSION);
    const pre = vm.runInContext(`(${openSnapshot.toString()})('pre')`, page);
    // values from another realm: compared as data
    assert.deepEqual(JSON.parse(JSON.stringify([pre.phase, pre.geometry.label, pre.geometry.error, pre.geometry.order])), ['pre', 'snapshot:pre', null, GEOMETRY_ORDER]);
    const arm = win.__evDiag.rows.find((row) => row.id === 'arm');
    assert(arm.on === true && arm.now >= pre.geometry.t1, 'armed only after the snapshot and its geometry were read');
    const post = vm.runInContext(`(${openSnapshot.toString()})('post')`, page);
    assert.equal(post.geometry.label, 'snapshot:post');
    assert.equal(JSON.stringify(win.__evDiag.rows.filter((row) => row.id === 'arm').map((row) => row.on)), '[true,false]');
    assert.equal(win.__evDiag.fault, null);
  } finally { restore(); }
});

test('EV3-V1: the action document must carry the exact events probe version; a later document\'s correct version never rescues it', () => {
  const listener = [{ id: 'reg-open', t: 5, node: REG }, { id: 'listener-open', t: 210, node: REG, event: EV }, { id: 'enter', t: 211, discuss: true }];
  const valid = evidence({ rows: fullClick, ctx: listener });
  assert.equal(valid.actionDoc.ctxVersion, 'publisher-context-probes/1+events/2', 'positives carry the actual frozen probe version');
  // the original action document is valid; the later document is different (after the journey reload) and is not consulted
  assert.equal(classOf({ ...valid, laterDocument: { docId: 'doc-after-reload', version: EVENT_PROBE_VERSION } }), 'listener-ran-and-keepSelection-entered');
  const withVersion = (ctxVersion) => {
    const input = evidence({ rows: fullClick, ctx: listener });
    if (ctxVersion === undefined) delete input.actionDoc.ctxVersion; else input.actionDoc.ctxVersion = ctxVersion;
    return { ...input, laterDocument: { docId: 'doc-after-reload', version: EVENT_PROBE_VERSION } };
  };
  for (const [label, version] of [['missing', undefined], ['null', null], ['context-only', PROBE_VERSION], ['other', 'publisher-context-probes/1+events/1']]) {
    const result = classifyOpen(withVersion(version));
    assert.equal(result.verdict, 'INCONCLUSIVE', label);
    assert.equal(result.classification, null, label);
    assert.deepEqual(result.reasons, ["the action document's probe version is missing or another version"], label);
  }
});

/* ---------------------------------------------------------------- EV4 mutation stream (W2 2037) */
class FakeMutationObserver {
  constructor(callback) { this.callback = callback; this.pending = []; this.observed = null; this.disconnected = false; FakeMutationObserver.all.push(this); }
  observe(target, options) { this.observed = { target, options }; }
  takeRecords() { const out = this.pending; this.pending = []; return out; }
  disconnect() { this.disconnected = true; }
}
FakeMutationObserver.all = [];
/** geometryPage plus preceding content, a following node, an ordered section and a ladder body; compareDocumentPosition is a spy. */
function streamPage(options = {}) {
  FakeMutationObserver.all = [];
  const page = geometryPage(options);
  page.win.MutationObserver = FakeMutationObserver;
  const { main } = page.nodes;
  const section = page.nodes.open.closest('.publisher-context-selection');
  const asked = [];
  section.__order = 2;
  section.compareDocumentPosition = (other) => { asked.push(other); if (!other.isConnected) return 1; return (other.__order ?? 99) < 2 ? 2 : 4; };
  let rects = 0;
  const element = (tag, order, extra = {}) => {
    const attrs = { ...(extra.attrs || {}) };
    const node = { nodeType: 1, tagName: tag, id: extra.id || '', className: extra.className || '', isConnected: true, parentElement: main, __order: order,
      getAttribute: (name) => (extra.throwOnAttr ? (() => { throw new Error('attr gone'); })() : attrs[name] ?? null), setAttr: (name, value) => { attrs[name] = value; },
      getBoundingClientRect() { rects += 1; page.log.push(`${tag}:rect`); return { x: 0, y: 100 + order, width: 50, height: extra.height ?? 24.5 }; },
      contains(other) { for (let n = other; n; n = n.parentElement) if (n === this) return true; return false; },
      classList: { contains: (name) => String(extra.className || '').split(/\s+/u).includes(name) }, querySelectorAll: () => [] };
    return node;
  };
  // a Text node has Node.prototype.contains in a real DOM; it contains only itself
  const text = (data, order) => { const node = { nodeType: 3, data, isConnected: true, parentElement: main, __order: order }; node.contains = (other) => other === node; return node; };
  const deliver = (records) => page.streamObserver().callback(records);
  page.streamObserver = () => FakeMutationObserver.all.find((o) => o.observed?.target === main);
  return { ...page, section, asked, element, text, deliver, rects: () => rects };
}
const record = (type, target, extra = {}) => ({ type, target, addedNodes: [], removedNodes: [], previousSibling: null, nextSibling: null, attributeName: null, oldValue: null, ...extra });

test('EV4: arming binds document, main and section and observes main with the documented options; version is /4', () => {
  const restore = keepEventPrototype();
  try {
    const p = streamPage();
    installEventDiagnostics(p.win);
    assert.equal(p.win.__evDiag.version, 'publisher-event-diagnostics/4');
    assert.equal(EVENT_RECORDER_VERSION, 'publisher-event-diagnostics/4');
    p.win.__evDiagArm(true);
    const b = p.win.__evDiag.binding;
    assert.deepEqual([b.docId, b.main[1], b.section[1], b.invalidated], [p.win.__evDiag.docId, 'div.main', 'div.section', null]);
    const o = p.streamObserver();
    assert.equal(o.observed.target, p.nodes.main);
    assert.deepEqual(o.observed.options, { childList: true, subtree: true, characterData: true, attributes: true, attributeOldValue: true,
      attributeFilter: ['class', 'hidden', 'style', 'data-ladder-rung', 'data-depth-aside', 'aria-hidden'] });
    assert.deepEqual(MUTATION_LIMITS, { rows: 128, nodesPerRow: 8, field: 240, ladderDetails: 4, extraRects: 8 });
  } finally { restore(); }
});

test('EV4: transient add, removal and reinsertion keep delivery metadata; a removed node shows only its cached live rect with its own time', () => {
  const restore = keepEventPrototype();
  try {
    const p = streamPage();
    installEventDiagnostics(p.win);
    p.win.__evDiagArm(true);
    const para = p.element('P', 1);
    const row = p.element('SPAN', 1, { className: 'tok-en' });
    p.deliver([record('childList', para, { addedNodes: [row] })]);
    const first = p.win.__evDiag.rows.filter((r) => r.id === 'mutation');
    assert.deepEqual([first.length, first[0].relation, first[0].added[0].classes, first[0].addedCount], [1, 'preceding', 'tok-en', 1]);
    assert.equal('rect' in first[0].added[0], false, 'rows carry metadata, not geometry');
    const batch1 = p.win.__evDiag.rows.find((r) => r.id === 'mutation-batch');
    assert.equal(batch1.geometry.extra[0].rect.height, 24.5, 'the batch geometry measures the connected added node');
    row.isConnected = false;
    p.deliver([record('childList', para, { removedNodes: [row] })]);
    const removal = p.win.__evDiag.rows.filter((r) => r.id === 'mutation')[1];
    assert.equal(removal.removed[0].rectAtDelivery, null, 'a detached node is not measured');
    assert.equal(removal.removed[0].lastLiveRect.rect.height, 24.5);
    assert.equal(removal.removed[0].lastLiveRect.sample, batch1.geometry.seq, 'the cached rect keeps its own sample');
    assert(removal.removed[0].lastLiveRect.t <= removal.delivered, 'and its own time, not the removal time');
    row.isConnected = true;
    p.deliver([record('childList', para, { addedNodes: [row] })]);
    const again = p.win.__evDiag.rows.filter((r) => r.id === 'mutation')[2];
    assert.deepEqual([again.added[0].node[0], again.added[0].connected], [first[0].added[0].node[0], true], 'reinsertion keeps the node identity');
  } finally { restore(); }
});

test('EV4: a detached target is never asked for its order; retained previous/next identities carry its place; an unmeasured removal has no rect', () => {
  const restore = keepEventPrototype();
  try {
    const p = streamPage();
    installEventDiagnostics(p.win);
    p.win.__evDiagArm(true);
    const parent = p.element('DIV', 1), before = p.element('B', 1), after = p.element('I', 1), gone = p.element('SPAN', 1);
    parent.isConnected = false; gone.isConnected = false;
    p.asked.length = 0;
    p.deliver([record('childList', parent, { removedNodes: [gone], previousSibling: before, nextSibling: after })]);
    const r = p.win.__evDiag.rows.find((x) => x.id === 'mutation');
    assert.deepEqual([r.relation, r.retainedContext], ['detached', true]);
    assert.equal(p.asked.includes(parent), false, 'compareDocumentPosition was not called on the detached target');
    assert.equal(r.previous[0], p.win.__diagId(before));
    assert.equal(r.next[0], p.win.__diagId(after));
    assert.equal(r.removed[0].lastLiveRect, null, 'never measured while live: no historical rect is invented');
  } finally { restore(); }
});

test('EV4: attribute oldValues are historical and the value at delivery is labelled so; text changes carry lengths, never text', () => {
  const restore = keepEventPrototype();
  try {
    const p = streamPage();
    installEventDiagnostics(p.win);
    p.win.__evDiagArm(true);
    const word = p.element('SPAN', 1, { attrs: { 'data-ladder-rung': 'gloss' } });
    p.deliver([record('attributes', word, { attributeName: 'data-ladder-rung', oldValue: null }),
      record('attributes', word, { attributeName: 'data-ladder-rung', oldValue: 'reading' })]);
    const rows = p.win.__evDiag.rows.filter((r) => r.id === 'mutation');
    assert.deepEqual(rows.map((r) => [r.oldValue, r.valueAtDelivery]), [[null, 'gloss'], ['reading', 'gloss']]);
    const secret = 'ひみつの本文テキスト';
    const t = p.text(secret, 1);
    p.deliver([record('characterData', t)]);
    const textRow = p.win.__evDiag.rows.filter((r) => r.id === 'mutation')[2];
    assert.equal(textRow.lengthAtDelivery, secret.length);
    assert.equal(JSON.stringify(p.win.__evDiag).includes(secret), false, 'no raw text anywhere in the recorder');
  } finally { restore(); }
});

test('EV4: inside-section and following targets are skipped and counted; an ancestor change is kept', () => {
  const restore = keepEventPrototype();
  try {
    const p = streamPage();
    installEventDiagnostics(p.win);
    p.win.__evDiagArm(true);
    const following = p.element('FOOTER', 3);
    p.deliver([record('attributes', p.nodes.actions, { attributeName: 'class', oldValue: 'a' }), record('attributes', following, { attributeName: 'class' }),
      record('attributes', p.nodes.main, { attributeName: 'style', oldValue: '' })]);
    const rows = p.win.__evDiag.rows.filter((r) => r.id === 'mutation');
    assert.deepEqual(rows.map((r) => r.relation), ['ancestor']);
    assert.equal(p.win.__evDiag.mutationSkipped, 2);
  } finally { restore(); }
});

test('EV4: caps and truncation are explicit: rows, nodes per row and metadata fields', () => {
  const restore = keepEventPrototype();
  try {
    const p = streamPage();
    installEventDiagnostics(p.win);
    p.win.__evDiagArm(true);
    const parent = p.element('DIV', 1);
    const many = Array.from({ length: 10 }, (_, i) => p.element('SPAN', 1, { className: i === 0 ? 'x'.repeat(300) : 'y' }));
    p.deliver([record('childList', parent, { addedNodes: many })]);
    const r = p.win.__evDiag.rows.find((x) => x.id === 'mutation');
    assert.deepEqual([r.addedCount, r.added.length, r.added[0].classes.length, r.truncated], [10, 8, 240, true]);
    const batch = p.win.__evDiag.rows.find((x) => x.id === 'mutation-batch');
    assert(batch.geometry.bounded.includes('extra'), 'extra rects beyond 8 are bounded and flagged');
    p.deliver(Array.from({ length: 130 }, () => record('attributes', parent, { attributeName: 'class' })));
    assert.equal(p.win.__evDiag.rows.filter((x) => x.id === 'mutation').length, 128);
    assert.equal(p.win.__evDiag.mutationTruncated, true);
  } finally { restore(); }
});

test('EV4: one geometry sample per callback batch, scroll read before any rect; disarm drains takeRecords and disconnects', () => {
  const restore = keepEventPrototype();
  try {
    const p = streamPage();
    installEventDiagnostics(p.win);
    p.win.__evDiagArm(true);
    const a = p.element('P', 1), b = p.element('P', 1), c = p.element('P', 1);
    const before = p.win.__evDiagGeometry('probe').seq;
    p.log.length = 0;
    p.deliver([record('attributes', a, { attributeName: 'class' }), record('attributes', b, { attributeName: 'class' }), record('attributes', c, { attributeName: 'class' })]);
    const batches = p.win.__evDiag.rows.filter((x) => x.id === 'mutation-batch');
    assert.equal(batches.length, 1);
    assert.equal(batches[0].geometry.seq, before + 1, 'exactly one sample for the batch');
    const firstRect = p.log.findIndex((entry) => entry.endsWith(':rect'));
    assert(p.log.indexOf('scroll') >= 0 && p.log.indexOf('scroll') < firstRect, 'scroll first');
    const o = p.streamObserver();
    o.pending = [record('attributes', a, { attributeName: 'hidden' })];
    p.win.__evDiagArm(false);
    assert.equal(o.disconnected, true);
    assert.equal(p.win.__evDiag.rows.filter((x) => x.id === 'mutation').length, 4, 'pending records drained at disarm');
    p.win.__evDiagArm(false);
    assert.equal(p.win.__evDiag.rows.filter((x) => x.id === 'mutation-batch').length, 2, 'an empty drain adds no batch or sample');
  } finally { restore(); }
});

test('EV4: a stream fault stops only the stream; replaced main invalidates the binding and makes geometry and stream INCONCLUSIVE', () => {
  const restore = keepEventPrototype();
  try {
    const p = streamPage();
    installEventDiagnostics(p.win);
    p.win.__evDiagArm(true);
    const bad = p.element('P', 1, { throwOnAttr: true });
    p.deliver([record('attributes', bad, { attributeName: 'class' })]);
    assert.equal(p.win.__evDiag.mutationFault, 'attr gone');
    assert.equal(p.streamObserver().disconnected, true);
    assert.equal(p.win.__evDiag.fault, null, 'the recorder itself is not faulted');
    p.win.addEventListener('click', () => {});
    p.win.dispatchEvent(new Event('click'));
    assert(p.win.__evDiag.rows.some((r) => r.id === 'capture' && r.type === 'click'), 'EV3 delivery rows continue');
    const q = streamPage();
    installEventDiagnostics(q.win);
    q.win.__evDiagArm(true);
    q.nodes.main.isConnected = false;
    q.deliver([record('attributes', q.element('P', 1), { attributeName: 'class' })]);
    assert.equal(q.win.__evDiag.binding.invalidated.why, 'main or section replaced');
    assert(q.win.__evDiag.rows.some((r) => r.id === 'binding-invalidated'));
    const recorder = { ...pressEvidence().actionDoc.recorder, binding: q.win.__evDiag.binding };
    const input = pressEvidence(); input.actionDoc.recorder = recorder;
    const result = classifyOpen(input);
    assert.equal(result.classification, 'click-landed-outside-open-button', 'the delivery class stands');
    assert.equal(result.geometry.verdict, 'INCONCLUSIVE');
    assert(result.geometry.reasons.some((x) => x.includes('binding was invalidated')));
  } finally { restore(); }
});

test('EV4: mutationStream gives its own verdict; missing binding, fault or overflow are INCONCLUSIVE, so absent rows prove nothing', () => {
  const binding = { docId: DOC, main: [1, 'main'], section: [2, 'section'], at: 1, invalidated: null };
  const rows = [{ id: 'mutation', seq: 1, truncated: false }, { id: 'mutation-batch', batch: 1, geometry: { seq: 9, bounded: [], error: null } }];
  assert.equal(mutationStream({ rows, recorder: { binding } }).verdict, 'OBSERVED');
  assert.deepEqual(mutationStream({ rows, recorder: {} }).reasons, ['no main/section binding']);
  assert.equal(mutationStream({ rows, recorder: { binding, mutationFault: 'x' } }).verdict, 'INCONCLUSIVE');
  assert.equal(mutationStream({ rows, recorder: { binding, mutationTruncated: true } }).verdict, 'INCONCLUSIVE');
  assert.equal(mutationStream({ rows: [], recorder: { binding } }).rows.length, 0);
});

test('EV4: ladder observables are source-verified selectors, bounded to four details per category and marked partial beyond', () => {
  const restore = keepEventPrototype();
  try {
    const p = streamPage();
    const words = Array.from({ length: 5 }, (_, i) => p.element('SPAN', 1, { attrs: { 'data-ladder-rung': i ? 'stage' : 'gloss' } }));
    const gloss = [p.element('SPAN', 1, { className: 'tok-en tok-en-wait' })];
    const body = p.element('DIV', 1, { id: 'publisher-body' });
    body.querySelectorAll = (selector) => (selector === '[data-ladder-rung]' ? words : selector === '.tok-en' ? gloss : selector === '.has-en' ? [words[0]] : []);
    const byId = p.win.document.getElementById;
    p.win.document.getElementById = (id) => (id === 'publisher-body' ? body : byId(id));
    installEventDiagnostics(p.win);
    const sample = p.win.__evDiagGeometry('snapshot:pre');
    assert.deepEqual([sample.ladder.body.id, sample.ladder.rungs.count, sample.ladder.rungs.partial, sample.ladder.rungs.details.length],
      ['publisher-body', 5, true, 4]);
    assert.equal(sample.ladder.rungs.details[0].rung, 'gloss');
    assert.deepEqual([sample.ladder.gloss.details[0].wait, sample.ladder.gloss.details[0].miss], [true, false]);
    assert.deepEqual([sample.ladder.glossedWords, sample.ladder.visibleReadings, sample.ladder.ruby.count], [1, 0, 0]);
  } finally { restore(); }
});

/* ---------------------------------------------------------------- EV4 corrections (W2 2055: R1 bounded refs, R2 null, R3 completeness) */
test('EV4-R1: every EV4 description is bounded to 240 characters, numeric ids still join, and clipping is flagged', () => {
  const restore = keepEventPrototype();
  try {
    const p = streamPage();
    const long = 'L'.repeat(2200);
    const body = p.element('DIV', 1, { id: 'publisher-body' });
    const rung = p.element('SPAN', 1, { id: long, className: long, attrs: { 'data-ladder-rung': long } });
    body.querySelectorAll = (selector) => (selector === '[data-ladder-rung]' ? [rung] : []);
    const byId = p.win.document.getElementById;
    p.win.document.getElementById = (id) => (id === 'publisher-body' ? body : byId(id));
    installEventDiagnostics(p.win);
    p.win.__evDiagArm(true);
    const parent = p.element('DIV', 1, { id: long, className: long }), sibling = p.element('B', 1, { id: long }), added = p.element('SPAN', 1, { id: long, className: long });
    p.deliver([record('childList', parent, { addedNodes: [added], previousSibling: sibling, nextSibling: sibling })]);
    const row = p.win.__evDiag.rows.find((r) => r.id === 'mutation');
    const batch = p.win.__evDiag.rows.find((r) => r.id === 'mutation-batch');
    const strings = [];
    const walk = (value) => { if (typeof value === 'string') strings.push(value); else if (value && typeof value === 'object') for (const v of Object.values(value)) walk(v); };
    walk(row); walk(batch.geometry.ladder); walk(batch.geometry.extra); walk(p.win.__evDiag.binding);
    assert.equal(strings.filter((text) => text.length > 240).length, 0, 'no EV4 descriptive field exceeds its bound');
    assert.equal(row.truncated, true);
    assert.equal(row.target.node[0], p.win.__diagId(parent), 'the numeric id still joins');
    assert.equal(row.previous[0], p.win.__diagId(sibling));
    assert.equal(batch.geometry.extra[0].node[0], p.win.__diagId(added));
    assert(batch.geometry.bounded.includes('ladder-metadata') && batch.geometry.bounded.includes('extra-metadata'), 'sample-level clipping is named');
    assert.equal(batch.geometry.ladder.rungs.details[0].rung.length, 240);
  } finally { restore(); }
});

test('EV4-R2: an attribute absent at delivery stays null and an empty present value stays empty', () => {
  const restore = keepEventPrototype();
  try {
    const p = streamPage();
    installEventDiagnostics(p.win);
    p.win.__evDiagArm(true);
    const removed = p.element('P', 1), empty = p.element('P', 1, { attrs: { hidden: '' } });
    p.deliver([record('attributes', removed, { attributeName: 'hidden', oldValue: '' }), record('attributes', empty, { attributeName: 'hidden', oldValue: null })]);
    const rows = p.win.__evDiag.rows.filter((r) => r.id === 'mutation');
    assert.deepEqual(rows.map((r) => [r.oldValue, r.valueAtDelivery]), [['', null], [null, '']]);
  } finally { restore(); }
});

test('EV4-R3: clipped rows or a failed/bounded batch sample make the stream explicitly incomplete; complete input stays positive', () => {
  const binding = { docId: DOC, main: [1, 'main'], section: [2, 'section'], at: 1, invalidated: null };
  const ok = { id: 'mutation-batch', batch: 1, geometry: { seq: 3, bounded: [], error: null } };
  const complete = mutationStream({ rows: [{ id: 'mutation', truncated: false }, ok], recorder: { binding } });
  assert.deepEqual([complete.verdict, complete.complete], ['OBSERVED', true]);
  const clipped = mutationStream({ rows: [{ id: 'mutation', truncated: true }, ok], recorder: { binding } });
  assert.deepEqual([clipped.verdict, clipped.complete, clipped.rows.length], ['INCONCLUSIVE', false, 1], 'raw rows are kept');
  assert.match(clipped.reasons[0], /clipped metadata/);
  for (const geometry of [{ seq: 3, bounded: ['extra'] }, { seq: 3, bounded: [], error: 'rect gone' }, { label: 'x', truncated: true }, undefined]) {
    const result = mutationStream({ rows: [{ id: 'mutation', truncated: false }, { id: 'mutation-batch', batch: 1, geometry }], recorder: { binding } });
    assert.equal(result.verdict, 'INCONCLUSIVE', JSON.stringify(geometry));
    assert.match(result.reasons.join(' '), /mutation-batch geometry/);
  }
});
