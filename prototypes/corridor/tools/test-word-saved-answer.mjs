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
    'advanceReviewSession', 'srsSchedulerInstant', 'srsReviewLogRow', 'srsStoredRecord'];
  const lifted = ast.statements.filter((statement) => {
    const declared = ts.isFunctionDeclaration(statement) ? [statement.name?.text]
      : ts.isVariableStatement(statement) ? statement.declarationList.declarations.map((node) => node.name.getText(ast)) : [];
    return declared.some((name) => NAMES.includes(name));
  });
  assert.equal(lifted.length, NAMES.length, 'every lifted definition is one authored top-level statement');
  const PROGRAM = lifted.map((statement) => statement.getText(ast)).join('\n');

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

  function makeD(mode) {
    const D = { dict: DICT, words: WORDS, kanji: {}, radicals: {}, idioms: {} };
    const maps = () => ({ dictionaryBySeq: new Map(), dictionaryByForm: new Map(), dictionaryCompleteForms: new Set() });
    if (mode === 'main') Object.assign(D, { dictionaryIndex: index, dictionaryMode: 'main', dictionaryState: 'ready', ...maps() });
    if (mode === 'worker') Object.assign(D, { dictionaryIndex: metadata, dictionaryMode: 'worker', dictionaryState: 'ready', ...maps() });
    if (mode === 'error') Object.assign(D, { dictionaryState: 'error', dictionaryError: new Error('offline') });
    return D;
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
  function app({ mode = 'none', record = blank(), view = null, trap = false, authority = null } = {}) {
    const D = makeD(mode);
    const context = vm.createContext({
      D: trap ? trapped(D) : D,
      S: roundTrip(view || record),
      latest: roundTrip(record),
      suppressions: [], failures: [], lastError: null,
      fsrsApi, scheduler: fsrsApi.fsrs({ enable_fuzz: false }),
      tx: (_ja, en) => en, bi: () => true, GRAMMARS: () => [], PARTICLES: [],
      recordEpoch: 1, recordWritable: () => true, recordReady: () => true, render: () => {},
      recordFailure: (reason) => { context.failures.push(reason); },
      resetAssessmentQuestionReview: () => {},
      queueAssessmentWork: (work) => work(),
      practiceIdentity: (prefix) => `${prefix}-synthetic`,
      el: (tag, cls, text) => new FakeElement(tag, cls, text),
      biLabel: (tag, cls, _ja, en) => new FakeElement(tag, cls, en),
      document: { querySelectorAll: () => [], body: { append: () => {} } },
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
}
