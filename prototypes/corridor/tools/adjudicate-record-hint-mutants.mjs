/**
 * Adjudicate record-hint mutation runs from their receipts (B2-TEST-REVIEW-r1 evidence rule).
 * Nothing here launches a browser, builds, or copies anything: it reads verify-record-hint.mjs
 * receipts and re-validates each mutant's provenance from disk with verifyTestMutant().
 *
 * Outcome types:
 *   baseline_passed           a FULL, unmutated run (kind release-artifact, selection full, base
 *                             source-compared unless --allow-pinned-baseline) of the CURRENT verifier
 *                             bytes and declared harness hashes: setup passed, every required row passed (schema checked,
 *                             not read from the receipt's status), nothing unreached.
 *   baseline_failed           that run completed its setup but a required row did not pass.
 *   behavioral_mutant_killed  { baseArtifact, mutantBytes, namedCase }. Requires: baseline_passed; a
 *                             test-mutation receipt from the same verifier bytes on the same base
 *                             artifact and base manifest, with matching browser/runtime identity; a mutation exactly equal to its RECORD_HINT_MUTANTS entry that
 *                             re-validates from disk against its pinned mutationSha256; setup and every
 *                             W0 identity row passed; the mutant's cases selected; each named row passed
 *                             in the baseline; every control prerequisite passed; and EVERY named row records its actual
 *                             forbidden behavioral witness. Only explicitly declared consequence failures are allowed.
 *   mutant_survived           everything valid, but a named row passed.
 *   inconclusive_setup        any setup, identity, provenance, verifier, selection or baseline rejection.
 *                             Never a kill.
 *   inconclusive_evidence     prerequisites failed, bytes were unverifiable, or a non-permitted failure contaminated the run.
 *   inconclusive_unreached    everything valid, but a named row was never evaluated (the case stopped
 *                             first). Never a kill.
 * Exit status 0 only when the baseline passed and every listed mutant was behavioral_mutant_killed.
 *
 * Usage: node adjudicate-record-hint-mutants.mjs --baseline <record-hint.json> [--mutant <record-hint.json>]...
 *          [--allow-pinned-baseline] [--out <new file under ~/.dharma>]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { verifyTestMutant } from './make-corridor-mutant.mjs';
import { RECORD_HINT_MUTANTS, RECORD_HINT_MUTANT_EVIDENCE, RECORD_HINT_CASE_SCHEMA,
  RECORD_HINT_AUTO_ROWS, RECORD_HINT_HARNESS_PATHS, RECORD_HINT_W0_ROWS } from './record-hint-mutants.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const VERIFIER_SHA256 = sha256(readFileSync(join(TOOLS, 'verify-record-hint.mjs')));
const FORMAT = 'kairo-record-hint-verification';
const REPO = resolve(TOOLS, '../../..');
const HARNESS_HASHES = Object.fromEntries(RECORD_HINT_HARNESS_PATHS.map((path) => [path, sha256(readFileSync(join(REPO, path)))]));

function parseArgs(argv) {
  const options = { baseline: null, mutants: [], allowPinned: false, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--baseline') options.baseline = argv[++i];
    else if (flag === '--mutant') options.mutants.push(argv[++i]);
    else if (flag === '--allow-pinned-baseline') options.allowPinned = true;
    else if (flag === '--out') options.out = argv[++i];
    else throw new Error(`Unknown argument ${flag}`);
  }
  if (!options.baseline) throw new Error('Usage: --baseline <record-hint.json> [--mutant <record-hint.json>]... [--allow-pinned-baseline] [--out <file>]');
  return options;
}
function load(path) {
  const bytes = readFileSync(path);
  return { path: realpathSync(path), sha256: sha256(bytes), receipt: JSON.parse(bytes.toString('utf8')) };
}
/** The complete expected row set, including declared unavailable rows. No executable verifier import. */
function expectedRows(receipt, reasons) {
  const expected = new Map();
  const kind = receipt?.artifact?.kind;
  if (!Object.hasOwn(RECORD_HINT_W0_ROWS, kind) || kind === 'common') { reasons.push('unknown artifact kind'); return expected; }
  for (const id of [...RECORD_HINT_W0_ROWS.common, ...RECORD_HINT_W0_ROWS[kind]]) expected.set(id, { case: 'W0', optional: false });
  const cases = receipt?.selection?.cases;
  if (!Array.isArray(cases) || cases.length === 0 || new Set(cases).size !== cases.length
    || cases.some((id) => !Object.hasOwn(RECORD_HINT_CASE_SCHEMA, id))) {
    reasons.push('invalid or empty case selection'); return expected;
  }
  if (receipt.selection.full === true && !isDeepStrictEqual(cases, Object.keys(RECORD_HINT_CASE_SCHEMA))) reasons.push('full selection omits or reorders a declared case');
  for (const caseId of cases) {
    const schema = RECORD_HINT_CASE_SCHEMA[caseId];
    const auto = schema.browser ? RECORD_HINT_AUTO_ROWS : ['completed'];
    for (const id of [...schema.rows, ...auto.map((name) => `${caseId}.${name}`)]) expected.set(id, { case: caseId, optional: false });
    for (const id of schema.optional) expected.set(id, { case: caseId, optional: true });
  }
  return expected;
}
/** Reasons a receipt cannot establish artifact/harness identity, whatever its summary claims. */
function receiptProblems(receipt) {
  const reasons = [];
  if (receipt?.format !== FORMAT || receipt.v !== 3) reasons.push('not a v3 record-hint receipt');
  const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  if (typeof receipt?.runId !== 'string' || !receipt.runId) reasons.push('missing run identity');
  if (!digest(receipt?.artifact?.base?.artifactSha256) || !digest(receipt?.artifact?.base?.manifestSha256)
    || !digest(receipt?.artifact?.served?.corridorJsSha256) || !digest(receipt?.artifact?.served?.identitySha256)) reasons.push('missing pinned artifact/manifest/served identity');
  if (receipt?.verifier?.sha256 !== VERIFIER_SHA256) reasons.push('produced by other main verifier bytes');
  if (!isDeepStrictEqual(receipt?.verifier?.support, HARNESS_HASHES)) reasons.push('declared harness sources do not match the supported current hashes');
  if (receipt?.setup?.status !== 'passed') reasons.push(`setup ${receipt?.setup?.status}: ${receipt?.setup?.error ?? ''}`.trim());
  if (!receipt?.finishedAt || !['passed', 'failed'].includes(receipt?.status)) reasons.push(`terminal status ${receipt?.status}`);
  if (receipt?.browser?.engine !== 'chromium' || !receipt.browser.version || !receipt.browser.playwrightCore) reasons.push('missing supported browser identity');
  if (!Array.isArray(receipt?.cleanup) || receipt.cleanup.length === 0 || receipt.cleanup.some((row) => row?.outcome !== 'closed')) reasons.push('cleanup is absent, failed, or incomplete');
  const expected = expectedRows(receipt, reasons);
  if (!Array.isArray(receipt?.results)) { reasons.push('no result rows'); return reasons; }
  const ids = receipt.results.map((row) => row?.id);
  if (new Set(ids).size !== ids.length) reasons.push('duplicate result rows');
  for (const id of expected.keys()) if (!ids.includes(id)) reasons.push(`missing required/declarative row ${id}`);
  for (const row of receipt.results) {
    const schema = expected.get(row?.id);
    if (!schema || row.case !== schema.case) { reasons.push(`undeclared or wrong-case row ${row?.id}`); continue; }
    if (!['passed', 'failed', 'unreached', 'unavailable', 'inconclusive'].includes(row.status)) reasons.push(`unknown status for ${row.id}`);
    if (row.status === 'unavailable' && !schema.optional) reasons.push(`required row unavailable: ${row.id}`);
    if (row.case === 'W0' && row.status !== 'passed') reasons.push(`W0 identity failed: ${row.id}`);
    if (row.id.endsWith('.served-script-identity')) {
      const evidence = row.evidence;
      const documents = evidence?.documents;
      const valid = row.status === 'passed' && evidence?.kind === 'document-script-identity'
        && Array.isArray(evidence.errors) && evidence.errors.length === 0
        && Array.isArray(documents) && documents.length > 0
        && documents.every((doc) => typeof doc.role === 'string' && doc.role.length > 0 && typeof doc.docId === 'string' && doc.docId.length > 0
          && Array.isArray(doc.checks) && doc.checks.length > 0
          && doc.checks.every((check) => check.ok === true && check.sha256 === receipt?.artifact?.served?.corridorJsSha256));
      if (!valid) reasons.push(`inconclusive document byte evidence: ${row.id}`);
    }
  }
  return reasons;
}
const rowsOf = (receipt) => new Map((Array.isArray(receipt?.results) ? receipt.results : []).filter((row) => row && typeof row.id === 'string').map((row) => [row.id, row]));

function adjudicateBaseline(entry, { allowPinned }) {
  const { receipt } = entry;
  const reasons = receiptProblems(receipt);
  if (receipt?.artifact?.kind !== 'release-artifact' || receipt?.artifact?.mutant) reasons.push('not an unmutated release artifact');
  if (receipt?.selection?.full !== true) reasons.push('a partial selection cannot be a baseline');
  if (!allowPinned && receipt?.artifact?.base?.sourceCompared !== true)
    reasons.push('the base was not source-compared (pass --allow-pinned-baseline to accept a pinned bundle)');
  if (reasons.length) return { outcome: 'inconclusive_setup', receipt: entry.path, reasons };
  const required = receipt.results.filter((row) => row.status !== 'unavailable');
  const notPassed = required.filter((row) => row.status !== 'passed').map(({ id, status }) => ({ id, status }));
  if (!required.length || notPassed.length || receipt.status !== 'passed')
    return { outcome: 'baseline_failed', receipt: entry.path, status: receipt.status, notPassed };
  return { outcome: 'baseline_passed', receipt: entry.path, runId: receipt.runId, baseArtifact: receipt.artifact.base.artifactSha256,
    omitted: receipt.cases?.omitted ?? [], coveragePending: receipt.coveragePending ?? [] };
}

function adjudicateMutant(entry, baseline, baselineEntry) {
  const { receipt } = entry;
  const mutant = receipt?.artifact?.mutant;
  const name = mutant?.name ?? null;
  const spec = name && Object.hasOwn(RECORD_HINT_MUTANTS, name) ? RECORD_HINT_MUTANTS[name] : null;
  const contract = name && Object.hasOwn(RECORD_HINT_MUTANT_EVIDENCE, name) ? RECORD_HINT_MUTANT_EVIDENCE[name] : null;
  const reasons = receiptProblems(receipt);
  if (baseline.outcome !== 'baseline_passed') reasons.push(`the baseline is ${baseline.outcome}`);
  if (receipt?.artifact?.kind !== 'test-mutation' || !mutant) reasons.push('not an explicit test-mutation run');
  if (!spec || !contract) reasons.push(`no mutation/evidence contract named ${name}`);
  if (!isDeepStrictEqual(receipt?.browser, baselineEntry.receipt?.browser)
    || !isDeepStrictEqual(receipt?.environment, baselineEntry.receipt?.environment)) reasons.push('baseline and mutant browser/runtime environments differ');
  if (receipt?.artifact?.base?.manifestSha256 !== baselineEntry.receipt?.artifact?.base?.manifestSha256) reasons.push('base manifest differs from the baseline');
  if (receipt?.runId === baselineEntry.receipt?.runId || entry.path === baselineEntry.path) reasons.push('the same run as the baseline');
  if (baseline.outcome === 'baseline_passed' && receipt?.artifact?.base?.artifactSha256 !== baseline.baseArtifact)
    reasons.push('mutated from another base artifact than the baseline ran');
  if (spec) {
    for (const id of spec.cases) if (!receipt?.selection?.cases?.includes(id)) reasons.push(`case ${id} was not selected`);
    const baselineRows = rowsOf(baselineEntry.receipt);
    for (const id of spec.kills) {
      const row = baselineRows.get(id);
      if (row?.status !== 'passed' || row?.evidence?.kind !== contract?.witness[id] || row?.evidence?.observed !== false)
        reasons.push(`named row ${id} has no passed baseline witness control`);
    }
  }
  let provenance = null;
  if (!reasons.length) {
    try {
      provenance = verifyTestMutant({ baseSite: receipt.artifact.base.site, mutantSite: mutant.site,
        expectedMutationSha256: mutant.mutationSha256, expectedName: name });
      const edits = provenance.edits.map(({ file, from, to }) => ({ file, from, to }));
      if (!isDeepStrictEqual(edits, [{ file: spec.file, from: spec.from, to: spec.to }])) reasons.push('the mutation is not the table entry for its name');
      if (provenance.base.artifactSha256 !== baseline.baseArtifact) reasons.push('the provenance names another base artifact');
      if (provenance.base.manifestSha256 !== baselineEntry.receipt.artifact.base.manifestSha256) reasons.push('the provenance names another base manifest');
      if (provenance.identitySha256 !== mutant.identitySha256) reasons.push('the mutant identity on disk is not the one the run served');
    } catch (error) {
      reasons.push(`mutation provenance: ${error.message}`);
    }
  }
  if (reasons.length) return { name, outcome: 'inconclusive_setup', receipt: entry.path, reasons };
  const rows = rowsOf(receipt);
  const controlProblems = [];
  for (const id of contract.requires) if (rows.get(id)?.status !== 'passed') controlProblems.push(`prerequisite ${id} did not pass`);
  for (const row of receipt.results) {
    if (Array.isArray(row.evidence?.unexpectedErrors) && row.evidence.unexpectedErrors.length)
      controlProblems.push(`unexpected rejection/error in ${row.id}`);
    if (spec.kills.includes(row.id)) {
      if (['passed', 'failed'].includes(row.status) && (row.evidence?.kind !== contract.witness[row.id]
        || row.evidence?.observed !== (row.status === 'failed'))) controlProblems.push(`missing actual behavioral witness/control for ${row.id}`);
      continue;
    }
    if (['passed', 'unavailable'].includes(row.status)) continue;
    const allowed = contract.allowed[row.id];
    let permitted = allowed === row.status;
    if (typeof allowed === 'string' && allowed.startsWith('stopped-at:')) {
      const at = allowed.slice('stopped-at:'.length);
      permitted = row.status === 'failed' && row.detail === `stopped: ${at} failed`
        && rows.get(at)?.status === 'failed' && rows.get(at)?.evidence?.observed === true;
    }
    if (allowed === 'expected-sync-errors-only') {
      const errors = row.evidence?.errors;
      permitted = row.status === 'failed' && row.evidence?.kind === 'page-errors' && Array.isArray(errors) && errors.length > 0
        && errors.every((error) => error.role === 'B' && error.message === 'probe: query threw synchronously');
    }
    if (!permitted) controlProblems.push(`unrelated or incomplete outcome: ${row.id} (${row.status})`);
  }
  if (controlProblems.length) return { name, outcome: 'inconclusive_evidence', receipt: entry.path, reasons: controlProblems };
  const named = spec.kills.map((id) => ({ id, status: rows.get(id)?.status ?? 'absent', detail: rows.get(id)?.detail ?? null,
    witness: rows.get(id)?.evidence ?? null }));
  if (named.some((row) => row.status === 'passed')) return { name, outcome: 'mutant_survived', receipt: entry.path, named };
  if (named.some((row) => row.status !== 'failed')) return { name, outcome: 'inconclusive_unreached', receipt: entry.path, named };
  return { name, outcome: 'behavioral_mutant_killed', receipt: entry.path,
    baseArtifact: baseline.baseArtifact,
    mutantBytes: { mutationSha256: provenance.mutationSha256, mutantFilesSha256: provenance.mutantFilesSha256, results: provenance.results },
    namedCase: spec.kills, named };
}

function authorizedOut(path) {
  const out = resolve(path);
  const root = realpathSync(join(homedir(), '.dharma'));
  const parent = realpathSync(dirname(out));
  const rel = relative(root, parent);
  if (!(rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)))) throw new Error('--out must be under ~/.dharma');
  if (existsSync(out)) throw new Error('--out must name a new file; an earlier verdict is never overwritten');
  return join(parent, basename(out));
}

const SELF = fileURLToPath(import.meta.url);
const invokedDirectly = (() => {
  try { return !!process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(SELF); } catch { return false; }
})();
if (invokedDirectly) {
  const options = parseArgs(process.argv.slice(2));
  const baselineEntry = load(options.baseline);
  const baseline = adjudicateBaseline(baselineEntry, options);
  const mutants = options.mutants.map((path) => adjudicateMutant(load(path), baseline, baselineEntry));
  const verdict = { format: 'kairo-record-hint-adjudication', v: 2, at: new Date().toISOString(),
    verifierSha256: VERIFIER_SHA256, harnessHashes: HARNESS_HASHES, receiptSchema: 3, allowPinnedBaseline: options.allowPinned, baseline, mutants };
  const text = `${JSON.stringify(verdict, null, 2)}\n`;
  if (options.out) writeFileSync(authorizedOut(options.out), text, { flag: 'wx' });
  process.stdout.write(text);
  process.exit(baseline.outcome === 'baseline_passed' && mutants.every((row) => row.outcome === 'behavioral_mutant_killed') ? 0 : 1);
}

export { adjudicateBaseline, adjudicateMutant };
