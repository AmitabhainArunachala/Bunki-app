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

/** the authored definitions under test, by name */
export const CORRIDOR_NAMES = [
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

/** lift the named top-level definitions from corridor.js source text */
export function liftCorridor(source) {
  const ast = ts.createSourceFile('corridor.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const names = new Set(CORRIDOR_NAMES);
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
  const S = { view: 'review', focus: null, review: null };
  const sandbox = {
    console, JSON, Math, Set, Map, Object, Array, Error, Promise, crypto: globalThis.crypto,
    Date: clock ? class extends Date { constructor(...a) { if (a.length) super(...a); else super(clock()); } static now() { return clock().getTime(); } } : Date,
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
