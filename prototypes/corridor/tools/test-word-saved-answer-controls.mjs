/**
 * D23 · negative controls for the control adjudicator (word-saved-answer-controls.mjs).
 * The rows are pure: synthetic child observations, with no child process and no application
 * code. Each row shows that one way an interrupted, partial, contaminated or unbound run could look
 * like a kill is refused, or that a legitimate one is admitted. Under a release gate
 * (KAIRO_EVIDENCE_DIR) the run writes a 'checks' report of exactly CASES plus `inventory-exact`.
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { INVENTORY, WORD_CONTROLS, LEARNING_RECORD_CONTROLS, admitControl, applyControl, childRecord, classifyError,
  inventoryReport, observeReceiptRun, observeTapRun, parseTap, receiptMarker, sourceMarker } from './word-saved-answer-controls.mjs';

const CASES = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17', 'A18'];
const observed = [];
function row(id, title, body) {
  test(`${id} ${title}`, async () => {
    try { await body(); observed.push({ id, pass: true }); }
    catch (error) { observed.push({ id, pass: false }); throw error; }
  });
}
after(() => {
  const { exact, report } = inventoryReport('word-saved-answer-controls', CASES, observed);
  if (process.env.KAIRO_EVIDENCE_DIR) {
    writeFileSync(join(resolveCorridorEvidence(), 'verification-report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  assert(exact, `the declared cases ran exactly once each: ${JSON.stringify(observed.map((entry) => entry.id))}`);
});

/** Synthetic source digests: the authored source, and a control's edited source. */
const SRC = 'a'.repeat(64);
const MUT = 'b'.repeat(64);

/** A synthetic node:test TAP stdout: the source marker, rows in order, then (unless truncated) the
 * plan and summary. */
function tapRun(rows, { status, signal = null, error = null, stderr = '', plan = true, summary = true, marker = null, extra = [] } = {}) {
  const lines = [];
  if (marker) lines.push(marker);
  rows.forEach(([id, ok], index) => lines.push(`${ok ? 'ok' : 'not ok'} ${index + 1} - ${id} synthetic row`));
  lines.push(...extra);
  const failed = rows.filter(([, ok]) => !ok).length;
  if (plan) lines.push(`1..${rows.length}`);
  if (summary) {
    lines.push(`# tests ${rows.length}`, `# suites 0`, `# pass ${rows.length - failed}`, `# fail ${failed}`,
      '# cancelled 0', '# skipped 0', '# todo 0', '# duration_ms 1.0');
  }
  // an explicit status (null included, as for a killed child) is kept; otherwise it agrees with the rows
  return { status: status === undefined ? (failed ? 1 : 0) : status, signal, error, stdout: lines.join('\n') + '\n', stderr };
}
const all = (failing = [], ids = INVENTORY) => ids.map((id) => [id, !failing.includes(id)]);
const baselineMarker = sourceMarker(null, WORD_CONTROLS, SRC);
const baseline = () => observeTapRun(tapRun(all(), { marker: baselineMarker }), INVENTORY, baselineMarker);
const C10 = WORD_CONTROLS.C10, C4 = WORD_CONTROLS.C4;
const marker = (name) => sourceMarker(name, WORD_CONTROLS, MUT);
const admit = (runRows, options = {}, control = C10, name = 'C10') =>
  admitControl({ baseline: options.baseline || baseline(), control, inventory: INVENTORY,
    run: observeTapRun(tapRun(runRows, { marker: marker(name), ...options }), INVENTORY, marker(name)) });

/* Receipt children (verify-learning-record.mjs): each failing row keeps the exact text it wrote to
 * stderr. One synthetic diagnostic spans lines, as an assertion message may. */
const LEARNING = ['a', 'word-review-render-fixture-starts-unbound', 'word-review-shows-and-binds-its-saved-answer',
  'word-review-changed-answer-refuses-both-producers-and-asks-for-a-fresh-look', 'word-review-unavailable-face-refuses-grades-and-writes-nothing'];
const MESSAGE = {
  'word-review-shows-and-binds-its-saved-answer': "Cannot read properties of undefined (reading 'item')",
  'word-review-changed-answer-refuses-both-producers-and-asks-for-a-fresh-look':
    'the actual renderer bound the real session\n\nundefined !== {\n  t: \'word\',\n  id: \'ポンド\'\n}',
};
const receipt = (failing = [], { control = null, source = SRC } = {}) => ({ format: 'kairo-learning-acknowledgment-tests', version: 1,
  ...(control ? { control } : {}), sourceSha256: source,
  results: LEARNING.map((name) => (failing.includes(name)
    ? { name, pass: false, reason: 'synthetic stack', diagnostic: `FAIL ${name}: ${MESSAGE[name] ?? 'synthetic failure'}` }
    : { name, pass: true })),
  pass: !failing.length });
const diagnostics = (value) => value.results.filter((entry) => !entry.pass).map((entry) => `${entry.diagnostic}\n`).join('');
const receiptRun = (status, value, { stdout = '', stderr = diagnostics(value), signal = null, error = null } = {}) =>
  ({ status, signal, error, stdout, stderr });
const RB = LEARNING_RECORD_CONTROLS.RB;
const rbMarker = receiptMarker('RB', MUT);
const learningBaseline = (stderr = '') => {
  const value = receipt();
  return observeReceiptRun(receiptRun(0, value, { stderr }), value, { sourceSha256: SRC });
};
const witnessed = () => receipt(RB.witnesses, { control: 'RB', source: MUT });
const rbObserve = (value, run) => observeReceiptRun(run, value, { marker: rbMarker, sourceSha256: MUT, control: 'RB' });
const rbAdmit = (value, run, base = learningBaseline()) => admitControl({ baseline: base, run: rbObserve(value, run), control: RB, inventory: LEARNING });

row('A1', 'a complete run whose only failure is the declared witness is killed', () => {
  assert.equal(admit(all(['T8'])).verdict, 'killed');
});
row('A2', 'truncation: an F0-pass/T8-fail prefix with no plan and no summary is incomplete, never killed', () => {
  const prefix = [['F0', true], ['T8', false]];
  for (const options of [{ plan: false, summary: false, status: 1 }, { plan: false, summary: false, status: null, signal: 'SIGKILL' }]) {
    assert.equal(admit(prefix, options).verdict, 'incomplete');
  }
});
row('A3', 'a duplicated id, a missing id and an unexpected id are incomplete', () => {
  const rows = all(['T8']);
  assert.equal(admit([...rows, ['T8', false]]).verdict, 'incomplete');
  assert.equal(admit(rows.filter(([id]) => id !== 'T13')).verdict, 'incomplete');
  assert.equal(admit([...rows, ['T99', true]]).verdict, 'incomplete');
});
row('A4', 'a witness whose setup row failed is contaminated, not killed', () => {
  assert.equal(admit(all(['T8', 'T8.setup'])).verdict, 'contaminated');
});
row('A5', 'an undeclared failure is contaminated; declared collateral is admitted', () => {
  assert.equal(admit(all(['T8', 'T3'])).verdict, 'contaminated');
  assert.equal(admit(all(['T5', 'T8.setup', 'T8']), {}, C4, 'C4').verdict, 'killed', 'C4 declares T8 and its setup as collateral');
  assert.equal(admit(all(['T5', 'T8.setup', 'T8', 'T2']), {}, C4, 'C4').verdict, 'contaminated');
});
row('A6', 'a failing, incomplete or unmarked baseline admits no control', () => {
  const failing = observeTapRun(tapRun(all(['T4']), { marker: baselineMarker }), INVENTORY, baselineMarker);
  assert.equal(admit(all(['T8']), { baseline: failing }).verdict, 'baseline-failed');
  const truncated = observeTapRun(tapRun(all().slice(0, 9), { plan: false, summary: false, marker: baselineMarker }), INVENTORY, baselineMarker);
  assert.equal(admit(all(['T8']), { baseline: truncated }).verdict, 'baseline-failed');
  const unmarked = observeTapRun(tapRun(all()), INVENTORY, baselineMarker);
  assert.equal(admit(all(['T8']), { baseline: unmarked }).verdict, 'baseline-failed');
});
row('A7', 'process failures are incomplete: signal, spawn error, stray stderr, exit/result disagreement', () => {
  const rows = all(['T8']);
  assert.equal(admit(rows, { signal: 'SIGTERM', status: null }).verdict, 'incomplete');
  assert.equal(admit(rows, { error: Object.assign(new Error('spawn'), { code: 'ENOENT' }), status: null }).verdict, 'incomplete');
  assert.equal(admit(rows, { stderr: 'Error: uncaught after the last row' }).verdict, 'incomplete');
  assert.equal(admit(rows, { stderr: '\n' }).verdict, 'incomplete', 'a TAP child’s stderr is empty, not merely blank');
  assert.equal(admit(rows, { status: 0 }).verdict, 'incomplete', 'exit 0 with a failure');
  assert.equal(admit(all(), { status: 1 }).verdict, 'incomplete', 'exit 1 without a failure');
  assert.equal(admit(rows, { status: 2 }).verdict, 'incomplete');
});
row('A8', 'a missing source marker, a summary disagreement and a SKIP directive are incomplete', () => {
  const rows = all(['T8']);
  const unmarked = observeTapRun(tapRun(rows), INVENTORY, marker('C10'));
  assert.equal(admitControl({ baseline: baseline(), run: unmarked, control: C10, inventory: INVENTORY }).verdict, 'incomplete');
  const disagreeing = tapRun(rows, { marker: marker('C10') });
  disagreeing.stdout = disagreeing.stdout.replace('# fail 1', '# fail 0');
  assert.equal(admitControl({ baseline: baseline(), run: observeTapRun(disagreeing, INVENTORY, marker('C10')), control: C10, inventory: INVENTORY }).verdict, 'incomplete');
  const skipped = tapRun(rows, { marker: marker('C10') });
  skipped.stdout = skipped.stdout.replace('ok 1 - F0 synthetic row', 'ok 1 - F0 synthetic row # SKIP');
  assert.equal(admitControl({ baseline: baseline(), run: observeTapRun(skipped, INVENTORY, marker('C10')), control: C10, inventory: INVENTORY }).verdict, 'incomplete');
});
row('A9', 'a witness that passes survives; F0 failing is contaminated', () => {
  assert.equal(admit(all()).verdict, 'survived');
  assert.equal(admit(all(['T8', 'F0'])).verdict, 'contaminated');
});
row('A10', 'receipt children: a legitimate failing receipt with exactly its diagnostics is killed; broken receipts are not', () => {
  const base = learningBaseline();
  assert.deepEqual([base.complete, base.problems], [true, []], 'a passing baseline with an empty stderr is complete');
  const value = witnessed();
  assert(diagnostics(value).includes('\n\nundefined !== {'), 'a multiline diagnostic is part of the expected stderr');
  assert.equal(rbAdmit(value, receiptRun(1, value, { stdout: `${rbMarker}\n` })).verdict, 'killed');
  assert.equal(admitControl({ baseline: base, run: rbObserve(null, receiptRun(1, value, { stdout: `${rbMarker}\n` })), control: RB, inventory: LEARNING }).verdict,
    'incomplete', 'no receipt');
  const duplicated = { ...value, results: [...value.results, { name: 'a', pass: true }] };
  assert.equal(rbAdmit(duplicated, receiptRun(1, duplicated, { stdout: `${rbMarker}\n` })).verdict, 'incomplete');
  const disagreeing = { ...value, pass: true };
  assert.equal(rbAdmit(disagreeing, receiptRun(1, disagreeing, { stdout: `${rbMarker}\n` })).verdict, 'incomplete');
  const setupFailed = receipt([...RB.witnesses, ...RB.setups], { control: 'RB', source: MUT });
  assert.equal(rbAdmit(setupFailed, receiptRun(1, setupFailed, { stdout: `${rbMarker}\n` })).verdict, 'contaminated');
});
row('A11', 'an edit that matches zero or several times refuses the control before any test runs', () => {
  const table = { X: { edits: [['needle', 'pin']] } };
  assert.throws(() => applyControl('no match here', table, 'X'), /matched 0 times/u);
  assert.throws(() => applyControl('needle needle', table, 'X'), /matched 2 times/u);
  assert.equal(applyControl('a needle b', table, 'X'), 'a pin b');
});
row('A12', 'the declared inventory is exact and unique, and every control names rows that exist in it', () => {
  assert.equal(new Set(INVENTORY).size, INVENTORY.length);
  assert.equal(parseTap(tapRun(all()).stdout).rows.length, INVENTORY.length);
  assert.deepEqual([Object.keys(WORD_CONTROLS).length, Object.keys(LEARNING_RECORD_CONTROLS).length], [29, 2], '31 controls, 33 children with the baselines');
  for (const [name, control] of Object.entries(WORD_CONTROLS)) {
    for (const id of [...control.witnesses, ...control.collateral]) assert(INVENTORY.includes(id), `${name}: ${id}`);
    for (const id of control.witnesses) assert(!control.collateral.includes(id), `${name}: ${id} is both witness and collateral`);
  }
});
row('A13', 'the gate report fails a duplicated, missing or failed row, and inventory-exact names the first two', () => {
  const ids = ['x', 'y'];
  const pass = (id) => ({ id, pass: true });
  const clean = inventoryReport('s', ids, [pass('x'), pass('y')]);
  assert.equal(clean.exact, true);
  assert.deepEqual(clean.report.summary, { total: 3, failed: 0 });
  const duplicated = inventoryReport('s', ids, [pass('x'), pass('y'), pass('y')]);
  assert.deepEqual([duplicated.exact, duplicated.report.results.map((entry) => entry.pass)], [false, [true, false, false]]);
  const missing = inventoryReport('s', ids, [pass('x')]);
  assert.deepEqual([missing.exact, missing.report.results.map((entry) => entry.pass)], [false, [true, false, false]]);
  const failed = inventoryReport('s', ids, [pass('x'), { id: 'y', pass: false }]);
  assert.deepEqual([failed.exact, failed.report.summary.failed], [true, 1]);
});
row('A14', 'receipt stderr must be exactly the diagnostics: a late fatal error, an extra FAIL line or a reordering is refused', () => {
  const value = witnessed();
  const expected = diagnostics(value);
  const refused = (stderr) => rbAdmit(value, receiptRun(1, value, { stdout: `${rbMarker}\n`, stderr })).verdict;
  assert.equal(refused(expected), 'killed', 'the legitimate receipt, as in A10');
  assert.equal(refused(`${expected}Error: unrelated late fatal failure\n    at file:///synthetic.mjs:1:1\n`), 'incomplete', 'the same receipt plus a late fatal error');
  assert.equal(refused(`Error: unrelated early fatal failure\n${expected}`), 'incomplete');
  assert.equal(refused(`${expected}FAIL a: a line no receipt row wrote\n`), 'incomplete', 'a FAIL prefix alone admits nothing');
  const [first, second] = value.results.filter((entry) => !entry.pass).map((entry) => `${entry.diagnostic}\n`);
  assert.equal(refused(`${second}${first}`), 'incomplete', 'emission order');
  assert.equal(refused(expected.slice(0, expected.indexOf('\n\nundefined'))), 'incomplete', 'a multiline diagnostic cut to its first line');
  assert.equal(refused(expected.slice(0, -1)), 'incomplete', 'the final newline');
  assert.equal(refused(''), 'incomplete', 'failures with an empty stderr');
  const noisy = receipt();
  const warned = observeReceiptRun(receiptRun(0, noisy, { stderr: '(node:1) Warning: synthetic\n' }), noisy, { sourceSha256: SRC });
  assert.equal(warned.complete, false, 'a passing baseline’s stderr is empty');
  assert.equal(rbAdmit(value, receiptRun(1, value, { stdout: `${rbMarker}\n` }), warned).verdict, 'baseline-failed');
});
row('A15', 'each diagnostic, the receipt and the marker are bound to their row, source and control', () => {
  const value = witnessed();
  const run = (receiptValue, extra = {}) => receiptRun(1, receiptValue, { stdout: `${rbMarker}\n`, ...extra });
  const without = { ...value, results: value.results.map((entry) => (entry.pass ? entry : { ...entry, diagnostic: undefined })) };
  assert.equal(rbAdmit(without, run(without, { stderr: diagnostics(value) })).verdict, 'incomplete', 'a failing row without its diagnostic');
  const [target] = RB.witnesses;
  const misbound = { ...value, results: value.results.map((entry) => (entry.name === target ? { ...entry, diagnostic: `FAIL a: ${MESSAGE[target]}` } : entry)) };
  assert.equal(rbAdmit(misbound, run(misbound)).verdict, 'incomplete', 'a diagnostic that names another row');
  const passingNoise = { ...value, results: value.results.map((entry) => (entry.name === 'a' ? { ...entry, diagnostic: 'FAIL a: passed' } : entry)) };
  assert.equal(rbAdmit(passingNoise, run(passingNoise)).verdict, 'incomplete', 'a passing row carries no diagnostic');
  const otherSource = { ...value, sourceSha256: SRC };
  assert.equal(rbAdmit(otherSource, run(otherSource)).verdict, 'incomplete', 'a receipt of the unedited source');
  const otherControl = { ...value, control: 'C6b' };
  assert.equal(rbAdmit(otherControl, run(otherControl)).verdict, 'incomplete', 'a receipt of another control');
  assert.equal(rbAdmit(value, run(value, { stdout: `${receiptMarker('RB', SRC)}\n` })).verdict, 'incomplete', 'a marker naming another source');
  const tapOther = observeTapRun(tapRun(all(['T8']), { marker: sourceMarker('C10', WORD_CONTROLS, SRC) }), INVENTORY, marker('C10'));
  assert.equal(admitControl({ baseline: baseline(), run: tapOther, control: C10, inventory: INVENTORY }).verdict, 'incomplete',
    'a TAP control child that lifted the unedited source');
});
row('A16', 'a timeout or an exceeded capture bound is classified and stays a failure', () => {
  const timeout = Object.assign(new Error('spawnSync node ETIMEDOUT'), { code: 'ETIMEDOUT' });
  const overflow = Object.assign(new Error('spawnSync node ENOBUFS'), { code: 'ENOBUFS' });
  const missing = Object.assign(new Error('spawnSync node ENOENT'), { code: 'ENOENT' });
  assert.deepEqual([classifyError(timeout), classifyError(overflow), classifyError(missing), classifyError(null)], ['timeout', 'output-limit', 'spawn', null]);
  const timedOut = admit(all(['T8']), { error: timeout, signal: 'SIGKILL', status: null });
  assert.equal(timedOut.verdict, 'incomplete');
  assert(timedOut.problems.includes('spawn-error:timeout:ETIMEDOUT'));
  assert.equal(admit(all(['T8']), { error: overflow, status: 1 }).verdict, 'incomplete', 'complete-looking rows cut at the capture bound');
  const value = witnessed();
  assert.equal(rbAdmit(value, receiptRun(null, value, { stdout: `${rbMarker}\n`, signal: 'SIGKILL', error: timeout })).verdict, 'incomplete');
});
row('A17', 'every child keeps a record of what ran, how it ended, its exact bytes and its binding', () => {
  const common = { kind: 'tap', role: 'control', control: 'C10', table: 'WORD_CONTROLS', edits: WORD_CONTROLS.C10.edits, marker: marker('C10'),
    authoredSha256: SRC, sourceSha256: MUT, argv: ['--test-reporter=tap', '/repo/prototypes/corridor/tools/test-word-saved-answer.mjs', '--control', 'C10'],
    env: { D23_ASSESSMENT_STAGE: '/evidence/assessment-stage' }, root: '/repo', evidence: '/evidence', bounds: { timeoutMs: 300_000 },
    times: { startedAt: '2026-09-25T00:00:00.000Z', endedAt: '2026-09-25T00:00:01.000Z', elapsedMs: 1000 },
    stdout: Buffer.from('out\n'), stderr: Buffer.alloc(0), pins: { 'corridor.js': { sha256: SRC } }, stage: { 'assessment-learning.mjs': MUT },
    observation: { complete: true, problems: [] }, verdict: { verdict: 'killed' } };
  const record = childRecord({ ...common, id: 'tap-C10', raw: { status: 1, signal: null, error: null } });
  assert.deepEqual(record.argv, ['node', '--test-reporter=tap', 'prototypes/corridor/tools/test-word-saved-answer.mjs', '--control', 'C10']);
  assert.deepEqual([record.cwd, record.env.D23_ASSESSMENT_STAGE, record.env.KAIRO_EVIDENCE_DIR], ['.', 'assessment-stage', null]);
  assert.deepEqual(record.mutation, { table: 'WORD_CONTROLS', edits: WORD_CONTROLS.C10.edits, authoredSha256: SRC, sourceSha256: MUT });
  assert.deepEqual([record.status, record.signal, record.error, record.elapsedMs], [1, null, null, 1000]);
  assert.deepEqual([record.stdout.path, record.stdout.bytes, /^[0-9a-f]{64}$/u.test(record.stdout.sha256), record.stderr.bytes], ['tap-C10.stdout', 4, true, 0]);
  assert.deepEqual([record.pins, record.stage, record.verdict, record.marker], [common.pins, common.stage, common.verdict, marker('C10')]);
  const killed = childRecord({ ...common, id: 'tap-C10', raw: { status: null, signal: 'SIGKILL',
    error: Object.assign(new Error('spawnSync node ETIMEDOUT'), { code: 'ETIMEDOUT' }) }, observation: { complete: false, problems: ['spawn-error:timeout:ETIMEDOUT'] } });
  assert.deepEqual([killed.signal, killed.error], ['SIGKILL', { class: 'timeout', code: 'ETIMEDOUT', message: 'spawnSync node ETIMEDOUT' }]);
  assert.deepEqual(killed.observation, { complete: false, problems: ['spawn-error:timeout:ETIMEDOUT'], rows: null },
    'a failed child keeps its record too');
  const parsed = childRecord({ ...common, id: 'tap-C10', raw: { status: 1, signal: null, error: null },
    observation: { complete: true, problems: [], results: new Map([['F0', true], ['T8', false]]) } });
  assert.deepEqual(parsed.observation.rows, { F0: true, T8: false }, 'the parsed row outcomes are kept beside the raw bytes');
});

row('A18', 'a receipt whose results is not an array is incomplete, and its child still keeps a record', () => {
  // the malformed shape Codex named: {results:{}} used to throw at .map before keep() wrote the child's record
  const malformed = { ...receipt(), results: {} };
  let observed;
  assert.doesNotThrow(() => { observed = observeReceiptRun(receiptRun(0, malformed, { stderr: '' }), malformed, { sourceSha256: SRC }); });
  assert.equal(observed.complete, false);
  assert.ok(observed.problems.includes('receipt-missing'), JSON.stringify(observed.problems));
  const record = childRecord({ id: 'receipt-baseline', kind: 'receipt', role: 'baseline', authoredSha256: SRC, sourceSha256: SRC,
    argv: ['/repo/prototypes/corridor/tools/verify-learning-record.mjs'], env: {}, root: '/repo', evidence: '/evidence',
    bounds: { timeoutMs: 300_000 }, times: { startedAt: '2026-09-25T00:00:00.000Z', endedAt: '2026-09-25T00:00:01.000Z', elapsedMs: 1000 },
    raw: { status: 0, signal: null, error: null }, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), receipt: 'learning-record.json',
    pins: {}, stage: {}, observation: observed });
  assert.deepEqual([record.observation.complete, record.observation.rows], [false, {}], 'the observation reaches the kept record');
  assert.ok(record.observation.problems.includes('receipt-missing'));
});
