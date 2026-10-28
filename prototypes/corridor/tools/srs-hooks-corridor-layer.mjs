/**
 * The corridor layer of verify-srs-hooks (HOOKS-SPEC r7 §7 items 1–8): the actual corridor.js functions — the save's
 * publication outcome (commitStorePatchOutcome and its boolean view commitStorePatch), the hook adapter
 * (reportHookAttempt with hookCardFacts and the corridor's own identity checks) and the review grade under the shared
 * admission (admitStandardGrade around commitStandardGrade and commitReviewAction) — lifted from the authored source by
 * the TypeScript AST and run in a vm sandbox, as verify-learning-record and verify-srs-conformance do. The record app,
 * Web Locks, storage and rendering are test doubles; presentation binding and the dictionary row index are stubbed
 * (verify-learning-record proves those).
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';

export const READER_TICKET_NAMES = [
  'readerTicket', 'readerTicketGeneration', 'readerTicketIntent',
  'readerTicketNotice', 'readerTicketPlacement', 'readerTicketFeedback',
  'readerTicketFeedbackNode', 'readerTicketArrival', 'readerTicketArrivalQueued',
  'READER_TICKET_COPY', 'readerTicketOwner', 'readerTicketOwns',
  'readerTicketCopy', 'readerTicketFrame', 'readerTicketFramesEqual',
  'readerTicketRoute', 'readerTicketRouteEqual', 'readerTicketOrdinary',
  'readerTicketRoomAllowed', 'readerTicketSourceValid', 'readerTicketValid',
  'readerTicketOverlay', 'readerTicketRetireFeedback', 'readerTicketFeedbackOwns',
  'readerTicketFeedbackHost', 'readerTicketFeedbackOwner', 'readerTicketShowFeedback',
  'readerTicketRetireNotice', 'readerTicketRevoke', 'readerTicketCapture',
  'readerTicketDeparture', 'readerTicketSheetCandidate', 'readerTicketCommitSheet',
  'readerTicketArrivalCheck', 'readerTicketQueueArrival', 'readerTicketReturned',
  'readerTicketAttach', 'readerTicketSync', 'settleReaderTicketNotice',
  'readerTicketBusy', 'readerTicketPlacementOwns', 'readerTicketPlacementDone',
  'readerTicketRestore', 'renderReaderTicket',
];

/** Transient exit closure shared by grade and renderer lifts. */
export const REVIEW_EXIT_NAMES = [
  ...READER_TICKET_NAMES,
  'reviewExitStates', 'reviewExitAdmissions', 'reviewExitGeneration', 'reviewExitNotice', 'reviewExitIntent', 'REVIEW_EXIT_COPY',
  'reviewExitState', 'reviewExitActivity', 'reviewExitUi', 'reviewExitOwner', 'reviewExitOwns', 'reviewExitPhase',
  'restoreReviewExitControl', 'retireReviewExitNotice', 'syncReviewExitNotice', 'renderReviewExitNotice',
  'showReviewExitNotice', 'settleReviewExitNotice', 'bindReviewExit',
];

/** the authored definitions under test, by name */
export const CORRIDOR_NAMES = [
  ...REVIEW_EXIT_NAMES,
  'commitStorePatchOutcome', 'commitStorePatch', 'PRODUCER_DECLINED', 'declineWrite', 'HELP_RELEVANCE_POLICY',
  'reportHookAttempt', 'hookCardFacts', 'srsKey', 'srsStoredRecord', 'srsSchedulerInstant', 'srsReviewLogRow',
  'sameWordIdentity', 'wordNodeIdentity', 'wordCardIdentity', 'wordAnswerIdentity', 'savedAnswerFor', 'nonBlankMeanings',
  'admitStandardGrade', 'commitStandardGrade', 'commitReviewAction', 'advanceReviewSession', 'dropReviewCard',
  'srsWordAnswerIdentity', 'srsWordRests',
  // HOOKS r8 install and wiring: W3's rule and the one caller, the course visit's retained ledger, its PREPARE_REVIEW, custody
  'helpRelevanceRule', 'kanjiReviewCaller', 'KANJI_REVIEW_OWNER', 'kanjiReviewRetained', 'adoptHelpRelevance',
  'KANJI_LEDGER_LIMITS', 'kanjiDeepFreeze', 'kanjiDataProperty', 'kanjiPlainData', 'kanjiPlainList', 'kanjiCourseRowValid',
  'kanjiCourseLedger', 'kanjiCourseCapture', 'kanjiCourseLedgerBefore', 'kanjiCourseSnapshot', 'KANJI_REVIEW_STATE',
  'kanjiCoursePrepareReview', 'kanjiCourseAct', 'kanjiCourseApplyHelp', 'kanjiCourseRememberHelp', 'reportKanjiCourseAttempt',
  'kanjiCourseJourney', 'KANJI_LEDGER_FULL', 'kanjiCourseHookLine',
];

/** HOOKS r8 rev 3.2 §7: the journey's switch, lifecycle adoption and course seams (lifted beside CORRIDOR_NAMES by the
 * journey verifier; the r8 verifiers keep lifting exactly CORRIDOR_NAMES) */
export const JOURNEY_NAMES = [
  'JOURNEY_WRITES', 'kanjiJourney', 'kanjiJourneyModule', 'kanjiJourneyDevice', 'KANJI_JOURNEY_DAY_FULL', 'adoptJourney', 'kanjiJourneyRun',
  'kanjiJourneyFor', 'kanjiJourneyTick', 'kanjiJourneyId', 'kanjiJourneyReason', 'kanjiJourneyEnter', 'kanjiJourneyRemember',
  'kanjiJourneyAct', 'kanjiJourneyPrepare', 'kanjiJourneyRetained', 'kanjiJourneyAdmission', 'kanjiJourneyFence', 'kanjiJourneySettle',
];

/** lift the named top-level definitions from corridor.js source text */
export function liftCorridor(source, list = CORRIDOR_NAMES) {
  const ast = ts.createSourceFile('corridor.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const names = new Set(list);
  const found = new Set();
  const selected = ast.statements.filter((statement) => {
    const declared = ts.isFunctionDeclaration(statement) ? [statement.name?.text]
      : ts.isVariableStatement(statement) ? statement.declarationList.declarations.map((node) => node.name.getText(ast)) : [];
    const hit = declared.filter((name) => names.has(name));
    hit.forEach((name) => found.add(name));
    return hit.length > 0;
  });
  assert.deepEqual([...names].filter((name) => !found.has(name)), [], 'every tested definition comes from the authored source');
  return selected.map((statement) => statement.getText(ast)).join('\n');
}

class MemoryStorage {
  constructor() { this.m = new Map(); this.refuse = false; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { if (this.refuse) throw new Error('storage refused'); this.m.set(k, String(v)); }
}
/** navigator.locks, modelled: one holder at a time; `hold()` keeps it until released */
class Locks {
  constructor() { this.tail = Promise.resolve(); }
  request(name, fn) { const r = this.tail.then(fn); this.tail = r.catch(() => {}); return r; }
  hold() { let release; const held = new Promise((resolve) => { release = resolve; }); this.request('hold', () => held); return release; }
}

/**
 * A sandbox running the lifted program. record: the learner record the fake record app holds; mode decides what
 * recordApp.write does: 'confirmed' (active, UI replayed), 'ui-replay-refused', 'epoch-after-write' (ownership lost after
 * the write applied), 'recovery-durable' (recovery with a durable target), 'recovery-unknown' (recovery, no receipt),
 * 'not-active' (the record is not active: the producer never runs), 'reject-after-producer' (rejects after the producer
 * returned, before a target write), 'pre-write-refusal' (this window does not own the record).
 */
export function corridorSandbox(program, { core, fsrsApi, pin, record, dict = {}, locks = new Locks(), storage = new MemoryStorage(), clock = null }) {
  const scheduler = core.createScheduler(fsrsApi, pin);
  const box = {
    mode: 'confirmed', writes: 0, failures: [], producerRan: 0, renders: 0,
    record: JSON.parse(JSON.stringify(record)),
  };
  const S = { view: 'review', focus: null, review: null, stack: [] };
  const sandbox = {
    console, JSON, Math, Set, Map, Object, Array, Error, Promise, crypto: globalThis.crypto,
    Date: clock ? class extends Date { constructor(...a) { if (a.length) super(...a); else super(clock()); } static now() { return clock().getTime(); } } : Date,
    queueMicrotask, recordInstallation: null, recordDeparted: false, staleTab: false, storeSealed: false,
    S, D: { dict, kanji: {} }, srsCore: core, fsrsApi, scheduler,
    globalThis: null, window: {}, navigator: { locks }, localStorage: storage,
    recordEpoch: 1, recordApp: null, publishedRecord: {}, DEFAULT_LEARNER_RECORD: {},
    personalHost: undefined,
    recordWritable: (epoch = sandbox.recordEpoch) => box.mode !== 'pre-write-refusal' && epoch === sandbox.recordEpoch,
    recordReady: (epoch = sandbox.recordEpoch) => epoch === sandbox.recordEpoch,
    safelySyncStoreAlert: () => {},
    recordFailure: (reason) => { box.failures.push(reason); },
    canonicalRecordJson: (value) => JSON.stringify(value),
    render: () => { box.renders += 1; },
    bi: () => true,
    focusKanjiReadingReview: () => {},
    kanjiAnswerAvailable: () => true,
    assertWordAnswerPresented: () => {},
    resetAssessmentQuestionReview: () => {},
    finiteNumber: (v) => Number.isFinite(v),
    nonEmptyString: (v) => typeof v === 'string' && v.trim() !== '',
    plainRecord: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
    owns: (o, k) => Object.prototype.hasOwnProperty.call(o, k),
    entryCueReading: (node) => node?.reading,
    lookup: () => null,
    wordStudied: () => false,
    dayKey: (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    sentencePracticeModule: null, assessmentQuestionModule: null, assessmentQuestionReviewOwner: null,
  };
  sandbox.globalThis = sandbox;
  sandbox.recordApp = {
    async write(producer) {
      await null; // the record app queues writes: another page's turn can come before this producer runs
      if (box.mode === 'not-active') return { status: 'recovery-required', reason: 'store-not-active' };
      box.producerRan += 1;
      const out = producer(JSON.parse(JSON.stringify(box.record)), {});
      box.markAtWrite = storage.getItem('bunki-srs:answered-today');
      if (box.mode === 'reject-after-producer') throw Object.assign(new Error('producer-result-invalid'), { code: 'producer-result-invalid' });
      if (box.mode === 'recovery-unknown') return { status: 'recovery-required', reason: 'publication-failed' };
      box.record = { ...box.record, ...out.patch };
      box.writes += 1;
      if (box.mode === 'recovery-durable') return { status: 'recovery-required', reason: 'writer-required', targetCommitDurable: true };
      if (box.mode === 'epoch-after-write') sandbox.recordEpoch = 2;
      return { status: 'active', replayUiEffects: box.mode !== 'ui-replay-refused' };
    },
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(`${program}\n;globalThis.__lifted = { commitStorePatchOutcome, commitStorePatch, reportHookAttempt, admitStandardGrade, commitStandardGrade };`, context);
  return { box, S, sandbox, lifted: sandbox.__lifted, storage, locks, scheduler };
}

export { MemoryStorage, Locks };

// Review-exit preparation: actual authored renderers and grade admission, with
// controlled record/lock boundaries. No browser, layout, focus or storage claim.
const reviewExitPrograms = new Map();
export function reviewExitFixture(source, { core, fsrsApi, pin, tailHeld = false, pauseEvery = 0, cards = 2 } = {}) {
  let program = reviewExitPrograms.get(source);
  if (!program) {
    program = liftCorridor(source, [...CORRIDOR_NAMES, 'renderReview', 'renderReviewBreak', 'renderReviewUndo', 'reviewNextStep', 'commitDrillGrade']);
    reviewExitPrograms.set(source, program);
  }
  const latch = () => {
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    return { promise, release };
  };
  const callbackDone = latch(), tail = latch(), baseLocks = new Locks();
  let entered = 0;
  const locks = { request(name, callback) {
    return baseLocks.request(name, async () => {
      entered += 1;
      const result = await callback();
      callbackDone.release(result);
      if (tailHeld) await tail.promise;
      return result;
    });
  } };
  const item = { t: 'word', id: '学校', label: '学校', started: 1 };
  const queue = Array.from({ length: cards }, (_, i) => i === 0 ? { ...item }
    : { t: 'kanji', id: '雨', label: '雨', started: 1 });
  const record = { taken: queue, srs: {}, revlog: [], obslog: [], stats: {}, suspended: {}, deepWords: {},
    sentencePractice: {}, m4Journey: {}, srsPrefs: {} };
  const f = corridorSandbox(program, { core, fsrsApi, pin, record, locks,
    dict: { 学校: { r: 'がっこう', m: ['school'] } }, clock: () => new Date('2026-10-28T00:00:00Z') });
  const { sandbox: c, S, box } = f;
  Object.assign(S, structuredClone(record), { stack: [] });
  const rv = { queue, ix: 0, revealed: true, declared: 1,
    pending: null, history: [], done: { again: 0, hard: 0, good: 0, easy: 0 } };
  S.review = rv;
  const queued = [], transitions = [];
  const drawingBoundary = new Error('review exit: card-face drawing boundary');
  class Element {
    constructor(tag = 'div', cls = '', text = '') {
      this.tag = tag; this.className = cls; this.ownText = text; this.children = []; this.events = {};
      this.attrs = {}; this.dataset = {}; this.disabled = false; this.isConnected = true;
      this.style = { setProperty() {} };
      this.classList = { add: name => { this.className += ` ${name}`; }, remove: name => {
        this.className = this.className.split(' ').filter(x => x !== name).join(' ');
      } };
    }
    get textContent() { return this.ownText + this.children.map(x => x.textContent ?? String(x)).join(''); }
    set textContent(value) { this.ownText = String(value); this.children = []; }
    get childNodes() { return this.ownText ? [new Element('text', '', this.ownText), ...this.children] : this.children; }
    contains(node) { return this === node || this.children.some(child => child.contains?.(node)); }
    prepend(node) { node.parentNode = this; this.children.unshift(node); }
    removeAttribute(k) { delete this.attrs[k]; }
    append(...children) {
      for (const child of children) { this.children.push(child); if (typeof child === 'object') child.parentNode = this; }
      // The real exit has already been bound. The remaining card face is not
      // needed for these event-handler tests; catch only this exact sentinel.
      if (this.boundary && children.some(x => x.id === 'zen-exit')) throw drawingBoundary;
    }
    replaceChildren(...children) { this.children.forEach(x => { x.isConnected = false; }); this.children = []; this.ownText = ''; this.append(...children); }
    remove() { this.isConnected = false; if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    addEventListener(k, fn) { (this.events[k] ||= []).push(fn); }
    fire() { assert(this.isConnected, 'fixture control is attached'); assert(!this.disabled, 'fixture control is enabled');
      const results = (this.events.click || []).map(fn => fn({ currentTarget: this, target: this, preventDefault() {} }));
      return results.at(-1);
    }
  }
  const find = (node, predicate) => predicate(node) ? node : node.children?.map(child => find(child, predicate)).find(Boolean);
  let main = null;
  const paint = (kind = 'auto') => {
    if (main) { const detach = node => { node.isConnected = false; node.children.forEach(detach); }; detach(main); }
    main = new Element(); main.boundary = true;
    if (S.view === 'tray' && c.placesLayout()) S.view = 'dojo';
    c.syncReviewExitNotice();
    try {
      if (kind === 'break') c.renderReviewBreak(main, S.review, 1);
      else if (S.view === 'review') c.renderReview(main);
    } catch (error) { if (error !== drawingBoundary) throw error; }
    c.renderReviewExitNotice(main);
    return main;
  };
  Object.assign(c, {
    queueMicrotask, setTimeout, clearTimeout, pageEpoch: 0,
    document: { createTextNode: text => new Element('text', '', text), getElementById: id => main && find(main, n => n.id === id) },
    el: (tag, cls, text) => new Element(tag, cls, text),
    biLabel: (tag, cls, _ja, en) => new Element(tag, cls, en), tx: (_ja, en) => en, withEn: n => n,
    todayLearning: (tag, cls, text) => new Element(tag, cls, text), TODAY_JA_WORD: /[一-龯]/,
    placesLayout: () => false, srsPauseEvery: () => pauseEvery, isLeech: () => false,
    renderAiCoach() {}, renderReviewNext() {}, roomTransition: change => { transitions.push(change); },
    render() { box.renders += 1; paint(); },
  });
  c.recordApp.write = producer => new Promise(resolve => {
    queued.push({ producer, resolve, staged: false, published: false });
  });
  const stage = () => {
    const job = queued[0]; assert(job, 'actual handler enqueued its record producer');
    if (!job.staged) {
      job.staged = true; box.producerRan += 1;
      try { job.output = job.producer(structuredClone(box.record), {}); }
      catch (error) { job.error = error; }
    }
    return job;
  };
  const publish = () => {
    const job = stage();
    if (!job.error && !job.published) {
      assert(job.output && Object.hasOwn(job.output, 'patch'), 'actual record producer returns an envelope patch');
      box.record = { ...box.record, ...structuredClone(job.output.patch) };
      Object.assign(S, structuredClone(box.record)); box.writes += 1; job.published = true;
    }
    return job;
  };
  const ack = ({ publishWrite = true, acknowledged = true, outcome = null } = {}) => {
    const job = publishWrite ? publish() : stage(); queued.shift();
    job.resolve(outcome || (job.error || !publishWrite
      ? { status: 'recovery-required', reason: 'publication-failed' }
      : { status: 'active', replayUiEffects: acknowledged }));
    return job;
  };
  const door = (kind = 'active') => {
    paint(kind === 'break' ? 'break' : 'auto');
    const node = find(main, n => kind === 'active' ? n.id === 'zen-exit'
      : n.tag === 'button' && (n.textContent === (kind === 'break' ? 'back to lists' : 'Back to Today') || n.getAttribute('aria-describedby') === 'review-exit-status' || n.textContent === 'Back to Review'));
    assert(node, `actual ${kind} renderer bound its exit`); return node;
  };
  const grade = (current = rv) => f.lifted.admitStandardGrade({ rv: current, item: current.queue[current.ix], key: 'easy', skey: current.queue[current.ix]?.t + ':' + current.queue[current.ix]?.id, rating: fsrsApi.Rating.Easy });
  return { ...f, rv, grade, queued, stage, publish, ack, door, paint, find, Element, transitions,
    holdLock: () => baseLocks.hold(), entered: () => entered, callbackDone: callbackDone.promise,
    releaseTail: () => tail.release(), main: () => main,
    roots: () => structuredClone(box.record), flushTransition: () => { assert(transitions.length <= 1); return transitions.shift()?.(); } };
}

/** Ticket controls use actual navigation/return/placement functions. This DOM is an explicit
 * synchronous layout model, never a native fit, announcement or keyboard proof. */
const readerTicketPrograms = new Map();
export function readerTicketFixture(source, options) {
  const f = reviewExitFixture(source, options);
  const { sandbox: c, S, Element, box } = f;
  let program = readerTicketPrograms.get(source);
  if (!program) {
    program = liftCorridor(source, [
      'scaleTokenFingerprint', 'scaleSource', 'scalePassage', 'scaleReaderIndex',
      'startReview', 'keepNavigationReturn', 'returnFromNavigation', 'go', 'enterWord', 'recede',
      'settleScaleReturn', 'requestScaleReturn', 'retireScaleReturn',
    ]);
    readerTicketPrograms.set(source, program);
  }
  vm.runInContext(program, c);
  const body = new Element('body');
  const reader = new Element('div'); reader.id = 'reader';
  const anchor = new Element('span', 'tok', '同じ');
  anchor.dataset = { index: '2', indexEnd: '3', para: '0' };
  const p = { id: 'article-a', file: 'archive/a.json', tokens: [
    { s: '同', r: 'どう' }, { s: 'じ' }, { s: '同', r: 'どう' }, { s: 'じ' }, { s: '文' },
  ] };
  reader.append(anchor); body.append(reader);
  const frames = [], queued = [];
  let y = 125, focusCount = 0, scrollCount = 0, failureRoom = false;
  let currentMain = null;
  const oldPaint = c.render;
  const all = (node, predicate) => [ ...(predicate(node) ? [node] : []), ...node.children.flatMap(child => all(child, predicate)) ];
  Element.prototype.querySelector = function (selector) {
    return all(this, node => selector.startsWith('#') && node.id === selector.slice(1))[0] || null;
  };
  Element.prototype.hasAttribute = function (name) { return name === 'data-para' || Object.hasOwn(this.attrs, name); };
  Element.prototype.getBoundingClientRect = function () { return { top: y, bottom: y + 20, width: 60, height: 20 }; };
  c.document = {
    body, activeElement: anchor,
    createTextNode: text => new Element('text', '', text),
    getElementById(id) { return all(body, node => node.isConnected && node.id === id)[0] || null; },
    querySelector(selector) { return selector === '#app > main .room-error' ? failureRoom : null; },
    querySelectorAll(selector) { return selector.startsWith('#reader ') ? [anchor] : []; },
  };
  Object.assign(c, {
    innerWidth: 390, innerHeight: 844, learningSourceVisit: null, worldPickerEls: null,
    ladderVisit: null, ladderOpening: null, ladderReturning: null, ladderCleanupGeneration: 0,
    ladderPages: new Map(), heroSource: new Map(), keptPages: new Map(),
    standingSlip: () => c.slip || null, personalHost: null, referenceLibrary: null, pendingReferenceCollection: null,
    recordInstallation: { policy: { binding: { sessionId: 'session-a', accountId: 'account-a', learnerId: 'learner-a' } }, assertCurrent: () => true },
    recordWritable: epoch => (epoch === undefined || epoch === c.recordEpoch) && !S.storeReadOnly && !c.staleTab && !c.storeSealed && !c.recordDeparted,
    passage: () => c.D.passages.find(row => row.id === S.passageId),
    readerTokenAtIndex: index => index === 2 && reader.isConnected && anchor.isConnected ? anchor : null,
    invokerKey: node => node === anchor ? { sel: '#reader [data-index="2"]' } : null,
    scaleLineTop: () => y, teacherSentence: () => ({ start: 0, end: p.tokens.length }),
    window: { scrollY: 900, scrollTo(_x, value) { scrollCount++; y += this.scrollY - value; this.scrollY = value; },
      scrollBy(_x, value) { scrollCount++; if (!c.stuck) { y -= value; this.scrollY += value; } } },
    focusProseWord: node => { focusCount++; c.document.activeElement = node; c.onFocus?.(); },
    requestAnimationFrame: fn => { frames.push(fn); }, queueMicrotask: fn => { queued.push(fn); },
    keepScroll() {}, rememberSheet() {}, rememberScaleEntry() {}, stopReadAloud() {}, restoreDialogInvoker() {},
    restoreDialogFocus() {}, clearTimeout() {}, saveReaderPosition() { throw new Error('ticket unexpectedly writes readerPos'); },
    finishPageTransition() {}, layerPathFor: () => false, takePrebuiltPage: () => null,
    sampleWhere: () => null, pageCutAllowed: () => false, removeMini() {}, sampleTransition() {},
    kanjiCourseReferenceHelp: () => null, scaleNodeBelongs: () => false, returnScroll() {},
    clearReaderSummons() {}, syncWalkSentinel() {}, clearWordLadder(visit) { if (c.ladderVisit === visit) c.ladderVisit = null; },
    todayQueue: (_now, scope) => ({ order: c.emptyQueue ? [] : scope || f.rv.queue, held: 0 }),
    roomTransition: change => f.transitions.push(change),
  });
  c.D.passages = [p];
  Object.assign(S, { view: 'reader', passageId: p.id, stack: [], navigationReturns: [], navigationDepartures: 0, wordEntrySerial: 0,
    review: null, readerTake: { p: p.id, index: 2, id: '同じ' }, revealed: new Set([2]), glossed: new Set([2]), readerScroll: 900 });
  c.render = () => {
    c.readerTicketSync();
    if (S.view === 'reader') {
      if (c.renderError) { failureRoom = new Element('div', 'room-error'); reader.isConnected = false; return; }
      reader.isConnected = true; anchor.isConnected = true;
      c.settleScaleReturn(reader);
    } else if (S.view === 'review') {
      // Existing review fixture owns the complete actual review render.
      oldPaint(); currentMain = f.main(); body.append(currentMain);
    }
  };
  const api = {
    ...f, c, p, anchor, reader, body, frames, microtasks: queued,
    ticket: () => vm.runInContext('readerTicket', c),
    placement: () => vm.runInContext('readerTicketPlacement', c),
    feedback: () => vm.runInContext('readerTicketFeedback', c),
    notice: () => vm.runInContext('readerTicketNotice', c),
    start: () => { c.readerTicketDeparture('tray'); S.view = 'tray'; S.stack = []; c.startReview(); return S.review; },
    door: () => { c.render(); const button = currentMain.querySelector('#review-reader-return'); assert(button, 'actual ticket door rendered'); return button; },
    flushMicrotasks: () => { let guard = 0; while (queued.length) { assert(++guard < 100); queued.shift()(); } },
    flushFrames: () => { let guard = 0; while (frames.length) { assert(++guard <= 12, 'placement has a finite frame bound'); frames.shift()(); } },
    focusCount: () => focusCount, scrollCount: () => scrollCount, y: () => y, setY: value => { y = value; },
    status: () => c.document.getElementById('reader-return-status-host'),
    paint: kind => { const node = f.paint(kind); currentMain = node; body.append(node); return node; },
  };
  box.ticketFixture = true;
  return api;
}
