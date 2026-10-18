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
    activeTokenAlternatives: null, readerPosTimer: null, sheetActionVisit: null, readerWordMenu: null, readerWordMenuSerial: 0, personalHost: null,
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
  vm.runInContext(actualFunction('closeReaderWordMenu'), context);
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
