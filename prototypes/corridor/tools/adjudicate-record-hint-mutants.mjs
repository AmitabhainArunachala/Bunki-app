/**
 * Adjudicate record-hint mutation runs from their receipts (B2-TEST-REVIEW-r1 evidence rule).
 * Nothing here launches a browser, builds, or copies anything: it reads verify-record-hint.mjs
 * receipts and re-validates each mutant's provenance from disk with verifyTestMutant().
 *
 * Outcome types:
 *   baseline_passed           a FULL, unmutated run (kind release-artifact, selection full, base
 *                             source-compared unless --allow-pinned-baseline) of the CURRENT verifier
 *                             bytes: setup passed, every required row passed (recomputed from the rows,
 *                             not read from the receipt's status), nothing unreached.
 *   baseline_failed           that run completed its setup but a required row did not pass.
 *   behavioral_mutant_killed  { baseArtifact, mutantBytes, namedCase }. Requires: baseline_passed; a
 *                             test-mutation receipt from the same verifier bytes on the same base
 *                             artifact; a mutation exactly equal to its RECORD_HINT_MUTANTS entry that
 *                             re-validates from disk against its pinned mutationSha256; setup and every
 *                             W0 identity row passed; the mutant's cases selected; each named row passed
 *                             in the baseline; and EVERY named row evaluated and failed in the mutant run.
 *   mutant_survived           everything valid, but a named row passed.
 *   inconclusive_setup        any setup, identity, provenance, verifier, selection or baseline rejection.
 *                             Never a kill.
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
import { RECORD_HINT_MUTANTS } from './record-hint-mutants.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const VERIFIER_SHA256 = sha256(readFileSync(join(TOOLS, 'verify-record-hint.mjs')));
const FORMAT = 'kairo-record-hint-verification';

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
/** Reasons a receipt cannot be adjudicated at all, whatever it claims. */
function receiptProblems(receipt) {
  const reasons = [];
  if (receipt?.format !== FORMAT || receipt.v !== 2) reasons.push('not a v2 record-hint receipt');
  if (receipt?.verifier?.sha256 !== VERIFIER_SHA256) reasons.push('produced by other verifier bytes than the current verify-record-hint.mjs');
  if (receipt?.setup?.status !== 'passed') reasons.push(`setup ${receipt?.setup?.status}: ${receipt?.setup?.error ?? ''}`.trim());
  if (!receipt?.finishedAt || !['passed', 'failed'].includes(receipt?.status)) reasons.push(`terminal status ${receipt?.status}`);
  if (!Array.isArray(receipt?.results)) reasons.push('no result rows');
  else {
    const ids = receipt.results.map((row) => row.id);
    if (new Set(ids).size !== ids.length) reasons.push('duplicate result rows');
    if (!receipt.results.some((row) => row.case === 'W0') || receipt.results.some((row) => row.case === 'W0' && row.status !== 'passed'))
      reasons.push('W0 identity rows did not all pass');
  }
  return reasons;
}
const rowsOf = (receipt) => new Map((receipt.results || []).map((row) => [row.id, row]));

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
    omitted: receipt.cases?.omitted ?? [] };
}

function adjudicateMutant(entry, baseline, baselineEntry) {
  const { receipt } = entry;
  const mutant = receipt?.artifact?.mutant;
  const name = mutant?.name ?? null;
  const spec = name && Object.hasOwn(RECORD_HINT_MUTANTS, name) ? RECORD_HINT_MUTANTS[name] : null;
  const reasons = receiptProblems(receipt);
  if (baseline.outcome !== 'baseline_passed') reasons.push(`the baseline is ${baseline.outcome}`);
  if (receipt?.artifact?.kind !== 'test-mutation' || !mutant) reasons.push('not an explicit test-mutation run');
  if (!spec) reasons.push(`no RECORD_HINT_MUTANTS entry named ${name}`);
  if (receipt?.runId === baselineEntry.receipt?.runId || entry.path === baselineEntry.path) reasons.push('the same run as the baseline');
  if (baseline.outcome === 'baseline_passed' && receipt?.artifact?.base?.artifactSha256 !== baseline.baseArtifact)
    reasons.push('mutated from another base artifact than the baseline ran');
  if (spec) {
    for (const id of spec.cases) if (!receipt?.selection?.cases?.includes(id)) reasons.push(`case ${id} was not selected`);
    const baselineRows = rowsOf(baselineEntry.receipt);
    for (const id of spec.kills) if (baselineRows.get(id)?.status !== 'passed') reasons.push(`named row ${id} did not pass in the baseline`);
  }
  let provenance = null;
  if (!reasons.length) {
    try {
      provenance = verifyTestMutant({ baseSite: receipt.artifact.base.site, mutantSite: mutant.site,
        expectedMutationSha256: mutant.mutationSha256, expectedName: name });
      const edits = provenance.edits.map(({ file, from, to }) => ({ file, from, to }));
      if (!isDeepStrictEqual(edits, [{ file: spec.file, from: spec.from, to: spec.to }])) reasons.push('the mutation is not the table entry for its name');
      if (provenance.base.artifactSha256 !== baseline.baseArtifact) reasons.push('the provenance names another base artifact');
      if (provenance.identitySha256 !== mutant.identitySha256) reasons.push('the mutant identity on disk is not the one the run served');
    } catch (error) {
      reasons.push(`mutation provenance: ${error.message}`);
    }
  }
  if (reasons.length) return { name, outcome: 'inconclusive_setup', receipt: entry.path, reasons };
  const rows = rowsOf(receipt);
  const named = spec.kills.map((id) => ({ id, status: rows.get(id)?.status ?? 'absent', detail: rows.get(id)?.detail ?? null }));
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
  const verdict = { format: 'kairo-record-hint-adjudication', v: 1, at: new Date().toISOString(),
    verifierSha256: VERIFIER_SHA256, allowPinnedBaseline: options.allowPinned, baseline, mutants };
  const text = `${JSON.stringify(verdict, null, 2)}\n`;
  if (options.out) writeFileSync(authorizedOut(options.out), text, { flag: 'wx' });
  process.stdout.write(text);
  process.exit(baseline.outcome === 'baseline_passed' && mutants.every((row) => row.outcome === 'behavioral_mutant_killed') ? 0 : 1);
}

export { adjudicateBaseline, adjudicateMutant };
