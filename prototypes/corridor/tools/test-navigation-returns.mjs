/** Actual navigation functions; DOM drawing and durable-write dependencies are
 * fakes here. The companion browser regressions exercise ordinary controls. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import * as exitCore from '../srs-core.mjs';
import * as exitFsrs from '../vendor/ts-fsrs.mjs';
import { reviewExitFixture, readerTicketFixture, liftCorridor, READER_TICKET_NAMES } from './srs-hooks-corridor-layer.mjs';

const source = readFileSync(new URL('../corridor.js', import.meta.url), 'utf8');
const exitPin = JSON.parse(readFileSync(new URL('../data/fsrs-pin.json', import.meta.url), 'utf8'));
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
    recordApp: null, recordInstallation: null, readerTicket: null,
    reviewExitUi() {}, // This fixture stops before DOM drawing; exit suite below uses real helpers.
    syncReviewExitNotice() {},
    keepScroll() {}, rememberSheet() {}, invokerKey: value => value,
    restoreDialogInvoker() {}, stopReadAloud() {}, clearTimeout() {},
    clearReaderReadings() {},
    requestAnimationFrame() {}, passage: () => null,
    recordReady: epoch => epoch === undefined || epoch === 4,
    saveReaderPosition: async (id, y) => { positions.push({ id, y }); return true; },
    stopSentenceListening() { throw drawingBoundary; },
  });
  context.scaleSource = visit => visit?.recordEpoch === context.recordEpoch ? { token: {} } : null;
  vm.runInContext(liftCorridor(source, READER_TICKET_NAMES), context);
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
    ladderVisit: null, ladderReturning: null, ladderCleanupGeneration: 0,
    finishPageTransition() {}, layerPathFor: () => true, sampleWhere: () => ({}), pageCutAllowed: () => false,
    renderLayer() { calls.push(['render']); }, render() { c.pageEpoch++; },
    returnScroll() { c.window.scrollY = 0; }, restoreDialogInvoker() { delayedFocus.push(() => { c.document.activeElement = anchor; }); },
    clearReaderSummons() {}, clearWordLadder(value = c.ladderVisit) { if (c.ladderVisit === value) c.ladderVisit = null; },
    removeMini() {}, clearReaderReadings() {}, stopReadAloud() {}, stopSentenceListening() {},
    reviewExitUi() {}, // This fixture stops before DOM drawing; exit suite below uses real helpers.
    syncReviewExitNotice() {},
    keepScroll() {}, rememberSheet() {}, enterWord(node, options) { calls.push(['enter', node, options]); c.S.stack.push(node); },
    scaleReaderIndex() { throw new Error('A retained source must not select a new visible occurrence'); },
    syncWalkSentinel() {}, sampleTransition() {},
  });
  vm.runInContext(liftCorridor(source, READER_TICKET_NAMES), c);
  c.reviewExitUi = work => { try { work(); } catch { /* this partial reader fixture has no review surface */ } };
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

// W2 0917 preparation on 99811314. These normative cases intentionally expose
// parent defects until a separately keyed product implementation exists. No
// missing declaration, renderer exception or wait timeout counts as a defect.
const exitFixture = options => reviewExitFixture(source, { core: exitCore, fsrsApi: exitFsrs, pin: exitPin, ...options });
const microtasksUntil = async (predicate, label) => {
  for (let i = 0; i < 30 && !predicate(); i++) await Promise.resolve();
  assert(predicate(), `fixture boundary reached: ${label}`);
};
const exitNotice = f => f.main() && f.find(f.main(), n => n.getAttribute?.('role') === 'status' && n.textContent.trim());

test('review exits fixture: genuine A0 waits outside callback, late departure reserves and writes nothing', async () => {
  const f = exitFixture();
  const release = f.holdLock();
  const p = f.grade();
  assert.equal(f.rv.admitting, true); assert.equal(f.rv.pending, null);
  assert.equal(f.entered(), 0); assert.equal(f.box.producerRan, 0);
  f.door().fire(); // Leaving A0 is allowed. Feedback is a separate failing claim.
  assert.equal(f.S.review, null);
  release(); assert.equal(await p, false);
  assert.equal(f.box.producerRan, 0); assert.equal(f.box.writes, 0);
  assert.equal(f.storage.getItem('bunki-srs:answered-today'), null);
});

test('review exits fixture: actual grade reaches P then published A1 then idle, with one reservation', async () => {
  const f = exitFixture({ tailHeld: true });
  const p = f.grade();
  await microtasksUntil(() => f.queued.length === 1, 'real queued producer');
  assert(f.rv.pending); assert.equal(f.rv.admitting, true); assert.equal(f.entered(), 1);
  assert.equal(f.box.producerRan, 0); assert.equal(f.box.writes, 0);
  f.ack(); await f.callbackDone;
  assert.equal(f.rv.pending, null); assert.equal(f.rv.admitting, true);
  assert.equal(f.box.writes, 1); assert.equal(f.box.record.revlog.length, 1);
  assert(f.storage.getItem('bunki-srs:answered-today'));
  f.releaseTail(); assert.equal(await p, true); assert.equal(f.rv.admitting, false);
});

test('review exits PREP: active P must retain the review and queued grade', async t => {
  const f = exitFixture(); const p = f.grade();
  await microtasksUntil(() => f.queued.length === 1, 'real queued producer');
  const before = f.roots(); f.door().fire();
  const retained = f.S.review === f.rv;
  assert.deepEqual(f.roots(), before, 'the exit itself never writes');
  f.ack(); const graded = await p;
  t.diagnostic(JSON.stringify({ retained, graded, producerCalls: f.box.producerRan, writes: f.box.writes,
    logRows: f.box.record.revlog.length, reservation: f.storage.getItem('bunki-srs:answered-today') }));
  assert.equal(retained, true, 'P exit must retain the exact pending review');
  assert.equal(graded, true, 'the original queued grade completes once');
  assert.equal(f.box.writes, 1);
});

test('review exits PREP: natural summary undo P must retain the review and undo', async t => {
  const f = exitFixture({ cards: 1 }); const p = f.grade();
  await microtasksUntil(() => f.queued.length === 1, 'grade producer'); f.ack(); await p;
  assert.equal(f.rv.ix, f.rv.queue.length);
  f.paint(); const undo = f.find(f.main(), n => n.className?.split(' ').includes('review-undo'));
  assert(undo, 'actual summary exposes its real undo');
  const undoing = undo.fire(); assert.equal(f.queued.length, 1); assert(f.rv.pending);
  f.door('summary').fire(); f.flushTransition(); const retained = f.S.review === f.rv;
  f.ack(); await undoing;
  t.diagnostic(JSON.stringify({ retained, writes: f.box.writes, logRows: f.box.record.revlog.length,
    lastLogRating: f.box.record.revlog.at(-1)?.[2], undoHistoryRetained: f.rv.history.length }));
  assert.equal(retained, true, 'summary must retain the exact undo owner while its producer is queued');
  assert.equal(f.box.writes, 2, 'one grade and one undo, no duplicated grade');
  assert.equal(f.box.record.revlog.at(-1)[2], 0, 'the undo is recorded as an append-only revocation');
});

for (const kind of ['active', 'summary', 'break']) {
  test(`review exits PREP: ${kind} A1 holds after publication, without claiming grade loss`, async t => {
    const f = exitFixture({ cards: kind === 'summary' ? 1 : 2, tailHeld: true, pauseEvery: kind === 'break' ? 1 : 0 });
    const p = f.grade(); await microtasksUntil(() => f.queued.length === 1, 'grade producer');
    f.ack(); await f.callbackDone;
    assert.equal(f.rv.pending, null); assert.equal(f.rv.admitting, true);
    assert.equal(f.box.writes, 1); const durable = f.roots();
    f.door(kind).fire(); if (kind === 'summary') f.flushTransition();
    const retained = f.S.review === f.rv;
    f.releaseTail(); await p;
    t.diagnostic(JSON.stringify({ retained, writes: f.box.writes, logRows: f.box.record.revlog.length,
      gradeRetained: JSON.stringify(f.roots()) === JSON.stringify(durable) }));
    assert.deepEqual(f.roots(), durable, 'A1 departure cannot erase an already durable grade');
    assert.equal(retained, true, 'callback-entered A1 requires an owned visible hold and a fresh later tap');
  });
}

test('review exits PREP: A0 departure leaves a perceivable non-save outcome on its destination', async () => {
  const f = exitFixture(); const release = f.holdLock(); const p = f.grade();
  assert.equal(f.entered(), 0); f.door().fire();
  assert.equal(f.S.review, null); assert.equal(f.S.view, 'tray', 'A0 is an allowed immediate escape');
  const notice = exitNotice(f);
  release(); await p;
  assert(notice, 'A0 must leave a destination-owned, perceivable not-recorded status; leaving alone is not a failure');
  assert.equal(f.box.producerRan, 0); assert.equal(f.box.writes, 0);
});

test('review exits PREP: defensive break P handler cannot discard a live queued action', async () => {
  // A pending grade is not a natural public break state. This deliberately
  // exercises the actual break handler as a defensive owner-contract control.
  const f = exitFixture(); const p = f.grade();
  await microtasksUntil(() => f.queued.length === 1, 'grade producer');
  f.door('break').fire(); const retained = f.S.review === f.rv;
  f.ack(); await p;
  assert.equal(retained, true, 'defensive break handler must hold P');
});

test('review exits PREP: delayed summary exit must not clear a replacement review', () => {
  const f = exitFixture({ cards: 0 });
  f.door('summary').fire(); const next = { queue: [], ix: 0 };
  f.S.review = next; f.flushTransition();
  assert.equal(f.S.review, next, 'deferred summary callback must recheck review identity');
});

test('review exits PREP: same-review activity between summary press and transition revokes stale exit', async () => {
  const f = exitFixture({ cards: 1 }); const p = f.grade();
  await microtasksUntil(() => f.queued.length === 1, 'grade producer'); f.ack(); await p;
  f.door('summary').fire();
  const undo = f.find(f.main(), n => n.className?.split(' ').includes('review-undo'));
  assert(undo, 'actual summary undo present'); const undoing = undo.fire(); f.ack(); await undoing;
  assert.equal(f.rv.pending, null); assert.equal(f.rv.admitting, false);
  const before = f.roots(); f.flushTransition();
  assert.deepEqual(f.roots(), before);
  assert.equal(f.S.review, f.rv, 'idle flags after newer completed activity cannot revive an old exit intent');
});

for (const kind of ['active', 'summary', 'break']) {
  test(`review exits fixture: ${kind} idle read-only review retains its ordinary escape`, () => {
    const f = exitFixture({ cards: kind === 'summary' ? 0 : 2 }); f.box.mode = 'pre-write-refusal';
    assert.equal(f.sandbox.recordWritable(), false);
    const before = f.roots(); f.door(kind).fire(); if (kind === 'summary') f.flushTransition();
    assert.equal(f.S.review, null); assert.equal(f.S.view, 'tray'); assert.deepEqual(f.roots(), before);
  });
}

// Successor controls use the actual renderer callbacks, admission and producers.
// Pending break/summary admission fixtures are defensive handler contracts.
const candidateFixture = (bytes = source, options = {}) => reviewExitFixture(bytes, { core: exitCore, fsrsApi: exitFsrs, pin: exitPin, ...options });
const drainExitMicrotasks = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const noticeText = f => exitNotice(f)?.textContent || '';
const idleText = kind => kind === 'active' ? '×' : kind === 'summary' ? 'Back to Today' : 'back to lists';
const queueGrade = async f => { const promise = f.grade(); await microtasksUntil(() => f.queued.length === 1, 'grade queued'); return { promise }; };
const completeGrade = async f => { const { promise } = await queueGrade(f); f.ack(); await promise; await drainExitMicrotasks(); };
function ownedStatus(f, text) {
  const node = exitNotice(f); assert(node, 'owned exit feedback is present');
  assert.equal(node.textContent, text); assert.equal(node.getAttribute('aria-live'), 'polite');
  return node;
}
const BUSY = 'This review action is still finishing. Tap again when it finishes to leave the review.';
const READY = 'Processing has finished. Tap again to leave the review.';
const DEPARTED = 'This answer was not recorded. You left the review.';
const RECHECK = 'The review state changed. Tap again to leave.';

for (const kind of ['active', 'summary', 'break']) {
  test(`UX01–03 ${kind}: P → A1 → idle, visible hold then one fresh exit`, async () => {
    const f = candidateFixture(source, { cards: kind === 'summary' ? 1 : 2, tailHeld: true });
    const { promise } = await queueGrade(f);
    // Summary before publication is a defensive renderer state; natural undo is tested above.
    if (kind === 'summary') f.rv.ix = f.rv.queue.length;
    const button = f.door(kind); button.fire(); button.fire();
    assert.equal(f.S.review, f.rv); assert.equal(f.transitions.length, 0);
    ownedStatus(f, BUSY); assert.equal(button.textContent, 'Processing…');
    assert.equal(button.getAttribute('aria-busy'), 'true'); assert.equal(button.disabled, false);
    assert.equal(button.getAttribute('aria-describedby'), exitNotice(f).id);
    if (kind === 'summary') f.rv.ix = 0;
    f.publish(); const published = f.roots(); button.fire();
    assert.equal(f.S.review, f.rv, 'published-before-ack still holds');
    f.ack(); await f.callbackDone;
    const current = f.door(kind); current.fire(); ownedStatus(f, BUSY);
    assert.equal(current.getAttribute('aria-busy'), 'true', 'inner pending settlement is not final');
    const paints = f.box.renders;
    f.releaseTail(); assert.equal(await promise, true); await drainExitMicrotasks();
    assert.equal(f.box.renders, paints, 'outer refresh does not require another full render');
    ownedStatus(f, READY); assert.equal(current.textContent, idleText(kind));
    assert.equal(current.getAttribute('aria-busy'), null); assert.equal(f.S.review, f.rv);
    current.fire(); if (kind === 'summary') f.flushTransition();
    assert.equal(f.S.review, null); assert.deepEqual(f.roots(), published); assert.equal(f.box.writes, 1);
  });

  test(`UX08 ${kind}: exact A0 escapes with zero notice writes and no late answer`, async () => {
    const f = candidateFixture(); const release = f.holdLock(); const p = f.grade();
    if (kind === 'summary') f.rv.ix = f.rv.queue.length;
    const before = f.roots(), storage = [...f.storage.m];
    f.door(kind).fire(); if (kind === 'summary') f.flushTransition();
    assert.equal(f.S.review, null); ownedStatus(f, DEPARTED);
    assert.deepEqual(f.roots(), before); assert.deepEqual([...f.storage.m], storage);
    release(); assert.equal(await p, false); assert.equal(f.box.producerRan, 0);
    assert.equal(f.box.writes, 0); assert.equal(f.storage.getItem('bunki-srs:answered-today'), null);
  });
}

test('UX05 natural summary leech-rest remains owned until publication, then leaves without another write', async () => {
  const f = candidateFixture(source, { cards: 1 }); await completeGrade(f);
  f.sandbox.isLeech = item => item.id === '学校'; f.paint();
  const rest = f.find(f.main(), n => n.dataset?.leechRest === '学校'); assert(rest);
  const p = rest.fire(); assert(f.rv.pending); f.door('summary').fire(); ownedStatus(f, BUSY);
  f.ack(); await p; await drainExitMicrotasks(); assert(f.box.record.suspended['word:学校']);
  const before = f.roots(); f.door('summary').fire(); f.flushTransition();
  assert.equal(f.S.review, null); assert.deepEqual(f.roots(), before); assert.equal(f.box.writes, 2);
});

for (const change of ['stack-push', 'stack-replace-frame', 'rv', 'epoch', 'app', 'installation', 'binding', 'readonly', 'departure', 'word-entry']) {
  test(`UX07 delayed summary revokes on ${change}`, () => {
    const f = candidateFixture(source, { cards: 0 }), c = f.sandbox;
    c.recordInstallation = { policy: { binding: { sessionId: 'one', learnerId: 'learner', accountId: 'account' } }, assertCurrent: () => true };
    f.S.stack = [{}]; f.door('summary').fire();
    if (change === 'stack-push') f.S.stack.push({});
    else if (change === 'stack-replace-frame') f.S.stack[0] = {};
    else if (change === 'rv') f.S.review = { queue: [], ix: 0 };
    else if (change === 'epoch') c.recordEpoch += 1;
    else if (change === 'app') c.recordApp = {};
    else if (change === 'installation') c.recordInstallation = { ...c.recordInstallation };
    else if (change === 'binding') c.recordInstallation.policy.binding.sessionId = 'two';
    else if (change === 'readonly') f.S.storeReadOnly = true;
    else if (change === 'departure') f.S.navigationDepartures = 1;
    else f.S.wordEntrySerial = 1;
    const current = f.S.review; f.flushTransition();
    assert.equal(f.S.review, current); assert.equal(f.S.view, 'review'); assert.equal(noticeText(f), '');
  });
}

test('UX07 summary duplicate activation has one callback and cannot act twice after a replacement', () => {
  const f = candidateFixture(source, { cards: 0 }); const button = f.door('summary');
  button.fire(); button.fire(); assert.equal(f.transitions.length, 1);
  const callback = f.transitions[0]; f.flushTransition(); assert.equal(f.S.review, null);
  const next = { queue: [], ix: 0 }; f.S.review = next; f.S.view = 'review'; callback();
  assert.equal(f.S.review, next); assert.equal(f.box.writes, 0);
});

for (const route of ['unsupported', 'reentry', 'deferred-native']) {
  test(`UX07 transition ${route} reaches the owned exit callback`, () => {
    const f = candidateFixture(source, { cards: 0 }), c = f.sandbox;
    Object.assign(c, { roomTransitionUpdating: route === 'reentry', activeRoomTransition: null,
      beginRoomTransition() {}, finishRoomTransition() {}, keepRoomFocus() {},
      document: { ...c.document, hidden: false }, window: {}, requestAnimationFrame: fn => fn(),
      S: f.S });
    // withoutRoomTransition and the unsupported/reentry entry branches are real;
    // native timing itself is separately covered by the held callback fixtures.
    c.S.ready = false;
    vm.runInContext(['withoutRoomTransition', 'roomTransition'].map(actualFunction).join('\n'), c);
    if (route === 'deferred-native') c.roomTransition = change => f.transitions.push(change);
    f.door('summary').fire(); if (route === 'deferred-native') f.flushTransition();
    assert.equal(f.S.review, null); assert.equal(f.S.view, 'tray');
  });
}

for (const completed of [false, true]) {
  test(`P-C deferred A0 becomes callback-entered ${completed ? 'and completed' : 'and unfinished'}; old permission dies`, async () => {
    const f = candidateFixture(); const release = f.holdLock(); const p = f.grade();
    f.rv.ix = f.rv.queue.length; f.door('summary').fire(); f.rv.ix = 0;
    release(); await microtasksUntil(() => f.queued.length === 1, 'A0 callback entered');
    if (completed) { f.ack(); await p; }
    f.paint(); f.flushTransition();
    assert.equal(f.S.review, f.rv); ownedStatus(f, completed ? RECHECK : BUSY);
    assert(!noticeText(f).includes('not recorded'));
    if (!completed) { f.ack(); await p; }
  });
}

test('P-A two reviews escape the same indefinitely held lock, with fresh notice and no abandoned writes', async () => {
  const f = candidateFixture(); const release = f.holdLock(); const first = f.grade();
  f.door().fire(); const oldNotice = ownedStatus(f, DEPARTED);
  const next = { ...f.rv, queue: [{ ...f.rv.queue[0] }], history: [], ix: 0, admitting: false, pending: null };
  f.S.review = next; f.S.view = 'review'; f.paint(); assert.equal(noticeText(f), '');
  const second = f.grade(next); assert.equal(next.admitting, true); assert.equal(f.entered(), 0);
  f.door().fire(); const newNotice = ownedStatus(f, DEPARTED); assert.notEqual(newNotice, oldNotice);
  release(); assert.equal(await first, false); assert.equal(await second, false);
  assert.equal(f.box.writes, 0); assert.equal(f.box.producerRan, 0); assert.equal(f.storage.m.size, 0);
});

for (const revoker of ['navigation', 'reload', 'pagehide', 'epoch', 'readonly', 'same-room-departure']) {
  test(`P-D destination notice is transient and revoked by ${revoker}`, async () => {
    const f = candidateFixture(); const release = f.holdLock(); const p = f.grade();
    let writes = 0; const setItem = f.storage.setItem.bind(f.storage); f.storage.setItem = (...args) => { writes++; return setItem(...args); };
    f.door().fire(); ownedStatus(f, DEPARTED); f.paint(); ownedStatus(f, DEPARTED);
    if (revoker === 'navigation') { f.S.view = 'reader'; f.paint(); f.S.view = 'tray'; }
    else if (revoker === 'reload') { const fresh = candidateFixture(); fresh.S.view = 'tray'; fresh.S.review = null; fresh.paint(); assert.equal(noticeText(fresh), ''); }
    else if (revoker === 'pagehide') {
      // Actual release's notification precedes all existing durable lifecycle work.
      const boundary = new Error('existing record lifecycle');
      f.sandbox.preserveVisibleDrafts = () => { throw boundary; };
      vm.runInContext(actualFunction('releaseRecordOwnership'), f.sandbox);
      assert.throws(() => f.sandbox.releaseRecordOwnership(), e => e === boundary);
    } else if (revoker === 'epoch') f.sandbox.recordEpoch++;
    else if (revoker === 'readonly') f.S.storeReadOnly = true;
    else f.S.navigationDepartures = 1;
    if (revoker !== 'reload') { f.paint(); assert.equal(noticeText(f), ''); }
    assert.equal(writes, 0); release(); await p; assert.equal(writes, 0);
  });
}

test('UX12 fresh mounted idle exit survives a protection warning without a repaint', () => {
  const f = candidateFixture(), button = f.door(); f.S.storeReadOnly = true; f.sandbox.staleTab = true;
  f.sandbox.syncReviewExitNotice(); button.fire(); assert.equal(f.S.review, null); assert.equal(f.box.writes, 0);
});

test('UX12 old settlement cannot overwrite replacement-session status; detach is inert', async () => {
  const f = candidateFixture(); const { promise } = await queueGrade(f); const old = f.door(); old.fire();
  const next = { ...f.rv, queue: [{ ...f.rv.queue[0] }], history: [], admitting: true, pending: null };
  f.S.review = next; f.paint(); const current = f.door(); current.fire(); ownedStatus(f, BUSY);
  const before = noticeText(f); f.ack({ publishWrite: false }); await promise; await drainExitMicrotasks();
  assert.equal(noticeText(f), before); assert.equal(f.S.review, next);
  // Directly dispatching a retained callback models a stale event without lying
  // that a detached element receives a physical/keyboard click.
  old.events.click[0](); assert.equal(f.S.review, next); assert.equal(noticeText(f), before);
});

for (const failure of ['not-published', 'unacknowledged', 'uncertain', 'missing-locks', 'rejected-lock']) {
  test(`UX08 ${failure} settles without success text, replay, rollback or automatic departure`, async () => {
    const f = candidateFixture(); let p;
    if (failure === 'missing-locks') { f.sandbox.navigator.locks = null; p = f.grade(); }
    else if (failure === 'rejected-lock') { f.sandbox.navigator.locks = { request: async () => { throw new Error('lock refused'); } }; p = f.grade(); }
    else {
      ({ promise: p } = await queueGrade(f)); f.door().fire(); ownedStatus(f, BUSY);
      if (failure === 'not-published') f.ack({ publishWrite: false });
      else if (failure === 'unacknowledged') f.ack({ acknowledged: false });
      else f.ack({ publishWrite: false, outcome: { status: 'recovery-required', reason: 'publication-failed' } });
    }
    if (failure === 'rejected-lock') await assert.rejects(p, /lock refused/u);
    else assert.equal(await p, false);
    await drainExitMicrotasks();
    assert.equal(f.S.review, f.rv); assert.equal(f.rv.pending || false, false); assert.equal(f.rv.admitting, false);
    assert(!/Saved|recorded|saved/u.test(noticeText(f))); assert(failure === 'rejected-lock' || f.rv.answerRefusal || f.box.failures.length, 'existing refusal remains');
    const before = f.roots(), mark = f.storage.getItem('bunki-srs:answered-today');
    f.door().fire(); assert.equal(f.S.review, null); assert.deepEqual(f.roots(), before);
    assert.equal(f.storage.getItem('bunki-srs:answered-today'), mark);
    assert.equal(f.box.writes, failure === 'unacknowledged' ? 1 : 0);
  });
}

test('UX10 duplicate grades while waiting and pending yield one admission, producer and history row', async () => {
  const f = candidateFixture(); const release = f.holdLock(); const p = f.grade();
  assert.equal(await f.grade(), false); release(); await microtasksUntil(() => f.queued.length === 1, 'producer');
  assert.equal(await f.grade(), false); const button = f.door(); button.fire(); button.fire();
  f.ack(); assert.equal(await p, true); assert.equal(f.box.writes, 1); assert.equal(f.box.producerRan, 1); assert.equal(f.rv.history.length, 1);
  const mark = f.storage.getItem('bunki-srs:answered-today'); assert(mark);
  const later = { ...f.rv, queue: [{ t: 'word', id: '学校', label: '学校' }], ix: 0, revealed: true, declared: 1, history: [] };
  f.S.review = later; const again = f.grade(later); await microtasksUntil(() => f.queued.length === 1, 'repeat producer');
  f.ack(); assert.equal(await again, false); assert.equal(f.box.writes, 1); assert.equal(f.storage.getItem('bunki-srs:answered-today'), mark);
});

test('UX11 raise-limit write remains independent: exit succeeds, one extra persists, no replacement review starts', async () => {
  const f = candidateFixture(source, { cards: 0 }), c = f.sandbox;
  f.rv.scope = 'all'; c.todayQueue = () => ({ held: 3 }); c.srsReviewsPerDay = () => 20;
  c.dayKey = () => '2026-10-28'; let starts = 0; c.startReview = () => { starts++; };
  f.paint(); const raise = f.find(f.main(), n => n.id === 'review-raise-limit'); assert(raise);
  const p = raise.fire(); assert.equal(f.queued.length, 1); assert(!f.rv.pending && !f.rv.admitting);
  f.door('summary').fire(); f.flushTransition(); assert.equal(f.S.review, null);
  f.ack(); await p; assert.equal(f.box.record.stats['2026-10-28'].extra, 3); assert.equal(f.box.writes, 1); assert.equal(starts, 0);
});

for (const fault of ['activity', 'enqueue', 'refresh']) {
  test(`UX15 ${fault} UI failure cannot change a confirmed grade`, async () => {
    const f = candidateFixture();
    if (fault === 'activity') Object.defineProperty(f.sandbox.reviewExitState(f.rv), 'activity', { set() { throw new Error('counter UI fault'); }, get: () => 0 });
    if (fault === 'enqueue') f.sandbox.queueMicrotask = () => { throw new Error('enqueue UI fault'); };
    if (fault === 'refresh') f.sandbox.syncReviewExitNotice = () => { throw new Error('refresh UI fault'); };
    // Isolate the notification fault from the fixture's explicit renderer calls.
    if (fault === 'refresh') f.sandbox.render = () => { f.box.renders++; };
    const { promise } = await queueGrade(f); f.ack(); assert.equal(await promise, true); await drainExitMicrotasks();
    assert.equal(f.box.writes, 1); assert.equal(f.box.record.revlog.length, 1); assert.equal(f.rv.ix, 1); assert(!f.rv.answerRefusal);
  });
}

test('UX15 original finally render error survives while notification scheduling is attempted', async () => {
  const f = candidateFixture(); let paints = 0, scheduled = 0; const original = new Error('original render failure');
  f.sandbox.render = () => { if (++paints > 1) throw original; };
  f.sandbox.queueMicrotask = () => { scheduled++; throw new Error('secondary enqueue error'); };
  const p = f.sandbox.commitReviewAction(f.rv, f.rv.queue[0], () => ({ obslog: [['one']] }), () => {});
  const observed = p.then(() => assert.fail('existing error suppressed'), error => assert.equal(error, original));
  f.ack(); await observed; assert.equal(scheduled, 2, 'independent legacy and ticket enqueues'); assert.equal(f.box.writes, 1);
});

test('UX13 exact keyed copy and idle accessibility labels; future ticket copy absent', () => {
  const f = candidateFixture(); const copy = vm.runInContext('REVIEW_EXIT_COPY', f.sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(copy)), {
    busyLabel: ['処理中…', 'Processing…'],
    busy: ['復習の処理が続いている。終わったら、もう一度押すと出られる。', BUSY],
    ready: ['処理は終わった。もう一度押すと復習を閉じる。', READY],
    departed: ['この答えは記録せずに復習を閉じた。', DEPARTED],
    recheck: ['復習の状態が変わった。もう一度押すと復習を閉じる。', RECHECK],
  });
  const button = f.door(); assert.equal(button.textContent, '×'); assert.equal(button.getAttribute('aria-label'), 'leave the session');
  assert(!Object.values(copy).flat().includes('Return to your reading'));
  f.sandbox.tx = (ja) => ja; assert.equal(f.door().getAttribute('aria-label'), '復習を閉じる');
});

for (const invalid of ['missing', 'empty', 'replacement', 'generation']) {
  test(`exact A0 marker ${invalid} is unknown and holds, never a never-entered inference`, async () => {
    const f = candidateFixture(); const release = f.holdLock(); const p = f.grade();
    const state = f.sandbox.reviewExitState(f.rv);
    if (invalid === 'missing') state.admission = null;
    else if (invalid === 'empty') state.admission = {};
    else if (invalid === 'replacement') state.admission = { ...state.admission };
    else state.admissionGeneration += 1;
    f.door().fire(); const retained = f.S.review === f.rv; const status = noticeText(f);
    release(); await microtasksUntil(() => f.queued.length === 1, 'unchanged original grade still queues'); f.ack(); await p;
    assert.equal(retained, true); assert.equal(status, BUSY); assert.equal(f.box.writes, 1);
  });
}

for (const fault of ['state-entry', 'state-finally', 'activity-call', 'settlement-call']) {
  test(`UX15 ${fault} exception leaves the grade result unchanged`, async () => {
    const f = candidateFixture(); const state = f.sandbox.reviewExitState;
    if (fault === 'state-entry') f.sandbox.reviewExitState = () => { throw new Error('state UI fault'); };
    if (fault === 'activity-call') f.sandbox.reviewExitActivity = () => { throw new Error('activity UI fault'); };
    if (fault === 'settlement-call') f.sandbox.settleReviewExitNotice = () => { throw new Error('settlement UI fault'); };
    f.sandbox.render = () => { f.box.renders++; };
    const { promise } = await queueGrade(f);
    if (fault === 'state-finally') f.sandbox.reviewExitState = () => { throw new Error('cleanup UI fault'); };
    f.ack(); assert.equal(await promise, true); await drainExitMicrotasks();
    assert.equal(f.box.writes, 1); assert.equal(f.rv.ix, 1); assert(!f.rv.answerRefusal);
    f.sandbox.reviewExitState = state;
  });
}

for (const type of ['word', 'kanji', 'drill']) {
  test(`UX09 ${type} named roots and concurrent rows survive an explicit exit`, async () => {
    const f = candidateFixture(); let p;
    f.box.record.stats.foreign = { n: 4 }; f.box.record.obslog.push(['unrelated']);
    if (type === 'kanji') { f.rv.queue[0] = { t: 'kanji', id: '火', label: '火', started: 1 }; f.box.record.taken[0] = { ...f.rv.queue[0] }; f.S.taken = structuredClone(f.box.record.taken); p = f.grade(); }
    else if (type === 'drill') p = f.sandbox.commitDrillGrade({ rv: f.rv, item: f.rv.queue[0], next: f.scheduler.repeat(exitFsrs.createEmptyCard(), new Date())[exitFsrs.Rating.Easy].card, key: 'good', skey: 'word:学校', rating: 3, mode: 'kanji', now: new Date() });
    else p = f.grade();
    await microtasksUntil(() => f.queued.length === 1, 'real producer'); f.ack(); assert.equal(await p, true);
    const roots = f.roots(), mark = f.storage.getItem('bunki-srs:answered-today');
    f.door().fire(); assert.equal(f.S.review, null); assert.deepEqual(f.roots(), roots);
    assert.equal(f.storage.getItem('bunki-srs:answered-today'), mark);
    assert.deepEqual(f.box.record.stats.foreign, { n: 4 }); assert.deepEqual(f.box.record.obslog[0], ['unrelated']);
    assert.equal(f.box.writes, 1);
  });
}

test('destination notice uses the places dojo alias, retains one node and never saves', async () => {
  const f = candidateFixture(); f.sandbox.placesLayout = () => true;
  const release = f.holdLock(); const p = f.grade(); f.door().fire();
  assert.equal(f.S.view, 'dojo'); ownedStatus(f, DEPARTED); f.paint(); ownedStatus(f, DEPARTED);
  assert.equal(f.main().children.filter(n => n.id === 'review-exit-status').length, 1);
  release(); await p; assert.equal(f.box.writes, 0);
});

function replaceOne(bytes, before, after) {
  assert.equal(bytes.split(before).length - 1, 1, 'mutant anchor is unique');
  return bytes.replace(before, after);
}
async function pendingOracle(bytes, kind = 'active') {
  const f = candidateFixture(bytes, { cards: kind === 'summary' ? 1 : 2 });
  const { promise } = await queueGrade(f);
  if (kind === 'summary') f.rv.ix = f.rv.queue.length;
  const button = f.door(kind); button.fire(); f.flushTransition();
  const retained = f.S.review === f.rv, status = noticeText(f), label = button.textContent;
  if (kind === 'summary') f.rv.ix = 0;
  f.ack(); await promise;
  assert.equal(retained, true, 'pending review preserved'); assert.equal(status, BUSY, 'held exit is visible'); assert.equal(label, 'Processing…');
}
async function tailOracle(bytes, checkReady = false) {
  const f = candidateFixture(bytes, { tailHeld: true }); const { promise } = await queueGrade(f);
  f.door().fire(); f.ack(); await f.callbackDone;
  const button = f.find(f.main(), n => n.id === 'zen-exit');
  const during = button.textContent;
  f.releaseTail(); await promise; await drainExitMicrotasks();
  if (checkReady) { assert.equal(button.textContent, '×', 'outer settlement restores idle label'); assert.equal(f.S.review, f.rv, 'settlement never navigates'); assert.equal(noticeText(f), READY); }
  else assert.equal(during, 'Processing…', 'admitting tail is still processing');
}
async function abaOracle(bytes) {
  const f = candidateFixture(bytes, { cards: 1 }); await completeGrade(f); f.door('summary').fire();
  const undo = f.find(f.main(), n => n.className?.split(' ').includes('review-undo')); const p = undo.fire(); f.ack(); await p;
  f.flushTransition(); assert.equal(f.S.review, f.rv, 'completed intervening action invalidates old exit'); assert.equal(noticeText(f), RECHECK);
}
async function markerOracle(bytes) {
  const f = candidateFixture(bytes, { tailHeld: true }); let sampled;
  f.sandbox.recordWritable = () => {
    if (f.rv.admitting && f.entered() === 1 && !sampled) { sampled = f.sandbox.reviewExitPhase(f.rv); return false; }
    return true;
  };
  const p = f.grade(); await f.callbackDone;
  const button = f.door(); button.fire(); const retained = f.S.review === f.rv;
  f.releaseTail(); await p;
  assert.equal(sampled, 'entered', 'actual callback is marked BEFORE its first writable check');
  assert.equal(retained, true, 'a refused callback is still A1 until admission returns');
}
async function mutationKilled(name, mutation, oracle) {
  await oracle(source); // the very same behavioral oracle must pass first
  const changed = mutation(source); assert.notEqual(changed, source);
  await assert.rejects(() => oracle(changed), error => error?.name === 'AssertionError' && !/fixture boundary|mutant anchor|renderer bound|Missing actual|every tested definition/u.test(error.message), `${name} killed by a behavioral assertion, not a harness/setup error`);
}
for (const kind of ['active', 'summary', 'break']) {
  test(`M1 restore exact ${kind} parent handler is rejected`, () => mutationKilled(`old-${kind}`, bytes => {
    const line = kind === 'active' ? 'bindReviewExit(exit, main, rv);' : kind === 'summary' ? 'bindReviewExit(out, main, rv, true);' : 'bindReviewExit(out, main, rv);';
    const target = kind === 'active' ? 'exit' : 'out';
    const action = "S.review = null; S.view = 'tray'; render();";
    return replaceOne(bytes, line, `${target}.addEventListener('click', () => ${kind === 'summary' ? `roomTransition(() => { ${action} })` : `{ ${action} }`});`);
  }, bytes => pendingOracle(bytes, kind)));
}

test('M2 pending-only phase cannot call an admitting tail idle', () => mutationKilled('pending-only', bytes => replaceOne(bytes, "if (!rv.admitting) return 'idle';", "return 'idle';"), bytes => tailOracle(bytes)));
test('M3 silent hold is rejected by live feedback', () => mutationKilled('silent-hold', bytes => replaceOne(bytes, "reviewExitUi(() => showReviewExitNotice(pressedOwner, 'busy', control, main));", '/* silent hold mutant */'), pendingOracle));

test('M4a no callback ownership rejects replacement review incorrectly', () => mutationKilled('press-only', bytes => replaceOne(bytes, 'if (!reviewExitOwns(pressedOwner)) return;', '/* stale callback mutant */'), async bytes => {
  const f = candidateFixture(bytes, { cards: 0 }); f.door('summary').fire(); const next = { queue: [], ix: 0 }; f.S.review = next;
  f.flushTransition(); assert.equal(f.S.review, next, 'replacement review remains current');
}));
test('M4b stack-array-only callback permission is rejected', () => mutationKilled('stack-ignored', bytes => replaceOne(bytes,
  "owner.stack.length === now.stack.length && owner.stack.every((frame, i) => frame === now.stack[i])", 'true'), async bytes => {
  const f = candidateFixture(bytes, { cards: 0 }); f.door('summary').fire(); f.S.stack.push({});
  f.flushTransition(); assert.equal(f.S.review, f.rv, 'same-array pushed sheet owns route');
}));
test('M5 missing activity generation is rejected after completed undo', () => mutationKilled('no-generation', bytes => replaceOne(bytes, 'reviewExitState(rv).activity === intent.activity &&', 'true &&'), abaOracle));
test('M6a inner settlement is not final', () => mutationKilled('inner-is-final', bytes => replaceOne(bytes, "!['pending', 'entered'].includes(reviewExitPhase(notice.owner.rv))", '!notice.owner.rv.pending'), bytes => tailOracle(bytes)));
test('M6b omitted outer notification leaves a stuck label', () => mutationKilled('no-outer-refresh', bytes => replaceOne(bytes,
  "reviewExitUi(() => settleReviewExitNotice());\n    reviewExitUi(() => settleReaderTicketNotice());\n  }\n  if (!admitted.admitted)", "/* missing outer refresh */\n    reviewExitUi(() => settleReaderTicketNotice());\n  }\n  if (!admitted.admitted)"), bytes => tailOracle(bytes, true)));
test('M7a settled never means saved', () => mutationKilled('saved-copy', bytes => replaceOne(bytes, READY, 'Saved'), bytes => tailOracle(bytes, true)));
test('M7b settlement never automatically departs', () => mutationKilled('auto-depart', bytes => replaceOne(bytes,
  'function settleReviewExitNotice() {', "function settleReviewExitNotice() {\n  if (S.review && !S.review.pending && !S.review.admitting) { S.review = null; S.view = 'tray'; }"), bytes => tailOracle(bytes, true)));
test('M8 exit cannot release an answered-today reservation', () => mutationKilled('release-mark', bytes => replaceOne(bytes,
  '// No asynchronous gap from the final permission check to departure.', "localStorage.setItem('bunki-srs:answered-today', '');\n      // No asynchronous gap from the final permission check to departure."), async bytes => {
  const f = candidateFixture(bytes); await completeGrade(f); const mark = f.storage.getItem('bunki-srs:answered-today'); assert(mark);
  f.door().fire(); assert.equal(f.storage.getItem('bunki-srs:answered-today'), mark, 'exit cannot change reservation');
}));
test('M9 stale notice cannot survive an unrelated departure', () => mutationKilled('stale-notice', bytes => replaceOne(bytes,
  "if (!reviewExitOwns(notice.owner)) { retireReviewExitNotice(); return; }", '/* missing notice owner */'), async bytes => {
  const f = candidateFixture(bytes); const release = f.holdLock(); const p = f.grade(); f.door().fire();
  f.S.view = 'reader'; f.paint(); const text = noticeText(f); release(); await p; assert.equal(text, '', 'unrelated room has no old outcome');
}));
test('M10 duplicate admission cannot replace the original waiting operation', () => mutationKilled('weakened-admission', bytes => replaceOne(bytes,
  'if (!rv || rv.pending || rv.admitting || S.review !== rv || rv.queue[rv.ix] !== item || !rv.revealed)',
  'if (!rv || rv.pending || S.review !== rv || rv.queue[rv.ix] !== item || !rv.revealed)'), async bytes => {
  const f = candidateFixture(bytes); const release = f.holdLock(); const p = f.grade();
  const first = f.sandbox.reviewExitState(f.rv).admission; const duplicate = f.grade();
  const same = f.sandbox.reviewExitState(f.rv).admission === first;
  f.door().fire(); release(); await p; await duplicate;
  assert.equal(same, true, 'refused duplicate cannot mint an admission generation');
}));
test('M11 a throwing settlement hook cannot replace an acknowledged grade', () => mutationKilled('throwing-finally', bytes => replaceOne(bytes,
  'finally {\n      reviewExitUi(() => settleReviewExitNotice());', 'finally {\n      settleReviewExitNotice();'), async bytes => {
  const f = candidateFixture(bytes); f.sandbox.settleReviewExitNotice = () => { throw new Error('UI-only notification'); };
  const { promise } = await queueGrade(f); f.ack(); const result = await promise;
  assert.equal(result, true, 'new notification error cannot change acknowledged grade'); assert.equal(f.rv.ix, 1);
}));
for (const position of ['after-writable', 'after-await']) {
  test(`M12 callback marker ${position} is rejected by the never-entered oracle`, () => mutationKilled(position, bytes => {
    const noMarker = replaceOne(bytes, '        admission.entered = true;\n', '');
    const anchor = position === 'after-writable' ? "        const report = {};\n" : "        return { outcome: report.outcome || 'not-published', graded };";
    // The report declaration exists only at this admission seam with this indentation.
    return replaceOne(noMarker, anchor, `        admission.entered = true;\n${anchor}`);
  }, markerOracle));
}

test('M8b an ordinary idle exit must not submit even a refused grade attempt', () => mutationKilled('replay-grade', bytes => replaceOne(bytes,
  '// No asynchronous gap from the final permission check to departure.',
  "void admitStandardGrade({ rv, item: rv.queue[rv.ix], key: 'easy', skey: 'word:学校', rating: 4 });\n      // No asynchronous gap from the final permission check to departure."), async bytes => {
  const f = candidateFixture(bytes); f.door().fire(); await drainExitMicrotasks();
  assert.equal(f.entered(), 0, 'exit never enters answer admission'); assert.equal(f.box.writes, 0);
}));

test('M12b unknown or replaced marker cannot authorize an A0 escape', () => mutationKilled('unattested-marker', bytes => replaceOne(bytes,
  "admission && reviewExitAdmissions.get(rv) === admission && admission.entered === false &&\n    Number.isSafeInteger(admission.generation) && admission.generation === reviewExitStates.get(rv)?.admissionGeneration", "admission && !admission.entered"), async bytes => {
  const f = candidateFixture(bytes); const release = f.holdLock(); const p = f.grade();
  f.sandbox.reviewExitState(f.rv).admission = {}; f.door().fire(); const retained = f.S.review === f.rv;
  release(); await drainExitMicrotasks(); if (f.queued.length) f.ack(); await p;
  assert.equal(retained, true, 'unknown marker means hold');
}));

test('UX13 zero-detail keyboard/AT click activation follows the same busy/idle law without focus movement', async () => {
  const f = candidateFixture(); const { promise } = await queueGrade(f); const button = f.door();
  f.sandbox.document.activeElement = button;
  button.events.click[0]({ detail: 0, currentTarget: button, target: button });
  assert.equal(f.S.review, f.rv); ownedStatus(f, BUSY); assert.equal(f.sandbox.document.activeElement, button);
  f.ack(); await promise; await drainExitMicrotasks(); const current = f.find(f.main(), n => n.id === 'zen-exit');
  current.events.click[0]({ detail: 0, currentTarget: current, target: current });
  assert.equal(f.S.review, null); assert.equal(f.box.writes, 1);
});

test('UX12 busy notice transfers through a pending repaint and old callback cannot clear a new notice', async () => {
  const f = candidateFixture(); const { promise } = await queueGrade(f);
  const old = f.door(); old.fire(); const oldStatus = exitNotice(f); f.paint();
  const current = f.find(f.main(), n => n.id === 'zen-exit'); assert.notEqual(current, old); assert.equal(old.isConnected, false);
  ownedStatus(f, BUSY); assert.notEqual(exitNotice(f), oldStatus); assert.equal(current.textContent, 'Processing…');
  old.events.click[0](); assert.equal(f.S.review, f.rv); assert.equal(current.textContent, 'Processing…');
  f.ack(); await promise; await drainExitMicrotasks(); ownedStatus(f, READY);
});

test('UX07 action begins after a summary press: live replacement surface gets visible busy feedback', async () => {
  const f = candidateFixture(source, { cards: 1 }); await completeGrade(f); f.door('summary').fire();
  const undo = f.find(f.main(), n => n.className?.split(' ').includes('review-undo')); const p = undo.fire();
  f.paint(); f.flushTransition(); assert.equal(f.S.review, f.rv); ownedStatus(f, BUSY);
  f.ack(); await p; await drainExitMicrotasks(); ownedStatus(f, READY); assert.equal(f.box.writes, 2);
});

test('UX12 newer same-review admission retires the previous action notice before waiting on a lock', async () => {
  const f = candidateFixture(); const { promise } = await queueGrade(f); f.door().fire(); f.ack(); await promise; await drainExitMicrotasks();
  ownedStatus(f, READY); f.rv.revealed = true; f.rv.declared = 1;
  const release = f.holdLock(); const next = f.grade();
  assert.equal(f.rv.admitting, true); assert.equal(f.rv.pending, null);
  assert.equal(noticeText(f), '', 'old action cannot say processing finished for a new waiting action');
  f.door().fire(); ownedStatus(f, DEPARTED); release(); await next; assert.equal(f.box.writes, 1);
});

const ticketFixture = (bytes = source, options = {}) => readerTicketFixture(bytes, { core: exitCore, fsrsApi: exitFsrs, pin: exitPin, ...options });
test('RT01 actual ordinary departure attaches, preserves the second joined occurrence and consumes once', () => {
  const f = ticketFixture(); const { c, S } = f;
  const roots = f.roots(); const rv = f.start();
  const ticket = f.ticket(); assert(ticket); assert.equal(ticket.source.index, 2); assert.equal(ticket.source.end, 3);
  S.revealed.add(4); S.glossed.clear();
  f.door().fire(); assert.equal(S.review, rv, 'deferred update has not yet committed');
  f.flushTransition();
  assert.equal(S.review, null); assert.equal(S.view, 'reader'); assert.equal(f.ticket(), null);
  assert.deepEqual([...S.revealed], [2]); assert.deepEqual([...S.glossed], [2]);
  const job = f.placement(); assert(job?.routeCommitted);
  f.flushFrames(); assert.equal(job.outcome, 'confirmed'); assert(Math.abs(job.delta) <= 4);
  assert.equal(c.document.activeElement, f.anchor); assert.deepEqual(f.roots(), roots); assert.equal(f.box.writes, 0);
  assert.equal(S.scaleVisit.index, 2);
});
for (const flag of ['pending', 'admitting']) test(`RT02 ${flag} including A0 retains an owned visible busy door; no automatic return`, () => {
  const f = ticketFixture(); const rv = f.start(); rv[flag] = true;
  f.door().fire(); assert.match(f.notice().node.textContent, /still finishing/);
  assert(f.ticket()); assert.equal(f.transitions.length, 0);
  rv[flag] = false; f.c.settleReaderTicketNotice(); f.flushMicrotasks();
  assert.equal(f.notice().node.textContent, 'You can return to your reading.');
  assert.equal(f.S.review, rv); assert.equal(f.transitions.length, 0);
  f.door().fire(); f.flushTransition(); assert.equal(f.S.view, 'reader');
});
for (const change of ['activity', 'pending', 'admitting', 'sheet-aba', 'binding', 'second-token', 'source-object', 'tokens-array', 'prefix']) {
  test(`RT03 final transition revalidates ${change}`, () => {
    const f = ticketFixture(); const rv = f.start(); f.door().fire();
    if (change === 'activity') f.c.reviewExitActivity(rv);
    if (change === 'pending' || change === 'admitting') rv[change] = true;
    if (change === 'sheet-aba') { f.S.stack.push({ t: 'word' }); f.S.stack.pop(); f.S.wordEntrySerial += 2; }
    if (change === 'binding') f.c.recordInstallation.policy.binding.sessionId = 'new';
    if (change === 'second-token') f.p.tokens[3].s = '別';
    if (change === 'source-object') f.c.D.passages = [{ ...f.p }];
    if (change === 'tokens-array') f.p.tokens = [...f.p.tokens];
    if (change === 'prefix') f.S.navigationReturns.push({ view: 'lessons', kanjiCourseReturn: {} });
    f.flushTransition(); assert.equal(f.S.review, rv); assert.equal(f.S.view, 'review'); assert.equal(f.focusCount(), 0);
    assert.equal(f.box.writes, 0);
    if (['second-token', 'source-object', 'tokens-array'].includes(change)) {
      assert.equal(f.status().hidden, false); assert.match(f.status().textContent, /review is still open/);
    }
  });
}
for (const failure of ['missing-anchor', 'room-error', 'escaping-render', 'exhausted']) test(`RT04 consumed route reports ${failure} through independent body host`, () => {
  const f = ticketFixture(); f.start(); f.door().fire();
  if (failure === 'room-error') f.c.renderError = true;
  if (failure === 'escaping-render') f.c.render = () => { f.reader.remove(); throw new Error('reader render'); };
  if (failure === 'missing-anchor') f.c.readerTokenAtIndex = () => null;
  if (failure === 'exhausted') { f.c.stuck = true; f.setY(250); }
  f.flushTransition(); f.flushFrames();
  assert.equal(f.ticket(), null); assert.equal(f.S.review, null); assert.equal(f.S.view, 'reader');
  const status = f.status(); assert(status?.isConnected); assert.equal(status.hidden, false);
  assert.equal(status.textContent, 'Couldn’t confirm the original reading position.');
  f.S.stack.push({ t: 'word' }); f.c.readerTicketSync(); assert.equal(status.hidden, true); assert.equal(status.textContent, '');
});
test('RT05 no placement effect before full owner or after synchronous focus re-entry', () => {
  for (const when of ['before', 'focus']) {
    const f = ticketFixture(); f.start(); f.door().fire();
    if (when === 'before') { const render = f.c.render; f.c.render = () => { f.c.recordInstallation.policy.binding.accountId = 'other'; render(); }; }
    else f.c.onFocus = () => { f.S.navOpen = true; };
    f.flushTransition(); f.flushFrames();
    assert.equal(f.scrollCount(), 0); assert.equal(f.focusCount(), when === 'before' ? 0 : 1);
    assert.equal(f.status()?.hidden, true);
  }
});
test('RT06 exact continuation only; zero queue is inert and unrelated restart cannot rebind', () => {
  const f = ticketFixture(); const old = f.start(); const ticket = f.ticket();
  f.c.emptyQueue = true; f.c.startReview(null, { continueFrom: old }); assert.equal(f.ticket(), ticket); assert.equal(f.S.review, old);
  f.c.emptyQueue = false; f.c.startReview(null, { continueFrom: old }); assert.notEqual(f.S.review, old); assert.equal(f.ticket(), ticket); assert.equal(ticket.rv, f.S.review);
  f.c.startReview(); assert.equal(f.ticket(), null);
});
test('RT07 same text with no live reader, course context, selected invalid occurrence and protection never mint', () => {
  for (const cause of ['room', 'course', 'learning', 'selected', 'protection', 'stale', 'install']) {
    const f = ticketFixture();
    if (cause === 'room') f.S.view = 'tray';
    if (cause === 'course') f.S.navigationReturns.push({ view: 'lessons', stack: [], kanjiCourseReturn: {} });
    if (cause === 'learning') f.c.learningSourceVisit = {};
    if (cause === 'selected') f.S.readerTake.index = 20;
    if (cause === 'protection') f.S.storeReadOnly = true;
    if (cause === 'stale') f.c.staleTab = true;
    if (cause === 'install') f.c.recordInstallation.assertCurrent = () => false;
    f.start(); assert.equal(f.ticket(), null, cause);
  }
});
test('RT08 real go word/kanji/radical and recede consume only at final bare reader', () => {
  const f = ticketFixture();
  for (const node of [{ t: 'word', id: '同じ', from: { passage: f.p.id, index: 2 } }, { t: 'kanji', id: '同' }, { t: 'radical', id: '口' }]) {
    f.c.go(node, { instant: true }); assert(f.ticket());
  }
  assert.equal(f.S.stack.length, 3);
  f.c.recede({ instant: true }); f.flushMicrotasks(); assert(f.ticket());
  f.c.recede({ instant: true }); f.flushMicrotasks(); assert(f.ticket());
  f.c.recede({ instant: true }); f.flushMicrotasks(); assert.equal(f.ticket(), null);
  f.S.view = 'tray'; f.c.startReview(); assert.equal(f.ticket(), null);
});
test('RT09 deferred arrival observes final ladder state and detachment; no focus/scroll from observer', () => {
  for (const replacement of ['none', 'same', 'new', 'detached']) {
    const f = ticketFixture(); f.c.go({ t: 'word', id: '同じ', from: { passage: f.p.id, index: 2 } }, { instant: true });
    const visit = { anchor: f.anchor, rung: 'stage' }; f.c.ladderVisit = visit;
    f.c.recede({ all: true, instant: true });
    if (replacement === 'none') f.c.ladderVisit = null;
    if (replacement === 'new') f.c.ladderVisit = { anchor: f.anchor, rung: 'reading' };
    if (replacement === 'detached') f.anchor.isConnected = false;
    f.flushMicrotasks(); assert.equal(!!f.ticket(), replacement === 'same');
    assert.equal(f.focusCount(), 0); assert.equal(f.scrollCount(), 0);
  }
});
test('RT10 source-less canonical entry carries only; pending ordinary arrival cannot be reused', () => {
  const f = ticketFixture();
  f.c.go({ t: 'word', id: '同じ' }, { instant: true }); assert.equal(f.ticket(), null);
  f.S.stack = []; f.c.go({ t: 'word', id: '同じ', from: { passage: f.p.id, index: 2 } }, { instant: true });
  const first = f.ticket(); assert(first);
  f.c.go({ t: 'kanji', id: '同' }, { instant: true }); assert.equal(f.ticket(), first);
  f.c.ladderVisit = { anchor: f.anchor }; f.c.recede({ all: true, instant: true });
  f.c.readerTicketDeparture('tray'); assert.notEqual(f.ticket(), first); f.S.view = 'tray';
  f.flushMicrotasks(); assert.notEqual(f.ticket(), first);
});
test('RT11 full copy is byte exact and ticket feedback survives missing source but not modal ownership', () => {
  const f = ticketFixture();
  const copy = JSON.parse(JSON.stringify(vm.runInContext('READER_TICKET_COPY', f.c)));
  assert.deepEqual(copy, {
    door: ['読んでいたところへ戻る', 'Return to your reading'],
    busy: ['復習の処理が続いている。終わったら、もう一度押すと読んでいたところへ戻れる。', 'This review action is still finishing. Tap again when it finishes to return to your reading.'],
    ready: ['読んでいたところへ戻れる。', 'You can return to your reading.'],
    unavailable: ['読んでいたところへ戻れなかった。復習の画面はそのまま開いている。', 'Couldn’t return to your reading. The review is still open.'],
    unconfirmed: ['元の位置に戻れたか、確認できなかった。', 'Couldn’t confirm the original reading position.'],
  });
  f.start(); const door = f.door(); f.p.tokens[3].s = '変'; door.fire();
  assert.equal(f.status().hidden, false); assert.equal(f.ticket(), null);
  f.c.worldPickerEls = {}; f.c.readerTicketSync(); assert.equal(f.status().hidden, true);
});
async function ticketNotices(bytes, { outer = false, throws = null, enqueueThrow = 0, exception = false } = {}) {
  const f = ticketFixture(bytes, { tailHeld: outer }); const rv = f.start();
  rv.revealed = true; rv.declared = 1;
  const original = new Error('original final renderer failure');
  const action = outer ? f.grade(rv) : f.c.commitReviewAction(rv, rv.queue[0], () => ({ obslog: [['ticket-control']] }), () => {});
  const result = action.then(value => ({ value }), error => ({ error }));
  for (let i = 0; i < 12 && !f.queued.length; i++) await Promise.resolve();
  assert(f.queued.length, 'actual action reached record boundary');
  const button = f.door(); button.fire();
  const legacy = f.find(f.main(), node => node.id === 'zen-exit'); assert(legacy); legacy.fire();
  assert.match(f.notice().node.textContent, /still finishing/);
  const legacyNotice = vm.runInContext('reviewExitNotice', f.c); assert.match(legacyNotice.node.textContent, /still finishing/);
  // In omission controls neither final repaint nor the other subscriber is allowed to mask the missing notification.
  f.c.render = () => { if (exception) throw original; };
  f.ack();
  if (outer) {
    await f.callbackDone;
    f.flushMicrotasks();
    assert.equal(rv.pending, null); assert.equal(rv.admitting, true);
    assert.match(f.notice().node.textContent, /still finishing/);
  }
  if (throws) f.c[throws] = () => { throw new Error('injected subscriber failure'); };
  if (enqueueThrow) {
    let n = 0; f.c.queueMicrotask = fn => { if (++n === enqueueThrow) throw new Error('injected enqueue failure'); f.microtasks.push(fn); };
  }
  if (outer) f.releaseTail();
  const outcome = await result; f.flushMicrotasks();
  if (exception) assert.equal(outcome.error, original, 'UI notification preserves original renderer error');
  else { assert.equal(outcome.error, undefined); assert.equal(outcome.value, true); }
  assert.equal(f.box.writes, 1);
  return { f, legacyNotice };
}
for (const outer of [false, true]) {
  test(`RT12 ${outer ? 'outer' : 'inner'} settlement updates both real notices without repaint`, async () => {
    const { f, legacyNotice } = await ticketNotices(source, { outer });
    assert.equal(f.notice().node.textContent, 'You can return to your reading.');
    assert.equal(legacyNotice.node.textContent, READY);
  });
  for (const throws of ['syncReviewExitNotice', 'readerTicketSync']) test(`RT13 ${outer ? 'outer' : 'inner'} independent ${throws} callback failure`, async () => {
    const { f, legacyNotice } = await ticketNotices(source, { outer, throws });
    if (throws === 'syncReviewExitNotice') assert.equal(f.notice().node.textContent, 'You can return to your reading.');
    else assert.equal(legacyNotice.node.textContent, READY);
  });
}
for (const enqueueThrow of [1, 2]) test(`RT14 independent enqueue failure ${enqueueThrow} cannot suppress the other subscriber`, async () => {
  const { f, legacyNotice } = await ticketNotices(source, { outer: true, enqueueThrow });
  if (enqueueThrow === 1) assert.equal(f.notice().node.textContent, 'You can return to your reading.');
  else assert.equal(legacyNotice.node.textContent, READY);
});
test('RT15 exceptional inner finally still delivers both notices and preserves the original error', async () => {
  const { f, legacyNotice } = await ticketNotices(source, { exception: true });
  assert.equal(f.notice().node.textContent, 'You can return to your reading.'); assert.equal(legacyNotice.node.textContent, READY);
});
for (const outer of [false, true]) for (const target of ['settleReviewExitNotice', 'settleReaderTicketNotice']) {
  test(`RTM omission ${outer ? 'outer' : 'inner'} ${target} is killed by its actual notice`, async () => {
    const indent = outer ? '    ' : '      ';
    const anchor = `\n${indent}reviewExitUi(() => ${target}());`;
    const changed = replaceOne(source, anchor + '\n', `\n${indent}/* single subscriber omitted */\n`);
    await mutationKilled(target, () => changed, async bytes => {
      const { f, legacyNotice } = await ticketNotices(bytes, { outer });
      assert.equal(target === 'settleReaderTicketNotice' ? f.notice().node.textContent : legacyNotice.node.textContent,
        target === 'settleReaderTicketNotice' ? 'You can return to your reading.' : READY, 'omitted subscriber leaves its live busy notice');
    });
  });
}
for (const first of ['syncReviewExitNotice', 'readerTicketSync']) test(`RTM shared-try ${first} first loses the reciprocal notice`, async () => {
  const second = first === 'syncReviewExitNotice' ? 'readerTicketSync' : 'syncReviewExitNotice';
  const anchor = '    reviewExitUi(() => settleReviewExitNotice());\n    reviewExitUi(() => settleReaderTicketNotice());';
  const mutant = replaceOne(source, anchor, `    reviewExitUi(() => queueMicrotask(() => reviewExitUi(() => { ${first}(); ${second}(); })));`);
  await mutationKilled('shared-try', () => mutant, async bytes => {
    const { f, legacyNotice } = await ticketNotices(bytes, { outer: true, throws: first });
    assert.equal(first === 'syncReviewExitNotice' ? f.notice().node.textContent : legacyNotice.node.textContent,
      first === 'syncReviewExitNotice' ? 'You can return to your reading.' : READY);
  });
});
test('RT16 ordinary Back rejects mutation of an already admitted suffix, without blessing it', () => {
  const f = ticketFixture(); f.c.keepNavigationReturn('search'); f.S.view = 'search';
  assert(f.ticket()); f.S.navigationReturns[0].readerTake = { p: f.p.id, index: 0 };
  f.c.returnFromNavigation(); assert.equal(f.ticket(), null);
});
test('RT17 focus re-entry to another article retires old feedback even when room and counters match', () => {
  const f = ticketFixture(); f.start(); f.door().fire();
  f.c.onFocus = () => { f.S.passageId = 'different-article'; };
  f.flushTransition(); f.flushFrames();
  assert.equal(f.focusCount(), 1); assert.equal(f.scrollCount(), 0); assert.equal(f.status().hidden, true);
});
for (const [name, from, to, change] of [
  ['whole-span', 's.fingerprints.every((value, i) => value === scaleTokenFingerprint(p.tokens[s.index + i]))',
    's.fingerprints[0] === scaleTokenFingerprint(p.tokens[s.index])', f => { f.p.tokens[3].s = 'changed'; }],
  ['token-array-identity', 'p.tokens === s.tokens && s.end >= s.index', 's.end >= s.index', f => { f.p.tokens = [...f.p.tokens]; }],
  ['source-identity', 'p === s.p && p.file === s.file', 'p.file === s.file', f => { f.c.D.passages = [{ ...f.p }]; }],
  ['captured-marks', 'revealed: S.revealed ? new Set(S.revealed) : null,\n    glossed: S.glossed ? new Set(S.glossed) : null };',
    'revealed: S.revealed,\n    glossed: S.glossed };', f => { f.S.revealed.add(4); }],
]) test(`RTM ${name} guard is behaviorally necessary`, async () => {
  await mutationKilled(name, bytes => replaceOne(bytes, from, to), async bytes => {
    const f = ticketFixture(bytes); const rv = f.start(); const door = f.door(); change(f); door.fire(); f.flushTransition();
    if (name === 'captured-marks') assert.deepEqual([...f.S.revealed], [2]);
    else assert.equal(f.S.review, rv, 'changed source cannot navigate');
  });
});
async function arrivalObserverOracle(bytes) {
  const f = ticketFixture(bytes); const c = f.c;
  vm.runInContext(liftCorridor(bytes, ['clearWordLadder']), c);
  Object.assign(c, { readingSlipSerial: 0, syncChromeKeep() {}, refreshLadderRoom() {} });
  c.go({ t: 'word', id: '同じ', from: { passage: f.p.id, index: 2 } }, { instant: true });
  c.ladderVisit = { anchor: f.anchor, rung: 'stage' };
  c.recede({ all: true, instant: true }); f.flushMicrotasks(); assert(f.ticket(), 'stage is not a bare arrival');
  c.clearWordLadder(); assert(f.ticket(), 'observer waits for the final event state'); f.flushMicrotasks();
  assert.equal(f.ticket(), null, 'actual clear observer consumes exactly at final bare state');
  assert.equal(f.focusCount(), 0); assert.equal(f.scrollCount(), 0);
}
test('RT18 actual ladder cleanup observes final bare state without changing its timing', () => arrivalObserverOracle(source));
test('RTM omitted pending-visit arrival callback is killed after actual clear', () => mutationKilled('missing-arrival-observer',
  bytes => replaceOne(bytes, 'visit.ticketArrival?.();', '/* observer omitted */'), arrivalObserverOracle));
for (const order of ['old-first', 'new-first']) test(`RT19 cancelled deferred callback remains inert (${order})`, () => {
  const f = ticketFixture(); const rv = f.start(); f.door().fire(); const old = f.transitions.shift();
  f.S.navOpen = true; f.c.readerTicketSync(); f.S.navOpen = false;
  f.door().fire(); const current = f.transitions.shift(); assert(current);
  if (order === 'old-first') { old(); assert.equal(f.S.review, rv); current(); }
  else { current(); const job = f.placement(); old(); assert.equal(f.placement(), job); }
  assert.equal(f.S.review, null); assert.equal(f.ticket(), null); assert.equal(f.box.writes, 0);
});
for (const throws of ['syncReviewExitNotice', 'readerTicketSync']) test(`RT20 original exceptional result survives ${throws} failure`, async () => {
  const { f, legacyNotice } = await ticketNotices(source, { exception: true, throws });
  if (throws === 'syncReviewExitNotice') assert.equal(f.notice().node.textContent, 'You can return to your reading.');
  else assert.equal(legacyNotice.node.textContent, READY);
});

// W2 RT-B-POST-PLACEMENT: continue through the actual article/sentence doors
// after the ticket's one return. The shared fixture and its layout model stay
// unchanged; these additional authored functions replace its scale stubs here.
function postTicketScaleFixture(bytes = source) {
  const f = ticketFixture(bytes), c = f.c;
  Object.assign(c, {
    scaleNavigationAllowed: () => true,
    scaleName: () => f.S.stack.at(-1)?.t === 'sent' ? 'sentence' : 'article',
    scaleOutTarget: () => f.S.stack.at(-1)?.t === 'sent' ? 'article' : null,
    adjacentScaleOutTarget: () => f.S.stack.at(-1)?.t === 'sent' ? 'article' : null,
    clearReaderReadings() {}, stopSentenceListening() {}, keyboardActivated: () => true,
  });
  vm.runInContext(liftCorridor(bytes, ['scaleIn', 'scaleOut', 'retireScaleTransients', 'replaceScalePages',
    'rememberScaleEntry', 'scaleNodeFrom', 'scaleNodeBelongs', 'captureScaleVisit']), c);
  return f;
}
function startTicketPlacement(f) {
  f.start(); f.door().fire();
  const transition = f.transitions.shift(); assert(transition); transition();
  const job = f.placement(); assert(job?.routeCommitted);
  assert.equal(job.visit.ticketPlacement, job);
  return { job, visit: job.visit, transition };
}
function finishTicketPlacement(f, kind) {
  const result = startTicketPlacement(f);
  if (kind === 'unconfirmed') { f.c.stuck = true; f.setY(250); }
  if (kind === 'revoked') f.c.readerTicketRevoke();
  else if (kind === 'cancelled') f.c.retireScaleReturn();
  else f.flushFrames();
  f.c.stuck = false;
  if (kind !== 'revoked') assert.equal(result.job.outcome, kind);
  assert.equal(f.placement(), null);
  return result;
}
function ordinaryScaleRoundTrip(f, visit) {
  assert.equal(f.c.scaleIn(), true);
  assert.equal(f.S.scaleVisit, visit, 'the actual scaleIn/go path retains the source visit');
  assert.equal(f.S.stack.at(-1), visit.sentence);
  f.setY(250);
  const before = { focus: f.focusCount(), scroll: f.scrollCount() };
  assert.equal(f.c.scaleOut(), true); f.flushFrames();
  assert.equal(f.y(), 125, 'subsequent ordinary return settles the original glyph position');
  assert.equal(f.focusCount(), before.focus + 2, 'ordinary placement owns initial and final focus');
  assert.equal(f.scrollCount(), before.scroll + 2, 'ordinary placement restores scroll and corrects the displacement');
  assert.equal(visit.returnRequest, null); assert.equal(visit.returnJob, null);
  assert.equal(f.box.writes, 0);
}
for (const kind of ['confirmed', 'unconfirmed', 'cancelled', 'revoked']) {
  test(`RT21 ${kind} ticket placement retires its marker before the next actual article/sentence round trip`, () => {
    const f = postTicketScaleFixture(), roots = f.roots();
    const { visit } = finishTicketPlacement(f, kind);
    assert.equal(Object.hasOwn(visit, 'ticketPlacement'), false, 'the terminal or revoked ticket no longer owns this visit');
    ordinaryScaleRoundTrip(f, visit); assert.deepEqual(f.roots(), roots);
    if (kind === 'confirmed') {
      assert.equal(f.focusCount(), 4); assert.equal(f.scrollCount(), 3);
    }
  });
}
function placementEffects(f) {
  const visit = f.S.scaleVisit;
  return { visit, ticket: f.ticket(), placement: f.placement(), feedback: f.feedback(),
    request: visit?.returnRequest, job: visit?.returnJob, marker: visit?.ticketPlacement,
    focus: f.focusCount(), scroll: f.scrollCount(), y: f.y(),
    statusHidden: f.status()?.hidden, statusText: f.status()?.textContent,
    queuedFrames: f.frames.length, queuedTransitions: f.transitions.length, writes: f.box.writes };
}
function replayObsoletePlacement(f, transition, frames) {
  const before = placementEffects(f);
  transition(); for (const callback of frames) callback();
  assert.deepEqual(placementEffects(f), before, 'obsolete callbacks cannot move, notify, clear a request or detach another job');
}
function placementCallbackOracle(bytes, { stage = 'initial', next = 'ticket', order = 'during', terminal = 'revoked' } = {}) {
  const f = postTicketScaleFixture(bytes), roots = f.roots();
  const old = startTicketPlacement(f);
  if (terminal === 'unconfirmed') { f.c.stuck = true; f.setY(250); }
  if (stage === 'correction') { assert.equal(f.frames.length, 1); f.frames.shift()(); }
  const obsoleteFrames = f.frames.slice(); assert.equal(obsoleteFrames.length, 1);
  if (terminal === 'revoked') { f.frames.splice(0); f.c.readerTicketRevoke(); }
  else { f.flushFrames(); assert.equal(old.job.outcome, terminal); }
  f.c.stuck = false;
  const replay = () => replayObsoletePlacement(f, old.transition, obsoleteFrames);
  if (order === 'before') replay();
  let successor;
  if (next === 'ordinary') {
    assert.equal(f.c.scaleIn(), true); assert.equal(f.S.scaleVisit, old.visit);
    f.setY(250); assert.equal(f.c.scaleOut(), true);
    successor = { visit: f.S.scaleVisit, request: f.S.scaleVisit.returnRequest, job: f.S.scaleVisit.returnJob };
    assert(successor.request); assert(successor.job);
  } else {
    successor = startTicketPlacement(f);
    assert.notEqual(successor.visit, old.visit);
    assert.equal(successor.visit.ticketPlacement, successor.job);
  }
  if (order === 'during') replay();
  f.flushFrames();
  if (order === 'after') replay();
  assert.equal(f.y(), successor.visit.viewportY); assert.equal(successor.visit.returnRequest, null); assert.equal(successor.visit.returnJob, null);
  if (next === 'ticket') {
    assert.equal(successor.job.outcome, 'confirmed'); assert.equal(f.placement(), null);
    assert.equal(Object.hasOwn(successor.visit, 'ticketPlacement'), false);
  }
  assert.equal(f.box.writes, 0); assert.deepEqual(f.roots(), roots);
}
for (const stage of ['initial', 'correction']) for (const next of ['ordinary', 'ticket']) for (const order of ['before', 'during', 'after']) {
  test(`RT22 obsolete ${stage} RAF and transition are inert ${order} successor ${next} placement`, () =>
    placementCallbackOracle(source, { stage, next, order }));
}
for (const terminal of ['confirmed', 'unconfirmed']) for (const next of ['ordinary', 'ticket']) for (const order of ['before', 'during', 'after']) {
  test(`RT22 completed ${terminal} correction and transition are inert ${order} successor ${next} placement`, () =>
    placementCallbackOracle(source, { stage: 'correction', terminal, next, order }));
}
test('RT23 revoke and completion remove only the matching visit marker', () => {
  for (const action of ['revoke', 'complete']) {
    const f = postTicketScaleFixture(); const { job, visit } = startTicketPlacement(f);
    const replacement = { visit, generation: 'a different placement owner' };
    visit.ticketPlacement = replacement;
    if (action === 'revoke') f.c.readerTicketRevoke();
    else f.c.readerTicketPlacementDone(job, 'cancelled');
    assert.equal(visit.ticketPlacement, replacement, 'cleanup cannot delete a different marker');
  }
});
test('RTM omitted terminal-marker retirement blocks the next ordinary request', () => mutationKilled('terminal-marker-left',
  bytes => replaceOne(bytes, '  if (job.visit.ticketPlacement === job) delete job.visit.ticketPlacement;\n', ''), async bytes => {
    const f = postTicketScaleFixture(bytes); const { visit } = finishTicketPlacement(f, 'confirmed');
    f.setY(250); assert.equal(f.c.requestScaleReturn(visit), true); f.c.settleScaleReturn(f.reader); f.flushFrames();
    assert.equal(f.y(), 125, 'ordinary placement must not be blocked by a completed ticket');
    assert.equal(visit.returnRequest, null);
  }));
test('RTM omitted revoke-marker retirement blocks the next article/sentence return', () => mutationKilled('revoked-marker-left',
  bytes => replaceOne(bytes, '  if (job && job.visit.ticketPlacement === job) delete job.visit.ticketPlacement;\n', ''), async bytes => {
    const f = postTicketScaleFixture(bytes); const { visit } = finishTicketPlacement(f, 'revoked');
    ordinaryScaleRoundTrip(f, visit);
  }));
test('RTM obsolete completion without the active-job fence detaches a newer ticket', () => mutationKilled('old-completion-unfenced',
  bytes => replaceOne(bytes, '  if (readerTicketPlacement !== job) return;\n', ''), async bytes =>
    placementCallbackOracle(bytes, { stage: 'correction', next: 'ticket', order: 'during' })));
