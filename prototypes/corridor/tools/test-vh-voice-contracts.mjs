import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selection, exactRoster, SENSE_GROUPS, SPEAK_CASE_IDS, SPEAK_CONTROL_IDS_BY_ENGINE, speakControlPlan, senseAttempts, readingInteraction, speakCompletion, adjudicateSpeakPhase } from './vh-voice-contracts.mjs';

for (const raw of ['', 'p', 'unknown', 'g,g', 'g,', ',g']) test(`selector refuses ${JSON.stringify(raw)}`, () => {
  assert.throws(() => selection(raw, SENSE_GROUPS, 'SENSE_TRUTH_ONLY'));
});
test('an explicitly complete selection remains selected, not unfiltered', () => {
  assert.equal(selection(undefined, SENSE_GROUPS, 'sense'), null);
  assert.deepEqual(selection('f0,g,w,c', SENSE_GROUPS, 'sense'), SENSE_GROUPS);
});
test('rosters reject empty, missing and duplicate-hides-missing', () => {
  assert.equal(exactRoster([], []), false);
  assert.equal(exactRoster(['A', 'B'], ['A', 'A']), false);
  assert.equal(exactRoster(['A', 'B'], ['A']), false);
  assert.equal(exactRoster(['A', 'B'], ['B', 'A']), true);
});
const timeout = (stage) => Object.assign(new Error('controlled timeout'), { name: 'TimeoutError', senseStage: stage });
for (const ok of [false, true]) test(`completed ${ok ? 'green' : 'red'} survives subsequent navigation timeout`, async () => {
  const rows = [], history = []; let runs = 0;
  await senseAttempts({ emit: (row) => rows.push(row), history, run: async (emit) => {
    runs++; emit({ id: 'G.fixture', title: 'sense', ok, observed: { line: 'wrong' } }); throw timeout('navigation');
  } });
  assert.equal(runs, 1); assert.equal(rows.length, 2); assert.equal(rows[0].ok, ok);
  assert.equal(rows[1].ok, false); assert.equal(history[0].retry, false);
  assert(Object.isFrozen(rows[0].observed));
});
test('one setup timeout can retry, ordinary errors and second timeouts cannot', async () => {
  for (const [errors, expectedRuns, expectedRed] of [[ [timeout('setup')], 2, false ], [ [new Error('setup error')], 1, true ], [ [timeout('setup'), timeout('setup')], 2, true ]]) {
    const rows = [], history = []; let runs = 0;
    await senseAttempts({ emit: (row) => rows.push(row), history, run: async (emit) => {
      const error = errors[runs++]; if (error) throw error; emit({ id: 'G', ok: true });
    } });
    assert.equal(runs, expectedRuns); assert.equal(rows.some((row) => !row.ok), expectedRed);
    assert.equal(history.length, expectedRuns);
  }
});
test('SENSE-1: actual grokCase publishes its wrong G before pageSense throws', async () => {
  const source = readFileSync(new URL('./verify-sense-truth.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function grokCase(page, fixture, emit)');
  const end = source.indexOf('/* ------------------------------------------------------------------ W', start);
  const context = vm.createContext({ openArticle: async () => true, vhControl: '',
    card: async () => ({ lines: ['wrong sense'], sense: '1:0', word: 'word', more: '' }),
    PAGE: new Set(['fixture']), led: (rows) => rows, glossesOf: () => ['correct sense'],
    pageSense: async () => { throw timeout('navigation'); }, readingInteraction });
  vm.runInContext(source.slice(start, end), context);
  const rows = [], history = []; let runs = 0;
  await senseAttempts({ emit: (row) => rows.push(row), history, run: async (emit) => {
    runs++; await context.grokCase({}, { name: 'fixture', at: 'article', index: 1, seq: '1', k: 0, kind: 'sense', never: 'wrong sense' }, emit);
  } });
  assert.equal(runs, 1); assert.equal(rows[0].id, 'G.fixture'); assert.equal(rows[0].ok, false);
  assert.equal(rows[1].id, 'incomplete'); assert.equal(history[0].retry, false);
});
test('SENSE-2: contradictory product flags never select the expected law', () => {
  assert.equal(readingInteraction('inert-annotation', { annotation: false, interactive: true, mini: false }), false);
  assert.equal(readingInteraction('reading-card', { annotation: true, interactive: false }), false);
  assert.equal(readingInteraction('inert-annotation', { annotation: true, interactive: false, mini: false, sheet: false, rung: null }), true);
  assert.equal(readingInteraction('reading-card', { annotation: false, interactive: true }), true);
});
const fixture = (ids, engine = 'webkit') => ({
  cases: ids.map((id) => ({ engine, case: id, completed: true, pass: true, checks: 1 })),
  checks: ids.map((id) => ({ engine, case: id, name: 'intended witness', pass: true })),
});
test('Speak exact S1–S23 plus egress; partial/hidden fault/overlay cannot accept', () => {
  const full = fixture([...SPEAK_CASE_IDS, 'egress']);
  assert.equal(speakCompletion({ engines: ['webkit'], selected: null, ...full }).fullAcceptance, true);
  assert.equal(speakCompletion({ engines: ['webkit', 'chromium'], selected: null, ...full }).fullAcceptance, false);
  for (const extra of [{ selected: SPEAK_CASE_IDS }, { fault: 'revlog' }, { overlay: true }])
    assert.equal(speakCompletion({ engines: ['webkit'], selected: null, ...full, ...extra }).fullAcceptance, false);
  const partial = speakCompletion({ engines: ['webkit'], selected: ['S1'], ...fixture(['S1']) });
  assert.equal(partial.selectedPassed, true); assert.equal(partial.fullAcceptance, false);
  for (const cases of [[], [full.cases[0]], full.cases.map((row, i) => i === 1 ? full.cases[0] : row)])
    assert.equal(speakCompletion({ engines: ['webkit'], selected: null, ...full, cases }).fullAcceptance, false);
});
test('Speak control applicability is explicit: 22 WebKit, 21 Chromium, no fictitious skipped kill', () => {
  for (const [engine, count] of [['webkit', 22], ['chromium', 21]]) {
    const plan = speakControlPlan([engine]);
    assert.equal(plan.jobs.length, count); assert.equal(plan.requestedScope.length, count);
    assert.deepEqual(plan.applicability[engine], SPEAK_CONTROL_IDS_BY_ENGINE[engine]);
    assert.equal(plan.jobs.some(job => job.name === 'blob-kept'), engine === 'webkit');
  }
  assert.equal(speakControlPlan(['webkit', 'chromium']).jobs.length, 43);
  assert.deepEqual(speakControlPlan(['webkit', 'chromium'], ['blob-kept']).jobs, [{ engine: 'webkit', name: 'blob-kept' }]);
  assert.throws(() => speakControlPlan(['chromium'], ['blob-kept']), /inapplicable/u);
  assert.throws(() => speakControlPlan(['chromium'], []), /invalid/u);
});
test('real CLI rejects Chromium-only blob control before artifact assembly or a browser', () => {
  for (const variable of ['SPEAK_NEGATIVES', 'SPEAK_FAULT']) {
    const env = { ...process.env, KAIRO_BROWSER: 'chromium' };
    for (const key of ['KAIRO_SITE_DIR', 'KAIRO_ARTIFACT_SHA256', 'SPEAK_CASES', 'SPEAK_NEGATIVES', 'SPEAK_FAULT', 'SPEAK_OVERLAY_SOURCE']) delete env[key];
    env[variable] = 'blob-kept';
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('./verify-speak.mjs', import.meta.url)), ...(variable === 'SPEAK_NEGATIVES' ? ['--negatives'] : [])], { env, encoding: 'utf8', timeout: 10000 });
    assert.equal(child.error, undefined); assert.equal(child.status, 1); assert.match(child.stderr, /inapplicable/u);
    assert.doesNotMatch(child.stderr, /browserType\.launch|Pin an immutable|Assembly failed/u);
  }
});
const negativeReceipt = () => ({ nonce: 'fresh', phase: 'mutant', fault: 'fault', artifactSha256: 'artifact', verifierSha256: 'tool',
  pageErrors: [], ...fixture(['S1']), checks: [{ engine: 'webkit', case: 'S1', name: 'intended witness', pass: false }] });
const adjudicate = (receipt, extra = {}) => adjudicateSpeakPhase({ receipt, exit: 1, nonce: 'fresh', engine: 'webkit', cases: ['S1'], fault: 'fault', witness: { S1: /^intended witness$/u }, ...extra });
test('Speak negatives require named completed witness; unrelated reds, stale evidence and timeouts never kill', () => {
  assert.equal(adjudicate(negativeReceipt()).ok, true);
  for (const mutate of [
    (r) => { r.nonce = 'stale'; }, (r) => { r.pageErrors = ['setup']; }, (r) => { r.error = 'setup'; },
    (r) => { r.cases[0].completed = false; }, (r) => { r.cases = []; },
    (r) => { r.checks[0].name = 'the case ran to its end'; },
    (r) => { r.checks.push({ engine: 'webkit', case: 'S1', name: 'unrelated failure', pass: false }); r.cases[0].checks++; },
  ]) { const r = negativeReceipt(); mutate(r); assert.equal(adjudicate(r).ok, false); }
  assert.equal(adjudicate(negativeReceipt(), { timedOut: true }).ok, false);
  assert.equal(adjudicate(negativeReceipt(), { signal: 'SIGKILL' }).ok, false);
  assert.equal(adjudicate(negativeReceipt(), { exit: 3 }).ok, false);
});

for (const [file, variable, args, bad] of [
  ['verify-sense-truth.mjs', 'SENSE_TRUTH_ONLY', [], ['p', '', 'g,g', 'g,']],
  ['verify-speak.mjs', 'SPEAK_CASES', [], ['unknown', '', 'S1,S1', 'S1,']],
  ['verify-speak.mjs', 'SPEAK_NEGATIVES', ['--negatives'], ['unknown', '', 'revlog,revlog', 'revlog,']],
]) test(`${file}: real CLI refuses invalid ${variable} before site assembly/browser`, () => {
  for (const raw of bad) {
    const env = { ...process.env };
    for (const key of ['KAIRO_SITE_DIR', 'KAIRO_ARTIFACT_SHA256', 'SENSE_TRUTH_ONLY', 'SPEAK_CASES', 'SPEAK_NEGATIVES', 'SPEAK_FAULT', 'SPEAK_OVERLAY_SOURCE']) delete env[key];
    env[variable] = raw;
    const child = spawnSync(process.execPath, [fileURLToPath(new URL(file, import.meta.url)), ...args], { env, encoding: 'utf8', timeout: 10000 });
    assert.equal(child.error, undefined); assert.equal(child.status, 1);
    assert.match(child.stderr, new RegExp(`${variable}: (?:empty|unknown|duplicate) selection`));
    assert.doesNotMatch(child.stderr, /browserType\.launch|Pin an immutable|Assembly failed/u);
  }
});

test('product-selects-annotation-oracle: actual grokCase refuses a quoted reading mislabeled by the DOM', async () => {
  const source = readFileSync(new URL('./verify-sense-truth.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function grokCase(page, fixture, emit)');
  const end = source.indexOf('/* ------------------------------------------------------------------ W', start);
  const rows = [];
  const target = { evaluate: async () => ({ annotation: true, interactive: false }), tap: async () => {} };
  const page = { locator: () => ({ first: () => target }), evaluate: async () => ({ mini: false, sheet: false, rung: null }) };
  const context = vm.createContext({ openArticle: async () => true, vhControl: '', readingInteraction,
    closeMini: async () => {}, delay: async () => {},
    card: async () => ({ word: 'ちゅう', lines: ['a reading in this text'], more: '', sense: '' }) });
  vm.runInContext(source.slice(start, end), context);
  await context.grokCase(page, { name: 'quoted', at: 'hashira', index: 242, s: 'ちゅう', kind: 'reading', expectedInteraction: 'reading-card' }, (row) => rows.push(row));
  assert.equal(rows[0].id, 'G.quoted.classification'); assert.equal(rows[0].ok, false);
  assert.equal(rows[1].id, 'G.quoted'); assert.equal(rows[1].ok, false);
});
for (const [index, s] of [[233, 'た'], [234, 'ん']]) test(`actual grokCase refuses pronunciation ${s} #${index} promoted to a door`, async () => {
  const source = readFileSync(new URL('./verify-sense-truth.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function grokCase(page, fixture, emit)');
  const end = source.indexOf('/* ------------------------------------------------------------------ W', start);
  const rows = [], target = { evaluate: async () => ({ annotation: false, interactive: true }), tap: async () => {} };
  const page = { locator: () => ({ first: () => target }), evaluate: async () => ({ mini: true, sheet: false, rung: null }) };
  const context = vm.createContext({ openArticle: async () => true, vhControl: '', readingInteraction,
    closeMini: async () => {}, delay: async () => {}, card: async () => ({ word: s, lines: ['a reading in this text'], more: '', sense: '' }) });
  vm.runInContext(source.slice(start, end), context);
  await context.grokCase(page, { name: `annotation-${s}`, at: 'gojuon', index, s, kind: 'reading', expectedInteraction: 'inert-annotation' }, (row) => rows.push(row));
  assert.equal(rows.length, 1); assert.equal(rows[0].id, `G.annotation-${s}`); assert.equal(rows[0].ok, false);
});

test('Speak downstream names are exact and cannot replace the primary witness', () => {
  const r = negativeReceipt();
  r.checks.push({ engine: 'webkit', case: 'S1', name: 'necessary downstream', pass: false }); r.cases[0].checks++;
  assert.equal(adjudicate(r).ok, false);
  assert.equal(adjudicate(r, { downstream: { S1: ['necessary downstream'] } }).ok, true);
  r.checks[0].pass = true;
  assert.equal(adjudicate(r, { downstream: { S1: ['necessary downstream'] } }).ok, false);
});

test('malformed or missing child row arrays cannot kill a Speak mutant', () => {
  for (const receipt of [null, {}, { checks: {}, cases: [] }, { checks: [null], cases: [], pageErrors: [] }, { checks: [], cases: [null], pageErrors: [] }])
    assert.equal(adjudicateSpeakPhase({ receipt, exit: 1, cases: ['S1'], nonce: 'n', engine: 'chromium', fault: 'fault' }).status, 'not-run');
});
