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
    S: { view: 'reader', stack: [], navigationReturns: [], passageId: 'source-a',
      readerScroll: 180, readerPos: {}, readerTake: { p: 'source-a', id: '世界', index: 3 },
      taken: [], srs: {}, revlog: [], dialogInvoker: null },
    window: { scrollY: 180, scrollTo(_x, y) { this.scrollY = y; } },
    document: { activeElement: null }, referenceLibrary: null,
    learningSourceVisit: null, pendingReferenceCollection: null,
    activeTokenAlternatives: null, readerPosTimer: null,
    keepScroll() {}, rememberSheet() {}, invokerKey: value => value,
    restoreDialogInvoker() {}, stopReadAloud() {}, clearTimeout() {},
    requestAnimationFrame() {}, passage: () => null,
    recordReady: () => true,
    saveReaderPosition: async (id, y) => { positions.push({ id, y }); return true; },
    stopSentenceListening() { throw drawingBoundary; },
  });
  vm.runInContext(actualFunction('render').replace('function render(', 'function renderUntilDOM('), context);
  context.render = () => {
    try { context.renderUntilDOM(); }
    catch (error) { if (error !== drawingBoundary) throw error; }
  };
  vm.runInContext(['keepNavigationReturn', 'returnFromNavigation', 'openPassage',
    'openReferenceCollection', 'restoreLearningSourceCaller', 'resumeLearningSource']
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
  c.render(); c.render();
  assert.equal(c.pendingReferenceCollection, 'jlpt:N1');
  c.keepNavigationReturn('search'); c.S.view = 'search'; c.render();
  assert.equal(c.pendingReferenceCollection, null);
  assert.equal(c.returnFromNavigation(), true);
  assert.equal(c.S.view, 'levels');
  assert.equal(c.pendingReferenceCollection, 'jlpt:N1');
});
