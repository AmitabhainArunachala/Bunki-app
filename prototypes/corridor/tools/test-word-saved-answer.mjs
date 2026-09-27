/**
 * D23 · the saved word answer: extracted-function tests over the real committed data.
 *
 * The ACTUAL corridor.js definitions are lifted by name (the TS-AST seam of
 * verify-corridor-storage-integrity.mjs). They run over the served dict-v2/index.json, dict.json
 * and words.json. Fixture values follow the independent D23 acceptance ledger (F01–F07, H01–H10,
 * the F04 content addendum), copied here literally.
 *
 * The rows are exactly INVENTORY (word-saved-answer-controls.mjs): F0, then for each case a
 * `.setup` row that builds and checks its fixtures, and a behaviour row that uses them. A
 * behaviour row whose setup did not complete fails with "setup did not complete". Under a
 * release gate (KAIRO_EVIDENCE_DIR) the run writes a 'checks' report with one row per inventory id
 * plus `inventory-exact`, so a removed, renamed or duplicated row fails the gate.
 *
 *   node prototypes/corridor/tools/test-word-saved-answer.mjs               the rows
 *   node prototypes/corridor/tools/test-word-saved-answer.mjs --control C9r one control's literal edits applied first
 *   node prototypes/corridor/tools/test-word-saved-answer.mjs --controls    every control, bounded and adjudicated
 *
 * A row run's first stdout line is its source marker: the control applied (or baseline) and the
 * sha256 of the exact source it lifted, which the control runner requires.
 *
 * Disclosed boundaries:
 *   - Commit hosts are synchronous stubs, not record-app durability. A committed patch updates the
 *     latest record only; the render-time S is not republished.
 *   - The actual mini (showMini) and its registered click handler run against a small fake DOM:
 *     FakeElement, document.querySelectorAll → [], document.body.append no-op, fixed
 *     getBoundingClientRect, window.innerWidth 400. removeMini is a no-op; syncReaderTakeSeal only
 *     counts, so a test sees the handler reach its end.
 *   - The suppression host runs the host's 'remove' transition on the actual modules, staged by the
 *     repository's own builder (as verify-assessment-learning.mjs stages them): the command through
 *     parseAssessmentSuppressionInput, the root through parseAssessmentLearning before and after, and
 *     the suppression through suppressAssessmentLearning. The composition — the taken filter and the
 *     v:2 stamp of assessment-finalization.mjs:163–167 and :176 — is mirrored in three lines. Revision,
 *     receipt and sync-operation handling are not exercised.
 *   - No browser, IndexedDB, service worker, native export/restore or ACK ordering. The D11 reader
 *     hold stays on.
 *   - D23 search stand-in rows (X, S, N, V, P3). The page search (searchResults, renderSearchResults),
 *     the word sheet's entry block (renderDictionaryHomographs), the full note (renderWordCaptureNote)
 *     and the lesson and older-set end screens (renderLessons, renderMockResult) run against the same
 *     fake DOM; render() is a no-op and go() only records the node it would open. Search runs in two
 *     shapes: 'main', the standalone's inline scan, and 'worker', the served path through the actual
 *     requestDictionarySearch → settle timer → dispatchQueuedDictionarySearch → reply handling, where
 *     dictionaryWorkerRequest is answered at once by dictionary-worker.js's own scoreDictionary, lifted
 *     by name, over the same data, the request and the reply each crossing as a JSON clone. There is no
 *     Worker, postMessage or wall-clock timing: the rows step the clock and run the one timer. The
 *     index holds kanji rows (served kanji.json) but no grammar or particle rows. The store alert
 *     (recordFailure) runs in a context of its own. The critic's 試 fixtures are literal rows of the
 *     index's shape, not a claim about Japanese content. A button's text is its English label; the
 *     Japanese label rides along (labelJa) for the route-label rows.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import * as fsrsApi from '../vendor/ts-fsrs.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { INVENTORY, WORD_CONTROLS, applyControl, inventoryReport, runControls, sha256, sourceMarker, stageAssessmentAuthority } from './word-saved-answer-controls.mjs';

const here = (path) => new URL(path, import.meta.url);
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const argValue = (flag) => { const at = process.argv.indexOf(flag); return at >= 0 ? process.argv[at + 1] : null; };

if (process.argv.includes('--controls')) {
  const report = await runControls({ root: ROOT, testFile: fileURLToPath(import.meta.url),
    learningRecordFile: fileURLToPath(here('./verify-learning-record.mjs')), evidence: resolveCorridorEvidence() });
  console.log(JSON.stringify({ pass: report.pass, children: report.children.length,
    verdicts: report.verdicts.map(({ suite, control, child, verdict, problems, failed }) => ({ suite, control, child, verdict, problems, failed })) }, null, 2));
  process.exitCode = report.pass ? 0 : 1;
} else {
  defineRows();
}

function defineRows() {
  let source = readFileSync(here('../corridor.js'), 'utf8');
  const controlName = argValue('--control');
  if (controlName) source = applyControl(source, WORD_CONTROLS, controlName);
  console.log(sourceMarker(controlName, WORD_CONTROLS, sha256(source)));
  const index = JSON.parse(readFileSync(here('../data/share_alike/dict-v2/index.json'), 'utf8'));
  const DICT = JSON.parse(readFileSync(here('../data/share_alike/dict.json'), 'utf8')).words;
  const WORDS = JSON.parse(readFileSync(here('../data/share_alike/words.json'), 'utf8')).words;
  const { entries, ...metadata } = index;
  const rowOf = new Map(entries.map((row) => [String(row[0]), row]));

  const ast = ts.createSourceFile('corridor.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const NAMES = ['plainRecord', 'owns', 'nonEmptyString', 'safeJsonValue', 'finiteNumber', 'srsKey', 'NODE_KIND',
    'kataToHira', 'KATA_TO_HIRA_OFFSET', 'normalizeGloss', 'GLOSS_MESSY', 'GLOSS_LEAD', 'dayKey',
    'lookup', 'dictionaryCoreMatch', 'dictionaryReadingSummaries', 'dictionaryGlossSummary', 'dictionaryReadingSupportsForm',
    'dictionarySummaryFor', 'validDictionaryRow', 'cacheDictionaryRow', 'cacheDictionaryFormRows', 'dictionaryRowBySeq',
    'dictionaryRowsForForm', 'readerReadingFits', 'readerSummaryFor', 'readerQuickRecord', 'readerGlossMissText', 'readerCaptureReasonText',
    'nonBlankMeanings', 'wordSelection', 'savedAnswerFor', 'wordAnswerIdentity', 'sameWordIdentity', 'wordStudied',
    'wordCardIdentity', 'wordNodeIdentity', 'explicitWordSnapshot', 'wordCapturePlan', 'captureStorePatch', 'commitCapture',
    'capturePending', 'toggleTaken', 'replaceWordCard', 'wordCaptureState', 'wordCaptureHeldText', 'showMini',
    'assessmentSuppressionRetries', 'suppressAssessmentCards', 'performAssessmentSuppression',
    'listReading', 'listGloss', 'listToMarkdown', 'resolveAssessmentSubject', 'learningEnrollmentPending', 'commitLearningEnrollment',
    'reviewAnswerAvailable', 'reviewCardBack', 'reviewBack', 'kanjiAnswerAvailable', 'retainedKanjiRecord', 'validKanjiRecord',
    'wordPresentationKey', 'presentReviewAnswer', 'assertWordAnswerPresented', 'commitDrillGrade', 'commitStandardGrade',
    'advanceReviewSession', 'srsSchedulerInstant', 'srsReviewLogRow', 'srsStoredRecord',
    // D23 search stand-in: the relation-worded held copy and its route, the enrollment rows, the page search with its
    // worker seam (request → dispatch → response), and the word sheet's entry doors
    'wordIdentityRelation', 'wordCaptureNoteText', 'heldWordCardNode', 'renderWordCaptureNote', 'withEn',
    'wordCaptureBasis', 'wordCaptureOpenLabel',
    'learningEnrollHeldText', 'heldEnrollRoute', 'renderLessons', 'renderMockResult', 'mockSubjectKey',
    'hiraToKata', 'ROMAJI', 'JLPT_RANK', 'jlptRank', 'searchIndex', 'buildSearchIndex', 'dictionarySearchContext', 'searchResults',
    'searchRowShownByCore', 'renderSearchResults', 'dictionaryQueryKey', 'activeDictionaryQuery', 'clearDictionarySearchTimer',
    'requestDictionarySearch', 'dispatchQueuedDictionarySearch', 'DICTIONARY_SEARCH_SETTLE_MS', 'dictionarySearchGeneration',
    'dictionarySearchInFlight', 'dictionarySearchQueued', 'dictionarySearchTimer',
    'dictionaryHomographChoices', 'renderDictionaryHomographs', 'dictionaryRowsFor', 'dictionaryDetailRowsFor'];
  /** The authored top-level statements declaring `names`, each exactly once. */
  const liftFrom = (tree, names) => {
    const found = tree.statements.filter((statement) => {
      const declared = ts.isFunctionDeclaration(statement) ? [statement.name?.text]
        : ts.isVariableStatement(statement) ? statement.declarationList.declarations.map((node) => node.name.getText(tree)) : [];
      return declared.some((name) => names.includes(name));
    });
    assert.equal(found.length, names.length, 'every lifted definition is one authored top-level statement');
    return found.map((statement) => statement.getText(tree)).join('\n');
  };
  const PROGRAM = liftFrom(ast, NAMES);
  // the store alert's own producer, in a context of its own (the rows' contexts keep their recordFailure stub)
  const STORE_PROGRAM = liftFrom(ast, ['recordFailure']);
  // the served worker's search, lifted by name from dictionary-worker.js as corridor.js is
  const workerAst = ts.createSourceFile('dictionary-worker.js', readFileSync(here('../dictionary-worker.js'), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const WORKER_PROGRAM = liftFrom(workerAst, ['GLOSS_MESSY', 'GLOSS_LEAD', 'JLPT_RANK', 'normalizeGloss', 'kataToHira', 'jlptRank',
    'dictionaryReadingSummaries', 'dictionaryGlossSummary', 'dictionaryReadingSupportsForm', 'dictionaryCoreMatch',
    'dictionaryEntries', 'coreWords', 'formRowsCache', 'formRowScore', 'collectFormRow', 'rowsForForms', 'scoreDictionary']);
  const KANJI = JSON.parse(readFileSync(here('../data/share_alike/kanji.json'), 'utf8')).kanji;

  const SCOPE = Object.freeze({ accountId: 'synthetic-account', learnerId: 'synthetic-learner' });
  const STUDIED = { due: '2026-09-25T00:00:00.000Z', last_review: '2026-09-24T00:00:00.000Z', stability: 1, difficulty: 2,
    elapsed_days: 1, scheduled_days: 1, reps: 1, lapses: 0, learning_steps: 0, state: 2 };
  const REVLOG = (key) => [[10, key, 3, 2, 1, 0.9, 1, 2, 2, 3, 1, 20]];
  const blank = () => ({ taken: [], deepWords: {}, srs: {}, revlog: [], stats: {}, obslog: [], suspended: {}, lists: {} });
  // vm-realm values are JSON round-tripped before any deepEqual: node:assert/strict compares prototypes
  const roundTrip = (value) => JSON.parse(JSON.stringify(value));
  const apply = (record, patch) => roundTrip({ ...record, ...patch });
  const bytes = (value) => JSON.stringify(value);
  const pick = (answer) => ({ status: answer.status, seq: answer.seq, reading: answer.reading, first: answer.meanings[0] ?? null, source: answer.source });
  const firstLine = (markdown) => markdown.split('\n').find((line) => line.startsWith('- '));
  const now = new Date('2026-09-25T10:00:00Z');

  /** The served data. A search case may instead run a small literal dataset of the same shape (`data`). */
  const SERVED = { dict: DICT, words: WORDS, kanji: {}, index };
  function makeD(mode, data = SERVED) {
    const D = { dict: data.dict, words: data.words, kanji: data.kanji, radicals: {}, idioms: {}, sem: {} };
    // the served worker build keeps the entries in the worker: the main thread holds the index's metadata only
    const shape = Object.fromEntries(Object.entries(data.index).filter(([key]) => key !== 'entries'));
    const maps = () => ({ dictionaryBySeq: new Map(), dictionaryByForm: new Map(), dictionaryCompleteForms: new Set(),
      dictionarySearchCache: new Map(), dictionarySearchPending: new Map(), dictionarySearchErrors: new Map() });
    if (mode === 'main') Object.assign(D, { dictionaryIndex: data.index, dictionaryMode: 'main', dictionaryState: 'ready', ...maps() });
    if (mode === 'worker') Object.assign(D, { dictionaryIndex: shape, dictionaryMode: 'worker', dictionaryState: 'ready', ...maps() });
    if (mode === 'error') Object.assign(D, { dictionaryState: 'error', dictionaryError: new Error('offline') });
    return D;
  }
  /** The actual dictionary-worker.js search over one dataset: its entries and its core words, as initialise() sets them. */
  function workerFor(data) {
    const context = vm.createContext({ performance: { now: () => 0 }, entriesIn: data.index.entries, coreIn: data.dict });
    vm.runInContext(`${WORKER_PROGRAM}\ndictionaryEntries = entriesIn; coreWords = coreIn;`, context, { filename: 'dictionary-worker-lifted.js' });
    return context;
  }
  /** A D that throws on any read of the deep-dictionary cache (D.dictionary*). */
  const trapped = (D) => new Proxy(D, { get(target, key) {
    if (typeof key === 'string' && key.startsWith('dictionary')) throw new Error(`read D.${key}`);
    return target[key];
  } });

  /** The disclosed DOM boundary for the actual mini. */
  class FakeElement {
    constructor(tag = 'div', className = '', text = '') {
      Object.assign(this, { tag, className: className || '', textContent: text || '', children: [], attributes: {}, dataset: {},
        style: {}, listeners: {}, disabled: false, isConnected: true, hidden: false, id: '' });
      const names = () => this.className.split(' ').filter(Boolean);
      this.classList = {
        add: (name) => { if (!names().includes(name)) this.className = [...names(), name].join(' '); },
        remove: (name) => { this.className = names().filter((entry) => entry !== name).join(' '); },
        toggle: (name, force) => { const on = force === undefined ? !names().includes(name) : !!force;
          if (on) this.classList.add(name); else this.classList.remove(name); return on; },
        contains: (name) => names().includes(name),
      };
    }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    addEventListener(kind, run) { this.listeners[kind] = run; }
    getBoundingClientRect() { return { top: 200, bottom: 220, left: 20, right: 60, width: 40, height: 20 }; }
    focus() {}
    remove() { this.isConnected = false; }
  }
  const find = (node, predicate) => predicate(node) ? node : node.children?.map((child) => find(child, predicate)).find(Boolean);

  /** One app context. `record` is the durable latest a producer reads; `view` is the render-time S
   * a control was painted from (the same record by default). */
  function app({ mode = 'none', record = blank(), view = null, trap = false, authority = null, lang = 'en', data = SERVED } = {}) {
    const D = makeD(mode, data);
    const context = vm.createContext({
      D: trap ? trapped(D) : D,
      S: roundTrip(view || record),
      latest: roundTrip(record),
      suppressions: [], failures: [], lastError: null,
      fsrsApi, scheduler: fsrsApi.fsrs({ enable_fuzz: false }),
      tx: lang === 'ja' ? (ja) => ja : (_ja, en) => en, bi: () => true, GRAMMARS: () => [], PARTICLES: [],
      // D23 search stand-in: a navigation records the node it would open; the page search's worker seam
      // (dictionaryWorkerRequest) is answered by the actual dictionary-worker.js scoreDictionary over the same data,
      // the request and the reply each crossing it as a JSON (structured) clone; a clock and timers the rows step
      opened: [], go: (node) => { context.opened.push(roundTrip(node)); },
      endLessonRun: () => {}, dropMockRun: () => {},
      worker: mode === 'worker' ? workerFor(data) : null, workerCalls: 0,
      dictionaryWorkerRequest: (type, payload, generation = 0) => {
        if (type !== 'search' || !context.worker) return Promise.reject(new Error(`no worker answer for ${type}`));
        context.workerCalls += 1;
        const wire = JSON.parse(JSON.stringify(payload));
        return Promise.resolve({ generation, result: JSON.parse(JSON.stringify(context.worker.scoreDictionary(wire.context, wire.matchingCoreIds))) });
      },
      recordDictionaryPerformance: () => {}, refreshDictionaryBodies: () => {},
      clock: 0, performance: { now: () => context.clock }, timers: [],
      setTimeout: (run, ms) => context.timers.push({ run, ms }), clearTimeout: () => {}, queueMicrotask,
      recordEpoch: 1, recordWritable: () => true, recordReady: () => true, render: () => {},
      recordFailure: (reason) => { context.failures.push(reason); },
      resetAssessmentQuestionReview: () => {},
      queueAssessmentWork: (work) => work(),
      practiceIdentity: (prefix) => `${prefix}-synthetic`,
      el: (tag, cls, text) => new FakeElement(tag, cls, text),
      // a button's text is its English label; the Japanese label rides along for the rows that read it
      biLabel: (tag, cls, ja, en) => Object.assign(new FakeElement(tag, cls, en), { labelJa: ja }),
      document: { querySelectorAll: () => [], body: { append: () => {} }, getElementById: () => null,
        createTextNode: (text) => new FakeElement('#text', '', text) },
      window: { innerWidth: 400 }, removeMini: () => {}, activeTokenAlternatives: null,
      sealSyncs: 0, syncReaderTakeSeal: () => { context.sealSyncs += 1; },
      commitStorePatch: async (producer) => {
        try {
          const patch = producer(roundTrip(context.latest));
          context.latest = roundTrip({ ...context.latest, ...patch });
          return true;
        } catch (error) { context.lastError = error; return false; }
      },
      commitReviewAction: async (_rv, _item, produce, advance) => {
        let patch;
        try { patch = produce(roundTrip(context.latest), {}); }
        catch (error) { context.lastError = error; return false; }
        context.latest = roundTrip({ ...context.latest, ...patch });
        advance?.();
        return true;
      },
      recordApp: { suppressAssessmentLearning: async (meta, producer) => {
        // the producer (and the D23 guard inside it) reads the latest learner record, as the host snapshot gives it
        const input = typeof producer === 'function'
          ? producer({ revision: 7, identity: SCOPE, record: roundTrip(context.latest) })
          : producer;
        if (!authority) throw new Error('this case has no suppression authority');
        // the host's 'remove' transition on the actual modules; the three composing lines mirror
        // assessment-finalization.mjs:163–167 and :176
        const command = authority.finalization.parseAssessmentSuppressionInput(roundTrip(input));
        const record = roundTrip(context.latest);
        authority.learning.parseAssessmentLearning(record.assessmentLearning, SCOPE);
        const patch = { ...authority.learning.suppressAssessmentLearning(record, command.key, Date.parse(meta.occurredAt)),
          taken: record.taken.filter((entry) => `${entry.t}:${entry.id}` !== command.key) };
        const next = roundTrip({ ...record, v: 2, ...patch });
        authority.learning.parseAssessmentLearning(next.assessmentLearning, SCOPE);
        context.latest = next;
        context.suppressions.push(roundTrip(input));
        return { status: 'active', learningSuppression: { remaining: 0 } };
      } },
    });
    vm.runInContext(PROGRAM, context, { filename: 'corridor-d23-lifted.js' });
    return context;
  }
  const session = (item) => ({ queue: [item], ix: 0, revealed: true, declared: 1, done: { again: 0, hard: 0, good: 0, easy: 0 }, history: [] });
  const grade = (ctx, rv, item, drill) => drill
    ? ctx.commitDrillGrade({ rv, item, next: { state: 2, scheduled_days: 1 }, key: 'good', skey: `word:${item.id}`, rating: 3, mode: 'due', now })
    : ctx.commitStandardGrade({ rv, item, key: 'good', skey: `word:${item.id}`, rating: 3, now, day: '2026-09-25' });
  /** The actual mini for a reader token, and its seal. */
  const openMini = (ctx, b, from = { passage: 'synthetic-passage', index: 3 }) => {
    const span = new FakeElement('span', 'tok');
    const mini = ctx.showMini(span, { b, s: b, r: '' }, () => {}, { from, reader: true });
    return { span, mini, seal: find(mini, (node) => node.id === 'mini-take') };
  };
  const clickSeal = (seal) => seal.listeners.click({ stopPropagation() {}, detail: 1 });

  const NODES = {
    mekuru: { t: 'word', id: '捲る', seq: '1257810', reading: 'めくる', matchedGloss: 'to turn over' },
    makuru: { t: 'word', id: '捲る', seq: '1257800', reading: 'まくる', matchedGloss: 'to turn up' },
    pound: { t: 'word', id: 'ポンド', seq: '1126030', reading: 'ポンド', matchedGloss: 'pound (unit of weight)' },
    pond: { t: 'word', id: 'ポンド', seq: '2855351', reading: 'ポンド', matchedGloss: 'pond' },
    uwate: { t: 'word', id: '上手', seq: '1580400', reading: 'うわて', matchedGloss: 'upper part' },
    kamite: { t: 'word', id: '上手', seq: '1580400', reading: 'かみて' },
    uwateDoor: { t: 'word', id: '上手', seq: '1580400', reading: 'うわて' },
    ubu: { t: 'word', id: '産', seq: '2036160', reading: 'うぶ', matchedHead: '産', matchedGloss: 'inexperienced (in life experience)' },
    mini: { t: 'word', id: '上手', from: { passage: 'synthetic-passage', index: 3 }, ctxScope: 'sent' },
  };
  const captured = (node, record = blank(), options = {}) =>
    apply(record, app({ mode: 'main' }).captureStorePatch(record, node, node.id, 1000, null, options));
  /** H01's historical shape for 上手: an explicit row without its optional cue, beside a matching
   * snapshot that knows the exact reading. */
  const h01Uwate = () => ({ ...blank(), taken: [{ t: 'word', id: '上手', label: '上手', ts: 10, started: 10, entrySeq: '1580400' }],
    deepWords: { 上手: { seq: '1580400', r: 'うわて', m: ['upper part'] } } });

  /* --------------------------------------------- D23 search stand-in helpers (the actual renderers, a fake DOM) */
  const all = (node, predicate, out = []) => {
    if (predicate(node)) out.push(node);
    for (const child of node.children || []) all(child, predicate, out);
    return out;
  };
  const byId = (node, id) => find(node, (child) => child.id === id);
  /** The page search's actual rows (renderSearchResults) for one query, and their data-result values. */
  const pageRows = (ctx, query) => {
    const main = new FakeElement('main');
    ctx.renderSearchResults(main, query);
    return byId(main, 'search-results').children.filter((child) => child.tag === 'button');
  };
  const ids = (rows) => rows.map((row) => row.dataset.result);
  const SEARCH = { ...SERVED, kanji: KANJI };
  /** One query through both served shapes, each painted by the actual renderSearchResults. main: the standalone's
   * inline scan of the embedded entries. worker: the served path, where the core answer queues one request, the settle
   * window passes, the actual dispatchQueuedDictionarySearch sends it to the worker's own scoreDictionary, and the app's
   * own reply handling (cacheDictionaryFormRows, dictionaryRowBySeq, dictionarySearchCache) settles it before the rows
   * are painted again. */
  async function searchBoth(query, data = SEARCH) {
    const main = app({ mode: 'main', data });
    const worker = app({ mode: 'worker', data });
    Object.assign(worker.S, { view: 'shelf', query });
    const immediate = ids(pageRows(worker, query));
    const timer = worker.timers.at(-1);
    assert.equal(timer?.ms, 320, `${query}: the one request waits out the settle window`);
    worker.clock += timer.ms;
    timer.run();
    for (let turn = 0; turn < 20 && !worker.D.dictionarySearchCache.has(query); turn += 1) await new Promise((done) => setImmediate(done));
    const batch = worker.D.dictionarySearchCache.get(query) || null;
    assert(batch, `${query}: the worker's batch settled into the cache through the app's own reply handling`);
    assert.equal(worker.workerCalls, 1, `${query}: one worker request crossed the seam`);
    assert(Array.isArray(main.D.dictionaryIndex.entries) && !Array.isArray(worker.D.dictionaryIndex.entries), 'main scans inline; worker holds metadata only');
    return { query, main, worker, immediate, batch, mainRows: pageRows(main, query), workerRows: pageRows(worker, query) };
  }
  /** Both modes paint the same data-result sequence; returns it. */
  const sameInBoth = (run) => {
    assert.deepEqual(ids(run.mainRows), ids(run.workerRows), `${run.query}: main and worker paint the same rows`);
    return ids(run.workerRows);
  };
  const exact = (sequence, id) => sequence.filter((entry) => entry === `word:${id}` || entry.startsWith(`word:${id}:`));
  const clickRow = (run, result) => {
    for (const rows of [run.mainRows, run.workerRows]) {
      const row = rows.find((entry) => entry.dataset.result === result);
      assert(row, `${run.query}: a row ${result}`);
      row.listeners.click();
    }
    assert.deepEqual(run.main.opened.at(-1), run.worker.opened.at(-1), `${run.query}: ${result} opens the same node in both modes`);
    return run.main.opened.at(-1);
  };
  /** The doors a sheet's entry block renders, as rendered. */
  const doorsOf = (container) => all(container, (node) => node.dataset?.dictionaryEntry != null).map((door) => ({ door,
    seq: door.dataset.dictionaryEntry, reading: find(door, (node) => node.className === 'row-reading')?.textContent ?? '',
    pressed: door.getAttribute('aria-pressed'), active: door.className.split(' ').includes('active') }));
  /** A seq-less core word sheet as the app opens it from the core search row: the stack top is the core node, the
   * actual dictionaryDetailRowsFor chooses the entry the senses come from (setting the resolved seq where it does), and
   * the actual renderDictionaryHomographs paints the entry block. */
  const coreSheet = (ctx, id) => {
    const node = { t: 'word', id };
    ctx.S.stack = [node];
    const shown = roundTrip(ctx.dictionaryDetailRowsFor(node).map((row) => String(row[0])));
    const sheet = new FakeElement('div');
    ctx.renderDictionaryHomographs(sheet, node);
    const title = find(sheet, (child) => child.className === 'dictionary-rel-title');
    return { node, shown, resolved: node.dictionaryResolvedSeq ?? null, sheet, doors: doorsOf(sheet),
      title: title ? [title.textContent, ...title.children.map((child) => child.textContent)] : null };
  };
  /** Click one door on the core sheet: a live door pushes its entry; returns the new stack top, or null if nothing
   * was pushed (an inert door). */
  const clickDoor = (ctx, door) => {
    const depth = ctx.S.stack.length;
    door.door.listeners.click();
    return ctx.S.stack.length === depth + 1 ? roundTrip(ctx.S.stack.at(-1)) : null;
  };
  /** The explicit entry reached the way a learner reaches it after the dedup: search → the core row → the core sheet's
   * own door for that entry and exact reading. */
  const throughDoor = (ctx, id, seq, reading) => {
    const { doors } = coreSheet(ctx, id);
    const door = doors.find((entry) => entry.seq === seq && entry.reading === reading);
    assert(door, `${id}: the core sheet renders a door for ${seq} ${reading}`);
    const top = clickDoor(ctx, door);
    assert(top, `${id}: the door for ${seq} ${reading} pushed its entry`);
    return top;
  };
  /** The critic's literal fixtures (INDEPENDENT-FINDING-REVIEW.md, "Addendum"): not a claim about Japanese content. A
   * row is the served index's 13-cell shape; 試/ためし is a core form whose meanings are ['shared default', 'tin plate']. */
  const literalRow = (seq, glosses, { kana = ['ためし'] } = {}) => [seq, '試', kana[0], glosses[0], ['試'], kana, glosses,
    glosses.map((gloss) => gloss.toLowerCase()), 0, kana.map(() => [0, 0]), glosses.map(() => [0, 0]), kana.map(() => 0),
    [[0, glosses.length, [], [], []]]];
  const literalData = (core, rows) => ({ dict: { 試: core }, words: {}, kanji: {},
    index: { ...Object.fromEntries(Object.entries(index).filter(([key]) => key !== 'entries')), entries: rows } });
  const TIN = literalData({ r: 'ためし', m: ['shared default', 'tin plate'] }, [literalRow('9000001', ['shared default', 'tin'])]);
  const PAIR = literalData({ r: 'ためし', m: ['shared default'] },
    [literalRow('9000011', ['shared default']), literalRow('9000012', ['shared default'])]);
  /** The copy D23 r3 A gives each site, by relation, verbatim (D23-SEARCH-STANDIN-PROPOSAL.md r3 §A). */
  const COPY = {
    held: {
      'other-entry': (id) => [`「${id}」には別の項目のカードがあるため、ここでは覚える・やめるができない。`, `${id} holds a card for another entry, so it cannot be memorized or stopped here.`],
      'other-reading': (id) => [`「${id}」には別の読みのカードがあるため、ここでは覚える・やめるができない。`, `${id} holds a card for another reading, so it cannot be memorized or stopped here.`],
      unestablished: (id) => [`「${id}」には保存済みのカードがある。管理するには、そのカードを開く。`, `A saved card exists for ${id}. Open that card to manage it.`],
    },
    studied: {
      'other-entry': (id, shown) => [`「${id}」には別の項目（${shown}）のカードと復習の記録があります。表記一つにカード一枚なので、そのまま残します。`,
        `${id} already has a card, with review history, for another entry (${shown}). One spelling holds one card, so it stays as it is.`],
      'other-reading': (id, shown) => [`「${id}」には別の読み（${shown}）のカードと復習の記録があります。表記一つにカード一枚なので、そのまま残します。`,
        `${id} already has a card, with review history, for another reading (${shown}). One spelling holds one card, so it stays as it is.`],
      unestablished: (id, shown) => [`「${id}」には保存済みのカード（${shown}）と復習の記録がある。この入り口はそのカードを表していない。表記一つにカード一枚なので、そのまま残す。`,
        `A saved card exists for ${id} (${shown}), with review history. This door doesn't stand for it. One spelling holds one card, so it stays as it is.`],
    },
    unstudied: {
      'other-entry': (id, shown) => [`「${id}」には、まだ復習していない別の項目（${shown}）のカードがあります。そのままにすると、いまのカードが残ります。`,
        `${id} has a card for another entry (${shown}) that has not been reviewed yet. Leaving it keeps that card.`],
      'other-reading': (id, shown) => [`「${id}」には、まだ復習していない別の読み（${shown}）のカードがあります。そのままにすると、いまのカードが残ります。`,
        `${id} has a card for another reading (${shown}) that has not been reviewed yet. Leaving it keeps that card.`],
      unestablished: (id, shown) => [`「${id}」には、まだ復習していない保存済みのカード（${shown}）がある。この入り口はそのカードを表していない。そのままにすると、いまのカードが残る。`,
        `A saved card exists for ${id} (${shown}) that has not been reviewed yet. This door doesn't stand for it. Leaving it keeps that card.`],
    },
    // r3.3: the same spelling with no card left, only the studied history of a removed card
    historyHeld: {
      'other-entry': (id) => [`「${id}」には別の項目の以前のカードの記録が残っているため、ここでは覚える・やめるができない。`,
        `${id} keeps history from an earlier card for another entry, so it cannot be memorized or stopped here.`],
      'other-reading': (id) => [`「${id}」には別の読みの以前のカードの記録が残っているため、ここでは覚える・やめるができない。`,
        `${id} keeps history from an earlier card for another reading, so it cannot be memorized or stopped here.`],
      unestablished: (id) => [`「${id}」には以前のカードの復習の記録が残っているため、ここでは覚える・やめるができない。`,
        `${id} keeps review history from an earlier card, so it cannot be memorized or stopped here.`],
    },
    historyNote: {
      'other-entry': (id, shown) => [`「${id}」には別の項目の以前のカード（${shown}）の復習の記録が残っている。この入り口はその記録を表していない。表記一つにカード一枚なので、そのまま残す。`,
        `${id} keeps review history from an earlier card for another entry (${shown}). This door doesn't stand for it. One spelling holds one card, so it stays as it is.`],
      'other-reading': (id, shown) => [`「${id}」には別の読みの以前のカード（${shown}）の復習の記録が残っている。この入り口はその記録を表していない。表記一つにカード一枚なので、そのまま残す。`,
        `${id} keeps review history from an earlier card for another reading (${shown}). This door doesn't stand for it. One spelling holds one card, so it stays as it is.`],
      unestablished: (id, shown) => [`「${id}」には以前のカード（${shown}）の復習の記録が残っている。この入り口はその記録を表していない。表記一つにカード一枚なので、そのまま残す。`,
        `${id} keeps review history from an earlier card (${shown}). This door doesn't stand for it. One spelling holds one card, so it stays as it is.`],
    },
    route: { card: ['そのカードを開く', 'open that card'], history: ['その項目を開く', 'open that entry'] },
    // a surface with no route of its own (the sentence sheet's seal, NM review-1's third site): only what cannot be done
    heldNoRoute: {
      unestablished: (id) => [`「${id}」には保存済みのカードがあるため、ここでは覚える・やめるができない。`, `A saved card exists for ${id}, so it cannot be memorized or stopped here.`],
    },
    // r3.3.1: no identity context, so neither a current card nor a differing record is claimed
    store: ['この操作では、この表記のカードや残っている記録を変更できない。何も変更していない。',
      "This action can't change the card or retained history for this spelling. Nothing was changed."],
  };
  /** A button's two labels, as the harness's biLabel keeps them. */
  const labels = (button) => [button?.labelJa ?? null, button?.textContent ?? null];
  const LANGS = [['ja', 0], ['en', 1]];
  /** The store alert the actual recordFailure sets for a refused word write, in its own context. */
  const storeAlert = (lang, reason) => {
    const context = vm.createContext({ S: { storeError: null }, tx: lang === 'ja' ? (ja) => ja : (_ja, en) => en,
      revalidateTutorRequests: () => {}, safelySyncStoreAlert: () => {}, sentencePracticeError: () => 'sentence' });
    vm.runInContext(STORE_PROGRAM, context, { filename: 'corridor-record-failure.js' });
    context.recordFailure(reason);
    return context.S.storeError;
  };
  /** The actual full note (renderWordCaptureNote) for a door: its line, and its buttons by id. */
  const noteOf = (ctx, node) => {
    const container = new FakeElement('div');
    ctx.renderWordCaptureNote(container, node, node.id);
    const note = byId(container, 'word-capture-note');
    return note ? { line: note.children.find((child) => child.tag === 'p')?.textContent ?? null,
      open: byId(note, 'word-capture-open'), replace: byId(note, 'word-capture-replace') } : null;
  };
  const enrollOf = (main, word) => find(main, (node) => node.tag === 'button' && node.dataset?.enroll === word);
  /** The actual lesson end screen (renderLessons) after a lesson of 上手 and 海, with its context. */
  const lessonEndOf = (record) => {
    const ctx = app({ mode: 'main', record });
    Object.assign(ctx.S, { view: 'lessons', lessonRun: { id: 'N5-synthetic', kind: 'word', words: ['上手', '海'], phase: 'end', results: [3, 1], correct: 1 } });
    const main = new FakeElement('main');
    ctx.renderLessons(main);
    return { ctx, main };
  };
  const lessonEnd = (record) => lessonEndOf(record).main;
  /** The actual older-set result (renderMockResult) after a completed sitting that missed 上手 and 海, with its context. */
  const olderSetResultOf = (record) => {
    const ctx = app({ mode: 'main', record });
    const set = { level: 'N5', sections: [{ title: { ja: '語彙' } }] };
    const flat = ['上手', '海'].map((word) => ({ section: set.sections[0], item: { q: word, opts: ['a', 'b', 'c', 'd'], right: 0, subject: `word:${word}` } }));
    const main = new FakeElement('main');
    ctx.renderMockResult(main, set, flat, { answers: [1, 1] }, { status: 'submitted', activeMs: 1000, attemptId: 'attempt-synthetic' });
    return { ctx, main };
  };
  const olderSetResult = (record) => olderSetResultOf(record).main;
  const CORE_DOOR = { t: 'word', id: '上手' };
  const JOZU = { t: 'word', id: '上手', seq: '1353320', reading: 'じょうず' };
  /** The explicit 上手 1353320/じょうず card, captured the way it is reached once search shows 上手 once: the core
   * sheet's own door (Codex 16:27:39Z), then the sheet foot's 覚 (toggleTaken). */
  const captureThroughRoute = async () => {
    const ctx = app({ mode: 'main' });
    const top = throughDoor(ctx, '上手', '1353320', 'じょうず');
    assert.deepEqual(top, { ...JOZU, from: null }, 'the door pushed the entry and its exact reading');
    assert.equal(await ctx.toggleTaken(top, '上手'), true, 'the opened entry is captured');
    return { top, record: roundTrip(ctx.latest) };
  };

  let authorityPromise = null;
  /** The actual assessment-learning and assessment-finalization modules, staged once (or reused
   * from the controls runner through D23_ASSESSMENT_STAGE). */
  const assessmentAuthority = () => (authorityPromise ||= (async () => {
    const stage = process.env.D23_ASSESSMENT_STAGE || await (async () => {
      const dir = join(resolveCorridorEvidence(), 'assessment-stage');
      mkdirSync(dir, { recursive: true });
      return stageAssessmentAuthority(ROOT, dir);
    })();
    const load = (name) => import(pathToFileURL(join(stage, name)).href);
    return { learning: await load('assessment-learning.mjs'), finalization: await load('assessment-finalization.mjs') };
  })());

  /* ------------------------------------------------------------------ rows */
  const observed = [];
  const fixtures = new Map();
  const need = (id) => { if (!fixtures.has(id)) throw new Error(`${id}: its setup did not complete`); return fixtures.get(id); };
  function row(id, title, body) {
    test(`${id} ${title}`, async () => {
      try { await body(); observed.push({ id, pass: true }); }
      catch (error) { observed.push({ id, pass: false }); throw error; }
    });
  }
  after(() => {
    const { exact, report } = inventoryReport('word-saved-answer', INVENTORY, observed);
    // the release gate's 'checks' report; a control run writes none
    if (process.env.KAIRO_EVIDENCE_DIR && !controlName) {
      writeFileSync(join(resolveCorridorEvidence(), 'verification-report.json'), JSON.stringify(report, null, 2) + '\n');
    }
    assert(exact, `the declared inventory ran exactly once each: ${JSON.stringify(observed.map((entry) => entry.id))}`);
  });

  row('F0', 'fixture facts from the served data (every control keeps this green)', () => {
    const r = (seq) => rowOf.get(seq);
    assert.deepEqual([r('1257800')[1], r('1257800')[5], r('1257800')[6][0]], ['捲る', ['まくる'], 'to turn up']);
    assert.deepEqual([r('1257810')[1], r('1257810')[5], r('1257810')[6][0]], ['捲る', ['めくる'], 'to turn over']);
    assert(r('1257810')[6].includes('to tear off'));
    assert.deepEqual([r('1126030')[5], r('1126030')[6].slice(0, 2)], [['ポンド'], ['pound (unit of weight)', 'pound (currency)']]);
    assert.deepEqual([r('2855351')[5], r('2855351')[6]], [['ポンド'], ['pond']]);
    assert.deepEqual([r('1580400')[1], r('1580400')[4], r('1580400')[5], r('1580400')[11], r('1580400')[6][0]],
      ['上手', ['上手'], ['うわて', 'かみて'], [0, 0], 'upper part']);
    assert.deepEqual([r('2036160')[4], r('2036160')[5], r('2036160')[11]], [['初', '初心', '産', '生'], ['ウブ', 'うぶ'], [1, 0]]);
    assert.deepEqual([DICT['上手'].r, DICT['上手'].m[0]], ['じょうず', 'skillful']);
    for (const spelling of ['捲る', 'ポンド', '産']) assert.equal(DICT[spelling], undefined, spelling);
    assert.deepEqual([WORDS['捲る'].r, WORDS['捲る'].g], ['めくる', 'to turn over, to turn pages of a']);
    assert.equal(WORDS['ポンド'], undefined);
    assert.equal(metadata.source.pin, '3.6.2+20260803141815');
    assert.equal(metadata.source.jmdict.sha256, '1806d2817215ebe7ded997c8dac4831a3335d83ed12f321ac869a97e745d3a5c');
    const main = app({ mode: 'main' });
    assert.deepEqual(roundTrip(main.dictionaryRowsForForm('捲る').map((entry) => entry[0])), ['1257800', '1257810'], 'the warm first row is まくる');
    assert.deepEqual(roundTrip(main.dictionaryRowsForForm('ポンド').map((entry) => entry[0])), ['1126030', '2855351']);
    // why raw lookup cannot validate a cue: its normalised path answers ウブ for 産 read うぶ
    assert.equal(main.lookup('産', '2036160', 'うぶ', 'inexperienced (in life experience)').r, 'ウブ');
  });

  row('T1.setup', 'a real explicit capture of 捲る 1257810, and a warm cache that answers the other entry', () => {
    const record = captured(NODES.mekuru);
    assert.deepEqual([record.taken[0].entrySeq, record.taken[0].cueReading], ['1257810', 'めくる']);
    const warm = app({ mode: 'worker', record });
    warm.cacheDictionaryFormRows('捲る', app({ mode: 'main' }).dictionaryRowsForForm('捲る'));
    assert.equal(warm.lookup('捲る').r, 'まくる', 'the warm cache answers the other entry (C1’s prerequisite)');
    fixtures.set('T1', { record, warm });
  });
  row('T1', 'F05: 捲る 1257810 answers the same cold, warm, offline, under a cache trap and after JSON', () => {
    const { record, warm } = need('T1');
    const row0 = record.taken[0];
    const snap = record.deepWords['捲る'];
    assert.deepEqual([snap.r, snap.m[0], snap.seq], ['めくる', 'to turn over', '1257810']);
    assert.deepEqual(snap.selection, { v: 1, seq: '1257810', r: 'めくる', head: '捲る',
      src: { release: metadata.source.pin, archiveSha256: metadata.source.jmdict.sha256 } });
    assert.equal(Object.hasOwn(snap, 'head') || Object.hasOwn(snap, 'src'), false, 'no new top-level head/src');
    const back = { reading: 'めくる', senses: snap.m.slice(0, 4) };
    for (const [state, ctx] of [['cold', app({ mode: 'none', record })], ['warm', warm], ['offline', app({ mode: 'error', record })],
      ['trap', app({ mode: 'main', record, trap: true })]]) {
      assert.deepEqual(pick(ctx.savedAnswerFor(row0, record)),
        { status: 'available', seq: '1257810', reading: 'めくる', first: 'to turn over', source: 'selection' }, state);
      assert.deepEqual(roundTrip(ctx.reviewCardBack(row0)), back, `${state}: the review back and the reading its audio speaks`);
    }
  });

  row('T2.setup', 'the core spelling 上手 is じょうず; its entry 1580400 is うわて', () => {
    assert.deepEqual([DICT['上手'].r, rowOf.get('1580400')[5][0]], ['じょうず', 'うわて']);
    fixtures.set('T2', true);
  });
  row('T2', 'F-core: 上手 1580400 keeps its entry on a core spelling; a plain core capture is unchanged', () => {
    need('T2');
    const patch = app({ mode: 'main' }).captureStorePatch(blank(), NODES.uwate, '上手', 1000);
    assert.deepEqual([patch.taken[0].entrySeq, patch.taken[0].cueReading], ['1580400', 'うわて']);
    const snap = patch.deepWords['上手'];
    assert.deepEqual([snap.r, snap.m[0], snap.selection.head, snap.selection.src.release], ['うわて', 'upper part', '上手', metadata.source.pin]);
    const record = apply(blank(), patch);
    const ctx = app({ mode: 'none', record });
    assert.deepEqual(pick(ctx.savedAnswerFor(record.taken[0], record)),
      { status: 'available', seq: '1580400', reading: 'うわて', first: 'upper part', source: 'selection' });
    assert.equal(firstLine(ctx.listToMarkdown('L', record.taken)), '- 上手（うわて） — upper part');
    const plain = app({ mode: 'main' }).captureStorePatch(blank(), { t: 'word', id: '上手' }, '上手', 1000);
    assert.deepEqual(Object.keys(plain), ['taken']);
    assert.equal(Object.hasOwn(plain.taken[0], 'entrySeq') || Object.hasOwn(plain.taken[0], 'cueReading'), false);
    const core = apply(blank(), plain);
    assert.deepEqual(pick(ctx.savedAnswerFor(core.taken[0], core)), { status: 'available', seq: null, reading: 'じょうず', first: 'skillful', source: 'core' });
    const subject = ctx.resolveAssessmentSubject('word:上手', { subjects: ['word:上手'] }, record);
    assert.deepEqual([subject.dictionary.r, subject.dictionary.m[0]], ['じょうず', 'skillful'], 'a core test word is its core entry');
  });

  row('T3.setup', 'a worker-mode dictionary with 1257810 uncached, and the F06 historical record', () => {
    const cold = app({ mode: 'worker' });
    assert.equal(cold.dictionaryRowBySeq('1257810'), null);
    const sentinel = { release: '3.6.1+20250101000000', archiveSha256: '1'.repeat(64) };
    const history = { ...blank(), srs: { 'word:捲る': STUDIED }, revlog: REVLOG('word:捲る'),
      deepWords: { 捲る: { seq: '1257810', r: 'めくる', m: ['to turn over', 'to turn (pages)'], head: '捲る', futureNote: { keep: true }, src: sentinel } } };
    fixtures.set('T3', { cold, history });
  });
  row('T3', 'F06: no validated answer refuses; a same-entry saved answer is reused exactly, source bytes included', () => {
    const { cold, history } = need('T3');
    const node = { t: 'word', id: '捲る', seq: '1257810', reading: 'めくる' };
    const empty = blank();
    assert.equal(cold.wordCaptureState(node, empty), 'unavailable');
    assert.throws(() => cold.captureStorePatch(empty, node, '捲る', 1000), (error) => error.code === 'word-answer-unavailable');
    assert.equal(bytes(empty), bytes(blank()));
    const before = bytes(history);
    const resumed = cold.captureStorePatch(history, node, '捲る', 1000);
    assert.equal(bytes(history), before);
    assert.deepEqual(Object.keys(resumed), ['taken'], 'only taken changes; the snapshot and its old src stay exactly as saved');
    assert.deepEqual([resumed.taken.at(-1).entrySeq, resumed.taken.at(-1).cueReading], ['1257810', 'めくる']);
    const stale = { ...blank(), deepWords: { 捲る: { seq: '1257810', r: 'めくる', m: ['to turn over'] } } };
    assert.throws(() => cold.captureStorePatch(stale, node, '捲る', 1000), (error) => error.code === 'word-answer-unavailable',
      'cold, an unvalidated legacy snapshot with no card and no history is not a validated answer');
  });

  row('T4.setup', '産 2036160 lists ウブ (no written form) and うぶ (every written form)', () => {
    assert.deepEqual([rowOf.get('2036160')[5], rowOf.get('2036160')[11]], [['ウブ', 'うぶ'], [1, 0]]);
    fixtures.set('T4', true);
  });
  row('T4', 'F03: 産 read うぶ is validated by that reading’s own restriction; ウブ written 産 refuses', () => {
    need('T4');
    const ctx = app({ mode: 'main' });
    const patch = ctx.captureStorePatch(blank(), NODES.ubu, '産', 1000);
    assert.deepEqual(Object.keys(patch).sort(), ['deepWords', 'taken']);
    assert.deepEqual([patch.taken[0].entrySeq, patch.taken[0].cueReading], ['2036160', 'うぶ']);
    const snap = patch.deepWords['産'];
    assert.deepEqual([snap.r, snap.selection.head, snap.m[0]], ['うぶ', '産', 'inexperienced (in life experience)']);
    const negative = { ...NODES.ubu, reading: 'ウブ' };
    for (const record of [blank(), { ...blank(), deepWords: { 産: { seq: '2036160', r: 'ウブ', m: ['inexperienced (in life experience)'] } } }]) {
      const before = bytes(record);
      assert.throws(() => ctx.captureStorePatch(record, negative, '産', 1000), (error) => error.code === 'word-answer-unavailable');
      assert.equal(bytes(record), before);
    }
  });

  row('T5.setup', 'a real capture of ポンド 1126030, enrolled and unstudied', () => {
    const enrolled = captured(NODES.pound);
    assert.deepEqual([enrolled.taken[0].entrySeq, enrolled.deepWords['ポンド'].seq], ['1126030', '1126030']);
    fixtures.set('T5', enrolled);
  });
  row('T5', 'ポンド: another entry never takes a card or its history silently', async () => {
    const enrolled = need('T5');
    const ctx = app({ mode: 'main' });
    assert.equal(ctx.wordCaptureState(NODES.pond, enrolled), 'conflict');
    const before = bytes(enrolled);
    assert.throws(() => ctx.captureStorePatch(enrolled, NODES.pond, 'ポンド', 2000), (error) => error.code === 'word-identity-conflict');
    assert.equal(bytes(enrolled), before);
    const swapped = ctx.captureStorePatch(enrolled, NODES.pond, 'ポンド', 2000, null, { replace: true });
    assert.deepEqual(Object.keys(swapped).sort(), ['deepWords', 'taken']);
    assert.deepEqual(roundTrip(swapped.taken.filter((entry) => entry.id === 'ポンド').map((entry) => entry.entrySeq)), ['2855351']);
    assert.equal(swapped.deepWords['ポンド'].seq, '2855351');
    const door = app({ mode: 'main', record: enrolled });
    assert.equal(await door.replaceWordCard(NODES.pond, 'ポンド'), true, 'the replace door commits the same guarded plan');
    assert.deepEqual(door.latest.taken.map((entry) => entry.entrySeq), ['2855351']);
    const removed = { ...enrolled, taken: [], srs: { 'word:ポンド': STUDIED }, revlog: REVLOG('word:ポンド') };
    const removedBefore = bytes(removed);
    for (const options of [{}, { replace: true }]) {
      assert.throws(() => ctx.captureStorePatch(removed, NODES.pond, 'ポンド', 3000, null, options), (error) => error.code === 'word-identity-conflict');
    }
    assert.equal(bytes(removed), removedBefore);
    const resumed = ctx.captureStorePatch(removed, NODES.pound, 'ポンド', 3000);
    assert.deepEqual(Object.keys(resumed), ['taken']);
    assert.equal(resumed.taken[0].entrySeq, '1126030');
    assert.equal(ctx.sameWordIdentity({ kind: 'seq', seq: '1126030', reading: 'ポンド' }, { kind: 'seq', seq: '2855351', reading: 'ポンド' }), false);
  });

  row('T6.setup', 'F02’s record: a studied 捲る 1257810 answer with no card and no src', () => {
    const snapshot = { seq: '1257810', r: 'めくる', m: ['to turn over', 'to turn (pages)'], head: '捲る', futureNote: { keep: true } };
    fixtures.set('T6', { ...blank(), deepWords: { 捲る: snapshot }, srs: { 'word:捲る': STUDIED }, revlog: REVLOG('word:捲る') });
  });
  row('T6', 'F02: a same-entry retake through a door with another gloss keeps the saved answer exactly', () => {
    const record = need('T6');
    const before = bytes(record);
    const node = { t: 'word', id: '捲る', seq: '1257810', reading: 'めくる', matchedHead: '捲る', matchedGloss: 'to tear off' };
    for (const mode of ['main', 'none']) {
      const patch = app({ mode }).captureStorePatch(record, node, '捲る', 1000);
      assert.deepEqual(Object.keys(patch), ['taken'], mode);
      assert.deepEqual([patch.taken.at(-1).entrySeq, patch.taken.at(-1).cueReading], ['1257810', 'めくる'], mode);
    }
    assert.equal(bytes(record), before);
    const resumed = apply(record, app({ mode: 'main' }).captureStorePatch(record, node, '捲る', 1000));
    const answer = app({ mode: 'none' }).savedAnswerFor(resumed.taken.at(-1), resumed);
    assert.deepEqual([answer.meanings[0], answer.source], ['to turn over', 'saved-legacy']);
    assert.equal(Object.hasOwn(resumed.deepWords['捲る'], 'src'), false);
    assert.throws(() => app({ mode: 'main' }).captureStorePatch(record, NODES.makuru, '捲る', 1000),
      (error) => error.code === 'word-identity-conflict');
    assert.equal(bytes(record), before);
  });

  row('T7r.setup', 'the explicit 上手 1580400 card, a plain core 上手 card, and H01’s うわて shape', () => {
    const uwate = captured(NODES.uwate);
    const core = captured({ t: 'word', id: '上手' });
    assert.deepEqual([uwate.taken[0].entrySeq, Object.hasOwn(core.taken[0], 'entrySeq')], ['1580400', false]);
    fixtures.set('T7r', { uwate, core, h01: h01Uwate() });
  });
  row('T7r', 'F01 remove route: the actual mini never removes another entry’s card; its own card still goes', async () => {
    const { uwate, core, h01 } = need('T7r');
    // the actual mini on the explicit card: held, explained, and its click writes nothing
    let ctx = app({ mode: 'none', record: uwate });
    let mini = openMini(ctx, '上手');
    assert.equal(mini.seal.disabled, true);
    assert(find(mini.mini, (node) => node.id === 'mini-take-reason'), 'the held seal says why');
    let before = bytes(ctx.latest);
    await clickSeal(mini.seal);
    assert.equal(bytes(ctx.latest), before);
    assert.equal(ctx.sealSyncs, 0);
    // the same mini on a plain core card removes that card, and its handler runs to its end
    ctx = app({ mode: 'none', record: core });
    mini = openMini(ctx, '上手');
    assert.equal(mini.seal.disabled, false);
    await clickSeal(mini.seal);
    assert.deepEqual(roundTrip(ctx.latest.taken), []);
    assert.equal(ctx.sealSyncs, 1);
    // painted for the core card, the latest record holds うわて: the producer refuses, every byte kept
    ctx = app({ mode: 'none', record: uwate, view: core });
    mini = openMini(ctx, '上手');
    assert.equal(mini.seal.disabled, false);
    before = bytes(ctx.latest);
    await clickSeal(mini.seal);
    assert.equal(bytes(ctx.latest), before, 'a latest-state change after render refuses in the producer');
    assert.equal(ctx.sealSyncs, 0);
    // H01's shape (no row cue; the snapshot reads うわて): the かみて door never removes the card; the うわて door does
    ctx = app({ mode: 'none', record: h01 });
    before = bytes(ctx.latest);
    assert.equal(await ctx.toggleTaken(NODES.kamite, '上手'), false);
    assert.equal(bytes(ctx.latest), before);
    assert.equal(await ctx.toggleTaken(NODES.uwateDoor, '上手'), true);
    assert.deepEqual(roundTrip(ctx.latest.taken), []);
    // the explicit card's own door removes it
    ctx = app({ mode: 'none', record: uwate });
    assert.equal(await ctx.toggleTaken(NODES.uwateDoor, '上手'), true);
    assert.deepEqual(roundTrip(ctx.latest.taken), []);
  });

  row('T7s.setup', 'the actual assessment modules and a populated latest record with a valid assessment root', async () => {
    const authority = await assessmentAuthority();
    const root = authority.learning.suppressAssessmentLearning(
      { assessmentLearning: authority.learning.createAssessmentLearning(SCOPE) }, 'word:earlier', 1).assessmentLearning;
    authority.learning.parseAssessmentLearning(root, SCOPE);
    // every mandatory no-write root of the ledger is present. The non-learning assessment,
    // teacher, source and sentence roots are opaque witnesses here; their own validity is not checked.
    const populated = (record) => ({ ...record, assessmentLearning: root,
      lists: { 読んだ: [{ t: 'word', id: '上手', label: '上手', ts: 10 }] }, suspended: { 'word:earlier': 5 },
      stats: { '2026-09-24': { n: 1, again: 0, nnew: 1 } }, obslog: [[5, 'tap', 'word:上手', 1, 'synthetic-passage']],
      assessmentReceived: { witness: 'assessmentReceived' }, assessmentLibraryV2: { witness: 'assessmentLibraryV2' },
      assessmentQuestionPractice: { witness: 'assessmentQuestionPractice' }, teacherContexts: { witness: 'teacherContexts' },
      sourceInbox: { witness: 'sourceInbox' }, publisherLibrary: { witness: 'publisherLibrary' }, sentencePractice: { witness: 'sentencePractice' } });
    const uwate = populated(captured(NODES.uwate));
    const core = populated(captured({ t: 'word', id: '上手' }));
    const h01 = populated(h01Uwate());
    assert.equal(uwate.taken[0].entrySeq, '1580400');
    assert.equal(Object.hasOwn(core.taken[0], 'entrySeq'), false);
    fixtures.set('T7s', { authority, uwate, core, h01 });
  });
  row('T7s', 'F01 suppress route: a stale or other-entry door suppresses nothing; the same card is suppressed for real', async () => {
    const { authority, uwate, core, h01 } = need('T7s');
    const learning = (ctx) => ctx.latest.assessmentLearning.suppressions.map((entry) => entry.key);
    // the producer guard alone (the mini holds this seal, T7r): the spelling-only node on the explicit
    // card is refused, and every byte of the populated record is kept
    let ctx = app({ mode: 'none', record: uwate, authority });
    let before = bytes(ctx.latest);
    assert.equal(await ctx.toggleTaken(NODES.mini, '上手'), false);
    assert.equal(bytes(ctx.latest), before);
    assert.deepEqual(roundTrip(ctx.suppressions), []);
    // the actual mini painted for a core card while the latest record holds うわて: refused
    ctx = app({ mode: 'none', record: uwate, view: core, authority });
    let mini = openMini(ctx, '上手');
    assert.equal(mini.seal.disabled, false);
    before = bytes(ctx.latest);
    await clickSeal(mini.seal);
    assert.equal(bytes(ctx.latest), before);
    assert.deepEqual([roundTrip(ctx.suppressions), ctx.sealSyncs], [[], 0]);
    // H01's shape: the かみて door suppresses nothing; the うわて door suppresses that card for real
    ctx = app({ mode: 'none', record: h01, authority });
    before = bytes(ctx.latest);
    assert.equal(await ctx.toggleTaken(NODES.kamite, '上手'), false);
    assert.equal(bytes(ctx.latest), before);
    assert.equal(await ctx.toggleTaken(NODES.uwateDoor, '上手'), true);
    assert.deepEqual(roundTrip(learning(ctx)), ['word:earlier', 'word:上手']);
    assert.deepEqual(roundTrip(ctx.latest.taken), []);
    // the actual mini on a plain core card: the real suppression transition
    ctx = app({ mode: 'none', record: core, authority });
    mini = openMini(ctx, '上手');
    const prior = roundTrip(ctx.latest);
    await clickSeal(mini.seal);
    assert.equal(ctx.sealSyncs, 1);
    assert.deepEqual(roundTrip(ctx.latest.taken), []);
    assert.deepEqual(roundTrip(learning(ctx)), ['word:earlier', 'word:上手']);
    assert.deepEqual(roundTrip(ctx.suppressions).map((input) => [input.kind, input.key]), [['remove', 'word:上手']]);
    const { v, ...rest } = roundTrip(ctx.latest);
    assert.equal(v, 2, 'the host transition stamps the record version');
    assert.deepEqual({ ...rest, taken: prior.taken, assessmentLearning: prior.assessmentLearning }, prior,
      'the suppression changes only taken, assessmentLearning and the record version');
  });

  row('T8.setup', 'A (ポンド 1126030), B (2855351 by the replace door) and the synthetic A′', () => {
    const A = captured(NODES.pound);
    const B = captured(NODES.pond, A, { replace: true });
    assert.deepEqual([A.taken[0].entrySeq, B.taken.find((entry) => entry.id === 'ポンド').entrySeq], ['1126030', '2855351']);
    // seam perturbation (synthetic, not a reachable UI path): same entry, reading and head; another shown meaning
    const C = roundTrip(A);
    C.deepWords['ポンド'].m = ['pound (currency)', ...C.deepWords['ポンド'].m.filter((meaning) => meaning !== 'pound (currency)')];
    fixtures.set('T8', { A, B, C });
  });
  row('T8', 'F04: both grade producers write only for the answer the card presented', async () => {
    const { A, B, C } = need('T8');
    const cases = [['A→A', A, true], ['A→B another entry, same reading', B, false], ['A→A′ seam perturbation, other meaning', C, false]];
    for (const drill of [false, true]) {
      for (const [name, latest, allowed] of cases) {
        const ctx = app({ mode: 'none', record: A });
        const item = ctx.S.taken.find((entry) => entry.id === 'ポンド');
        const rv = session(item);
        assert.equal(ctx.presentReviewAnswer(rv).state, 'shown', name);
        ctx.latest = roundTrip(latest);
        const before = bytes(ctx.latest);
        assert.equal(await grade(ctx, rv, item, drill), allowed, `${drill ? 'drill' : 'standard'} ${name}`);
        if (allowed) {
          const later = JSON.parse(bytes(ctx.latest)); const prior = JSON.parse(before);
          if (drill) {
            assert.equal(later.obslog.length, prior.obslog.length + 1);
            assert.deepEqual({ ...later, obslog: prior.obslog }, prior, 'a drill grade changes only obslog');
          } else {
            assert.equal(later.revlog.length, prior.revlog.length + 1);
            assert.deepEqual({ ...later, srs: prior.srs, revlog: prior.revlog, stats: prior.stats }, prior, 'a grade changes only srs/revlog/stats');
          }
        } else {
          assert.equal(bytes(ctx.latest), before, `${name}: nothing written`);
          assert.deepEqual([rv.ix, rv.declared, rv.revealed], [0, 1, true], `${name}: no advance, no rebinding`);
          assert.equal(ctx.lastError?.code, 'word-answer-changed');
        }
      }
    }
    const ctx = app({ mode: 'none', record: A });
    const item = ctx.S.taken[0];
    const rv = session(item);
    assert.equal(await grade(ctx, rv, item, false), false, 'no presentation, no grade');
    assert.equal(ctx.presentReviewAnswer(rv).state, 'shown');
    const bound = rv.presented.key;
    assert.equal(ctx.presentReviewAnswer(rv, B).state, 'changed');
    assert.equal(rv.presented.key, bound, 'a later render never refreshes the binding');
  });

  // H01–H10: the independent ledger's resolver fragments, overlaid on an enrolled row
  const H = [
    ['H01', { entrySeq: '1257810' }, '捲る', { seq: '1257810', r: 'めくる', m: ['to turn over'] }, ['1257810', 'めくる', 'to turn over']],
    ['H02', {}, '捲る', { seq: '1257810', r: 'めくる', m: ['to turn over'] }, ['1257810', 'めくる', 'to turn over']],
    ['H03', {}, '捲る', { r: 'めくる', m: ['to turn over'] }, [null, 'めくる', 'to turn over']],
    ['H04', { entrySeq: '1257810', cueReading: 'めくる' }, '捲る', null, null],
    ['H05', { entrySeq: '1257810', cueReading: 'めくる' }, '捲る', { r: 'めくる', m: ['to turn over'] }, null],
    ['H06', { entrySeq: '1126030', cueReading: 'ポンド' }, 'ポンド', { seq: '2855351', r: 'ポンド', m: ['pond'] }, null],
    ['H07', { entrySeq: '1257810', cueReading: 'まくる' }, '捲る', { seq: '1257810', r: 'めくる', m: ['to turn over'] }, null],
    ['H08', {}, '上手', { seq: '1580400', r: 'うわて', m: ['upper part'] }, [null, 'じょうず', 'skillful']],
    ['H09', { entrySeq: '1', cueReading: 'うみ' }, '海', { seq: '1', r: 'うみ', m: ['sea'] }, ['1', 'うみ', 'sea']],
    ['H10', { entrySeq: '1257810', cueReading: 'めくる' }, '捲る', { seq: '1257810', r: 'めくる', m: [' ', ''] }, null],
  ];
  const enrolledRecord = (fields, spelling, snapshot) => ({ ...blank(), taken: [{ t: 'word', id: spelling, label: spelling, ts: 10, started: 10, ...fields }],
    deepWords: snapshot ? { [spelling]: snapshot } : {} });
  /** Both grade producers refuse an answer that is not available, even behind a forged binding. */
  async function refusesBothGrades(ctx, label) {
    for (const drill of [false, true]) {
      const item = ctx.S.taken[0];
      const rv = session(item);
      rv.presented = { item, ix: 0, key: 'forged' };
      ctx.lastError = null;
      const latest = bytes(ctx.latest);
      assert.equal(await grade(ctx, rv, item, drill), false, `${label} ${drill ? 'drill' : 'standard'}`);
      assert.equal(bytes(ctx.latest), latest);
      assert.equal(ctx.lastError?.code, 'word-answer-unavailable', `${label}: refused for the answer, not the setup`);
    }
  }
  row('T9.setup', 'the H01–H10 fragments on enrolled rows', () => {
    fixtures.set('T9', H.map(([id, fields, spelling, snapshot, expected]) => [id, enrolledRecord(fields, spelling, snapshot), expected]));
  });
  row('T9', 'H01–H10 resolve as pinned, read-only; an unavailable one is refused by both grade producers', async () => {
    for (const [id, record, expected] of need('T9')) {
      const ctx = app({ mode: 'main', record });
      const before = bytes(record);
      const answer = ctx.savedAnswerFor(record.taken[0], record);
      assert.equal(answer.status === 'available', !!expected, id);
      if (expected) assert.deepEqual([answer.seq, answer.reading, answer.meanings[0]], expected, id);
      ctx.listToMarkdown('L', record.taken);
      assert.equal(bytes(record), before, `${id}: read-only`);
      if (!expected) await refusesBothGrades(ctx, id);
    }
  });

  row('T10.setup', 'F07 from literal JSON (an own "__proto__" is data, never a prototype setter)', () => {
    fixtures.set('T10', { ...blank(), ...JSON.parse('{"futureRecord":{"retain":[true,0,null]},' +
      '"taken":[{"t":"word","id":"捲る","label":"捲る","entrySeq":"1257810","cueReading":"めくる","ts":10,"futureTaken":{"note":"keep"}}],' +
      '"deepWords":{"捲る":{"seq":"1257810","r":"めくる","m":["to turn over"],"head":17,"src":"third-party-note",' +
      '"futureSnapshot":{"retain":true},"__proto__":{"retainOwnData":true}}}}') });
  });
  row('T10', 'F07: lawful legacy head/src stay opaque and are never read as a validated selection', () => {
    const record = need('T10');
    const before = bytes(record);
    const ctx = app({ mode: 'none', record });
    const answer = ctx.savedAnswerFor(record.taken[0], record);
    assert.deepEqual(pick(answer), { status: 'available', seq: '1257810', reading: 'めくる', first: 'to turn over', source: 'saved-legacy' });
    assert.equal(answer.head, '捲る', 'head falls back to the spelling, never 17');
    assert.equal(ctx.wordSelection(record.deepWords['捲る']), null);
    assert.equal(bytes(record), before);
    assert(Object.hasOwn(record.deepWords['捲る'], '__proto__'));
    assert.equal(Object.getPrototypeOf(record.deepWords['捲る']), Object.prototype);
    assert.equal(({}).retainOwnData, undefined);
    assert.equal(Object.hasOwn(record.taken[0], 'started'), false);
  });

  row('T11.setup', 'an unstudied explicit うわて card, removed', () => {
    const taken = captured(NODES.uwate);
    assert.equal(taken.deepWords['上手'].seq, '1580400');
    fixtures.set('T11', { ...taken, taken: [] });
  });
  row('T11', 'a core capture drops a stale explicit snapshot, so a removed card’s entry is never mistaken later', () => {
    const removed = need('T11');
    const plain = app({ mode: 'main' }).captureStorePatch(removed, { t: 'word', id: '上手' }, '上手', 2000);
    assert.equal(Object.hasOwn(plain.deepWords, '上手'), false);
    assert.equal(Object.hasOwn(plain.taken.at(-1), 'entrySeq'), false);
  });

  row('T12.setup', 'a real capture of 捲る 1257800 while the word layer holds めくる', () => {
    const record = captured(NODES.makuru);
    assert.equal(record.taken[0].entrySeq, '1257800');
    fixtures.set('T12', record);
  });
  row('T12', 'F05: the list note is the card’s saved answer, not the word layer', () => {
    const record = need('T12');
    const ctx = app({ mode: 'none', record });
    assert.equal(firstLine(ctx.listToMarkdown('L', record.taken)), '- 捲る（まくる） — to turn up');
    assert.equal(ctx.listReading({ t: 'word', id: '捲る', label: '捲る' }), 'まくる', 'a named-list member inherits its spelling’s row');
  });

  row('T13.setup', 'a studied うわて history with its card removed', () => {
    const record = captured(NODES.uwate);
    assert.equal(record.taken[0].entrySeq, '1580400');
    fixtures.set('T13', { ...record, taken: [], srs: { 'word:上手': STUDIED }, revlog: REVLOG('word:上手') });
  });
  row('T13', 'a learning batch skips a conflicting word and keeps the rest of its write', async () => {
    const studied = need('T13');
    const ctx = app({ mode: 'main', record: studied });
    assert.equal(await ctx.commitLearningEnrollment('batch', [{ t: 'word', id: '上手' }, { t: 'word', id: '海' }], () => true), true);
    assert.deepEqual(ctx.latest.taken.map((entry) => entry.id), ['海']);
    assert.equal(bytes(ctx.latest.deepWords), bytes(studied.deepWords));
  });

  row('T14.setup', 'a present row cue beside a snapshot with no reading, an equal one, and H01', () => {
    fixtures.set('T14', {
      absent: enrolledRecord({ entrySeq: '1257810', cueReading: 'めくる' }, '捲る', { seq: '1257810', m: ['to turn over'] }),
      equal: enrolledRecord({ entrySeq: '1257810', cueReading: 'めくる' }, '捲る', { seq: '1257810', r: 'めくる', m: ['to turn over'] }),
      h01: enrolledRecord({ entrySeq: '1257810' }, '捲る', { seq: '1257810', r: 'めくる', m: ['to turn over'] }),
    });
  });
  row('T14', 'Δ1: a present row cue is compared as it is; a snapshot without a reading does not match it', async () => {
    const { absent, equal, h01 } = need('T14');
    const ctx = app({ mode: 'none', record: absent });
    const before = bytes(absent);
    const answer = ctx.savedAnswerFor(absent.taken[0], absent);
    assert.deepEqual([answer.status, answer.reason], ['mismatch', 'reading-conflict']);
    assert.equal(bytes(absent), before, 'no repair write, no invented reading');
    await refusesBothGrades(ctx, 'present cue, absent snapshot reading');
    assert.deepEqual(pick(ctx.savedAnswerFor(equal.taken[0], equal)),
      { status: 'available', seq: '1257810', reading: 'めくる', first: 'to turn over', source: 'saved-legacy' });
    assert.deepEqual(pick(ctx.savedAnswerFor(h01.taken[0], h01)),
      { status: 'available', seq: '1257810', reading: 'めくる', first: 'to turn over', source: 'saved-legacy' });
  });

  row('T15.setup', 'H01’s うわて shape, and a present cue beside a broken snapshot', () => {
    fixtures.set('T15', {
      h01: h01Uwate(),
      broken: { ...blank(), taken: [{ t: 'word', id: '上手', label: '上手', ts: 10, started: 10, entrySeq: '1580400', cueReading: 'うわて' }],
        deepWords: { 上手: { seq: '1580400', m: [] } } },
    });
  });
  row('T15', 'Δ2: an absent row cue takes the matching snapshot’s reading; a present cue stays authoritative', () => {
    const { h01, broken } = need('T15');
    const ctx = app({ mode: 'main', record: h01 });
    assert.deepEqual(roundTrip(ctx.wordCardIdentity(h01, '上手')), { kind: 'seq', seq: '1580400', reading: 'うわて' });
    assert.equal(ctx.wordCaptureState(NODES.kamite, h01), 'conflict');
    assert.equal(ctx.wordCaptureState(NODES.uwateDoor, h01), 'taken');
    const before = bytes(h01);
    assert.throws(() => ctx.captureStorePatch(h01, NODES.kamite, '上手', 2000), (error) => error.code === 'word-identity-conflict',
      'capture of the other reading is a conflict, never a dedupe');
    assert.deepEqual(roundTrip(ctx.captureStorePatch(h01, NODES.uwateDoor, '上手', 2000)), {}, 'the same reading dedupes');
    assert.equal(bytes(h01), before);
    assert.deepEqual(roundTrip(ctx.wordCardIdentity(broken, '上手')), { kind: 'seq', seq: '1580400', reading: 'うわて' });
    assert.equal(ctx.wordCaptureState(NODES.uwateDoor, broken), 'taken', 'a broken card is still its own door’s');
    assert.equal(ctx.wordCaptureState(NODES.kamite, broken), 'conflict');
  });

  /* ---------------------------------------------------------- D23 search stand-in (design r3 FINAL, with Codex's
   * 16:15:01Z, 16:17:40Z, 16:20:08Z and 16:27:39Z conditions): the relation-worded copy (X), search's presentation
   * dedup in both served shapes (S), the core sheet's live doors (N), the critic's preservation table (V), P3 */

  row('X1.setup', 'real conflicts for each relation: ポンド 1126030 at 2855351, うわて at かみて, 1353320 (through its route) at the core door', async () => {
    fixtures.set('X1', { pound: captured(NODES.pound), uwate: captured(NODES.uwate), jozu: (await captureThroughRoute()).record });
  });
  row('X1', 'wordIdentityRelation: its truth table, and the relation each real conflict establishes', () => {
    const { pound, uwate, jozu } = need('X1');
    const ctx = app();
    const seq = (number, reading = null) => ({ kind: 'seq', seq: number, reading });
    const text = { kind: 'text', reading: 'めくる', gloss: 'to turn over' };
    const TABLE = [
      [seq('1126030', 'ポンド'), seq('2855351', 'ポンド'), 'other-entry'],
      [seq('1353320', 'じょうず'), seq('1580400', 'うわて'), 'other-entry'],
      [seq('1580400', 'かみて'), seq('1580400', 'うわて'), 'other-reading'],
      [seq('1580400', null), seq('1580400', 'うわて'), 'unestablished'],
      [seq('1580400', 'うわて'), seq('1580400', null), 'unestablished'],
      [seq('1580400', 'うわて'), seq('1580400', 'うわて'), 'unestablished'],
      [{ kind: 'core' }, seq('1353320', 'じょうず'), 'unestablished'],
      [seq('1353320', 'じょうず'), { kind: 'core' }, 'unestablished'],
      [{ kind: 'core' }, { kind: 'core' }, 'unestablished'],
      [text, seq('1257810', 'めくる'), 'unestablished'],
      [seq('1257810', 'めくる'), text, 'unestablished'],
      [{ kind: 'unknown' }, seq('1257810', 'めくる'), 'unestablished'],
      [seq('1257810', 'めくる'), { kind: 'unknown' }, 'unestablished'],
      [null, seq('1257810', 'めくる'), 'unestablished'],
    ];
    for (const [node, card, expected] of TABLE) assert.equal(ctx.wordIdentityRelation(node, card), expected, JSON.stringify([node, card]));
    const real = (record, door) => {
      const view = app({ record });
      assert.equal(view.wordCaptureState(door), 'conflict', JSON.stringify(door));
      return view.wordIdentityRelation(view.wordNodeIdentity(door, view.S), view.wordCardIdentity(view.S, door.id));
    };
    assert.equal(real(pound, NODES.pond), 'other-entry', 'same reading, another entry number');
    assert.equal(real(uwate, NODES.kamite), 'other-reading', 'one entry, another known reading');
    assert.equal(real(jozu, CORE_DOOR), 'unestablished', 'the core door beside 1353320: R4 keeps them unequal, and nothing says they differ');
    assert.equal(real(uwate, CORE_DOOR), 'unestablished', 'the core door beside 1580400');
    assert.equal(real(jozu, NODES.uwateDoor), 'other-entry', 'the うわて door beside 1353320');
  });

  row('X2.setup', 'the three relations, each as an unstudied and a studied card', () => {
    const { pound, uwate, jozu } = need('X1');
    const studied = (record, id) => ({ ...record, srs: { [`word:${id}`]: STUDIED }, revlog: REVLOG(`word:${id}`) });
    fixtures.set('X2', [
      ['other-entry', pound, NODES.pond, 'ポンド〔ポンド〕 pound (unit of weight)'],
      ['other-reading', uwate, NODES.kamite, '上手〔うわて〕 upper part'],
      ['unestablished', jozu, CORE_DOOR, '上手〔じょうず〕 skillful'],
    ].flatMap(([relation, record, door, shown]) => [
      [relation, 'unstudied', record, door, shown], [relation, 'studied', studied(record, door.id), door, shown]]));
  });
  row('X2', 'with a card enrolled, the held line, both note lines and the route keep r3’s words; the store alert claims nothing, in both languages', () => {
    for (const [relation, review, record, door, shown] of need('X2')) {
      for (const [lang, at] of LANGS) {
        const ctx = app({ mode: 'main', record, lang });
        const label = `${relation} · ${review} · ${lang}`;
        assert.deepEqual([ctx.wordCaptureState(door), ctx.wordCaptureBasis(ctx.S, door.id)], ['conflict', 'card'], label);
        assert.equal(ctx.wordCaptureHeldText(door), COPY.held[relation](door.id)[at], `held · ${label}`);
        const note = noteOf(ctx, door);
        assert.equal(note?.line, COPY[review][relation](door.id, shown)[at], `note · ${label}`);
        assert.deepEqual(labels(note.open), COPY.route.card, `note route · ${label}`);
        assert.equal(storeAlert(lang, 'word-identity-conflict'), COPY.store[at], `store alert · ${lang}`);
      }
    }
    const cold = app({ mode: 'worker' });
    assert.equal(cold.wordCaptureHeldText({ t: 'word', id: '捲る', seq: '1257810', reading: 'めくる' }),
      'This entry’s answer cannot be confirmed yet, so it cannot be memorized.', 'the unavailable line is unchanged');
  });

  row('X3.setup', 'no card left, studied history kept: うわて 1580400 and ポンド 1126030, each card removed after its review', () => {
    const studiedNoCard = (record, id) => ({ ...record, taken: [], srs: { [`word:${id}`]: STUDIED }, revlog: REVLOG(`word:${id}`) });
    const uwate = studiedNoCard(captured(NODES.uwate), '上手');
    const pound = studiedNoCard(captured(NODES.pound), 'ポンド');
    for (const [record, id, seq] of [[uwate, '上手', '1580400'], [pound, 'ポンド', '1126030']]) {
      assert.deepEqual([record.taken.length, record.deepWords[id].seq, !!record.srs[`word:${id}`], record.revlog.length], [0, seq, true, 1],
        `${id}: no card; its snapshot and its review history kept`);
    }
    fixtures.set('X3', [
      ['unestablished', uwate, CORE_DOOR, '上手〔うわて〕 upper part', { t: 'word', id: '上手', seq: '1580400', reading: 'うわて' }],
      ['other-reading', uwate, NODES.kamite, '上手〔うわて〕 upper part', { t: 'word', id: '上手', seq: '1580400', reading: 'うわて' }],
      ['other-entry', pound, NODES.pond, 'ポンド〔ポンド〕 pound (unit of weight)', { t: 'word', id: 'ポンド', seq: '1126030', reading: 'ポンド' }],
    ]);
  });
  row('X3', 'r3.3: with no card left, the held line, the full note, the mini and the route speak of kept history, never of a card that exists', () => {
    for (const [relation, record, door, shown, entry] of need('X3')) {
      for (const [lang, at] of LANGS) {
        const ctx = app({ mode: 'main', record, lang });
        const label = `${relation} · ${lang}`;
        assert.equal(ctx.wordCaptureState(door), 'conflict', label);
        assert.equal(ctx.wordCaptureHeldText(door), COPY.historyHeld[relation](door.id)[at], `held · ${label}`);
        const note = noteOf(ctx, door);
        assert.equal(note?.line, COPY.historyNote[relation](door.id, shown)[at], `note · ${label}`);
        assert.deepEqual(labels(note.open), COPY.route.history, `note route · ${label}`);
        assert.equal(note.replace, undefined, `no card, so nothing to replace · ${label}`);
        const before = bytes(ctx.latest);
        note.open.listeners.click();
        assert.deepEqual(ctx.opened.at(-1), entry, `the route opens the entry the history belongs to · ${label}`);
        // the mini's spelling-only door reaches only the core spelling: the unestablished relation
        if (door === CORE_DOOR) {
          const mini = openMini(ctx, '上手');
          assert.equal(mini.seal.disabled, true, `mini held · ${label}`);
          assert.equal(byId(mini.mini, 'mini-take-reason')?.textContent, COPY.historyHeld.unestablished('上手')[at], `mini line · ${label}`);
          const open = byId(mini.mini, 'mini-take-open');
          assert.deepEqual(labels(open), COPY.route.history, `mini route · ${label}`);
          open.listeners.click({ stopPropagation() {} });
          assert.deepEqual(ctx.opened.at(-1), entry, `mini route · ${label}`);
        }
        assert.equal(bytes(ctx.latest), before, `opening wrote nothing · ${label}`);
        assert.equal(ctx.wordCaptureBasis(ctx.S, door.id), 'history', `basis · ${label}`);
      }
    }
  });

  row('X4.setup', 'the lawful unstudied shape: the うわて card removed before any review, its snapshot kept, no srs and no revlog', () => {
    const record = { ...captured(NODES.uwate), taken: [] };
    assert.deepEqual([record.deepWords['上手'].seq, Object.keys(record.srs).length, record.revlog.length], ['1580400', 0, 0]);
    fixtures.set('X4', record);
  });
  row('X4', 'r3.3.1: a card removed before any review holds nothing: no hold, held line or note, and no claim of kept history or a card at any site', () => {
    const record = need('X4');
    for (const [lang] of LANGS) {
      const ctx = app({ mode: 'main', record, lang });
      for (const door of [CORE_DOOR, NODES.kamite, NODES.uwateDoor]) assert.equal(ctx.wordCaptureState(door), 'take', `${door.reading || 'core'} · ${lang}`);
      assert.equal(noteOf(ctx, CORE_DOOR), null, `no note · ${lang}`);
      const mini = openMini(ctx, '上手');
      assert.deepEqual([mini.seal.disabled, byId(mini.mini, 'mini-take-reason'), byId(mini.mini, 'mini-take-open')], [false, undefined, undefined],
        `the mini is a live 覚 with no held line and no route · ${lang}`);
      const lesson = lessonEnd(record);
      const older = olderSetResult(record);
      for (const main of [lesson, older]) {
        assert.deepEqual([enrollOf(main, '上手')?.disabled, all(main, (node) => node.className === 'enroll-held').length], [false, 0], `enroll rows · ${lang}`);
      }
      const text = [mini.mini, lesson, older].flatMap((root) => all(root, () => true)).map((node) => node.textContent).join('\n');
      assert(!/記録が残って|keeps (review )?history|保存済みのカード|saved card|holds a card/u.test(text), `no history or card claim · ${lang}`);
    }
  });

  row('S1.setup', 'the full index answers 上手 in both modes: 1353320 じょうず and the incompatible 1580400 うわて are scored', async () => {
    const run = await searchBoth('上手');
    const scored = run.batch.scored.map(({ e }) => [e.seq, e.id, e.r, e.g].join('|'));
    assert(scored.includes('1353320|上手|じょうず|skillful'), 'the worker scored 1353320 as it displays');
    assert(scored.includes('1580400|上手|うわて|upper part'), 'the worker scored the incompatible 1580400: the full index is in');
    assert.deepEqual(run.immediate, ids(pageRows(app({ mode: 'none', data: SEARCH }), '上手')), 'before the batch, the core answer alone');
    fixtures.set('S1', run);
  });
  row('S1', '上手: the core row and 1580400 stay; 1353320 is shown once, as the core row in its rank, because the core sheet offers its exact door', () => {
    const run = need('S1');
    assert.deepEqual(exact(sameInBoth(run), '上手'), ['word:上手', 'word:上手:1580400'],
      'the core row, in 1353320’s place, and the other entry; never 1353320 beside them');
    const core = run.worker.searchResults('上手').find((e) => e.core && e.id === '上手');
    const deep = run.batch.scored.map(({ e }) => e).find((e) => e.seq === '1353320');
    assert.deepEqual([deep.w, deep.r, deep.g], [core.w, core.r, core.g], 'condition 1: the displayed triple is byte-identical');
    const door = run.worker.dictionaryHomographChoices('上手').find((choice) => String(choice.row[0]) === '1353320' && choice.summary[0] === 'じょうず');
    assert.equal(door?.enabledOnCore, true, 'condition 2: the core sheet offers 1353320 じょうず as an enabled door');
    assert.equal(run.worker.searchRowShownByCore(deep, core), true);
    assert.deepEqual(clickRow(run, 'word:上手'), CORE_DOOR, 'the core row opens the core word');
    assert.deepEqual(clickRow(run, 'word:上手:1580400'), { t: 'word', id: '上手', seq: '1580400', reading: 'うわて', matchedGloss: 'upper part' });
  });

  row('S2.setup', 'じょうず in both modes, 1353320 scored by its exact reading', async () => {
    const run = await searchBoth('じょうず');
    assert(run.batch.scored.some(({ e }) => e.seq === '1353320' && e.r === 'じょうず' && e.id === '上手'));
    fixtures.set('S2', run);
  });
  row('S2', 'じょうず: the core 上手 row stays, and 1353320 is not shown beside it', () => {
    assert.deepEqual(exact(sameInBoth(need('S2')), '上手'), ['word:上手']);
  });

  row('S3.setup', "'skillful', the core card's first meaning, in both modes", async () => {
    const run = await searchBoth('skillful');
    const scored = run.batch.scored.map(({ e }) => [e.seq, e.g].join('|'));
    assert(scored.includes('1353320|skillful') && scored.includes('1580400|skillful (in comparisons)'));
    fixtures.set('S3', run);
  });
  row('S3', "'skillful': the core 上手 row stays, 1353320 folds into it, and 1580400's own sense keeps its door", () => {
    assert.deepEqual(exact(sameInBoth(need('S3')), '上手'), ['word:上手', 'word:上手:1580400']);
  });

  row('S4.setup', "the critic's literal fixture: core 試 ['shared default', 'tin plate'], entry 9000001 ['shared default', 'tin'], query 'tin'", async () => {
    const run = await searchBoth('tin', TIN);
    assert.equal(run.main.dictionaryCoreMatch('試', TIN.index.entries[0]).compatible, true, 'compatible through the shared default');
    assert(run.batch.scored.some(({ e }) => e.seq === '9000001' && e.g === 'tin'), 'the entry scored its exact secondary gloss');
    fixtures.set('S4', run);
  });
  row('S4', "'tin': the numbered row carrying a meaning the core card lacks stays, beside the core row, and opens that meaning", () => {
    const run = need('S4');
    assert.deepEqual(exact(sameInBoth(run), '試'), ['word:試:9000001', 'word:試']);
    assert.deepEqual(roundTrip(run.worker.searchResults('tin').filter((e) => e.id === '試').map((e) => [e.seq || null, e.r, e.g])),
      [['9000001', 'ためし', 'tin'], [null, 'ためし', 'shared default']]);
    assert.deepEqual(clickRow(run, 'word:試:9000001'), { t: 'word', id: '試', seq: '9000001', reading: 'ためし', matchedGloss: 'tin' });
  });

  row('S5.setup', "'flattery' (a sense 1353320 has and the core card lacks) and ポンド (no core entry) in both modes", async () => {
    const flattery = await searchBoth('flattery');
    assert(!DICT['上手'].m.includes('flattery') && flattery.batch.scored.some(({ e }) => e.seq === '1353320' && e.g === 'flattery'));
    const pound = await searchBoth('ポンド');
    assert.equal(DICT['ポンド'], undefined);
    fixtures.set('S5', { flattery, pound });
  });
  row('S5', 'no scored core row: each numbered row keeps its door, and no core row is invented for it', () => {
    const { flattery, pound } = need('S5');
    assert.deepEqual(exact(sameInBoth(flattery), '上手'), ['word:上手:1353320']);
    assert.deepEqual(clickRow(flattery, 'word:上手:1353320'), { t: 'word', id: '上手', seq: '1353320', reading: 'じょうず', matchedGloss: 'flattery' });
    assert.deepEqual(exact(sameInBoth(pound), 'ポンド'), ['word:ポンド:1126030', 'word:ポンド:2855351']);
  });

  row('S6.setup', 'ぺらぺら: entry 1011580 is scored under ペラペラ, a different exact reading that normalises to the core reading', async () => {
    const run = await searchBoth('ぺらぺら');
    const deep = run.batch.scored.map(({ e }) => e).find((e) => e.seq === '1011580');
    assert.deepEqual([deep.id, deep.r, deep.g], ['ぺらぺら', 'ペラペラ', DICT['ぺらぺら'].m[0]]);
    assert.deepEqual([run.main.kataToHira(deep.r), DICT['ぺらぺら'].r], ['ぺらぺら', 'ぺらぺら'], 'equal only after normalisation');
    fixtures.set('S6', run);
  });
  row('S6', 'a different exact reading stays its own door, though its gloss is the same and its reading normalises equal', () => {
    const run = need('S6');
    assert.deepEqual(exact(sameInBoth(run), 'ぺらぺら'), ['word:ぺらぺら:1011580', 'word:ぺらぺら']);
    assert.deepEqual(clickRow(run, 'word:ぺらぺら:1011580'),
      { t: 'word', id: 'ぺらぺら', seq: '1011580', reading: 'ペラペラ', matchedGloss: DICT['ぺらぺら'].m[0] });
  });

  row('S7.setup', 'りんご: core りんご, and entry 1555480 headed 林檎 that also lists りんご', async () => {
    const run = await searchBoth('りんご');
    assert.equal(run.main.dictionaryCoreMatch('りんご', rowOf.get('1555480')).compatible, true);
    assert(run.batch.scored.some(({ e }) => e.seq === '1555480' && e.id === '林檎'));
    fixtures.set('S7', run);
  });
  row('S7', 'an entry shown under another spelling (林檎) stays, and the core りんご row is not replaced by it', () => {
    const sequence = sameInBoth(need('S7'));
    assert.deepEqual([exact(sequence, 'りんご'), exact(sequence, '林檎')], [['word:りんご'], ['word:林檎:1555480']]);
  });

  row('S8.setup', 'two compatible entries: エコノミスト 1028350 and 5746853, and the literal pair 9000011 / 9000012 that display alike', async () => {
    const economist = await searchBoth('エコノミスト');
    for (const seq of ['1028350', '5746853']) assert.equal(economist.main.dictionaryCoreMatch('エコノミスト', rowOf.get(seq)).compatible, true, seq);
    const pair = await searchBoth('試', PAIR);
    for (const row0 of PAIR.index.entries) assert.equal(pair.main.dictionaryCoreMatch('試', row0).compatible, true, row0[0]);
    fixtures.set('S8', { economist, pair });
  });
  row('S8', 'two compatible entries both stay reachable: a distinct gloss as its own row, an identical display through the core sheet’s door', () => {
    const { economist, pair } = need('S8');
    assert.deepEqual(exact(sameInBoth(economist), 'エコノミスト'), ['word:エコノミスト', 'word:エコノミスト:5746853']);
    assert.deepEqual(clickRow(economist, 'word:エコノミスト:5746853'),
      { t: 'word', id: 'エコノミスト', seq: '5746853', reading: 'エコノミスト', matchedGloss: 'The Economist (weekly newspaper)' });
    for (const seq of ['1028350', '5746853']) {
      assert.deepEqual(throughDoor(app({ mode: 'main' }), 'エコノミスト', seq, 'エコノミスト'), { t: 'word', id: 'エコノミスト', seq, reading: 'エコノミスト', from: null });
    }
    assert.deepEqual(sameInBoth(pair), ['word:試'], 'both display exactly as the core row: shown once');
    for (const seq of ['9000011', '9000012']) {
      assert.deepEqual(throughDoor(app({ mode: 'main', data: PAIR }), '試', seq, 'ためし'), { t: 'word', id: '試', seq, reading: 'ためし', from: null });
    }
  });

  row('S9.setup', '学校 and がっこう in both modes; 学校 has exactly one entry, 1206730 がっこう', async () => {
    const kanji = await searchBoth('学校');
    const kana = await searchBoth('がっこう');
    assert(kanji.batch.scored.some(({ e }) => e.seq === '1206730' && e.r === 'がっこう' && e.g === 'school'));
    assert.deepEqual(roundTrip(kanji.main.dictionaryHomographChoices('学校').map((choice) => [String(choice.row[0]), choice.summary[0]])),
      [['1206730', 'がっこう']]);
    fixtures.set('S9', { kanji, kana });
  });
  row('S9', '学校, one entry: 1206730 folds into the core row only because the core sheet renders its lone door (B2)', () => {
    const { kanji, kana } = need('S9');
    assert.deepEqual([exact(sameInBoth(kanji), '学校'), exact(sameInBoth(kana), '学校')], [['word:学校'], ['word:学校']]);
    assert.equal(kanji.worker.dictionaryHomographChoices('学校')[0].enabledOnCore, true);
    const sheet = coreSheet(app({ mode: 'main' }), '学校');
    assert.deepEqual(sheet.title, ['辞書の項目', 'Dictionary entry']);
    assert.deepEqual(sheet.doors.map(({ seq, reading, pressed, active }) => [seq, reading, pressed, active]), [['1206730', 'がっこう', 'false', false]]);
    assert.deepEqual(clickRow(kanji, 'word:学校'), { t: 'word', id: '学校' });
  });

  row('S10.setup', 'every search above, in both modes', () => {
    const { flattery, pound } = need('S5');
    const { economist, pair } = need('S8');
    const { kanji, kana } = need('S9');
    fixtures.set('S10', { runs: [need('S1'), need('S2'), need('S3'), need('S4'), flattery, pound, need('S6'), need('S7'), economist, pair, kanji, kana],
      cores: [['上手', '上手'], ['じょうず', '上手'], ['skillful', '上手'], ['tin', '試'], ['ぺらぺら', 'ぺらぺら'], ['りんご', 'りんご'],
        ['エコノミスト', 'エコノミスト'], ['試', '試'], ['学校', '学校'], ['がっこう', '学校']] });
  });
  row('S10', 'a restored core row is unique: no row repeats, and each exact core word appears once', () => {
    const { runs, cores } = need('S10');
    for (const run of runs) {
      for (const sequence of [ids(run.mainRows), ids(run.workerRows)]) {
        assert.equal(new Set(sequence).size, sequence.length, `${run.query}: no row repeats`);
      }
    }
    for (const [query, id] of cores) {
      const run = runs.find((entry) => entry.query === query);
      assert.deepEqual([ids(run.mainRows), ids(run.workerRows)].map((sequence) => sequence.filter((entry) => entry === `word:${id}`).length), [1, 1],
        `${query}: word:${id} once in each mode`);
    }
  });

  row('S11.setup', "'上', a broad query whose first 40 rows fold dozens of numbered rows into core words (worker, the served path)", async () => {
    const run = await searchBoth('上');
    assert.equal(run.batch.scored.length, 40, 'the worker returned a full batch');
    fixtures.set('S11', run);
  });
  row('S11', 'a folded row never hides its word: each numbered row folded before the last numbered row shown has its core row shown, in its place', () => {
    const run = need('S11');
    const results = run.worker.searchResults('上');
    const index = vm.runInContext('searchIndex', run.worker);
    const batch = run.batch.scored.map(({ e }) => e);
    const reach = Math.max(...results.map((e) => batch.indexOf(e)));
    let folded = 0;
    for (const deep of batch.slice(0, reach)) {
      const core = index.find((entry) => entry.core && entry.id === deep.id);
      if (!core || !run.worker.searchRowShownByCore(deep, core)) continue;
      folded += 1;
      assert(results.includes(core), `${deep.id} ${deep.seq}: folded into word:${core.id}, which must be shown`);
      assert(results.indexOf(core) <= results.indexOf(batch[reach]), `word:${core.id} takes the folded row’s rank`);
    }
    assert(folded >= 10, `the check reached ${folded} folded rows`);
  });

  row('N1.setup', 'seq-less core sheets: 上手, セント (two compatible entries, one resolved) and 学校 (one entry)', () => {
    const sheets = Object.fromEntries(['上手', 'セント', '学校'].map((id) => [id, coreSheet(app({ mode: 'main' }), id)]));
    assert.deepEqual([sheets['上手'].shown, sheets['セント'].shown, sheets['学校'].shown], [['1353320'], ['1075090'], ['1206730']],
      'the entry each sheet’s senses come from');
    assert.equal(sheets['セント'].resolved, '1075090', 'セント resolves 1075090 among its compatible entries');
    fixtures.set('N1', true);
  });
  row('N1', 'the default entry’s door on a seq-less core sheet is live: its click pushes {t, id, seq, reading} with the exact reading, and that entry opens', () => {
    need('N1');
    for (const [id, seq, reading] of [['上手', '1353320', 'じょうず'], ['セント', '1075090', 'セント'], ['学校', '1206730', 'がっこう']]) {
      const ctx = app({ mode: 'main' });
      const { node, doors } = coreSheet(ctx, id);
      const door = doors.find((entry) => entry.seq === seq && entry.reading === reading);
      assert(door, `${id}: the core sheet renders the door of the entry its senses come from`);
      assert.deepEqual(clickDoor(ctx, door), { t: 'word', id, seq, reading, from: null }, `${id}: a click pushed that entry and its exact reading`);
      assert.equal(ctx.S.stack[0], node, `${id}: it pushed; ← 戻る returns to the core word`);
      const top = ctx.S.stack.at(-1);
      assert.deepEqual(roundTrip(ctx.wordNodeIdentity(top)), { kind: 'seq', seq, reading }, `${id}: the opened sheet stands for that entry`);
      assert.deepEqual([String(ctx.lookup(top.id, top.seq, top.reading).seq), ctx.lookup(top.id, top.seq, top.reading).r], [seq, reading]);
      const opened = doorsOf((() => { const sheet = new FakeElement('div'); ctx.renderDictionaryHomographs(sheet, top); return sheet; })());
      const own = opened.find((entry) => entry.seq === seq && entry.reading === reading);
      if (own) {
        assert.deepEqual([own.pressed, own.active], ['true', true], `${id}: on its own sheet the entry is marked`);
        assert.equal(clickDoor(ctx, own), null, `${id}: and it is no door to itself`);
      } else assert.equal(id, '学校', 'only a one-entry form has no block on its explicit sheet');
    }
  });

  row('V1.setup', 'the 1353320 じょうず door reached through the core sheet and captured from it (Codex 16:27:39Z)', async () => {
    fixtures.set('V1', await captureThroughRoute());
  });
  row('V1', 'a 1353320 capture through the retained route stays explicit: seq, exact cue, saved answer and selection; never core', () => {
    const { top, record } = need('V1');
    assert.deepEqual(top, { ...JOZU, from: null });
    const [card] = record.taken;
    assert.deepEqual([record.taken.length, card.id, card.entrySeq, card.cueReading], [1, '上手', '1353320', 'じょうず']);
    const snap = record.deepWords['上手'];
    assert.deepEqual([snap.seq, snap.r, snap.m[0]], ['1353320', 'じょうず', 'skillful']);
    assert.deepEqual(snap.selection, { v: 1, seq: '1353320', r: 'じょうず', head: '上手',
      src: { release: metadata.source.pin, archiveSha256: metadata.source.jmdict.sha256 } });
    const ctx = app({ mode: 'none', record });
    assert.deepEqual(pick(ctx.savedAnswerFor(card, record)), { status: 'available', seq: '1353320', reading: 'じょうず', first: 'skillful', source: 'selection' });
    assert.deepEqual(roundTrip(ctx.wordCardIdentity(record, '上手')), { kind: 'seq', seq: '1353320', reading: 'じょうず' }, 'never cast to core');
    assert.deepEqual([ctx.wordCaptureState(CORE_DOOR), ctx.wordCaptureState(JOZU)], ['conflict', 'taken'], 'R4 unchanged');
  });

  row('V2.setup', 'the route-captured 1353320 card', () => { fixtures.set('V2', need('V1').record); });
  row('V2', 'that card at the core mini: held with the unestablished line, nothing written, and its open route to the retained entry', async () => {
    const record = need('V2');
    for (const [lang, at] of LANGS) {
      const ctx = app({ mode: 'none', record, lang });
      const before = bytes(ctx.latest);
      const mini = openMini(ctx, '上手');
      assert.equal(mini.seal.disabled, true);
      assert.equal(byId(mini.mini, 'mini-take-reason')?.textContent, COPY.held.unestablished('上手')[at], `mini line · ${lang}`);
      await clickSeal(mini.seal);
      const open = byId(mini.mini, 'mini-take-open');
      assert(open, 'the held mini offers the card');
      assert.deepEqual(labels(open), COPY.route.card, 'a card is there: 「そのカードを開く」');
      open.listeners.click({ stopPropagation() {} });
      assert.deepEqual(ctx.opened.at(-1), JOZU, 'it opens the retained entry and exact reading');
      assert.deepEqual([bytes(ctx.latest), ctx.sealSyncs], [before, 0], 'opening wrote nothing');
      const note = noteOf(ctx, CORE_DOOR);
      assert.equal(note.line, COPY.unstudied.unestablished('上手', '上手〔じょうず〕 skillful')[at], `note line · ${lang}`);
      assert.deepEqual(labels(note.open), COPY.route.card);
      note.open.listeners.click();
      assert.deepEqual(ctx.opened.at(-1), JOZU, 'the note opens the same card');
      assert.equal(bytes(ctx.latest), before);
      assert.equal(ctx.wordCaptureState(ctx.opened.at(-1)), 'taken', 'the opened door is the card’s own');
    }
  });

  row('V3.setup', 'the route-captured card, plain and beside a valid assessment root (the actual modules)', async () => {
    const authority = await assessmentAuthority();
    const root = authority.learning.suppressAssessmentLearning(
      { assessmentLearning: authority.learning.createAssessmentLearning(SCOPE) }, 'word:earlier', 1).assessmentLearning;
    authority.learning.parseAssessmentLearning(root, SCOPE);
    const plain = need('V1').record;
    fixtures.set('V3', { authority, plain, assessed: { ...plain, assessmentLearning: root } });
  });
  row('V3', 'through the opened route the card is removed, or suppressed for real; a core-door write still refuses', async () => {
    const { authority, plain, assessed } = need('V3');
    const opened = (ctx) => {
      byId(openMini(ctx, '上手').mini, 'mini-take-open').listeners.click({ stopPropagation() {} });
      return ctx.opened.at(-1);
    };
    let ctx = app({ mode: 'none', record: plain });
    let before = bytes(ctx.latest);
    assert.equal(await ctx.toggleTaken(CORE_DOOR, '上手'), false, 'the core door removes nothing');
    assert.throws(() => ctx.captureStorePatch(ctx.latest, CORE_DOOR, '上手', 2000), (error) => error.code === 'word-identity-conflict');
    assert.equal(bytes(ctx.latest), before);
    assert.equal(await ctx.toggleTaken(opened(ctx), '上手'), true, 'the opened route removes the card');
    assert.deepEqual(roundTrip(ctx.latest.taken), []);
    assert.equal(bytes(ctx.latest.deepWords), bytes(plain.deepWords), 'its saved answer stays with the spelling');
    ctx = app({ mode: 'none', record: assessed, authority });
    before = bytes(ctx.latest);
    assert.equal(await ctx.toggleTaken(CORE_DOOR, '上手'), false, 'the core door suppresses nothing');
    assert.deepEqual([bytes(ctx.latest), roundTrip(ctx.suppressions)], [before, []]);
    const prior = roundTrip(ctx.latest);
    assert.equal(await ctx.toggleTaken(opened(ctx), '上手'), true, 'the opened route suppresses that card');
    assert.deepEqual(roundTrip(ctx.suppressions).map((input) => [input.kind, input.key]), [['remove', 'word:上手']]);
    assert.deepEqual(roundTrip(ctx.latest.assessmentLearning.suppressions.map((entry) => entry.key)), ['word:earlier', 'word:上手']);
    const { v, ...rest } = roundTrip(ctx.latest);
    assert.equal(v, 2);
    assert.deepEqual({ ...rest, taken: prior.taken, assessmentLearning: prior.assessmentLearning }, prior,
      'only taken, assessmentLearning and the record version change');
  });

  row('V4.setup', 'a studied plain core 上手 card, an unstudied one, and the 1353320 door reached through the core sheet', () => {
    const unstudied = captured(CORE_DOOR);
    assert.equal(Object.hasOwn(unstudied.taken[0], 'entrySeq'), false);
    const studied = { ...unstudied, srs: { 'word:上手': STUDIED }, revlog: REVLOG('word:上手') };
    fixtures.set('V4', { studied, unstudied, door: throughDoor(app({ mode: 'main', record: studied }), '上手', '1353320', 'じょうず') });
  });
  row('V4', 'a historical core card at a compatible explicit door keeps its core bytes and history: nothing assigned, deduped, suppressed or replaced', async () => {
    const { studied, unstudied, door } = need('V4');
    const ctx = app({ mode: 'main', record: studied });
    const before = bytes(ctx.latest);
    assert.equal(ctx.wordCaptureState(door), 'conflict');
    assert.equal(ctx.wordCaptureHeldText(door), COPY.held.unestablished('上手')[1]);
    for (const options of [{}, { replace: true }]) {
      assert.throws(() => ctx.captureStorePatch(ctx.latest, door, '上手', 3000, null, options), (error) => error.code === 'word-identity-conflict');
    }
    assert.equal(await ctx.toggleTaken(door, '上手'), false, 'no removal through the entry door');
    assert.equal(await ctx.replaceWordCard(door, '上手'), false, 'a studied card is never replaced');
    assert.equal(bytes(ctx.latest), before);
    assert.deepEqual([roundTrip(ctx.wordCardIdentity(ctx.latest, '上手')), Object.hasOwn(ctx.latest.deepWords, '上手')], [{ kind: 'core' }, false]);
    const fresh = app({ mode: 'main', record: unstudied });
    assert.throws(() => fresh.captureStorePatch(fresh.latest, door, '上手', 3000), (error) => error.code === 'word-identity-conflict',
      'unstudied, it is still no silent swap');
    assert.deepEqual(roundTrip(fresh.captureStorePatch(fresh.latest, door, '上手', 3000, null, { replace: true }).taken.map((entry) => entry.entrySeq)),
      ['1353320'], 'the explicit replacement stays its own, requested action');
  });

  row('V5.setup', 'the うわて and ポンド 1126030 cards, and the route-captured 1353320 card', () => {
    fixtures.set('V5', { uwate: captured(NODES.uwate), pound: captured(NODES.pound), jozu: need('V1').record });
  });
  row('V5', '1580400, same seq other reading, same reading other seq and a stale latest record keep their precise conflict and write nothing', async () => {
    const { uwate, pound, jozu } = need('V5');
    const refuses = async (record, door, relation, label) => {
      const ctx = app({ mode: 'main', record });
      const before = bytes(ctx.latest);
      assert.equal(ctx.wordCaptureState(door), 'conflict', label);
      assert.equal(ctx.wordCaptureHeldText(door), COPY.held[relation](door.id)[1], label);
      assert.throws(() => ctx.captureStorePatch(ctx.latest, door, door.id, 4000), (error) => error.code === 'word-identity-conflict', label);
      assert.equal(await ctx.toggleTaken(door, door.id), false, label);
      assert.equal(bytes(ctx.latest), before, `${label}: nothing written`);
    };
    await refuses(uwate, CORE_DOOR, 'unestablished', '1580400 at the core door');
    await refuses(uwate, throughDoor(app({ mode: 'main', record: uwate }), '上手', '1353320', 'じょうず'), 'other-entry', '1580400 at the 1353320 door');
    await refuses(uwate, NODES.kamite, 'other-reading', 'same seq, other reading');
    await refuses(pound, NODES.pond, 'other-entry', 'same reading, other seq');
    const ctx = app({ mode: 'none', record: uwate, view: jozu });
    byId(openMini(ctx, '上手').mini, 'mini-take-open').listeners.click({ stopPropagation() {} });
    assert.deepEqual(ctx.opened.at(-1), JOZU, 'painted for 1353320, the route opens it');
    const before = bytes(ctx.latest);
    assert.equal(await ctx.toggleTaken(ctx.opened.at(-1), '上手'), false, 'the latest record holds うわて: the producer refuses');
    assert.equal(bytes(ctx.latest), before);
  });

  row('P3.setup', 'a lesson and an older set ending with 上手 and 海: the route-captured 1353320 card, and a studied うわて history with no card', () => {
    const history = { ...captured(NODES.uwate), taken: [], srs: { 'word:上手': STUDIED }, revlog: REVLOG('word:上手') };
    assert(DICT['海'] && DICT['上手']);
    fixtures.set('P3', { jozu: need('V1').record, history });
  });
  row('P3', 'the lesson and older-set enroll rows say why 上手 is held, with 覚える held, and leave it out of the batch', () => {
    const { jozu, history } = need('P3');
    // the enrolled 1353320 card keeps r3's line; the card-less studied history speaks of kept history (r3.3)
    const lines = [[jozu, COPY.held.unestablished('上手')[1]], [history, COPY.historyHeld.unestablished('上手')[1]]];
    for (const [record, line] of lines) {
      const main = lessonEnd(record);
      const held = enrollOf(main, '上手');
      assert.deepEqual([held.disabled, held.textContent, held.classList.contains('word-capture-held')], [true, 'memorize', true]);
      assert.equal(byId(main, held.getAttribute('aria-describedby'))?.textContent, line);
      assert.deepEqual([enrollOf(main, '海').disabled, enrollOf(main, '海').textContent], [false, 'memorize']);
      assert.equal(byId(main, 'lesson-enroll-all')?.textContent, 'memorize all 1', 'the batch holds only 海');
    }
    // the older set, over the enrolled card and over the history with no card (Codex 17:33:57Z)
    for (const [record, line] of lines) {
      const main = olderSetResult(record);
      const held = enrollOf(main, '上手');
      assert(held, 'the missed 上手 row carries its 覚える, held, enrolled spelling or not');
      assert.deepEqual([held.disabled, held.classList.contains('word-capture-held')], [true, true]);
      assert.equal(byId(main, held.getAttribute('aria-describedby'))?.textContent, line);
      assert.equal(enrollOf(main, '海').disabled, false);
      assert.equal(byId(main, 'mock-enroll-all')?.textContent, 'memorize all 1 missed');
    }
  });

  row('P3b.setup', 'an older set that missed 上手 and 海, over the route-captured 1353320 card and over a plain core 上手 card', () => {
    fixtures.set('P3b', { jozu: need('V1').record, core: captured(CORE_DOOR) });
  });
  row('P3b', 'regression (Codex 17:33:57Z): the older set shows the hold for a spelling enrolled as another identity; one enrolled as itself stays quiet', () => {
    const { jozu, core } = need('P3b');
    let main = olderSetResult(jozu);
    const held = enrollOf(main, '上手');
    assert(held, 'the 1353320 card holds the spelling: the core subject 上手 still shows its 覚える, held');
    assert.deepEqual([held.disabled, held.classList.contains('word-capture-held')], [true, true]);
    assert.equal(byId(main, held.getAttribute('aria-describedby'))?.textContent, COPY.held.unestablished('上手')[1]);
    assert.equal(byId(main, 'mock-enroll-all')?.textContent, 'memorize all 1 missed', 'the batch still holds only 海');
    main = olderSetResult(core);
    assert.equal(enrollOf(main, '上手'), undefined, 'a spelling enrolled as itself shows no 覚える, as before');
    assert.equal(all(main, (node) => node.className === 'enroll-held').length, 0, 'and no held line');
    assert.equal(byId(main, 'mock-enroll-all')?.textContent, 'memorize all 1 missed');
  });

  row('X5.setup', 'the route-captured 1353320 card and the card-less studied うわて history, each holding the core spelling 上手', () => {
    const jozu = need('V1').record;
    const history = { ...captured(NODES.uwate), taken: [], srs: { 'word:上手': STUDIED }, revlog: REVLOG('word:上手') };
    for (const [name, record] of [['card', jozu], ['history', history]]) {
      assert.equal(app({ mode: 'main', record }).wordCaptureState(CORE_DOOR), 'conflict', `the core spelling is held · ${name}`);
    }
    fixtures.set('X5', { jozu, history });
  });
  row('X5', 'NM review-1, third site: a surface with no route of its own (the sentence sheet’s seal) says only what cannot be done; the rest keep “open that card”', () => {
    const { jozu, history } = need('X5');
    for (const [lang, at] of LANGS) {
      let ctx = app({ mode: 'main', record: jozu, lang });
      assert.equal(ctx.wordCaptureHeldText(CORE_DOOR), COPY.held.unestablished('上手')[at], `with a route: the instruction · ${lang}`);
      assert.equal(ctx.wordCaptureHeldText(CORE_DOOR, { route: false }), COPY.heldNoRoute.unestablished('上手')[at], `without a route: none · ${lang}`);
      // kept history already says only what cannot be done here: the same line with or without a route
      ctx = app({ mode: 'main', record: history, lang });
      assert.equal(ctx.wordCaptureHeldText(CORE_DOOR), COPY.historyHeld.unestablished('上手')[at], `history · ${lang}`);
      assert.equal(ctx.wordCaptureHeldText(CORE_DOOR, { route: false }), COPY.historyHeld.unestablished('上手')[at], `history, no route · ${lang}`);
    }
  });

  row('P3r.setup', 'the P3 records, and a plain core 上手 card: a lesson and an older set ending with 上手 and 海', () => {
    const history = { ...captured(NODES.uwate), taken: [], srs: { 'word:上手': STUDIED }, revlog: REVLOG('word:上手') };
    fixtures.set('P3r', { jozu: need('V1').record, history, core: captured(CORE_DOOR) });
  });
  row('P3r', 'NM review-1: a held lesson or older-set row offers the route its held line names, right after that line, labelled by basis; it opens the retained entry and writes nothing', () => {
    const { jozu, history, core } = need('P3r');
    const kept = [[jozu, COPY.route.card, JOZU], [history, COPY.route.history, { t: 'word', id: '上手', seq: '1580400', reading: 'うわて' }]];
    for (const [screen, render, prefix] of [['lesson', lessonEndOf, 'lesson-enroll-open-'], ['older set', olderSetResultOf, 'mock-enroll-open-']]) {
      for (const [record, route, entry] of kept) {
        const { ctx, main } = render(record);
        const label = `${screen} · ${route[1]}`;
        const held = enrollOf(main, '上手');
        const open = byId(main, `${prefix}0`);
        assert(open, `the held 上手 row offers its route · ${label}`);
        assert.deepEqual([open.tag, open.type, labels(open)], ['button', 'button', route], `labelled by basis · ${label}`);
        const parent = find(main, (node) => node.children?.includes(open));
        assert.equal(parent.children[parent.children.indexOf(open) - 1]?.id, held.getAttribute('aria-describedby'), `right after the held line · ${label}`);
        assert.equal(byId(main, `${prefix}1`), undefined, `海 is free: no route · ${label}`);
        const before = bytes(ctx.latest);
        open.listeners.click();
        assert.deepEqual(ctx.opened.at(-1), entry, `it opens the retained entry and exact reading · ${label}`);
        assert.equal(bytes(ctx.latest), before, `opening wrote nothing · ${label}`);
        assert.equal(held.disabled, true, `覚える stays held · ${label}`);
      }
      // a spelling enrolled as itself is not held: no held line, so no route
      const { main } = render(core);
      assert.equal(all(main, (node) => String(node.className || '').includes('enroll-held-open')).length, 0, `self-enrolled 上手: no route · ${screen}`);
    }
  });
}
