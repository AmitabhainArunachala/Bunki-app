/** VH-1: pure contracts shared by the actual voice/sense/Speak verifiers and their adversarial tests. */
import assert from 'node:assert/strict';

export const SPEAK_CASE_IDS = Object.freeze(Array.from({ length: 23 }, (_, i) => `S${i + 1}`));
export const SPEAK_CONTROL_IDS = Object.freeze(['device-voice', 'charon-main', 'revlog', 'auto-save', 'mic-on-entry', 'tracks-kept', 'key-in-url', 'no-gate', 'late-opening-voice', 'queued-voice', 'pending-mic', 'spend-unchecked', 'settings-claim', 'notes-claim', 'untyped-word', 'pin-only', 'no-his-pitch', 'residue-target', 'token-dropped', 'blob-kept', 'ended-no-shadow', 'overlap']);
// Original S12 fault contract at 384d4a70: "WebKit offline refuses it". Lead approved this named
// applicability on 2026-10-19 (0708): it does not exempt either engine from the full positive S12 case.
export const SPEAK_CONTROL_IDS_BY_ENGINE = Object.freeze({
  webkit: SPEAK_CONTROL_IDS,
  chromium: Object.freeze(SPEAK_CONTROL_IDS.filter(id => id !== 'blob-kept')),
});
export function speakControlPlan(engines, selected = null) {
  assert(Array.isArray(engines) && engines.length && new Set(engines).size === engines.length
    && engines.every(engine => Object.hasOwn(SPEAK_CONTROL_IDS_BY_ENGINE, engine)), 'unknown or duplicate Speak control engine');
  const available = SPEAK_CONTROL_IDS.filter(id => engines.some(engine => SPEAK_CONTROL_IDS_BY_ENGINE[engine].includes(id)));
  assert(selected === null || (Array.isArray(selected) && selected.length && new Set(selected).size === selected.length
    && selected.every(id => available.includes(id))), 'SPEAK_NEGATIVES: inapplicable or invalid selection for requested engines');
  const requestedScope = selected || available;
  const applicability = Object.fromEntries(engines.map(engine => [engine, [...SPEAK_CONTROL_IDS_BY_ENGINE[engine]]]));
  const jobs = engines.flatMap(engine => requestedScope.filter(id => applicability[engine].includes(id)).map(name => ({ engine, name })));
  return { requestedScope, applicability, jobs };
}
export const SENSE_GROUPS = Object.freeze(['f0', 'g', 'w', 'c']);

export function selection(raw, allowed, name) {
  if (raw === undefined) return null;
  assert.equal(typeof raw, 'string', `${name}: selection must be text`);
  const values = raw.split(',').map((x) => x.trim());
  assert(values.length && values.every(Boolean), `${name}: empty selection`);
  assert.equal(new Set(values).size, values.length, `${name}: duplicate selection`);
  assert(values.every((x) => allowed.includes(x)), `${name}: unknown selection: ${values.filter((x) => !allowed.includes(x)).join(',')}`);
  return values;
}

export function exactRoster(expected, observed) {
  return Array.isArray(expected) && expected.length > 0 && Array.isArray(observed)
    && new Set(expected).size === expected.length && new Set(observed).size === observed.length
    && expected.length === observed.length && expected.every((id) => observed.includes(id));
}

export function readingInteraction(expected, observed) {
  if (expected === 'inert-annotation') return observed.annotation === true
    && !observed.interactive && !observed.mini && !observed.sheet && !observed.rung;
  if (expected === 'reading-card') return observed.annotation === false && observed.interactive === true;
  return false;
}

/** Only explicitly classified setup timeouts before any observation may retry. Rows are emitted immediately,
 * deeply copied/frozen and never replaced. Errors after a semantic row are terminal even if that row was green. */
export async function senseAttempts({ run, emit, history = [], onError = () => {} }) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let observations = 0;
    const publish = (row) => {
      observations += 1;
      const copy = structuredClone({ ...row, attempt });
      const freeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
      emit(freeze(copy));
    };
    try {
      await run(publish, attempt);
      history.push({ attempt, observations, complete: true });
      return;
    } catch (error) {
      const retry = attempt === 1 && observations === 0 && error?.name === 'TimeoutError' && error?.senseStage === 'setup';
      history.push({ attempt, observations, complete: false, retry, stage: error?.senseStage || 'semantic', error: String(error?.stack || error) });
      if (retry) continue;
      await onError(error, attempt);
      publish({ id: 'incomplete', title: 'the case completed without infrastructure failure', ok: false,
        observed: { error: String(error?.stack || error), stage: error?.senseStage || 'semantic' } });
      return;
    }
  }
}

export function speakCompletion({ engines, selected, cases, checks, error, pageErrors = [], fault = '', overlay = false }) {
  const requested = selected || SPEAK_CASE_IDS;
  const expectedCases = engines.flatMap((engine) => [...requested, ...(!selected ? ['egress'] : [])].map((id) => `${engine}/${id}`));
  const observedCases = cases.map((row) => `${row.engine}/${row.case}`);
  const complete = exactRoster(expectedCases, observedCases) && cases.every((row) => row.completed === true && row.checks > 0)
    && checks.length > 0 && checks.every((row) => expectedCases.includes(`${row.engine}/${row.case}`))
    && cases.every((row) => checks.filter((check) => check.engine === row.engine && check.case === row.case).length === row.checks);
  const selectedPassed = complete && !error && pageErrors.length === 0 && cases.every((row) => row.pass) && checks.every((row) => row.pass);
  return { expectedCases, observedCases, complete, selectedPassed, fullAcceptance: selectedPassed && selected === null && !fault && !overlay };
}

/** A receipt is necessary, but only fresh complete intended evidence is a kill. A process timeout or an unrelated red
 * cannot count. Witness names are bound to their cases; all rows, including prerequisites, are adjudicated. */
export function adjudicateSpeakPhase({ receipt, exit, signal, timedOut, nonce, engine, cases, fault = '', witness = {}, downstream = {} }) {
  if (!receipt || !Array.isArray(receipt.checks) || !Array.isArray(receipt.cases) || !Array.isArray(receipt.pageErrors)
    || !receipt.checks.every(row => row && typeof row === 'object') || !receipt.cases.every(row => row && typeof row === 'object'))
    return { ok: false, clean: false, witnesses: [], unrelated: [], downstreamReds: [], status: 'not-run' };
  const failures = receipt.checks.filter((row) => !row.pass);
  const expected = cases.map((id) => `${engine}/${id}`);
  const clean = !!receipt && receipt.nonce === nonce && receipt.phase === (fault ? 'mutant' : receipt.phase)
    && receipt.fault === (fault || null) && receipt.artifactSha256 && receipt.verifierSha256
    && !receipt.error && !(receipt.pageErrors || []).length && !signal && !timedOut
    && exactRoster(expected, (receipt.cases || []).map((row) => `${row.engine}/${row.case}`))
    && receipt.cases.every((row) => row.completed && row.checks > 0
      && receipt.checks.filter((r) => r.engine === engine && r.case === row.case).length === row.checks)
    && receipt.checks.every((row) => row.engine === engine && cases.includes(row.case));
  const intended = (row) => row.engine === engine && witness[row.case]?.test(row.name);
  const witnesses = cases.map((id) => ({ case: id, rows: failures.filter((row) => row.case === id && intended(row)).map((row) => row.name) }));
  const allowedDownstream = (row) => row.engine === engine && (downstream[row.case] || []).includes(row.name);
  const unrelated = failures.filter((row) => !intended(row) && !allowedDownstream(row));
  const downstreamReds = failures.filter((row) => !intended(row) && allowedDownstream(row));
  const ok = clean && (fault ? exit === 1 && witnesses.every((row) => row.rows.length > 0) && unrelated.length === 0
    : exit === 3 && receipt.selectedPassed === true && failures.length === 0);
  return { ok: !!ok, clean: !!clean, witnesses, unrelated, downstreamReds, status: !clean || unrelated.length ? 'not-run' : ok ? (fault ? 'caught' : 'passed') : 'missed' };
}
