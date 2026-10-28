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

/** Transient exit closure shared by grade and renderer lifts. */
export const REVIEW_EXIT_NAMES = [
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
