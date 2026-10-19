import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selection, exactRoster, SENSE_GROUPS, SPEAK_CASE_IDS, SPEAK_CONTROL_IDS_BY_ENGINE, speakControlPlan, senseAttempts, readingInteraction, speakCompletion, adjudicateSpeakPhase, adjudicateSensePhase } from './vh-voice-contracts.mjs';
import { grokCase } from './sense-grok-case.mjs';
const grokDeps = (deps) => ({ openArticle: async () => true, card: async () => null, cardState: async () => null, closeMini: async () => {}, delay: async () => {},
  pageSense: async () => [], glossesOf: () => [], sidecarRow: () => null, led: (rows) => rows, pageNames: new Set(), vhControl: '', vhMutations: [], ...deps });

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
  const deps = grokDeps({ card: async () => ({ lines: ['wrong sense'], sense: '1:0', word: 'word', more: '' }),
    pageNames: new Set(['fixture']), glossesOf: () => ['correct sense'], pageSense: async () => { throw timeout('navigation'); } });
  const rows = [], history = []; let runs = 0;
  await senseAttempts({ emit: (row) => rows.push(row), history, run: async (emit) => {
    runs++; await grokCase({}, { name: 'fixture', at: 'article', index: 1, seq: '1', k: 0, kind: 'sense', never: 'wrong sense' }, emit, deps);
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
  const rows = [];
  const target = { evaluate: async () => ({ annotation: true, interactive: false }), tap: async () => {} };
  const page = { locator: () => ({ first: () => target }), evaluate: async () => ({ mini: false, sheet: false, rung: null }) };
  const deps = grokDeps({ card: async () => ({ word: 'ちゅう', lines: ['a reading in this text'], more: '', sense: '' }) });
  await grokCase(page, { name: 'quoted', at: 'hashira', index: 242, s: 'ちゅう', kind: 'reading', expectedInteraction: 'reading-card' }, (row) => rows.push(row), deps);
  assert.equal(rows[0].id, 'G.quoted.classification'); assert.equal(rows[0].ok, false);
  assert.equal(rows[1].id, 'G.quoted'); assert.equal(rows[1].ok, false);
});
for (const [index, s] of [[233, 'た'], [234, 'ん']]) test(`actual grokCase refuses pronunciation ${s} #${index} promoted to a door`, async () => {
  const rows = [], target = { evaluate: async () => ({ annotation: false, interactive: true }), tap: async () => {} };
  const page = { locator: () => ({ first: () => target }), evaluate: async () => ({ mini: true, sheet: false, rung: null }) };
  const deps = grokDeps({ card: async () => ({ word: s, lines: ['a reading in this text'], more: '', sense: '' }) });
  await grokCase(page, { name: `annotation-${s}`, at: 'gojuon', index, s, kind: 'reading', expectedInteraction: 'inert-annotation' }, (row) => rows.push(row), deps);
  assert.equal(rows.length, 1); assert.equal(rows[0].id, `G.annotation-${s}`); assert.equal(rows[0].ok, false);
});
test('actual grokCase accepts a true inert annotation and a correct sense, and a control mutation stays visible', async () => {
  const rows = [], target = { evaluate: async () => ({ annotation: true, interactive: false }), tap: async () => {} };
  const page = { locator: () => ({ first: () => target, evaluate: async () => {} }), evaluate: async () => ({ mini: false, sheet: false, rung: null }) };
  await grokCase(page, { name: 'inert', at: 'gojuon', index: 233, s: 'た', kind: 'reading', expectedInteraction: 'inert-annotation' }, (row) => rows.push(row), grokDeps());
  assert.deepEqual(rows.map((row) => [row.id, row.ok]), [['G.inert', true]]);
  rows.length = 0;
  const sense = { lines: ['correct sense'], sense: '7:0', word: 'word', more: '' };
  await grokCase(page, { name: 'sense', at: 'article', index: 1, seq: '7', k: 0, kind: 'sense', never: 'wrong sense' }, (row) => rows.push(row),
    grokDeps({ card: async () => sense, glossesOf: () => ['correct sense'] }));
  assert.deepEqual(rows.map((row) => [row.id, row.ok]), [['G.sense', true]]);
  rows.length = 0;
  const vhMutations = [];
  await grokCase(page, { name: 'sense', at: 'article', index: 1, seq: '7', k: 0, kind: 'sense', never: 'wrong sense' }, (row) => rows.push(row),
    grokDeps({ card: async () => sense, cardState: async () => ({ ...sense, lines: ['VH wrong sense sentinel'] }), glossesOf: () => ['correct sense'],
      vhControl: 'discard-completed-red-on-retry', vhMutations }));
  assert.deepEqual(rows.map((row) => [row.id, row.ok]), [['G.sense', false]]);
  assert.equal(vhMutations.length, 1);
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

test('Speak negatives count only exact false witness rows; null, undefined and skip markers never kill', () => {
  for (const pass of [null, undefined, 'skip', 0, 'false']) {
    const r = negativeReceipt(); r.checks[0].pass = pass;
    assert.equal(adjudicate(r).ok, false, `witness ${pass}`);
    const unrelated = negativeReceipt();
    unrelated.checks.push({ engine: 'webkit', case: 'S1', name: 'other row', pass }); unrelated.cases[0].checks++;
    assert.equal(adjudicate(unrelated).ok, false, `unrelated ${pass}`);
    const candidate = { ...negativeReceipt(), phase: 'baseline', fault: null, selectedPassed: true };
    candidate.checks = [{ engine: 'webkit', case: 'S1', name: 'intended witness', pass }];
    assert.equal(adjudicateSpeakPhase({ receipt: candidate, exit: 3, nonce: 'fresh', engine: 'webkit', cases: ['S1'] }).ok, false, `baseline ${pass}`);
  }
  const candidate = { ...negativeReceipt(), phase: 'baseline', fault: null, selectedPassed: true };
  candidate.checks = [{ engine: 'webkit', case: 'S1', name: 'intended witness', pass: true }];
  assert.equal(adjudicateSpeakPhase({ receipt: candidate, exit: 3, nonce: 'fresh', engine: 'webkit', cases: ['S1'] }).ok, true);
});

const SENSE_CONTROL = { id: 'discard-completed-red-on-retry', fixture: 'adapt-n3:govonline:article-202609-radio-3741#36', row: 'G.ない, auxiliary (聞こえない)', downstream: ['G.ない, auxiliary (聞こえない).incomplete'] };
const READING_CONTROL = { id: 'pronunciation-ta-promoted-to-door', fixture: 'bunki-read-n3-gojuon-sanskrit#233', row: 'G.悉曇（しったん）: た', downstream: [] };
const senseIdentity = { engine: 'chromium', runId: 'run', nonce: 'fresh', artifactSha256: 'artifact', verifierSha256: 'tool' };
const navigationTimeout = { attempt: 1, observations: 1, complete: false, retry: false, stage: 'navigation', error: 'TimeoutError: controlled post-G navigation timeout' };
const senseReceipt = (control, phase, { primaryOk = phase !== 'mutant', history } = {}) => {
  const discard = control.id === SENSE_CONTROL.id, mutant = phase === 'mutant';
  const rows = [{ engine: 'chromium', id: control.row, ok: primaryOk,
    observed: { attempt: 1, detail: discard ? { lines: [mutant ? 'VH wrong sense sentinel' : 'the real sense'] } : { annotation: false, interactive: true } } }];
  if (discard && mutant) rows.push({ engine: 'chromium', id: `${control.row}.incomplete`, ok: false, observed: { attempt: 1, detail: { error: navigationTimeout.error, stage: 'navigation' } } });
  if (discard && !mutant) rows.push({ engine: 'chromium', id: control.row.replace(/^G\./u, 'P.'), ok: true, observed: { attempt: 1, detail: {} } });
  rows.push({ engine: 'chromium', id: 'g.page-errors', ok: true, observed: [] }, { engine: 'chromium', id: 'S.retried', recorded: true, observed: { count: 0 } });
  return { runId: 'run', nonce: 'fresh', artifactSha256: 'artifact', verifierSha256: 'tool', engines: ['chromium'], error: null,
    selectedPassed: !mutant, fullAcceptance: false, complete: !(discard && mutant), vhControl: mutant ? control.id : null,
    vhMutations: mutant ? [{ control: control.id, matches: 1 }] : [],
    attempts: [{ engine: 'chromium', fixture: control.row.slice(2), history: history || (discard && mutant ? [navigationTimeout] : [{ attempt: 1, observations: 1, complete: true }]) }], rows };
};
const senseVerdict = (control, phase, receipt, extra = {}) => adjudicateSensePhase({ ...senseIdentity, control, phase, receipt, exit: phase === 'mutant' ? 1 : 3, ...extra });
test('Sense served-control phases: caught mutants and green candidates are admitted by the producer adjudicator', () => {
  for (const control of [SENSE_CONTROL, READING_CONTROL])
    for (const phase of ['baseline', 'mutant', 'restore']) {
      const verdict = senseVerdict(control, phase, senseReceipt(control, phase));
      assert.equal(verdict.ok, true, `${control.id}/${phase}`); assert.equal(verdict.fresh, true);
    }
});
test('a surviving discard-retry mutant is a structured failed control, never a crash that loses other evidence', () => {
  const survived = senseReceipt(SENSE_CONTROL, 'mutant', { primaryOk: true });
  let verdict;
  assert.doesNotThrow(() => { verdict = senseVerdict(SENSE_CONTROL, 'mutant', survived); });
  assert.equal(verdict.ok, false); assert.deepEqual(verdict.reds.map((row) => row.id), [`${SENSE_CONTROL.row}.incomplete`]);
  const unmutated = senseReceipt(SENSE_CONTROL, 'mutant'); delete unmutated.vhMutations;
  assert.doesNotThrow(() => { verdict = senseVerdict(SENSE_CONTROL, 'mutant', unmutated); });
  assert.equal(verdict.ok, false);
  for (const receipt of [null, undefined, {}, { rows: {} }, { rows: [null] }, { ...senseReceipt(SENSE_CONTROL, 'mutant'), attempts: [{ history: null }] }, { ...senseReceipt(SENSE_CONTROL, 'mutant'), attempts: [null] }])
    for (const phase of ['baseline', 'mutant', 'restore'])
      assert.doesNotThrow(() => { assert.equal(senseVerdict(SENSE_CONTROL, phase, receipt).ok, false); }, `${phase}: ${JSON.stringify(receipt)?.slice(0, 40)}`);
});
test('Sense served-control kills need exact false named witnesses; null, skip, timeout and stale evidence never kill', () => {
  for (const ok of [null, undefined, 'skip', 0]) {
    const receipt = senseReceipt(READING_CONTROL, 'mutant');
    receipt.rows[0].ok = ok;
    assert.equal(senseVerdict(READING_CONTROL, 'mutant', receipt).ok, false, `witness ${ok}`);
    const candidate = senseReceipt(READING_CONTROL, 'baseline');
    candidate.rows[1].ok = ok;
    assert.equal(senseVerdict(READING_CONTROL, 'baseline', candidate).ok, false, `candidate ${ok}`);
  }
  const hidden = senseReceipt(READING_CONTROL, 'mutant');
  hidden.rows.push({ engine: 'chromium', id: 'G.hidden', recorded: 'skip', ok: false });
  assert.equal(senseVerdict(READING_CONTROL, 'mutant', hidden).ok, false);
  const wrongSentinel = senseReceipt(SENSE_CONTROL, 'mutant');
  wrongSentinel.rows[0].observed.detail.lines = ['the real sense'];
  assert.equal(senseVerdict(SENSE_CONTROL, 'mutant', wrongSentinel).ok, false);
  for (const extra of [{ timedOut: true }, { signal: 'SIGKILL' }, { error: 'spawn ENOENT' }, { exit: 3 }, { nonce: 'other' }, { runId: 'other' }, { artifactSha256: 'other' }, { verifierSha256: 'other' }, { engine: 'webkit' }])
    assert.equal(senseVerdict(READING_CONTROL, 'mutant', senseReceipt(READING_CONTROL, 'mutant'), extra).ok, false, JSON.stringify(extra));
  const retried = senseReceipt(READING_CONTROL, 'mutant', { history: [{ attempt: 1, observations: 0, complete: false, retry: true, stage: 'setup' }, { attempt: 2, observations: 1, complete: true }] });
  assert.equal(senseVerdict(READING_CONTROL, 'mutant', retried).ok, false);
});
test('Sense reading kills require actual wrong classification observations, not a false label on absent or opposite evidence', () => {
  for (const mutate of [
    row => { delete row.observed; }, row => { row.observed = null; },
    row => { row.observed.detail = {}; },
    row => { row.observed.detail = { annotation: true, interactive: false }; },
    row => { row.observed.detail.skipped = true; },
  ]) {
    const receipt = senseReceipt(READING_CONTROL, 'mutant'); mutate(receipt.rows[0]);
    assert.doesNotThrow(() => assert.equal(senseVerdict(READING_CONTROL, 'mutant', receipt).ok, false));
  }
  const incomplete = senseReceipt(SENSE_CONTROL, 'mutant');
  incomplete.rows[1].observed.detail = {};
  assert.equal(senseVerdict(SENSE_CONTROL, 'mutant', incomplete).ok, false);
});
test('Sense and Speak execution-failure markers cannot be laundered into exact boolean rows', () => {
  for (const marker of [{ skipped: true }, { skip: true }, { unexecuted: true }, { timedOut: true }, { harnessError: 'setup failed' }, { status: 'not-run' }]) {
    for (const phase of ['baseline', 'mutant', 'restore']) {
      for (const location of ['row', 'observed']) {
        const receipt = senseReceipt(READING_CONTROL, phase);
        Object.assign(location === 'row' ? receipt.rows[0] : receipt.rows[0].observed, marker);
        assert.equal(senseVerdict(READING_CONTROL, phase, receipt).ok, false, `${phase}/${location}/${JSON.stringify(marker)}`);
      }
    }
    const receipt = negativeReceipt(); Object.assign(receipt.checks[0], marker);
    assert.equal(adjudicate(receipt).ok, false);
    const candidate = negativeReceipt(); Object.assign(candidate, { fault: null, phase: 'baseline', selectedPassed: true }); candidate.checks[0].pass = true;
    Object.assign(candidate.checks[0], marker);
    assert.equal(adjudicateSpeakPhase({ receipt: candidate, exit: 3, nonce: 'fresh', engine: 'webkit', cases: ['S1'] }).ok, false);
  }
});
test('Speak completion requires strict true, including every case and assertion', () => {
  for (const collection of ['cases', 'checks']) for (const value of [1, 'true', null, undefined, 'skip']) {
    const full = fixture([...SPEAK_CASE_IDS, 'egress']); full[collection][0].pass = value;
    assert.equal(speakCompletion({ engines: ['webkit'], selected: null, ...full }).fullAcceptance, false);
  }
});
