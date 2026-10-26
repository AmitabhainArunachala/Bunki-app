/** Actual navigation functions; DOM drawing and durable-write dependencies are
 * fakes here. The companion browser regressions exercise ordinary controls. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../corridor.js', import.meta.url), 'utf8');
function actualFunction(name) {
  const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^\\}`, 'm'));
  assert(match, `Missing actual app function ${name}`);
  return match[0];
}
function app() {
  const drawingBoundary = new Error('DOM drawing boundary');
  const positions = [];
  const context = vm.createContext({
    S: { view: 'reader', stack: [], strokes: null, navigationReturns: [], passageId: 'source-a',
      readerScroll: 180, readerPos: {}, readerTake: { p: 'source-a', id: '世界', index: 3 },
      taken: [], srs: {}, revlog: [], dialogInvoker: null },
    window: { scrollY: 180, scrollTo(_x, y) { this.scrollY = y; } },
    document: { activeElement: null, getElementById: () => null }, referenceLibrary: null,
    learningSourceVisit: null, pendingReferenceCollection: null, retainedRetryView: null,
    activeTokenAlternatives: null, readerPosTimer: null, sheetActionVisit: null, sealStrip: null, sealSerial: 0, sealPending: null, readerLayers: null, personalHost: null,
    roomTransitionUpdating: false, activeRoomTransition: null, pageEpoch: 0, recordEpoch: 4,
    keepScroll() {}, rememberSheet() {}, invokerKey: value => value,
    restoreDialogInvoker() {}, stopReadAloud() {}, clearTimeout() {},
    clearReaderReadings() {},
    requestAnimationFrame() {}, passage: () => null,
    recordReady: epoch => epoch === undefined || epoch === 4,
    saveReaderPosition: async (id, y) => { positions.push({ id, y }); return true; },
    stopSentenceListening() { throw drawingBoundary; },
  });
  context.scaleSource = visit => visit?.recordEpoch === context.recordEpoch ? { token: {} } : null;
  vm.runInContext(actualFunction('syncSheetActionVisit'), context);
  // G5 (2026-10-18): a render puts away the hold's strip and the 層 layers, where it once closed the word menu
  vm.runInContext(['closeSealStrip', 'foldReaderLayers'].map(actualFunction).join('\n'), context);
  vm.runInContext(actualFunction('render').replace('function render(', 'function renderUntilDOM('), context);
  context.render = () => {
    try { context.renderUntilDOM(); }
    catch (error) { if (error !== drawingBoundary) throw error; }
  };
  vm.runInContext(['withoutRoomTransition', 'roomTransition', 'keepNavigationReturn', 'returnFromNavigation', 'openPassage',
    'openReferenceCollection', 'learningSourceCaller', 'restoreLearningSourceCaller', 'resumeLearningSource',
    'requestScaleReturn', 'retireScaleReturn']
    .map(actualFunction).join('\n'), context);
  return { context, positions };
}

test('nested article and search detours restore the exact live review caller and selected token', () => {
  const { context: c, positions } = app();
  const review = { revealed: true, ix: 2 };
  const invoker = {}; invoker.self = invoker; // A live DOM-like identity cannot be serialized.
  const parent = { view: 'sentence-practice' };
  const visit = { epoch: 4, view: 'review', review, parent, stack: [], scroll: 10,
    dialogInvoker: invoker, focusId: 'review-source-return', sourceState: {} };
  c.S.review = review; c.learningSourceVisit = visit;
  const selected = c.S.readerTake;
  const roots = [c.S.taken, c.S.srs, c.S.revlog];
  c.keepNavigationReturn('search', invoker);
  c.S.view = 'search'; c.S.navQ = '世界';
  c.keepNavigationReturn('reader');
  c.openPassage('source-b');
  c.S.readerTake = { p: 'source-b', id: '学校', index: 8 };
  assert.equal(c.learningSourceVisit, null);
  assert.equal(c.returnFromNavigation(), true);
  assert.equal(c.S.view, 'search');
  assert.equal(c.learningSourceVisit, visit);
  assert.equal(c.S.readerTake, selected);
  assert.equal(c.returnFromNavigation(), true);
  assert.equal(c.S.passageId, 'source-a');
  assert.equal(c.learningSourceVisit, visit);
  assert.equal(c.S.readerTake, selected);
  assert.equal(c.resumeLearningSource(), true);
  assert.equal(c.S.view, 'review');
  assert.equal(c.S.review, review);
  assert.equal(c.S.dialogInvoker, invoker);
  assert.equal(c.learningSourceVisit, parent);
  assert.deepEqual([c.S.taken, c.S.srs, c.S.revlog], roots);
  assert.deepEqual(positions, [{ id: 'source-b', y: 0 }]);
});

test('restoring navigation cannot resume a replaced learner epoch or review session', () => {
  const { context: c } = app();
  const review = {};
  c.S.review = review;
  const visit = { epoch: 4, view: 'review', review, parent: null };
  c.learningSourceVisit = visit;
  c.keepNavigationReturn('reader'); c.openPassage('source-b');
  assert.equal(c.returnFromNavigation(), true);
  c.recordReady = () => false;
  assert.equal(c.resumeLearningSource(), false);
  assert.equal(c.S.view, 'reader');
  c.recordReady = () => true; c.learningSourceVisit = visit; c.S.review = {};
  assert.equal(c.resumeLearningSource(), false);
  assert.equal(c.S.view, 'reader');
});

test('a recursive source detour restores its own scale origin and rejects a replaced learner', () => {
  const { context: c } = app();
  const origin = { recordEpoch: 4, passageId: 'source-a', index: 3, viewportY: 220 };
  const word = { t: 'word', id: '世界', from: { passage: 'source-a', index: 3 } };
  c.S.scaleVisit = origin; c.S.stack = [word];
  const caller = c.learningSourceCaller('source-word');
  c.S.passageId = 'source-b'; c.S.stack = [];
  c.S.scaleVisit = { recordEpoch: 4, passageId: 'source-b', index: 8, viewportY: 340 };
  assert.equal(c.restoreLearningSourceCaller(caller), true);
  assert.equal(c.S.passageId, 'source-a');
  assert.equal(c.S.stack[0], word);
  assert.equal(c.S.scaleVisit, origin, 'The caller retains its exact line identity, not the source detour');
  c.recordEpoch = 5; c.recordReady = epoch => epoch === undefined || epoch === 5;
  c.S.passageId = 'source-b'; c.S.scaleVisit = null;
  assert.equal(c.restoreLearningSourceCaller(caller), false);
  assert.equal(c.S.passageId, 'source-b');
  assert.equal(c.S.scaleVisit, null, 'A replaced learner cannot revive the older origin');
});

test('a queued scale return yields to a newer page action even without a room render', () => {
  for (const interrupted of [false, true]) {
    const { context: c } = app();
    const pending = [];
    const origin = { recordEpoch: 4, passageId: 'source-a', index: 3, scroll: 180 };
    c.S.view = 'shelf'; c.S.scaleVisit = origin;
    c.roomTransition = change => pending.push(change);
    c.openPassage('source-a');
    assert.equal(pending.length, 1);
    const epoch = c.pageEpoch;
    const newer = { t: 'word', id: '学校' };
    if (interrupted) { c.retireScaleReturn(); c.S.stack = [newer]; }
    assert.equal(c.pageEpoch, epoch, 'A page-layer action need not render the room');
    c.roomTransitionUpdating = true;
    const result = pending.shift()();
    c.roomTransitionUpdating = false;
    if (interrupted) {
      assert.equal(result, false, 'A retired source return cannot overwrite newer input');
      assert.equal(c.S.view, 'shelf');
      assert.equal(c.S.stack[0], newer);
    } else {
      assert.equal(c.S.view, 'reader');
      assert.equal(c.S.passageId, 'source-a');
      assert.equal(c.S.stack.length, 0);
      assert.equal(c.window.scrollY, origin.scroll);
    }
  }
});

test('an origin read past yields to the newer bookmark; an unread origin keeps its exact line', () => {
  for (const readOn of [false, true]) {
    const { context: c } = app();
    const pending = [];
    c.S.view = 'shelf'; c.S.readerPos = { 'source-a': 900 };
    c.S.scaleVisit = { recordEpoch: 4, passageId: 'source-a', index: 3, scroll: 180, ...(readOn ? { readOn } : {}) };
    c.roomTransition = change => pending.push(change);
    c.openPassage('source-a');
    assert.equal(pending.length, 1);
    c.roomTransitionUpdating = true;
    pending.shift()();
    c.roomTransitionUpdating = false;
    assert.equal(c.S.view, 'reader');
    assert.equal(c.S.passageId, 'source-a');
    assert.equal(c.window.scrollY, readOn ? 900 : 180, readOn ? 'The durable bookmark wins' : 'The retained origin owns the return');
  }
});

// G5 replaced the word menu with the hold's strip (sealWord); G6's pending-menu ownership is carried onto it: a hold whose
// door is still preparing is owned by its newest request until it settles or a close retires it
test('a pending hold is owned by its newest request until it is closed', async () => {
  const { context: c } = app();
  const mounted = new Error('strip mounted');
  const focused = [];
  Object.assign(c, { removeMini() {}, standingSlip: () => null, openSealStrip() { throw mounted; }, focusProseWord: anchor => focused.push(anchor) });
  vm.runInContext(actualFunction('sealWord'), c);
  const anchor = name => ({ name, isConnected: true, closest: () => null });
  const held = () => {
    const gate = {};
    gate.promise = new Promise((resolve, reject) => { gate.settle = resolve; gate.fail = reject; });
    return gate;
  };
  const a = anchor('a'), b = anchor('b'), first = held(), second = held();
  const openA = c.sealWord(a, { prepare: () => first.promise });
  assert.equal(c.sealPending.anchor, a);
  const openB = c.sealWord(b, { prepare: () => second.promise });
  assert.equal(c.sealPending.anchor, b, 'The newer hold owns cancellation');
  first.settle();
  await openA;
  assert.equal(c.sealPending.anchor, b, 'An older completion cannot clear the newer owner');
  c.closeSealStrip({ restoreFocus: true });
  assert.equal(c.sealPending, null);
  assert.deepEqual(focused, [b], 'Closing returns focus to the pending word');
  second.settle();
  await openB;
  const failed = held(), openFailed = c.sealWord(a, { prepare: () => failed.promise });
  failed.fail(new Error('prepare failed'));
  await assert.rejects(openFailed, /prepare failed/);
  assert.equal(c.sealPending, null, 'A rejected preparation leaves no stale owner');
  const live = held(), openLive = c.sealWord(b, { prepare: () => live.promise });
  live.settle();
  await assert.rejects(openLive, error => error === mounted, 'An uncancelled preparation still mounts its strip');
  assert.equal(c.sealPending, null);
});

test('abandoning a pending collection retires its destination before another library visit', () => {
  const { context: c } = app();
  c.openReferenceCollection('jlpt:N5');
  assert.equal(c.pendingReferenceCollection, 'jlpt:N5');
  assert.equal(c.returnFromNavigation(), true);
  assert.equal(c.pendingReferenceCollection, null);
  c.S.view = 'levels'; c.render();
  assert.equal(c.pendingReferenceCollection, null);
  c.pendingReferenceCollection = 'kanken:1級';
  c.S.view = 'shelf'; c.render();
  assert.equal(c.pendingReferenceCollection, null, 'Ordinary room exit also retires pending navigation');
});

test('same-visit retry and a reversible nested detour preserve the pending collection', () => {
  const { context: c } = app();
  c.openReferenceCollection('jlpt:N1');
  const beforeRender = c.pageEpoch;
  c.render(); c.render();
  assert.equal(c.pageEpoch, beforeRender + 2, 'Every actual room render invalidates retained page generations');
  assert.equal(c.pendingReferenceCollection, 'jlpt:N1');
  c.keepNavigationReturn('search'); c.S.view = 'search'; c.render();
  assert.equal(c.pendingReferenceCollection, null);
  assert.equal(c.returnFromNavigation(), true);
  assert.equal(c.S.view, 'levels');
  assert.equal(c.pendingReferenceCollection, 'jlpt:N1');
});

// Exercise the actual Back, capture, source validation and prose-focus functions.
// Only DOM layout/roving and rendering are doubled: the native companion must
// still prove that the real browser settles at this same source after focus.
function readerBack({ joined = false } = {}) {
  const calls = [], delayedFocus = [];
  const p = { id: 'source-a', tokens: Array.from({ length: 5 }, (_, index) =>
    ({ s: index === 3 ? '総理' : '文', b: index === 3 ? '総理' : '文', r: '' })) };
  const word = { t: 'word', id: '総理', from: { passage: p.id, index: 3 } };
  const block = {};
  let c, afterOpen = () => {}, afterFocus = () => {};
  const anchor = {
    isConnected: true, dataset: { index: joined ? '2' : '3', indexEnd: '3' }, documentY: 1064.6875,
    closest: selector => selector === '[data-prose-roving]' ? block : null,
    matches: selector => selector === '.tok',
    getBoundingClientRect: () => ({ top: anchor.documentY - c.window.scrollY, width: 32, height: 24 }),
  };
  const reader = {
    isConnected: true,
    querySelector: selector => Number(selector.match(/data-index="(\d+)"/)?.[1]) === Number(anchor.dataset.index) ? anchor : null,
    querySelectorAll: () => [anchor],
  };
  const glyph = { textContent: '総理', parentElement: { closest: () => null } };
  const origin = { anchor, demo: false, openStage(options) { calls.push(['stage', options]); afterOpen(); } };
  c = vm.createContext({
    S: { view: 'reader', passageId: p.id, stack: [word], scaleVisit: null, wordEntrySerial: 0,
      taken: [], srs: {}, revlog: [] }, D: { passages: [p] }, recordEpoch: 4, pageEpoch: 7,
    learningSourceVisit: { view: 'review' }, personalHost: null, referenceLibrary: null, worldPickerEls: null,
    innerWidth: 390, innerHeight: 844,
    window: { scrollY: 0 },
    document: {
      activeElement: null, getElementById: id => id === 'reader' ? reader : null,
      createTreeWalker(_anchor, _show, filter) {
        let read = false;
        return { nextNode() { if (read) return null; read = true; return filter.acceptNode(glyph) === 1 ? glyph : null; } };
      },
      createRange: () => ({ selectNodeContents() {}, getClientRects: () => [anchor.getBoundingClientRect()] }),
    }, NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    proseWordRovers: new Map([[block, { selector: '.tok', focus(target, options) {
      calls.push(['focus', options]); c.document.activeElement = target;
      // The existing rover's nearest scroll can move the source even with preventScroll.
      c.window.scrollY = 270; afterFocus();
    } }]]),
    passage: () => p, teacherSentence: () => ({ start: 0, end: p.tokens.length }),
    learnerSourceLabel: () => 'source', invokerKey: token => token.id ? { id: token.id } : { index: Number(token.dataset.index) },
    ladderPages: new Map([[word, origin]]), keptPages: new Map(), heroSource: new Map(),
    ladderVisit: null, ladderReturning: null,
    finishPageTransition() {}, layerPathFor: () => true, sampleWhere: () => ({}), pageCutAllowed: () => false,
    renderLayer() { calls.push(['render']); }, render() { c.pageEpoch++; },
    returnScroll() { c.window.scrollY = 0; }, restoreDialogInvoker() { delayedFocus.push(() => { c.document.activeElement = anchor; }); },
    clearReaderSummons() {}, clearWordLadder(value = c.ladderVisit) { if (c.ladderVisit === value) c.ladderVisit = null; },
    removeMini() {}, clearReaderReadings() {}, stopReadAloud() {}, stopSentenceListening() {},
    keepScroll() {}, rememberSheet() {}, enterWord(node, options) { calls.push(['enter', node, options]); c.S.stack.push(node); },
    scaleReaderIndex() { throw new Error('A retained source must not select a new visible occurrence'); },
    syncWalkSentinel() {}, sampleTransition() {},
  });
  vm.runInContext(['scaleTokenFingerprint', 'scalePassage', 'scaleSource', 'scaleLineTop', 'readerTokenAtIndex',
    'captureScaleVisit', 'focusProseWord', 'recede', 'scaleName', 'scaleNavigationAllowed', 'retireScaleReturn',
    'retireScaleTransients', 'scaleNodeFrom', 'rememberScaleEntry', 'keyboardActivated', 'go', 'scaleIn']
    .map(actualFunction).join('\n'), c);
  const visit = c.captureScaleVisit(3, word);
  const skyPlace = { id: 'retained-sky' };
  visit.skyPlace = skyPlace;
  return { c, p, word, reader, anchor, origin, visit, calls, delayedFocus,
    onOpen(fn) { afterOpen = fn; }, onFocus(fn) { afterFocus = fn; } };
}

test('ordinary Back captures the landed source after actual stage/focus, including joined tokens', () => {
  for (const joined of [false, true]) {
    const f = readerBack({ joined }), { c, visit, word, anchor, calls } = f;
    const roots = [c.S.taken, c.S.srs, c.S.revlog];
    f.onOpen(() => { anchor.documentY += 20; });
    assert.equal(visit.scroll, 0); assert.equal(visit.viewportY, 1064.6875);
    c.recede();
    const landed = c.S.scaleVisit;
    assert.notEqual(landed, visit, 'Back must replace stale pre-focus geometry');
    assert.equal(landed.scroll, 270); assert.equal(landed.viewportY, 814.6875);
    assert.equal(landed.index, 3); assert.equal(landed.indexEnd, 3);
    assert.equal(landed.fingerprint, visit.fingerprint); assert.equal(landed.word, word);
    assert.equal(landed.skyPlace, visit.skyPlace); assert.equal(landed.learningSourceVisit, visit.learningSourceVisit);
    assert.equal(c.document.activeElement, anchor); assert.equal(c.S.stack.length, 0);
    assert.deepEqual([c.S.taken, c.S.srs, c.S.revlog], roots);
    assert.deepEqual(calls.map(call => call[0]), ['render', 'stage', 'focus']);
    assert.equal(calls[1][1].restore, true); assert.equal(calls[2][1].preventScroll, true);
    assert.equal(visit.scroll, 0, 'The prior visit is not mutated into a different owner');
  }
});

test('ordinary Back refuses stale, nested, replaced, pending or cancelled source owners', () => {
  const cases = [
    ['nested page', f => f.c.S.stack.unshift({ t: 'sent' })],
    ['old learner', f => { f.c.recordEpoch++; }],
    ['detached source at entry', f => { f.anchor.isConnected = false; }],
    ['different occurrence', f => f.onOpen(() => { f.anchor.dataset.index = '4'; f.anchor.dataset.indexEnd = '4'; })],
    ['changed occurrence extent', f => f.onOpen(() => { f.anchor.dataset.indexEnd = '4'; })],
    ['changed source token', f => f.onOpen(() => { f.p.tokens[3].s = '別'; })],
    ['pending request', f => { f.visit.returnRequest = {}; }],
    ['pending job', f => { f.visit.returnJob = {}; }],
    ['pending request retired during Back', f => { f.visit.returnRequest = {}; f.onOpen(() => { f.visit.returnRequest = null; }); }],
    ['new request during focus', f => f.onFocus(() => { f.visit.returnRequest = {}; })],
    ['new job during focus', f => f.onFocus(() => { f.visit.returnJob = {}; })],
    ['new learner during focus', f => f.onFocus(() => { f.c.recordEpoch++; })],
    ['changed passage during focus', f => f.onFocus(() => { f.c.S.passageId = 'source-b'; })],
    ['changed room during focus', f => f.onFocus(() => { f.c.S.view = 'shelf'; })],
    ['detached source during focus', f => f.onFocus(() => { f.anchor.isConnected = false; })],
    ['detached reader during focus', f => f.onFocus(() => { f.reader.isConnected = false; })],
    ['replaced reader', f => f.onFocus(() => { f.c.document.getElementById = () => ({}); })],
    ['new page epoch', f => f.onFocus(() => { f.c.pageEpoch++; })],
    ['new page action', f => f.onFocus(() => { f.c.S.wordEntrySerial++; })],
    ['cancelled ladder', f => f.onFocus(() => { f.c.ladderVisit = null; })],
    ['moved focus', f => f.onFocus(() => { f.c.document.activeElement = {}; })],
  ];
  for (const [name, arrange] of cases) {
    const f = readerBack(); arrange(f); f.c.recede();
    assert.equal(f.c.S.scaleVisit, f.visit, `${name} cannot acquire a new origin`);
    assert.equal(f.visit.scroll, 0, `${name} cannot rewrite the retained geometry`);
  }
  for (const replacement of [null, { origin: 'reader', scroll: 900 }]) {
    const f = readerBack(); f.onFocus(() => { f.c.S.scaleVisit = replacement; }); f.c.recede();
    assert.equal(f.c.S.scaleVisit, replacement, 'A cancelled or superseding visit retains ownership');
  }
});

test('close-all and room rebuild do not refresh the reader origin', () => {
  for (const options of [{ all: true }, { viaRender: true }]) {
    const f = readerBack(); f.c.recede(options);
    assert.equal(f.c.S.scaleVisit, f.visit);
    assert.equal(f.visit.scroll, 0);
  }
});

test('the actual next scale entry retains the landed occurrence after simulated Tab scroll', () => {
  const f = readerBack(); f.c.recede();
  const landed = f.c.S.scaleVisit;
  assert.equal(landed.scroll, 270);
  // This callback is a DOM double, not a proof of native dialog-focus ownership.
  f.delayedFocus.shift()();
  assert.equal(f.c.S.scaleVisit, landed);
  const rail = { id: 'scale-sentence' };
  f.c.document.activeElement = rail; f.c.window.scrollY = 410;
  f.c.window.event = { type: 'click', isTrusted: true, detail: 0 };
  assert.equal(f.c.scaleIn(), true);
  assert.equal(f.c.S.stack.length, 1);
  assert.equal(f.c.S.stack[0], landed.sentence, 'The real scaleIn/go path enters the retained sentence');
  assert.equal(f.c.S.stack[0].target, f.word.id); assert.equal(f.c.S.stack[0].targetOffset, 3);
  assert.equal(f.calls.at(-1)[0], 'enter'); assert.equal(f.calls.at(-1)[2].invoker, rail);
  assert.equal(f.calls.at(-1)[2].instant, true);
  assert.equal(f.c.S.scaleVisit, landed);
  assert.equal(landed.word, f.word); assert.equal(landed.index, 3);
  assert.equal(landed.scroll, 270, 'Later rail traversal does not silently move this source origin');
});
