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
  'advanceReviewSession', 'commitReviewAction', 'commitDrillGrade', 'commitStandardGrade',
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
function fixture(overrides = {}) {
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
    S, Date, Math, JSON, Set, Map, console, fsrsApi, scheduler: fsrsApi.fsrs({ enable_fuzz: false }), recordEpoch: 1,
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
    D: { exampleBank: new Map(), dict: {}, kanji: {} },
    lookup: (id) => ({ r: 'がっこう', m: [id], seq: 'synthetic-' + id }),
    findExamples: () => [], takenContext: () => null, ensureBankExamples: async () => [],
    reviewBack: () => ({ reading: '', senses: ['synthetic meaning'] }),
    isLeech: () => false, renderAiCoach: () => {},
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
  const ack = (save = true) => {
    const pending = stage(); queue.shift();
    const ok = save && !pending.error && pending.epoch === sandbox.recordEpoch;
    if (ok) { durable = freeze(ordered(clone({ ...durable, ...pending.patch }))); Object.assign(S, durable); }
    pending.settle(ok);
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
          await boot(page); await page.locator('#mock-link').click(); await page.locator('[data-mock-set="n5-01"]').click();
          await page.locator('[data-mock-opt="0"]').waitFor(); const before = await fault(page, 'assessmentLibrary');
          await page.locator('[data-mock-opt="0"]').evaluate((node) => { node.click(); node.click(); }); await failed(page, before);
          assert.equal(await page.locator('#mock-next').isDisabled(), true);
          assert.equal(await page.locator('[data-mock-opt][aria-pressed="true"]').count(), 0);
        });
        await journey('practice-navigation-rejection-keeps-the-acknowledged-answer-and-question', async (page) => {
          await boot(page); await page.locator('#mock-link').click(); await page.locator('[data-mock-set="n5-01"]').click();
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
  testedDefinitions: [...names], scope: browserMode ? 'Actual immutable staged browser UI and independently read native IndexedDB, plus controlled frozen-root acknowledgment tests' : 'Actual authored handlers with frozen synthetic roots and controlled save acknowledgments; no browser-storage claim',
  results, pass: results.every((result) => result.pass) };
writeFileSync(resolve(out, 'learning-record.json'), JSON.stringify(receipt, null, 2) + '\n');
if (!receipt.pass) process.exitCode = 1;
