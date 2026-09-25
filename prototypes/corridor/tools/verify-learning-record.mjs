/** Controlled acknowledgment tests of the actual authored learning handlers.
 * Frozen synthetic roots detect premature mutation. This verifies the UI save
 * contract; RecordApp/Host suites separately exercise real browser storage. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { chromium, webkit } from 'playwright-core';
import { verifyBundledArtifact } from '../../bunki-desktop/lib/artifact.cjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import * as fsrsApi from '../vendor/ts-fsrs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browserMode = process.argv.includes('--browser');
const propertyMode = process.argv.includes('--property');
let site;
let artifact;
if (browserMode) {
  assert(isAbsolute(process.env.KAIRO_SITE_DIR || ''), 'Browser verification needs the absolute staged site');
  site = resolve(process.env.KAIRO_SITE_DIR);
  artifact = verifyBundledArtifact(site);
  assert.equal(artifact.artifactSha256, process.env.KAIRO_ARTIFACT_SHA256, 'Supply the exact staged artifact digest');
}
const source = readFileSync(resolve(site || root, 'corridor.js'), 'utf8');
const ast = ts.createSourceFile('corridor.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = new Set([
  'srsKey', 'srsCardOf', 'srsStoredRecord', 'srsSchedulerInstant', 'srsReviewLogRow',
  'focusKanjiReadingReview', 'kanjiAnswerAvailable', 'retainedKanjiRecord', 'validKanjiRecord', 'nonEmptyString', 'safeJsonValue',
  'advanceReviewSession', 'resetAssessmentQuestionReview', 'commitReviewAction', 'commitDrillGrade', 'commitStandardGrade',
  'renderReview', 'renderReviewUndo', 'renderProbe', 'renderLessons', 'renderSrsPrefs',
  'aiQuizPending', 'aiQuizStarting', 'aiQuizParse', 'aiQuizCommit', 'aiQuizStart', 'renderAiQuiz',
  'learningEnrollmentPending', 'commitLearningEnrollment', 'captureStorePatch', 'commitCapture',
  'srsPrefsPending', 'NODE_KIND', 'YOMI_RT_LABEL', 'dayKey', 'renderMockItem',
  'NEW_PER_DAY_MAX', 'REVIEW_LIMIT_MIN', 'REVIEW_LIMIT_MAX',
  'canonicalRecordJson',
]);
const selected = ast.statements.filter((statement) => {
  const declared = ts.isFunctionDeclaration(statement) ? [statement.name?.text] :
    ts.isVariableStatement(statement) ? statement.declarationList.declarations.map((node) => node.name.getText(ast)) : [];
  return declared.some((name) => names.has(name));
});
const program = selected.map((statement) => statement.getText(ast)).join('\n');
assert.equal(selected.length, names.size, 'Every tested definition comes from the current authored source');
const out = resolveCorridorEvidence();
mkdirSync(out, { recursive: true });
const clone = (value) => JSON.parse(JSON.stringify(value));
const ordered = (value) => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])])) : value;
const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
class Element {
  constructor(tag = 'div', className = '', text = '') {
    Object.assign(this, { tag, className, textContent: text, children: [], style: {}, dataset: {}, events: {}, disabled: false });
    this.classList = { add: (name) => { this.className += ' ' + name; } };
  }
  append(...children) { this.children.push(...children); }
  setAttribute() {}
  addEventListener(kind, run) { this.events[kind] = run; }
  fire() { return this.events.click?.(); }
  get childNodes() { return this.children; }
}
const find = (node, predicate) => predicate(node) ? node : node.children?.map((child) => find(child, predicate)).find(Boolean);
const byId = (node, id) => { const found = find(node, (child) => child.id === id); assert(found, id); return found; };
const byClass = (node, name) => { const found = find(node, (child) => child.className?.split(' ').includes(name)); assert(found, name); return found; };
const item = { t: 'word', id: '学校', label: '学校', ts: 100, started: 100 };
const run = () => ({ queue: [item], ix: 0, revealed: true, declared: 1, done: { again: 0, hard: 0, good: 0, easy: 0 }, history: [] });
const questions = Array.from({ length: 3 }, (_, i) => ({ q: 'Synthetic question ' + i, opts: ['a', 'b', 'c', 'd'], right: 0, why: 'Synthetic explanation' }));
const quiz = () => ({ qs: questions, ix: 0, picked: null, correct: 0, ts: 100 });
function fixture(overrides = {}, options = {}) {
  const durableNames = ['taken', 'srs', 'revlog', 'obslog', 'stats', 'suspended', 'lessonsDone', 'deepWords', 'srsPrefs', 'aiQuiz'];
  const S = { view: 'review', focus: null, review: run(), reviewMore: false, probe: null,
    taken: [clone(item)], srs: {}, revlog: [], obslog: [], stats: {}, suspended: {}, lessonsDone: {}, deepWords: {},
    srsPrefs: { newPerDay: 20, reviewLimit: 20 }, aiQuiz: null, ...overrides };
  let durable = Object.fromEntries(durableNames.map((key) => [key, freeze(clone(S[key]))]));
  Object.assign(S, durable);
  const queue = [];
  let paints = 0;
  let scrolls = 0;
  const sandbox = {
    S, Date: options.Date || Date, Math, JSON, Set, Map, console, fsrsApi, scheduler: fsrsApi.fsrs({ enable_fuzz: false }), recordEpoch: 1,
    assessmentQuestionReviewOwner: null,
    recordReady: (epoch = 1) => epoch === sandbox.recordEpoch,
    recordWritable: (epoch = 1) => epoch === sandbox.recordEpoch,
    render: () => { paints += 1; },
    window: { scrollY: 0, scrollTo: () => { scrolls += 1; }, __CORRIDOR_STANDALONE__: true },
    document: { createTextNode: (text) => new Element('text', '', text) },
    el: (tag, cls, text) => new Element(tag, cls, text),
    biLabel: (tag, cls, ja, en) => new Element(tag, cls, en),
    tx: (ja, en) => en, withEn: (node) => node, bi: () => true,
    finiteNumber: (value) => Number.isFinite(value),
    plainRecord: (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
    D: { exampleBank: new Map(), dict: {}, kanji: options.kanji || {} },
    lookup: (id) => ({ r: 'がっこう', m: [id], seq: 'synthetic-' + id }),
    findExamples: () => [], takenContext: () => null, ensureBankExamples: async () => [],
    reviewBack: () => ({ reading: '', senses: ['synthetic meaning'] }),
    isLeech: () => false, renderAiCoach: () => {},
    recManifest: null, // Explicit audio-unavailable fixture; this suite does not exercise audio.
    // a DOM focus helper startReview calls after rendering; no scheduling effect
    focusKanjiReadingReview: () => {},
    endLessonRun: () => {}, srsCustom: null, srsNewPerDay: () => S.srsPrefs.newPerDay, srsReviewLimit: () => S.srsPrefs.reviewLimit,
    mockPending: null, leaveMockRun: () => {}, dropMockRun: () => {},
    aiLevelGuess: () => 'N5', aiAsk: async () => JSON.stringify(questions),
    commitStorePatch: (producer) => new Promise((settle) => queue.push({ producer, settle, epoch: sandbox.recordEpoch })),
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(program, context, { filename: 'authored-learning-handlers.js' });
  const stage = () => {
    const pending = queue[0]; assert(pending, 'An actual handler queued a save');
    if (!pending.staged) {
      pending.staged = true;
      try { pending.patch = typeof pending.producer === 'function' ? pending.producer(durable) : pending.producer; }
      catch (error) { pending.error = error; }
    }
    return pending;
  };
  const ack = (save = true, { acknowledge = true, afterPublish } = {}) => {
    const pending = stage(); queue.shift();
    const ok = save && !pending.error && pending.epoch === sandbox.recordEpoch;
    if (ok) { durable = freeze(ordered(clone({ ...durable, ...pending.patch }))); Object.assign(S, durable); }
    // Test-only boundary: durable publication may precede loss of ownership.
    // The callback runs before resolving the awaited save, not after its handler.
    if (ok) afterPublish?.();
    pending.settle(ok && acknowledge);
    return pending;
  };
  return { S, c: context, queue, stage, ack, paints: () => paints, scrolls: () => scrolls,
    durable: () => clone(durable), external: (patch) => { durable = freeze(clone({ ...durable, ...patch })); Object.assign(S, durable); },
    render: (name, ...args) => { const main = new Element(); context[name](main, ...args); return main; } };
}
const results = [];
async function check(name, action) {
  try { await action(); results.push({ name, pass: true }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, pass: false, reason: error.stack }); console.error('FAIL ' + name + ': ' + error.message); }
}
const grade = (f, overrides = {}) => f.c.commitStandardGrade({ rv: f.S.review, item, key: 'good', skey: 'word:学校',
  rating: fsrsApi.Rating.Good, now: new Date('2026-09-10T10:00:00Z'), day: '2026-09-10', ...overrides });

await check('grade-rejection-keeps-schedule-log-stats-and-session-with-double-tap-guard', async () => {
  const f = fixture(); const before = f.durable(); const history = clone(f.S.review.history);
  const first = grade(f); assert.equal(await grade(f), false); assert.equal(f.queue.length, 1);
  assert.equal(f.S.review.ix, 0); assert.deepEqual(f.durable(), before);
  f.ack(false); assert.equal(await first, false);
  assert.deepEqual(f.durable(), before); assert.deepEqual(f.S.review.history, history); assert.equal(f.S.review.ix, 0);
});
await check('queued-grade-recomputes-latest-card-and-preserves-concurrent-log-and-stats', async () => {
  const f = fixture(); const promise = grade(f);
  const before = fsrsApi.createEmptyCard(new Date('2026-09-01T00:00:00Z'));
  const prior = f.c.srsStoredRecord(f.c.scheduler.repeat(before, new Date('2026-09-01T00:00:00Z'))[fsrsApi.Rating.Easy].card);
  f.external({ srs: { 'word:学校': prior }, revlog: [[1, 'other', 1]], stats: { '2026-09-10': { n: 2, again: 1, nnew: 2 } } });
  const staged = f.stage(); assert.deepEqual(Object.keys(staged.patch).sort(), ['revlog', 'srs', 'stats']);
  assert.equal(f.S.review.ix, 0); assert.equal(f.S.revlog.length, 1);
  f.ack(); assert.equal(await promise, true);
  assert.equal(f.S.revlog.length, 2); assert.equal(f.S.revlog[1][3], prior.state);
  assert.equal(f.S.stats['2026-09-10'].n, 3); assert.equal(f.S.stats['2026-09-10'].nnew, 2);
  assert.deepEqual(clone(f.S.review.history[0].prev), clone(prior)); assert.equal(f.S.review.history[0].logIx, 1);
  assert.equal(f.S.review.history[0].item, item); assert.equal(f.S.review.history[0].queueIndex, 0);
  assert.equal(f.S.review.ix, 1);
});
await check('not-recalled-forces-again-even-if-another-grade-is-requested', async () => {
  const f = fixture(); f.S.review.declared = 0;
  const promise = grade(f, { key: 'easy', rating: fsrsApi.Rating.Easy }); f.ack(); assert.equal(await promise, true);
  assert.equal(f.S.revlog[0][2], fsrsApi.Rating.Again); assert.equal(f.S.review.done.again, 1); assert.equal(f.S.review.done.easy, 0);
});
await check('review-does-not-advance-a-replacement-session-after-ack', async () => {
  const f = fixture(); const original = f.S.review; const promise = grade(f); f.stage(); f.S.review = run();
  f.ack(); assert.equal(await promise, false); assert.equal(f.S.review.ix, 0); assert.equal(original.ix, 0);
});
await check('stale-grade-refuses-removed-or-suspended-card-without-lost-latest-data', async () => {
  for (const patch of [{ taken: [] }, { suspended: { 'word:学校': 123 } }]) {
    const f = fixture(); const promise = grade(f); f.external(patch); const before = f.durable();
    f.ack(); assert.equal(await promise, false); assert.deepEqual(f.durable(), before); assert.equal(f.S.review.ix, 0);
  }
});
await check('undo-is-atomic-append-only-and-rejection-keeps-the-grade', async () => {
  const f = fixture(); let promise = grade(f); f.ack(); await promise;
  const after = f.durable(); const rv = f.S.review;
  let undo = byClass(f.render('renderReviewUndo', rv), 'review-undo'); promise = undo.fire();
  assert.equal(rv.ix, 1); f.ack(false); await promise; assert.deepEqual(f.durable(), after); assert.equal(rv.ix, 1);
  undo = byClass(f.render('renderReviewUndo', rv), 'review-undo'); promise = undo.fire(); f.ack(); await promise;
  assert.equal(rv.ix, 0); assert.equal(f.S.srs['word:学校'], undefined); assert.equal(f.S.revlog.length, 2);
  assert.deepEqual(f.S.revlog[1].slice(1), ['word:学校', 0, 0]); assert.equal(f.S.stats['2026-09-10'].n, 0);
});
await check('undo-does-not-overwrite-a-later-card-change', async () => {
  const f = fixture(); let promise = grade(f); f.ack(); await promise;
  promise = byClass(f.render('renderReviewUndo', f.S.review), 'review-undo').fire();
  f.external({ srs: { 'word:学校': { ...f.S.srs['word:学校'], reps: 90 } } }); const before = f.durable();
  f.ack(); await promise; assert.deepEqual(f.durable(), before); assert.equal(f.S.review.ix, 1);
});
await check('acknowledged-grade-disposes-question-view-and-clears-transient-response-state', async () => {
  const f = fixture(); const rv = f.S.review;
  Object.assign(rv, { questionAttemptId: 'previous-question-response', questionError: 'previous error',
    questionSourceAttempted: true, questionSourceChecking: true, questionSourceAvailable: true });
  let disposed = 0;
  const owner = { rv, view: { dispose: () => { disposed += 1; } } };
  f.c.assessmentQuestionReviewOwner = owner;
  let promise = grade(f);
  assert.equal(disposed, 0); assert.equal(rv.questionAttemptId, 'previous-question-response');
  f.ack(false); assert.equal(await promise, false);
  assert.equal(disposed, 0); assert.equal(f.c.assessmentQuestionReviewOwner, owner);
  assert.equal(rv.questionSourceAvailable, true);
  promise = grade(f); f.ack(); assert.equal(await promise, true);
  assert.equal(disposed, 1); assert.equal(f.c.assessmentQuestionReviewOwner, null);
  assert.equal(rv.questionAttemptId, null); assert.equal(rv.questionError, '');
  assert.equal(rv.questionSourceAttempted, false); assert.equal(rv.questionSourceChecking, false);
  assert.equal(rv.questionSourceAvailable, false);
});
await check('undo-after-ungraded-skip-restores-the-actual-graded-item-and-removes-only-its-reinsertion', async () => {
  const f = fixture(); const rv = f.S.review;
  const skipped = { t: 'word', id: '電話', label: '電話', ts: 100, started: 100 };
  const current = { t: 'word', id: '先生', label: '先生', ts: 100, started: 100 };
  rv.queue = [item, skipped, current]; rv.declared = 0;
  let promise = grade(f); f.ack(); assert.equal(await promise, true);
  assert.equal(rv.history[0].item, item); assert.equal(rv.history[0].queueIndex, 0);
  assert.equal(rv.history[0].reinserted, true); assert.deepEqual(rv.queue, [item, skipped, current, item]);
  // Skip advances the cursor without minting a grade or a history entry.
  rv.ix = 2;
  promise = byClass(f.render('renderReviewUndo', rv), 'review-undo').fire();
  f.ack(); assert.equal(await promise, true);
  assert.equal(rv.ix, 0); assert.equal(rv.history.length, 0); assert.equal(rv.done.again, 0);
  assert.deepEqual(rv.queue, [item, skipped, current]);
  assert.equal(f.S.srs['word:学校'], undefined); assert.equal(f.S.revlog.length, 2);
  assert.deepEqual(f.S.revlog[1].slice(1), ['word:学校', 0, 0]);
  assert.equal(f.S.stats['2026-09-10'].n, 0); assert.equal(f.S.stats['2026-09-10'].nnew, 0);
});
await check('dojo-evidence-waits-for-ack-and-never-creates-schedule-state', async () => {
  const f = fixture(); const before = f.durable();
  const promise = f.c.commitDrillGrade({ rv: f.S.review, item, next: { state: 2, scheduled_days: 1 }, key: 'good', skey: 'word:学校', rating: 3, mode: 'kanji', now: new Date() });
  assert.equal(f.S.review.ix, 0); f.ack(); assert.equal(await promise, true);
  assert.equal(f.S.obslog.length, 1); assert.deepEqual(f.S.srs, before.srs); assert.deepEqual(f.S.revlog, before.revlog); assert.deepEqual(f.S.stats, before.stats);
});
await check('recall-declaration-rejects-without-revealing-and-serializes-double-input', async () => {
  const f = fixture(); f.S.review.revealed = false; f.S.review.declared = null;
  const main = f.render('renderReview'); const first = byId(main, 'declare-notyet').fire();
  await byId(main, 'declare-recalled').fire(); assert.equal(f.queue.length, 1); assert.equal(f.S.review.revealed, false);
  f.ack(false); await first; assert.equal(f.S.review.revealed, false); assert.equal(f.S.review.declared, null);
  const second = byId(f.render('renderReview'), 'declare-notyet').fire(); f.ack(); await second;
  assert.equal(f.S.review.revealed, true); assert.equal(f.S.review.declared, 0); assert.equal(f.S.obslog[0][3], 0);
});
await check('quiz-answer-next-and-close-use-only-acknowledged-run-and-ignore-stale-buttons', async () => {
  const f = fixture({ view: 'aiquiz', aiQuiz: quiz() }); const before = f.durable();
  let option = byClass(f.render('renderAiQuiz'), 'lesson-option'); let promise = option.fire();
  await option.fire(); assert.equal(f.queue.length, 1); assert.equal(f.S.aiQuiz.picked, null);
  f.ack(false); await promise; assert.deepEqual(f.durable(), before);
  option = byClass(f.render('renderAiQuiz'), 'lesson-option'); promise = option.fire(); f.ack(); await promise;
  assert.equal(f.S.aiQuiz.correct, 1); assert.equal(f.S.aiQuiz.picked, 0);
  promise = option.fire(); f.ack(); await promise; assert.equal(f.S.aiQuiz.correct, 1);
  promise = byId(f.render('renderAiQuiz'), 'aiq-next').fire(); f.ack(false); await promise; assert.equal(f.S.aiQuiz.ix, 0);
  f.external({ aiQuiz: { ...f.S.aiQuiz, ix: 3 } }); promise = byId(f.render('renderAiQuiz'), 'aiq-close').fire();
  f.ack(false); await promise; assert.equal(f.S.view, 'aiquiz'); assert(f.S.aiQuiz);
});
await check('lesson-completion-atomically-files-score-and-evidence-after-ack', async () => {
  const lesson = { id: 'N5-1', kind: 'word', words: ['学校'], ix: 0, phase: 'quiz', picked: 'school', choices: { right: 'school', opts: ['school', 'other'] }, correct: 1 };
  const f = fixture({ view: 'lessons', lessonRun: lesson }); const before = f.durable();
  let promise = byId(f.render('renderLessons'), 'lesson-next').fire();
  assert.equal(lesson.phase, 'quiz'); f.ack(false); await promise; assert.deepEqual(f.durable(), before); assert.equal(lesson.phase, 'quiz');
  promise = byId(f.render('renderLessons'), 'lesson-next').fire(); f.external({ obslog: [[100, 'other', 'word:other', 1]] });
  f.ack(); await promise; assert.equal(lesson.phase, 'end'); assert.equal(f.S.lessonsDone['N5-1'].score, 1);
  assert.equal(f.S.obslog.length, 2); assert.deepEqual(f.S.taken, before.taken); assert.deepEqual(f.S.srs, before.srs);
});
await check('explicit-enrollment-batch-is-one-save-deduplicated-and-keeps-deep-word-provenance', async () => {
  const f = fixture(); const nodes = [{ t: 'word', id: '学校' }, { t: 'word', id: '電話' }, { t: 'word', id: '電話' }];
  let promise = f.c.commitLearningEnrollment('synthetic-batch', nodes, () => true);
  assert.equal(await f.c.commitLearningEnrollment('synthetic-batch', nodes, () => true), false);
  assert.equal(f.queue.length, 1); assert.equal(f.S.taken.length, 1); f.ack(false); await promise; assert.equal(f.S.taken.length, 1);
  promise = f.c.commitLearningEnrollment('synthetic-batch', nodes, () => true); f.ack(); await promise;
  assert.equal(f.S.taken.length, 2); assert.equal(f.S.deepWords['電話'].seq, 'synthetic-電話'); assert.equal(f.S.taken[1].entrySeq, 'synthetic-電話');
});
await check('probe-mint-and-evidence-wait-together-and-double-input-cannot-mint-twice', async () => {
  const word = { w: '電話', r: 'でんわ', m: ['telephone'], rt: '音', band: '10' };
  const probe = { queue: [word], ix: 0, revealed: true, right: 0, missed: [], minted: 0 };
  const f = fixture({ view: 'probe', probe }); const before = f.durable();
  const wrong = byClass(f.render('renderProbe'), 'g-again'); let promise = wrong.fire(); await wrong.fire();
  assert.equal(f.queue.length, 1); assert.equal(probe.ix, 0); f.ack(false); await promise; assert.deepEqual(f.durable(), before);
  promise = byClass(f.render('renderProbe'), 'g-again').fire(); f.ack(); await promise;
  assert.equal(probe.ix, 1); assert.equal(probe.minted, 1); assert.equal(f.S.taken.length, 2); assert.equal(f.S.obslog[0][4], 1);
  assert.deepEqual(f.S.srs, before.srs); assert.deepEqual(f.S.revlog, before.revlog);
});
await check('preference-step-merges-latest-pacing-without-publishing-unacknowledged-value', async () => {
  const f = fixture({ view: 'tray', srsPrefsOpen: true });
  const plus = find(f.render('renderSrsPrefs'), (node) => node.dataset?.prefUp === 'newPerDay'); assert(plus);
  const promise = plus.fire(); await plus.fire(); assert.equal(f.queue.length, 1); assert.equal(f.S.srsPrefs.newPerDay, 20);
  f.external({ srsPrefs: { newPerDay: 25, reviewLimit: 50 } }); f.ack(); await promise;
  assert.equal(f.S.srsPrefs.newPerDay, 30); assert.equal(f.S.srsPrefs.reviewLimit, 50);
});

/* Opt-in generated handler histories. Storage is deliberately a small controlled
 * acknowledgment model: a saved root is not a native IndexedDB durability proof.
 * Start/disclosure/clock/external changes are fixture commands; grade, drill and
 * undo invoke the actual AST-selected handlers above. The oracle does not invoke
 * a scheduler or production handler to calculate its expectations. */
async function propertyChecks() {
  const integerOption = (flag, fallback, min, max) => {
    const positions = process.argv.flatMap((value, i) => value === flag ? [i] : []);
    assert(positions.length <= 1, 'Supply ' + flag + ' at most once');
    const text = positions.length ? process.argv[positions[0] + 1] : String(fallback);
    assert(/^(?:0x[0-9a-f]+|\d+)$/iu.test(text || ''), flag + ' needs an unsigned integer');
    const value = Number(text);
    assert(Number.isSafeInteger(value) && value >= min && value <= max, flag + ' out of bounds');
    return value;
  };
  const seed = integerOption('--seed', 0x51ee7, 0, 0xffffffff);
  const runs = integerOption('--runs', 1000, 1, 100000);
  const onlyHistory = process.argv.includes('--history') ? integerOption('--history', 0, 0, 1000000) : null;
  assert(onlyHistory === null || runs === 1, 'Replay one history with --runs 1 --history N');
  const hash = (text) => createHash('sha256').update(text).digest('hex');
  const same = (actual, expected, label) => assert.deepEqual(ordered(clone(actual)), ordered(clone(expected)), label);
  const items = [clone(item), { t: 'kanji', id: '学', label: '学', ts: 100, started: 100 }];
  const keyOf = (value) => value.t + ':' + value.id;
  const fixedStart = Date.parse('2026-09-10T10:00:00Z');
  const mature = () => ({ due: '2026-09-13T10:00:00.000Z', last_review: '2026-09-01T10:00:00.000Z',
    state: 2, stability: 12, difficulty: 5, elapsed_days: 2, scheduled_days: 12, learning_steps: 0, reps: 4, lapses: 1 });
  const scope = 'Generated word and dictionary-backed kanji grade/dojo/undo handler contracts with frozen synthetic roots, default unfitted FSRS weights, fixed clock and controlled save acknowledgments. Resume serializes these modeled roots into a fresh fixture. No browser/native durability, native lost-ack recovery, fitted-weight initialization, retained dictionary provenance, sentence/question source contract, or undo initiated after reload claim.';
  const counters = {};
  let countEnabled = true;
  const count = (name) => { if (countEnabled) counters[name] = (counters[name] || 0) + 1; };
  const report = { format: 'kairo-learning-handler-properties', version: 1, scope, seed, requestedHistories: runs,
    replayHistory: onlyHistory, minimumCommands: 12, maximumCommands: 64, completedHistories: 0, totalCommands: 0,
    historyLengths: {}, deterministicReplays: 0, sourceSha256: hash(source), selectedProgramSha256: hash(program), testedDefinitions: [...names],
    verifierSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
    schedulerSha256: hash(readFileSync(resolve(root, 'vendor/ts-fsrs.mjs'))),
    counters, negativeControls: [], failures: [], pass: false };
  const receiptFile = resolve(out, 'learning-properties.json');
  const saveReport = () => writeFileSync(receiptFile, JSON.stringify(report, null, 2) + '\n');
  const sessionValue = (rv) => clone({ ...rv, pending: undefined });
  const unchanged = (f, before, rv, session, label) => {
    same(f.durable(), before, label + ': saved roots');
    same(sessionValue(rv), session, label + ': session');
  };
  const pendingCount = (f) => assert.equal(f.queue.length, 1, 'One pending intention must queue exactly one save');
  const advancedOnce = (rv, previousIx) => assert.equal(rv.ix, previousIx + 1, 'One acknowledged grade advances the cursor exactly once');
  const revokeTarget = (row, key, index) => same(row.slice(1), [key, 0, index], 'Undo targets its original grade row');
  // Deliberately corrupt only oracle inputs, never authored code or live data.
  // Each control must fail at the same assertion used by generated histories.
  const runNegativeControls = () => {
    for (const [name, action, expectedMessage] of [
      ['premature-root-publication', () => unchanged({ durable: () => ({ srs: { unexpected: true } }) }, { srs: {} }, { ix: 0 }, { ix: 0 }, 'before acknowledgment'), /before acknowledgment: saved roots/],
      ['duplicate-pending-write', () => pendingCount({ queue: [{}, {}] }), /One pending intention/],
      ['duplicate-session-advance', () => advancedOnce({ ix: 2 }, 0), /advances the cursor exactly once/],
      ['wrong-revocation-target', () => revokeTarget([fixedStart, 'word:学校', 0, 8], 'word:学校', 7), /original grade row/],
    ]) {
      let caught;
      try { action(); } catch (error) { caught = error; }
      const rejected = caught instanceof assert.AssertionError && expectedMessage.test(caught.message);
      report.negativeControls.push({ name, rejected, assertion: caught?.message?.split('\n')[0] || null });
      if (!rejected) {
        const error = new Error(name + ' must trip its intended assertion');
        error.propertyFailure = { negativeControl: name, reason: error.stack, observedError: caught?.stack || null };
        throw error;
      }
    }
  };
  const rngFor = (value) => {
    let state = value >>> 0;
    return (limit) => {
      state = (state + 0x6d2b79f5) >>> 0;
      let mixed = Math.imul(state ^ (state >>> 15), state | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) % limit;
    };
  };
  const scenarioNames = ['grade', 'reject-retry', 'undo-reject-retry', 'undo-conflict', 'replace-before-stage',
    'replace-after-stage', 'epoch-loss', 'stale-enrollment', 'disclosure-guard', 'concurrent-merge',
    'dojo-existing', 'kanji-unavailable', 'committed-lost-ack', 'ownership-after-publication', 'two-grade-two-undo'];
  const commandsFor = (historyIndex, historySeed) => {
    const random = rngFor(historySeed);
    const commands = [];
    const episodes = 2 + random(4);
    for (let episode = 0; episode < episodes; episode += 1) {
      const kind = episode === 0 ? historyIndex % scenarioNames.length : episode === 1 ? 0 : random(scenarioNames.length);
      const rating = 1 + random(4);
      const start = { op: 'start', type: kind === 11 ? 1 : random(2), dojo: kind === 10,
        declared: random(4) === 0 ? 0 : 1, shift: [-172800000, 0, 60000, 86400000][random(4)] };
      const gradeCommand = { op: 'grade', rating };
      const ok = { op: 'ack', save: true };
      const stage = { op: 'stage' };
      let part;
      switch (scenarioNames[kind]) {
        case 'reject-retry': part = [start, gradeCommand, { op: 'duplicate' }, stage, { op: 'ack', save: false }, gradeCommand, stage, ok]; break;
        case 'undo-reject-retry': part = [start, gradeCommand, { op: 'duplicate' }, stage, ok, { op: 'undo' }, { op: 'duplicate' }, stage,
          { op: 'ack', save: false }, { op: 'undo' }, stage, ok]; break;
        case 'undo-conflict': part = [start, gradeCommand, stage, ok, { op: 'undo' }, { op: 'external', kind: 'target' }, stage, ok]; break;
        case 'replace-before-stage': part = [start, gradeCommand, { op: 'replace' }, stage, ok]; break;
        case 'replace-after-stage': part = [start, gradeCommand, stage, { op: 'replace' }, ok]; break;
        case 'epoch-loss': part = [start, gradeCommand, stage, { op: 'epoch' }, ok]; break;
        case 'stale-enrollment': {
          const enrollment = random(2) ? 'suspend' : 'remove';
          part = [start, gradeCommand, { op: 'external', kind: enrollment }, stage, ok, { op: 'external', kind: 'enroll' }]; break;
        }
        case 'disclosure-guard': part = [start, { op: 'disclosure', revealed: false, declared: 1 }, gradeCommand,
          { op: 'disclosure', revealed: true, declared: null }, gradeCommand, { op: 'disclosure', revealed: true, declared: 1 }, gradeCommand, stage, ok]; break;
        case 'concurrent-merge': part = [start, gradeCommand, { op: 'external', kind: 'unrelated' }, { op: 'external', kind: 'target' }, stage, ok]; break;
        case 'dojo-existing': part = [start, { op: 'external', kind: 'mature' }, gradeCommand, { op: 'duplicate' }, stage, ok, { op: 'undo' }, stage, ok]; break;
        case 'kanji-unavailable': part = [start, { op: 'dictionary', available: false }, gradeCommand, stage, ok,
          { op: 'dictionary', available: true }, gradeCommand, stage, ok]; break;
        case 'committed-lost-ack': part = [start, gradeCommand, { op: 'duplicate' }, stage, { op: 'ack', save: true, lostAck: true }]; break;
        case 'ownership-after-publication': part = [start, gradeCommand, { op: 'duplicate' }, stage, { op: 'ack', save: true, loseOwnershipAfterPublish: true }]; break;
        case 'two-grade-two-undo': part = [start, { op: 'grade', rating: 1 }, stage, ok,
          { op: 'clock', shift: 86400000 }, { op: 'disclosure', revealed: true, declared: 1 }, gradeCommand, stage, ok,
          { op: 'undo' }, stage, ok, { op: 'undo' }, stage, ok]; break;
        default: part = [start, gradeCommand, { op: 'duplicate' }, stage, ok];
      }
      part.push({ op: 'resume' });
      // Two complete episodes always fit and always contain at least 12 commands.
      // Longer histories stop at a completed episode, never discard an in-flight save.
      if (commands.length + part.length > 64) break;
      commands.push(...part.map((command) => ({ ...command, scenario: scenarioNames[kind] })));
    }
    assert(commands.length >= 12 && commands.length <= 64);
    return commands;
  };
  const runHistory = async (historyIndex, historySeed, commands) => {
    let now = fixedStart;
    class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
    const initial = { taken: clone(items), srs: historySeed & 1 ? { [keyOf(items[0])]: mature(), [keyOf(items[1])]: mature() } : {},
      deepWords: { unrelated: { keep: historySeed } }, obslog: [], revlog: [], stats: {} };
    let f = fixture(initial, { Date: FixedDate, kanji: { 学: { m: 'synthetic learning' } } });
    let target = items[0], pending = null, lastSaved = null, lastPostCommitOwnershipLoss = false, rejectedGrade = false, acceptedGrades = 0;
    let sessionEntries = new WeakMap([[f.S.review, []]]);
    let sessionUndos = new WeakMap();
    const trace = [];
    const newSession = (dojo = false) => {
      const other = items.find((value) => keyOf(value) !== keyOf(target));
      const rv = { queue: [clone(target), clone(other)],
        ix: 0, revealed: true, declared: 1, done: { again: 0, hard: 0, good: 0, easy: 0 }, history: [] };
      f.S.review = rv; f.S.focus = dojo ? { mode: 'kanji' } : null; sessionEntries.set(rv, []);
      sessionUndos.set(rv, { count: 0, reinserted: false, days: new Set() });
      return rv;
    };
    const attemptGrade = (rating) => {
      const rv = f.S.review, current = rv.queue[rv.ix];
      const key = ['again', 'hard', 'good', 'easy'][rating - 1];
      const args = { rv, item: current, key, skey: keyOf(current), rating, now: new FixedDate(now), day: new FixedDate(now).toISOString().slice(0, 10) };
      return f.S.focus ? f.c.commitDrillGrade({ ...args, next: { state: 2, scheduled_days: 1 }, mode: 'kanji' }) : f.c.commitStandardGrade(args);
    };
    const stagePending = () => {
      assert(pending, 'Stage requires a generated pending intention');
      if (!pending.staged) {
        const before = f.durable();
        pending.before = before;
        const ownsSession = f.S.review === pending.rv && pending.rv.ix === pending.ix && pending.rv.queue[pending.ix] === pending.item;
        const entry = before.taken.find((value) => keyOf(value) === pending.key);
        let valid = ownsSession;
        if (pending.kind === 'grade') valid = valid && (pending.item.t !== 'kanji' || !!f.c.D.kanji[pending.item.id]?.m?.trim()) &&
          (pending.dojo || (!!entry && (before.srs[pending.key] !== undefined || Number.isFinite(entry.started)) && !before.suspended[pending.key]));
        if (pending.kind === 'undo' && !pending.entry.dojo) valid = valid &&
          JSON.stringify(ordered(before.srs[pending.entry.key] ?? null)) === JSON.stringify(ordered(pending.entry.after ?? null));
        pending.valid = !!valid; pending.staged = true;
        const staged = f.stage();
        assert.equal(!!staged.error, !pending.valid, 'Producer accepts exactly the independently modeled preconditions');
        unchanged(f, before, pending.rv, pending.session, 'dequeue before acknowledgment');
      }
    };
    const checkSaved = (p, before, after) => {
      const expected = clone(before);
      if (p.kind === 'grade' && p.dojo) {
        expected.obslog.push([p.at, 'dojo', p.key, p.rating, 'kanji']);
        count('dojoGrades'); if (before.srs[p.key]) count('dojoOnExistingSchedule');
      } else if (p.kind === 'grade') {
        const previous = before.srs[p.key], card = after.srs[p.key];
        assert(card, 'An accepted standard grade creates exactly its schedule');
        for (const field of ['stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'reps', 'lapses'])
          assert(Number.isFinite(card[field]), 'Finite scheduled ' + field);
        assert(card.stability > 0 && card.difficulty >= 1 && card.difficulty <= 10);
        assert([1, 2, 3].includes(card.state));
        assert(card.elapsed_days >= 0 && card.scheduled_days >= 0 && card.lapses >= 0);
        assert.equal(card.reps, (previous?.reps || 0) + 1, 'One intention increments repetitions exactly once');
        const anchor = Math.max(p.at, previous?.last_review ? Date.parse(previous.last_review) : p.at);
        assert.equal(Date.parse(card.last_review), anchor, 'New grade uses the effective monotonic scheduling anchor');
        assert(Number.isFinite(Date.parse(card.due)) && Date.parse(card.due) >= anchor, 'Newly scheduled due never precedes its effective anchor');
        const row = after.revlog[before.revlog.length]; assert(row && row.length === 12, 'One complete grade row');
        same(row.slice(0, 4), [p.at, p.key, p.effectiveRating, previous?.state || 0], 'Raw time, identity, effective grade and prior state');
        assert.equal(row[11], Date.parse(card.due)); assert.equal(row[10], card.scheduled_days);
        assert.equal(row[8], Number(card.stability.toFixed(4))); assert.equal(row[9], Number(card.difficulty.toFixed(4)));
        if (!previous?.last_review) same(row.slice(4, 8), [null, null, null, null], 'First grade has no invented prior memory');
        else {
          assert.equal(row[4], Number(((anchor - Date.parse(previous.last_review)) / 86400000).toFixed(3)));
          assert(row[5] === null || (Number.isFinite(row[5]) && row[5] >= 0 && row[5] <= 1));
          assert.equal(row[6], Number(previous.stability.toFixed(4))); assert.equal(row[7], Number(previous.difficulty.toFixed(4)));
          if (p.at < Date.parse(previous.last_review)) count('backwardAnchoredGrades');
        }
        expected.srs[p.key] = clone(card); // Numeric schedule is validated above, not recomputed with FSRS.
        expected.revlog.push(clone(row)); // Prefix/count and every row field are checked independently.
        const day = expected.stats[p.day] || { n: 0, again: 0 };
        day.n = (day.n || 0) + 1;
        if (p.effectiveRating === 1) day.again = (day.again || 0) + 1;
        if (previous === undefined) day.nnew = (day.nnew || 0) + 1;
        expected.stats[p.day] = day;
        count('standardGrades'); count(p.item.t + 'Grades'); count('rating' + p.effectiveRating);
        if (p.declared === 0) count('notRecalledForcedAgain');
        if (rejectedGrade) { count('explicitGradeRetry'); rejectedGrade = false; }
      } else if (p.entry.dojo) {
        expected.obslog.push([p.at, 'dojo', p.entry.key, 0]); count('dojoUndos');
      } else {
        const entry = p.entry;
        if (entry.previous === undefined) delete expected.srs[entry.key]; else expected.srs[entry.key] = clone(entry.previous);
        expected.revlog.push([p.at, entry.key, 0, entry.logIndex]);
        revokeTarget(after.revlog[before.revlog.length], entry.key, entry.logIndex);
        const day = expected.stats[entry.day]; assert(day, 'A generated undo has its accepted grade counters');
        day.n = Math.max(0, (day.n || 0) - 1);
        if (entry.rating === 1) day.again = Math.max(0, (day.again || 0) - 1);
        if (entry.previous === undefined && day.nnew) day.nnew -= 1;
        count('standardUndos');
      }
      same(after, expected, 'Accepted operation changes only its independently modeled roots and counters');
    };
    try {
      for (let index = 0; index < commands.length; index += 1) {
        const command = commands[index]; trace.push({ index, ...command, beforeTime: now }); count('command:' + command.op);
        switch (command.op) {
          case 'start': {
            assert.equal(pending, null); rejectedGrade = false; target = items[command.type]; now += command.shift;
            if (command.shift < 0) count('backwardClockMoves'); else if (command.shift === 0) count('equalClockMoves');
            const rv = newSession(command.dojo); rv.declared = command.declared; break;
          }
          case 'clock': assert.equal(pending, null); now += command.shift; count('explicitClockMoves'); break;
          case 'disclosure': assert.equal(pending, null); Object.assign(f.S.review, { revealed: command.revealed, declared: command.declared }); break;
          case 'dictionary': if (command.available) f.c.D.kanji.学 = { m: 'synthetic learning' }; else delete f.c.D.kanji.学; break;
          case 'grade': {
            assert.equal(pending, null); const rv = f.S.review, before = f.durable(), session = sessionValue(rv);
            const allowed = !!f.S.focus || (rv.revealed && rv.declared !== null);
            const promise = attemptGrade(command.rating);
            unchanged(f, before, rv, session, 'grade activation before acknowledgment');
            if (!allowed) { assert.equal(await promise, false); assert.equal(f.queue.length, 0); count('disclosureRejections'); break; }
            pendingCount(f);
            const current = rv.queue[rv.ix], dojo = !!f.S.focus;
            const effectiveRating = !dojo && rv.declared === 0 ? 1 : command.rating;
            pending = { kind: 'grade', rv, item: current, ix: rv.ix, key: keyOf(current), dojo, rating: command.rating, effectiveRating,
              gradeKey: ['again', 'hard', 'good', 'easy'][effectiveRating - 1], declared: rv.declared, day: new FixedDate(now).toISOString().slice(0, 10),
              at: now, epoch: f.c.recordEpoch, session, promise };
            break;
          }
          case 'undo': {
            assert.equal(pending, null); const rv = f.S.review, before = f.durable(), session = sessionValue(rv);
            const entry = sessionEntries.get(rv).at(-1); assert(entry, 'Undo requires independently tracked accepted history');
            const promise = byClass(f.render('renderReviewUndo', rv), 'review-undo').fire();
            unchanged(f, before, rv, session, 'undo activation before acknowledgment'); pendingCount(f);
            pending = { kind: 'undo', rv, item: rv.queue[rv.ix], ix: rv.ix, entry, key: entry.key, at: now, epoch: f.c.recordEpoch, session, promise };
            break;
          }
          case 'duplicate': {
            assert(pending); const before = f.durable(), session = sessionValue(pending.rv);
            const value = pending.kind === 'grade' ? await attemptGrade(pending.rating) : await byClass(f.render('renderReviewUndo', pending.rv), 'review-undo').fire();
            assert.equal(value, false); pendingCount(f); unchanged(f, before, pending.rv, session, 'duplicate pending activation'); count('pendingDuplicates'); break;
          }
          case 'stage': stagePending(); break;
          case 'external': {
            const before = f.durable(), key = keyOf(target); let patch;
            if (command.kind === 'unrelated') {
              patch = { srs: { ...before.srs, 'word:unrelated': mature() }, revlog: [...before.revlog, [now, 'word:unrelated', 3, 2]],
                obslog: [...before.obslog, [now, 'synthetic-external', 'word:unrelated', 1]],
                stats: { ...before.stats, '1999-01-01': { n: historyIndex + 2, again: 1, nnew: 1 } },
                deepWords: { ...before.deepWords, preserved: { historyIndex, index } } }; count('concurrentUnrelatedChanges');
            } else if (command.kind === 'target' || command.kind === 'mature') {
              patch = { srs: { ...before.srs, [key]: command.kind === 'mature' ? mature() : { ...(before.srs[key] || mature()), reps: 90 + index } } };
              if (pending?.kind === 'undo') count('undoConflictsInjected'); else count('concurrentTargetChanges');
            } else if (command.kind === 'remove') patch = { taken: before.taken.filter((value) => keyOf(value) !== key) };
            else if (command.kind === 'suspend') patch = { suspended: { ...before.suspended, [key]: now } };
            else if (command.kind === 'enroll') {
              const suspended = { ...before.suspended }; delete suspended[key];
              patch = { taken: [...before.taken.filter((value) => keyOf(value) !== key), clone(target)], suspended };
            } else assert.fail('Unknown generated external change');
            f.external(patch); same(f.durable(), { ...before, ...patch }, 'Only explicit fixture external changes publish'); break;
          }
          case 'replace': assert(pending); newSession(false); count('sessionReplacements'); break;
          case 'epoch': assert(pending); f.c.recordEpoch += 1; count('ownershipChanges'); break;
          case 'ack': {
            stagePending(); const p = pending, before = f.durable(), replacement = f.S.review !== p.rv ? sessionValue(f.S.review) : null;
            const saved = command.save && p.valid && p.epoch === f.c.recordEpoch;
            const advance = saved && !command.lostAck && !command.loseOwnershipAfterPublish && f.S.review === p.rv;
            let publishedBeforeOwnershipLoss = null;
            if (command.loseOwnershipAfterPublish) assert(saved, 'The postcommit ownership case must first save under its original owner');
            f.ack(command.save, { acknowledge: !command.lostAck, afterPublish: command.loseOwnershipAfterPublish ? () => {
              publishedBeforeOwnershipLoss = f.durable();
              assert.notDeepEqual(publishedBeforeOwnershipLoss, before, 'Complete saved grade roots exist before ownership changes');
              same(sessionValue(p.rv), p.session, 'Publication alone does not resume or advance the awaiting handler');
              assert.equal(f.c.recordEpoch, p.epoch, 'Original owner still holds the publication boundary');
              f.c.recordEpoch += 1;
              trace.at(-1).publicationBoundary = { savedBeforeOwnershipLoss: true, oldEpoch: p.epoch, newEpoch: f.c.recordEpoch };
            } : undefined });
            const returned = await p.promise;
            if (command.loseOwnershipAfterPublish) {
              assert(publishedBeforeOwnershipLoss, 'Ownership-loss callback ran only after saved publication');
              same(f.durable(), publishedBeforeOwnershipLoss, 'Ownership loss retains the complete published roots');
              count('postCommitOwnershipLoss');
            }
            assert.equal(returned, !!advance, 'Return value reports acknowledged current-session success, not inferred durability');
            assert.equal(f.queue.length, 0); assert.equal(p.rv.pending, null);
            if (saved) {
              checkSaved(p, before, f.durable()); count('savedOperations');
              if (p.kind === 'grade') acceptedGrades += 1;
            }
            else { same(f.durable(), before, 'Rejected or old-owner save preserves every saved root'); count('rejectedOperations'); }
            if (advance && p.kind === 'grade') {
              advancedOnce(p.rv, p.ix);
              assert.equal(p.rv.history.length, p.session.history.length + 1);
              const done = { ...p.session.done, [p.gradeKey]: p.session.done[p.gradeKey] + 1 }; same(p.rv.done, done, 'One grade increments exactly its sitting counter');
              const card = p.dojo ? { state: 2, scheduled_days: 1 } : f.durable().srs[p.key];
              const reinserted = [1, 3].includes(card.state) && card.scheduled_days < 1;
              same(p.rv.queue, reinserted ? [...p.session.queue, p.item] : p.session.queue, 'Only a short learning step is reinserted once');
              const entry = { key: p.key, previous: before.srs[p.key], after: f.durable().srs[p.key], day: p.day, rating: p.effectiveRating,
                logIndex: before.revlog.length, dojo: p.dojo, ix: p.ix, session: p.session, reinserted };
              sessionEntries.get(p.rv).push(entry);
              if (sessionEntries.get(p.rv).length === 2) count('sameSittingTwoGrades');
              if (!p.dojo) {
                const actualEntry = p.rv.history.at(-1);
                same(actualEntry.prev ?? null, entry.previous ?? null, 'Undo snapshot is the dequeue-time schedule');
                assert.equal(actualEntry.logIx, entry.logIndex);
              }
            } else if (advance) {
              const entry = sessionEntries.get(p.rv).pop(); assert.equal(entry, p.entry);
              assert.equal(p.rv.ix, entry.ix); assert.equal(p.rv.history.length, p.session.history.length - 1);
              same(p.rv.done, entry.session.done, 'Undo restores the independent sitting counter snapshot');
              same(p.rv.queue, entry.session.queue, 'Undo removes only its own short-step reinsertion');
              const undone = sessionUndos.get(p.rv); undone.count += 1;
              undone.reinserted ||= entry.reinserted; undone.days.add(entry.day);
              if (undone.count === 2) {
                count('sameSittingTwoUndos');
                if (undone.reinserted) count('twoUndosWithReinsertion');
                if (undone.days.size === 2) count('twoUndosAcrossDays');
              }
            } else {
              same(sessionValue(p.rv), p.session, 'A failed or superseded acknowledgment never advances the old sitting');
              if (p.kind === 'grade') {
                count('unadvancedGrades');
                if (!saved) { rejectedGrade = true; count('preCommitGradeRejections'); }
              }
              else { count('undoRejections'); if (!p.valid) count('undoConflictRejections'); }
            }
            if (replacement) same(sessionValue(f.S.review), replacement, 'Late save cannot advance replacement sitting');
            if (advance) { assert.equal(p.rv.revealed, false); assert.equal(p.rv.declared, null); }
            if (command.lostAck && saved) count('simulatedCommittedLostAcks');
            lastSaved = saved; lastPostCommitOwnershipLoss = !!command.loseOwnershipAfterPublish; pending = null; break;
          }
          case 'resume': {
            assert.equal(pending, null); assert.equal(f.queue.length, 0); const before = f.durable();
            f = fixture(clone(before), { Date: FixedDate, kanji: { 学: { m: 'synthetic learning' } } });
            sessionEntries = new WeakMap([[f.S.review, []]]); sessionUndos = new WeakMap(); rejectedGrade = false;
            same(f.durable(), before, 'Serialize and resume preserves all modeled saved roots');
            assert.equal(f.S.review.history.length, 0); assert.equal(f.S.review.ix, 0); assert.equal(f.queue.length, 0);
            if (lastSaved === true) count('resumesAfterSave'); else if (lastSaved === false) count('resumesAfterRejection');
            if (lastPostCommitOwnershipLoss) count('resumesAfterPostCommitOwnershipLoss');
            count('resumes'); break;
          }
          default: assert.fail('Unknown generated command: ' + command.op);
        }
      }
      assert.equal(pending, null); assert.equal(f.queue.length, 0);
      assert(acceptedGrades > 0, 'A completed history must exercise an accepted grade, not only no-ops or rejected preconditions');
      return { semanticSha256: hash(JSON.stringify(ordered(f.durable()))), trace };
    } catch (error) {
      error.propertyFailure = { historyIndex, historySeed, failedCommandIndex: trace.length - 1, trace,
        fullCommands: commands, savedRoots: f.durable(), session: sessionValue(f.S.review), reason: error.stack };
      throw error;
    }
  };
  const semanticDigests = [];
  try {
    runNegativeControls();
    for (let offset = 0; offset < runs; offset += 1) {
      const historyIndex = onlyHistory ?? offset;
      const historySeed = (seed ^ Math.imul(historyIndex + 1, 0x9e3779b1)) >>> 0;
      const commands = commandsFor(historyIndex, historySeed);
      const result = await runHistory(historyIndex, historySeed, commands);
      // Replay every scenario twice through the first 30 histories, plus a
      // deterministic sparse sample. This is a separate repeatability check;
      // it is not the reference model and does not inflate coverage counts.
      if (historyIndex < 30 || historyIndex % 97 === 0) {
        countEnabled = false;
        try {
          const replayed = await runHistory(historyIndex, historySeed, commandsFor(historyIndex, historySeed));
          assert.equal(replayed.semanticSha256, result.semanticSha256, 'Identical commands, seed and clock replay to identical modeled roots');
          report.deterministicReplays += 1;
        } finally { countEnabled = true; }
      }
      semanticDigests.push(result.semanticSha256);
      report.completedHistories += 1; report.totalCommands += commands.length;
      report.historyLengths[commands.length] = (report.historyLengths[commands.length] || 0) + 1;
    }
    // The main gate always requests >=1,000 histories. Short runs are explicit
    // diagnostic replays and may not claim the campaign's coverage floor.
    report.coverageFloorApplicable = runs >= 1000 && onlyHistory === null;
    if (report.coverageFloorApplicable) {
      const required = ['standardGrades', 'wordGrades', 'kanjiGrades', 'rating1', 'rating2', 'rating3', 'rating4', 'pendingDuplicates',
        'preCommitGradeRejections', 'explicitGradeRetry', 'standardUndos', 'undoRejections', 'undoConflictRejections', 'resumesAfterSave',
        'resumesAfterRejection', 'backwardClockMoves', 'equalClockMoves', 'backwardAnchoredGrades', 'dojoOnExistingSchedule', 'dojoUndos',
        'disclosureRejections', 'notRecalledForcedAgain', 'concurrentUnrelatedChanges', 'concurrentTargetChanges', 'sessionReplacements',
        'ownershipChanges', 'simulatedCommittedLostAcks', 'postCommitOwnershipLoss', 'resumesAfterPostCommitOwnershipLoss',
        'sameSittingTwoGrades', 'sameSittingTwoUndos', 'twoUndosWithReinsertion', 'twoUndosAcrossDays'];
      report.coverageFloors = Object.fromEntries(required.map((name) => [name, 10]));
      for (const name of required) assert((counters[name] || 0) >= 10, 'Non-vacuity coverage floor: ' + name);
    }
    report.semanticDigest = hash(semanticDigests.join('\n'));
    report.pass = true;
  } catch (error) {
    const failure = error.propertyFailure || { reason: error.stack };
    if (failure.historyIndex !== undefined) failure.replay = 'node prototypes/corridor/tools/verify-learning-record.mjs --property --seed ' + seed + ' --runs 1 --history ' + failure.historyIndex;
    report.failures.push(failure);
    throw error;
  } finally { saveReport(); }
  return report;
}
let properties;
if (propertyMode) await check('generated-learning-handler-histories', async () => { properties = await propertyChecks(); });

async function browserChecks() {
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2' };
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    response.setHeader('cache-control', 'no-store');
    if (pathname === '/learning-setup') { response.setHeader('content-type', 'text/html'); response.end('<!doctype html><title>Synthetic learning setup</title>'); return; }
    const file = resolve(site, pathname === '/' ? 'index.html' : pathname.slice(1));
    if (!file.startsWith(site + sep) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('content-type', mime[extname(file)] || 'application/octet-stream'); response.end(readFileSync(file));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
  assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
  const disk = async (page) => JSON.parse(await page.evaluate(async () => {
    const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
    const db = await new Promise((done, fail) => {
      const request = indexedDB.open(installation.databaseName);
      request.onsuccess = () => done(request.result); request.onerror = () => fail(request.error);
    });
    try {
      return await new Promise((done, fail) => {
        const tx = db.transaction('kairo_replication_rows', 'readonly');
        const request = tx.objectStore('kairo_replication_rows').getAll();
        tx.oncomplete = () => {
          const row = request.result.filter((value) => value.kind === 'document').map((value) => JSON.parse(value.text))
            .find((value) => value.collection === 'learner-record' && value.id === 'current');
          done(JSON.stringify(row.value));
        };
        tx.onabort = () => fail(tx.error);
      });
    } finally { db.close(); }
  }));
  const boot = async (page, aiQuiz = null, entry = 'shelf') => {
    await page.goto(origin + '/learning-setup');
    await page.evaluate(async (initialQuiz) => {
      localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1,
        taken: ['学校', '電話', '先生', '時間', '天気'].map((id) => ({ t: 'word', id, label: id, ts: 1700000000000, started: 1700000000000 })),
        aiQuiz: initialQuiz, srs: {}, revlog: [], obslog: [], stats: {}, suspended: {},
        srsPrefs: { newPerDay: 20, reviewLimit: 20 }, futureRoot: { keep: 'synthetic-learning-future' },
      }));
      const db = await new Promise((done, fail) => {
        const request = indexedDB.open('kairo-ai-log', 3);
        request.onupgradeneeded = () => {
          const rows = request.result.createObjectStore('turns', { keyPath: 'id', autoIncrement: true });
          rows.createIndex('logical-id', 'turn.id'); request.result.createObjectStore('imports', { keyPath: 'id' });
        };
        request.onsuccess = () => done(request.result); request.onerror = () => fail(request.error);
      }); db.close();
    }, aiQuiz);
    await page.goto(origin + '/index.html?entry=' + entry + '&ui=bi');
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    assert.equal(await page.locator('#store-alert').isVisible(), false, 'Synthetic legacy record migrated without warning');
  };
  const fault = async (page, target) => {
    const before = await disk(page);
    await page.evaluate(({ target, beforeText }) => {
      const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
      const nativePut = globalThis.IDBObjectStore.prototype.put;
      const matched = new WeakSet();
      const state = window.__learningFault = { fired: false, target, nativePut };
      globalThis.IDBObjectStore.prototype.put = function (...args) {
        const request = nativePut.apply(this, args);
        if (state.fired || this.transaction.db.name !== installation.databaseName || this.name !== 'kairo_replication_rows' || args[0]?.kind !== 'document') return request;
        const row = JSON.parse(args[0].text);
        if (row.collection === 'learner-record' && JSON.stringify(row.value[target]) !== beforeText) matched.add(this.transaction);
        if (row.collection === 'kairo:record-host-commands' && matched.has(this.transaction)) {
          state.fired = true;
          throw new DOMException('Synthetic learning quota fault after learner-record put', 'QuotaExceededError');
        }
        return request;
      };
    }, { target, beforeText: JSON.stringify(before[target]) });
    return before;
  };
  const failed = async (page, before) => {
    await page.waitForFunction(() => window.__learningFault?.fired === true);
    await page.locator('#store-alert').waitFor({ state: 'visible' });
    assert.deepEqual(await disk(page), before, 'Native transaction rejection preserved the entire acknowledged learner record');
  };
  const pollDisk = async (page, predicate) => {
    for (let i = 0; i < 100; i += 1) {
      const state = await disk(page); if (predicate(state)) return state;
      await new Promise((done) => setTimeout(done, 25));
    }
    assert.fail('Expected native persisted learner state did not arrive');
  };
  const finishLesson = async (page, reject = false) => {
    await page.locator('#lessons-link').click(); await page.locator('.lesson-row').first().click();
    let learned = 0;
    while (await page.locator('.lesson-option').count() === 0) {
      assert(learned++ < 12); await page.locator('#lesson-next').click();
    }
    let before;
    for (let index = 0; index < learned; index += 1) {
      await page.locator('.lesson-option').first().click();
      if (reject && index + 1 === learned) before = await fault(page, 'lessonsDone');
      await page.locator('#lesson-next').click();
    }
    return { learned, before };
  };
  try {
    for (const engine of engines) {
      const browser = await ({ chromium, webkit }[engine]).launch(engine === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || undefined } : {});
      try {
        const journey = async (name, action) => {
          await check(engine + ': ' + name, async () => {
            const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
            const errors = [];
            await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
            context.setDefaultTimeout(15000);
            const page = await context.newPage(); page.on('pageerror', (error) => errors.push(error.message));
            try { await action(page); assert.deepEqual(errors, [], 'No unhandled browser errors'); }
            finally { await context.close(); }
          });
        };
        await journey('quiz-answer-rejection-and-reload-preserve-the-unanswered-question', async (page) => {
          await boot(page, quiz()); await page.locator('#tray').click(); await page.locator('#aiq-resume').click();
          const before = await fault(page, 'aiQuiz');
          await page.locator('.lesson-option').first().evaluate((node) => { node.click(); node.click(); });
          await failed(page, before); assert.equal(await page.locator('.aiq-why').count(), 0); assert.equal(await page.locator('#aiq-next').count(), 0);
          await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === '1');
          await page.locator('#tray').click(); await page.locator('#aiq-resume').click(); assert.equal(await page.locator('.aiq-q').textContent(), questions[0].q);
          await page.locator('.lesson-option').first().click(); await page.locator('.aiq-why').waitFor();
          const after = await disk(page); assert.equal(after.aiQuiz.correct, 1); assert.equal(after.aiQuiz.picked, 0); assert.deepEqual(after.srs, before.srs);
        });
        await journey('quiz-next-and-close-reject-without-advancing-or-leaving', async (page) => {
          await boot(page, { ...quiz(), picked: 0, correct: 1 }); await page.locator('#tray').click(); await page.locator('#aiq-resume').click();
          const before = await fault(page, 'aiQuiz'); await page.locator('#aiq-next').click(); await failed(page, before);
          assert.equal(await page.locator('.aiq-q').textContent(), questions[0].q); assert.equal(await page.locator('.aiq-why').count(), 1);
        });
        await journey('quiz-close-rejection-keeps-the-completed-run', async (page) => {
          await boot(page, { ...quiz(), ix: 3, correct: 1 }); await page.locator('#tray').click(); await page.locator('#aiq-resume').click();
          const before = await fault(page, 'aiQuiz'); await page.locator('#aiq-close').click(); await failed(page, before);
          assert.equal(await page.locator('#aiq-close').count(), 1);
        });
        await journey('recall-declaration-rejection-keeps-the-answer-concealed', async (page) => {
          await boot(page); await page.locator('#tray').click(); await page.locator('#review-start').click();
          const before = await fault(page, 'obslog'); await page.locator('#declare-recalled').click(); await failed(page, before);
          assert.equal(await page.locator('#declare-recalled').count(), 1); assert.equal(await page.locator('.g-good').count(), 0);
        });
        await journey('review-grade-rejection-keeps-card-schedule-log-and-stats', async (page) => {
          await boot(page); await page.locator('#tray').click(); await page.locator('#review-start').click(); await page.locator('#declare-recalled').click();
          await page.locator('.g-good').waitFor(); const label = await page.locator('.review-front').textContent(); const before = await fault(page, 'srs');
          await page.locator('.g-good').evaluate((node) => { node.click(); node.click(); }); await failed(page, before);
          assert.equal(await page.locator('.review-front').textContent(), label); assert.equal(await page.locator('.g-good').count(), 1);
        });
        await journey('review-grade-and-undo-persist-one-schedule-with-an-append-only-revocation', async (page) => {
          await boot(page); await page.locator('#tray').click(); await page.locator('#review-start').click(); await page.locator('#declare-notyet').click();
          await page.locator('.g-again').waitFor(); assert.equal(await page.locator('.g-good').count(), 0);
          await page.locator('.g-again').click(); const graded = await pollDisk(page, (state) => state.revlog.length === 1);
          assert.equal(graded.revlog[0][2], 1); const key = graded.revlog[0][1]; assert(graded.srs[key]);
          await page.locator('#zen-more').click(); await page.locator('.review-undo').click();
          const undone = await pollDisk(page, (state) => state.revlog.length === 2);
          assert.deepEqual(undone.revlog[1].slice(1), [key, 0, 0]); assert.equal(undone.srs[key], undefined);
          assert.equal(Object.values(undone.stats).reduce((n, value) => n + (value.n || 0), 0), 0);
        });
        await journey('lesson-completion-rejection-keeps-the-last-answer', async (page) => {
          await boot(page); const { before } = await finishLesson(page, true); await failed(page, before);
          assert.equal(await page.locator('#lesson-next').count(), 1); assert.equal(await page.locator('#lesson-enroll-all').count(), 0);
        });
        await journey('lesson-completion-and-explicit-batch-enrollment-are-separate-durable-actions', async (page) => {
          await boot(page); const before = await disk(page); const { learned } = await finishLesson(page);
          await page.locator('#lesson-enroll-all').waitFor(); const completed = await disk(page);
          assert.deepEqual(completed.taken, before.taken); assert.equal(completed.obslog.filter((row) => row[1] === 'lesson').length, learned);
          await page.locator('#lesson-enroll-all').evaluate((node) => { node.click(); node.click(); });
          await page.locator('#lesson-enroll-all').waitFor({ state: 'detached' }); const enrolled = await disk(page);
          assert(enrolled.taken.length > before.taken.length); assert.equal(new Set(enrolled.taken.map((row) => row.t + ':' + row.id)).size, enrolled.taken.length);
          assert.deepEqual(enrolled.srs, before.srs); assert.deepEqual(enrolled.revlog, before.revlog); assert.deepEqual(enrolled.futureRoot, before.futureRoot);
        });
        await journey('practice-answer-rejection-keeps-the-question-unanswered', async (page) => {
          await boot(page); await page.locator('#mock-link').click(); await page.locator('#exam-legacy').click(); await page.locator('[data-mock-set="n5-01"]').click();
          await page.locator('[data-mock-opt="0"]').waitFor(); const before = await fault(page, 'assessmentLibrary');
          await page.locator('[data-mock-opt="0"]').evaluate((node) => { node.click(); node.click(); }); await failed(page, before);
          assert.equal(await page.locator('#mock-next').isDisabled(), true);
          assert.equal(await page.locator('[data-mock-opt][aria-pressed="true"]').count(), 0);
        });
        await journey('practice-navigation-rejection-keeps-the-acknowledged-answer-and-question', async (page) => {
          await boot(page); await page.locator('#mock-link').click(); await page.locator('#exam-legacy').click(); await page.locator('[data-mock-set="n5-01"]').click();
          await page.locator('[data-mock-opt="0"]').click(); await page.locator('[data-mock-opt="0"][aria-pressed="true"]').waitFor();
          const question = await page.locator('.mock-q').textContent(); const before = await fault(page, 'assessmentLibrary');
          await page.locator('#mock-next').click(); await failed(page, before);
          assert.equal(await page.locator('.mock-q').textContent(), question);
          assert.equal(await page.locator('[data-mock-opt="0"]').getAttribute('aria-pressed'), 'true');
        });
        await journey('probe-rejection-keeps-card-and-evidence-unminted', async (page) => {
          await boot(page, null, 'drift'); await page.locator('#ginga-symbol').click(); await page.locator('.nav-dojo').click();
          await page.locator('.focus-mode').filter({ hasText: 'yomi probe' }).click(); await page.locator('.focus-start').click();
          await page.locator('#probe-reveal').click(); const word = await page.locator('.review-front').textContent(); const before = await fault(page, 'obslog');
          await page.locator('[data-probe="wrong"]').evaluate((node) => { node.click(); node.click(); }); await failed(page, before);
          assert.equal(await page.locator('.review-front').textContent(), word); assert.equal(await page.locator('[data-probe="wrong"]').count(), 1);
        });
        await journey('probe-miss-atomically-mints-one-card-and-one-observation', async (page) => {
          await boot(page, null, 'drift'); await page.locator('#ginga-symbol').click(); await page.locator('.nav-dojo').click();
          await page.locator('.focus-mode').filter({ hasText: 'yomi probe' }).click(); await page.locator('.focus-start').click();
          await page.locator('#probe-reveal').click(); const word = await page.locator('.review-front').textContent(); const before = await disk(page);
          await page.locator('[data-probe="wrong"]').evaluate((node) => { node.click(); node.click(); });
          const after = await pollDisk(page, (state) => state.obslog.some((row) => row[1] === 'probe'));
          assert.equal(after.taken.filter((row) => row.t === 'word' && row.id === word).length, 1);
          assert.equal(after.obslog.filter((row) => row[1] === 'probe' && row[2] === 'word:' + word).length, 1);
          assert.equal(after.taken.length, before.taken.length + 1); assert.deepEqual(after.srs, before.srs); assert.deepEqual(after.revlog, before.revlog);
        });
      } finally { await browser.close(); }
    }
  } finally { await new Promise((done) => server.close(done)); }
}
if (browserMode) await browserChecks();

const receipt = { format: 'kairo-learning-acknowledgment-tests', version: 1,
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  artifactSha256: artifact?.artifactSha256,
  ...(propertyMode ? { properties: properties || { pass: false, receipt: 'learning-properties.json' } } : {}),
  testedDefinitions: [...names], scope: browserMode ? 'Actual immutable staged browser UI and independently read native IndexedDB, plus controlled frozen-root acknowledgment tests' : 'Actual authored handlers with frozen synthetic roots and controlled save acknowledgments; no browser-storage claim',
  results, pass: results.every((result) => result.pass) };
writeFileSync(resolve(out, 'learning-record.json'), JSON.stringify(receipt, null, 2) + '\n');
if (!receipt.pass) process.exitCode = 1;
