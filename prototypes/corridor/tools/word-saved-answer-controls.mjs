/**
 * D23 · bounded control admission for the saved-word-answer tests.
 *
 * A control is a set of literal edits to corridor.js. Each edit must match exactly once; the
 * edited source is then lifted by the test it is run against. This module declares:
 *   - the exact test inventory;
 *   - every control, with its witnesses and the collateral it may cause: 32 WORD_CONTROLS and 2
 *     LEARNING_RECORD_CONTROLS, 34 controls, run as 36 children with the two baselines;
 *   - the admission rules;
 *   - the runner, and the evidence it keeps for every child.
 *
 * A control counts as KILLED only when all of the following hold:
 *   - the unmutated baseline completed, reported exactly the declared inventory once each, and
 *     passed every row;
 *   - the control's child completed, which requires:
 *       - no spawn error and no signal (a timeout is both, and an exceeded capture bound is a spawn error);
 *       - exit 0 or 1, agreeing with its own failures;
 *       - for a TAP child: plan and summary counts equal to the inventory, with no cancel, skip or
 *         todo, and an empty stderr;
 *       - for a receipt child: stderr exactly equal to its receipt's failure diagnostics in order
 *         (empty for a passing baseline), and the receipt bound to the expected source and control;
 *       - its source marker, naming the control and the sha256 of the exact source it lifted;
 *       - exactly the inventory, each id reported once;
 *   - F0 passed;
 *   - every witness's setup row passed, so the failure is behavioural, not setup;
 *   - every witness failed;
 *   - every failure is a declared witness or declared collateral.
 * Anything else is 'incomplete', 'contaminated', 'survived' or 'baseline-failed'. A mutant's
 * ordinary assertion failure (exit 1) is expected, not an error.
 *
 * Bounds: each child has timeoutMs (300 s, then SIGKILL) and CHILD_MAX_BUFFER (16 MiB) per stream.
 * These are per-child bounds only; the phase has no separately admitted total bound (worst case:
 * the assessment staging plus 36 × 300 s).
 *
 *   node prototypes/corridor/tools/test-word-saved-answer.mjs --controls   runs every control below
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

export const CHILD_TIMEOUT_MS = 300_000;
export const CHILD_MAX_BUFFER = 16 * 1024 * 1024;

export const WORD_CASES = Object.freeze(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7r', 'T7s', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15',
  // D23 search stand-in: relation copy (X), search presentation (S), the core sheet's live door (N), the preservation table (V), P3
  'X1', 'X2', 'X3', 'X4', 'X5', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'N1', 'V1', 'V2', 'V3', 'V4', 'V5', 'P3', 'P3b', 'P3r']);
/** The exact rows test-word-saved-answer.mjs must report: F0, then a setup row and a behaviour row per case. */
export const INVENTORY = Object.freeze(['F0', ...WORD_CASES.flatMap((id) => [`${id}.setup`, id])]);

/* Controls on test-word-saved-answer.mjs. `edits` are [from, to] literal pairs on corridor.js;
 * `witnesses` must fail; `collateral` may fail (declared by reading the code, never inferred). */
export const WORD_CONTROLS = Object.freeze({
  C1: { note: 'resolver bypassed: the review back is lookup()’s (reviewCardBack → reviewBack)', witnesses: ['T1'], collateral: [], edits: [
    ["  if (item.t !== 'word') return reviewBack(item);\n", '  return reviewBack(item);\n']] },
  C2: { note: 'capture guard reverted: an explicit selection on a core spelling saves nothing', witnesses: ['T2'],
    // the search stand-in rows built on a 1353320 or うわて capture on the core spelling 上手 then hold a core card,
    // and the history fixtures then keep no うわて snapshot
    collateral: ['T7r.setup', 'T7r', 'T7s.setup', 'T7s', 'T11.setup', 'T11', 'T13.setup', 'T13', 'T15',
      'X1', 'X2', 'X3.setup', 'X3', 'X4.setup', 'X4', 'X5.setup', 'X5', 'V1', 'V2', 'V3', 'V4', 'V5', 'P3', 'P3b', 'P3r'], edits: [
      ["  if (node.seq != null && node.seq !== '') {\n    snapshot = explicitWordSnapshot(node, latest);",
        "  if (node.seq != null && node.seq !== '' && !D.dict[id]) {\n    snapshot = explicitWordSnapshot(node, latest);"]] },
  C3: { note: 'fail-closed removed: an explicit selection with no validated answer captures a row without identity', witnesses: ['T3'],
    collateral: ['T4'], edits: [
      ["    if (!snapshot) throw Object.assign(new Error('word-answer-unavailable'), { code: 'word-answer-unavailable' });\n    identity = { kind: 'seq', seq: snapshot.seq, reading: snapshot.r };",
        "    identity = snapshot ? { kind: 'seq', seq: snapshot.seq, reading: snapshot.r } : { kind: 'unknown' };"]] },
  C4: { note: 'identity by reading only: a shared reading passes for a shared entry', witnesses: ['T5'],
    // ポンド 2855351 is then no conflict beside the 1126030 card or its history: the relation rows lose their other-entry fixture
    collateral: ['T8.setup', 'T8', 'X1', 'X2', 'X3', 'V5'], edits: [
    ["  if (a.kind === 'seq') return a.seq === b.seq && (a.reading == null || b.reading == null || a.reading === b.reading);",
      "  if (a.kind === 'seq') return a.reading == null || b.reading == null || a.reading === b.reading;"]] },
  C5: { note: 'list note precedence reverted: the legacy word layer answers first', witnesses: ['T12', 'T2'], collateral: [], edits: [
    ["  return answer?.status === 'available' ? answer.reading : '';", "  return D.words?.[item.id]?.r || (answer?.status === 'available' ? answer.reading : '');"],
    ["  return answer?.status === 'available' ? answer.meanings[0] : '';", "  return D.words?.[item.id]?.g || (answer?.status === 'available' ? answer.meanings[0] : '');"]] },
  C6a: { note: 'commit-time word check removed from both grade producers', witnesses: ['T8', 'T9', 'T14'], collateral: [], edits: [
    ["      if (item.t === 'word') assertWordAnswerPresented(rv, item, latest);\n      return { obslog:", '      return { obslog:'],
    ["    if (item.t === 'word') assertWordAnswerPresented(rv, item, latest);\n    let sentenceRoot", '    let sentenceRoot']] },
  C7: { note: 'stale snapshot kept: a core capture leaves a removed explicit card’s entry behind', witnesses: ['T11'], collateral: [], edits: [
    ['    if (saved && nonEmptyString(saved.seq)) deepWords = Object.fromEntries(Object.entries(snapshots).filter(([key]) => key !== id));',
      '    if (saved && nonEmptyString(saved.seq)) deepWords = null;']] },
  C8: { note: 'assessment subject precedence reverted: a learner snapshot answers for a core test word', witnesses: ['T2'], collateral: [], edits: [
    ['    const entry = D.dict?.[id] || record.deepWords?.[id] || lookup(id);', '    const entry = record.deepWords?.[id] || D.dict?.[id] || lookup(id);']] },
  C9r: { note: 'removal guard removed from the ordinary remove producer', witnesses: ['T7r'],
    // a core door (V3), the 1353320 door on a core card (V4) and every other-identity door (V5) then remove the card
    collateral: ['V3', 'V4', 'V5'], edits: [
    ['      holds(latest);\n', '']] },
  C9s: { note: 'suppression guard removed from the assessment suppression producer', witnesses: ['T7s'],
    // the core door then suppresses the route-captured 1353320 card
    collateral: ['V3'], edits: [
    ["suppressAssessmentCards({ kind: 'remove', key }, expected ? holds : null)", "suppressAssessmentCards({ kind: 'remove', key }, null)"]] },
  C10: { note: 'shown-answer binding removed: availability alone authorizes a grade', witnesses: ['T8'], collateral: [], edits: [
    ['  if (!bound || bound.item !== item || bound.ix !== rv.ix || bound.key !== wordPresentationKey(item, answer)) {', '  if (false) {']] },
  C11: { note: 'exact reading index relaxed to normalised kana (lends ウブ’s restriction to うぶ)', witnesses: ['T4'], collateral: [], edits: [
    ['  const kana = indexed ? indexed[5].indexOf(node.reading) : -1;',
      '  const kana = indexed ? indexed[5].findIndex((form) => kataToHira(form) === kataToHira(node.reading)) : -1;']] },
  C12: { note: 'reading restriction removed: ウブ may be written 産', witnesses: ['T4'], collateral: [], edits: [
    ['  if (indexed && !(kana >= 0 && readerReadingFits(indexed, kana, node.id) && readerReadingFits(indexed, kana, head))) {',
      '  if (indexed && !(kana >= 0)) {']] },
  C13: { note: 'same-entry saved answer not reused: a retake rewrites the captured answer', witnesses: ['T6', 'T3'], collateral: ['T5'], edits: [
    ['    (indexed || wordSelection(saved) || held)) {\n    return saved;', '    false) {\n    return saved;']] },
  C14: { note: 'opaque legacy src promoted to provenance', witnesses: ['T10'], collateral: [], edits: [
    ["head: selection?.head || id, source: selection ? 'selection' : 'saved-legacy' });",
      "head: selection?.head || id, source: selection || snap.src ? 'selection' : 'saved-legacy' });"]] },
  C15: { note: 'identity-only binding: the displayed meaning left out of the presentation key', witnesses: ['T8'], collateral: [], edits: [
    ['    answer.reading, answer.meanings.slice(0, 4)]);', '    answer.reading]);']] },
  C16: { note: 'present row cue excused when the snapshot has no reading (the typeof conjunct restored)', witnesses: ['T14'], collateral: [], edits: [
    ['    if (nonEmptyString(row?.cueReading) && snap.r !== row.cueReading) {',
      "    if (nonEmptyString(row?.cueReading) && typeof snap.r === 'string' && snap.r !== row.cueReading) {"]] },
  C17: { note: 'absent row cue made a wildcard again (the matching snapshot’s reading ignored)', witnesses: ['T15'], collateral: ['T7r', 'T7s'], edits: [
    ["    const known = nonEmptyString(row.cueReading) ? row.cueReading\n      : snap?.seq === row.entrySeq && nonEmptyString(snap.r) ? snap.r : null;",
      '    const known = nonEmptyString(row.cueReading) ? row.cueReading : null;']] },
  // D23 search stand-in (design r3 FINAL; Codex 16:17:40Z, 16:20:08Z, 16:27:39Z)
  KS1: { note: 'search dedup removed: a numbered row identical to the core row is shown beside it (上手 shows the core row plus 1353320)',
    // S11: with no fold, a numbered row takes a place its core word then loses in the first 40
    witnesses: ['S1', 'S2', 'S3', 'S8', 'S9'], collateral: ['S11'], edits: [
      ['    const row = e.seq && searchRowShownByCore(e, coreRows.get(e.id)) ? coreRows.get(e.id) : e;', '    const row = e;']] },
  KS2: { note: 'search dedup widened to non-identical rows (the stand-in proposal’s compatible + normalised-reading test): the critic’s ‘tin’ row, ペラペラ and The Economist are dropped',
    witnesses: ['S4', 'S6', 'S8'], collateral: [], edits: [
      ['  if (!core || !e?.seq || core.w !== e.w || core.r !== e.r || core.g !== e.g) return false;',
        '  if (!core || !e?.seq || !dictionaryCoreMatch(e.id, e.dictionaryRow).compatible || kataToHira(core.r) !== kataToHira(e.reading || e.r)) return false;']] },
  KS3: { note: 'the old core drop restored: a compatible deep row hides the scored core row again (word:上手, word:学校 missing)',
    witnesses: ['S1', 'S2', 'S3', 'S4', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11'], collateral: [], edits: [
      ['    const row = e.seq && searchRowShownByCore(e, coreRows.get(e.id)) ? coreRows.get(e.id) : e;',
        '    if (e.core && scored.some(({ e: deep }) => deep.dictionaryRow && [deep.dictionaryRow[1], ...deep.dictionaryRow[4], ' +
          '...deep.dictionaryRow[5]].includes(e.id) && dictionaryCoreMatch(e.id, deep.dictionaryRow).compatible)) continue;\n    const row = e;']] },
  KS4: { note: 'B2 and the live core-sheet door removed (no choice is enabled on a seq-less core sheet): 学校 loses its lone door and its dedup, and セント’s resolved door is inert again',
    // S11: with no enabled door nothing folds, so its reach check has no folded row to test
    witnesses: ['S1', 'S9', 'N1'], collateral: ['S2', 'S3', 'S8', 'S11'], edits: [
      ['  const enabledOnCore = !!D.dict?.[form];', '  const enabledOnCore = false;']] },
  KS4b: { note: 'the resolved-seq active rule restored on the core sheet only (B2 and the dedup kept): the resolved entry’s door is inert, a failed click',
    witnesses: ['N1'], collateral: ['S8'], edits: [
      ['    const active = !(seqless && enabledOnCore) && String(seq) === currentSeq &&', '    const active = String(seq) === currentSeq &&']] },
  KS5: { note: 'fold by skipping: the numbered row is dropped and the core row keeps its own later rank, so words fall out of the first 40',
    witnesses: ['S1', 'S8', 'S11'], collateral: [], edits: [
      ['    const row = e.seq && searchRowShownByCore(e, coreRows.get(e.id)) ? coreRows.get(e.id) : e;',
        '    if (e.seq && searchRowShownByCore(e, coreRows.get(e.id))) continue;\n    const row = e;']] },
  KC1: { note: 'relation collapsed to other-entry: every held line claims another entry again',
    witnesses: ['X1', 'X2', 'X3', 'X5', 'V2', 'V4', 'V5', 'P3', 'P3b'], collateral: [], edits: [
      ["  if (node?.kind !== 'seq' || card?.kind !== 'seq') return 'unestablished';", "  return 'other-entry';"]] },
  KR1: { note: 'the open route removed from the held mini', witnesses: ['V2'], collateral: ['V3', 'V5', 'X3'], edits: [
    ["  if (miniState === 'conflict') {\n    const open = biLabel('button', 'mini-take-open'", "  if (false) {\n    const open = biLabel('button', 'mini-take-open'"]] },
  KP3: { note: 'the held reason removed from the lesson and older-set enroll rows', witnesses: ['P3', 'P3b'],
    // with no held line the row offers no route either
    collateral: ['P3r'], edits: [
    ['    const heldText = learningEnrollHeldText({ t: kt, id: w, from: null });', '    const heldText = null;'],
    ['    const heldText = completed && !unanswered && !ok && key ? learningEnrollHeldText({ t, id, from: null }) : null;', '    const heldText = null;']] },
  KP3b: { note: 'the older set’s enrolled-spelling exclusion restored ahead of the hold (the r1 draft 29e15532): a word enrolled as another identity is silent again',
    // the silent older-set row offers no route either
    witnesses: ['P3', 'P3b'], collateral: ['P3r'], edits: [
      ['    if (completed && !unanswered && !ok && key && (heldText || !inDeck.has(key))) {', '    if (completed && !unanswered && !ok && key && !inDeck.has(key)) {']] },
  KB1: { note: 'basis forced to card (r3.3): a hold that only studied history keeps claims a card that exists again', witnesses: ['X3', 'X5', 'P3', 'P3r'], collateral: [], edits: [
    ["  return (record.taken || []).some((entry) => entry.t === 'word' && entry.id === id) ? 'card' : 'history';", "  return 'card';"]] },
  // NM review-1 (run 01M3EDXJHA9TPQ1PA7VV5TDQFV): the held enroll rows' route, and the route-less line for a page without one
  KR3: { note: 'the open route removed from the held lesson and older-set rows: their held line names a control that is not there (NM review-1)',
    witnesses: ['P3r'], collateral: [], edits: [
      ["  if (node?.t !== 'word' || wordCaptureState(node) !== 'conflict') return null;\n  const open = biLabel('button', 'chip enroll-held-open'",
        "  return null;\n  const open = biLabel('button', 'chip enroll-held-open'"]] },
  KR3t: { note: 'the enroll-row route opens the bare spelling, whose core door cannot manage the retained card', witnesses: ['P3r'], collateral: [], edits: [
    ["  open.addEventListener('click', () => go(heldWordCardNode(S, node.id), { invoker: open }));\n  return open;",
      "  open.addEventListener('click', () => go({ t: 'word', id: node.id }, { invoker: open }));\n  return open;"]] },
  KX5: { note: 'the route-less line ignored: the sentence sheet’s seal, whose page has no route, says “open that card” again (NM review-1, third site)',
    witnesses: ['X5'], collateral: [], edits: [
      ['  if (!route) {\n    return tx(`「${node.id}」には保存済みのカードがあるため', '  if (false) {\n    return tx(`「${node.id}」には保存済みのカードがあるため']] },
});

/* Controls on verify-learning-record.mjs (receipt children). Its inventory is the exact, unique
 * check list its complete unmutated baseline receipt reports; these rows must be in it. */
export const LEARNING_RECORD_CONTROLS = Object.freeze({
  RB: { note: 'the renderer binds a copy of the session, not the real one', setups: ['word-review-render-fixture-starts-unbound'],
    witnesses: ['word-review-shows-and-binds-its-saved-answer', 'word-review-changed-answer-refuses-both-producers-and-asks-for-a-fresh-look'],
    collateral: [], edits: [['  const presented = presentReviewAnswer(rv);\n', '  const presented = presentReviewAnswer({ ...rv });\n']] },
  C6b: { note: 'UI word-answer check removed from the review face', setups: [],
    witnesses: ['word-review-unavailable-face-refuses-grades-and-writes-nothing'], collateral: [], edits: [
      ['  if (!reviewAnswerAvailable(item)) {\n', '  if (false) {\n']] },
});

/** Apply one control's literal edits; any edit that does not match exactly once throws, so a
 * child whose control could not be applied never reaches its tests. */
export function applyControl(text, table, name) {
  const control = table[name];
  if (!control) throw new Error(`unknown control ${name}`);
  for (const [from, to] of control.edits) {
    let count = 0;
    for (let at = text.indexOf(from); at !== -1; at = text.indexOf(from, at + 1)) count++;
    if (count !== 1) throw new Error(`control ${name}: edit matched ${count} times, not exactly once`);
    text = text.replace(from, () => to);
  }
  return text;
}
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
/** The first stdout line of every test-word-saved-answer.mjs row run: the control it applied (or
 * baseline), its edit count, and the sha256 of the exact source it lifted from. */
export const sourceMarker = (name, table, sourceSha256) =>
  `# d23-source ${name || 'baseline'} ${name ? table[name].edits.length : 0} ${sourceSha256}`;
/** The stdout line a verify-learning-record.mjs control child prints; its receipt's sourceSha256
 * must name the same source. */
export const receiptMarker = (name, sourceSha256) => `CONTROL-APPLIED ${name} ${sourceSha256}`;

/** node:test TAP: top-level rows, the plan and the summary counts. */
export function parseTap(stdout) {
  const rows = [];
  let plan = null;
  const summary = {};
  for (const line of String(stdout).split('\n')) {
    let match = /^(not ok|ok) \d+ - (.*)$/u.exec(line);
    if (match) {
      const directive = /\s#\s*(SKIP|TODO)\b/iu.test(match[2]);
      rows.push({ id: match[2].trim().split(/\s+/u)[0], ok: match[1] === 'ok', directive });
      continue;
    }
    match = /^1\.\.(\d+)$/u.exec(line);
    if (match) { plan = Number(match[1]); continue; }
    match = /^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/u.exec(line);
    if (match) summary[match[1]] = Number(match[2]);
  }
  return { rows, plan, summary };
}

const tally = (ids) => ids.reduce((map, id) => map.set(id, (map.get(id) || 0) + 1), new Map());
function inventoryProblems(ids, inventory) {
  const counts = tally(ids);
  const problems = [];
  const duplicates = [...counts].filter(([, n]) => n > 1).map(([id]) => id);
  const missing = inventory.filter((id) => !counts.has(id));
  const extra = [...counts.keys()].filter((id) => !inventory.includes(id));
  if (duplicates.length) problems.push(`duplicate:${duplicates.join(',')}`);
  if (missing.length) problems.push(`missing:${missing.join(',')}`);
  if (extra.length) problems.push(`extra:${extra.join(',')}`);
  return problems;
}
/** A spawn error's class. A timeout (killed by the timeout) and an exceeded capture bound stay
 * failures, like any other spawn error. */
export function classifyError(error) {
  if (!error) return null;
  if (error.code === 'ETIMEDOUT') return 'timeout';
  if (error.code === 'ENOBUFS') return 'output-limit';
  return 'spawn';
}
function processProblems(run, { stderr }) {
  const problems = [];
  if (run.error) problems.push(`spawn-error:${classifyError(run.error)}:${run.error.code || run.error.message}`);
  if (run.signal) problems.push(`signal:${run.signal}`);
  if (run.status !== 0 && run.status !== 1) problems.push(`exit:${run.status}`);
  if (stderr && String(run.stderr ?? '') !== '') problems.push('stderr');
  return problems;
}

/** One TAP child observed against the exact inventory. A TAP child's stderr must be empty, and its
 * source marker (baseline or control) must be its exact stdout line. */
export function observeTapRun(run, inventory, marker = null) {
  const problems = processProblems(run, { stderr: true });
  const { rows, plan, summary } = parseTap(run.stdout || '');
  problems.push(...inventoryProblems(rows.map((row) => row.id), inventory));
  const failed = rows.filter((row) => !row.ok).length;
  if (plan !== inventory.length) problems.push(`plan:${plan}`);
  if (summary.tests !== inventory.length) problems.push(`summary-tests:${summary.tests}`);
  for (const key of ['cancelled', 'skipped', 'todo']) if (summary[key] !== 0) problems.push(`summary-${key}:${summary[key]}`);
  if (summary.pass !== rows.length - failed || summary.fail !== failed) problems.push('summary-disagrees');
  if (rows.some((row) => row.directive)) problems.push('directive');
  if (run.status === 0 && failed) problems.push('exit-0-with-failures');
  if (run.status === 1 && !failed) problems.push('exit-1-without-failures');
  if (marker && !String(run.stdout || '').split('\n').includes(marker)) problems.push('source-marker-missing');
  return { complete: problems.length === 0, problems, results: new Map(rows.map((row) => [row.id, row.ok])) };
}

/** One receipt child (verify-learning-record.mjs), from the receipt it writes only at completion.
 * Each failing row carries `diagnostic`, the exact text it wrote to stderr (one write of
 * diagnostic + '\n', in the same step as the row), and a passing row carries none. So stderr must
 * be exactly the failing rows' diagnostics in receipt order, which is emission order: a passing run
 * leaves stderr empty, and a late fatal error, an extra or reordered FAIL line, or a diagnostic not
 * bound to its own row makes the run incomplete. Multiline diagnostics compare byte for byte.
 * `sourceSha256` and `control` bind the receipt to the source and control the parent expects. */
export function observeReceiptRun(run, receipt, { marker = null, sourceSha256 = null, control = null } = {}) {
  const problems = processProblems(run, { stderr: false });
  if (!receipt || !Array.isArray(receipt.results)) problems.push('receipt-missing');
  // a parsed {results:{}} is refused above and must still reach keep(): map only a real array (Codex D23 r3 P2)
  const rows = (Array.isArray(receipt?.results) ? receipt.results : []).map((row) => ({ id: row?.name, ok: row?.pass === true,
    typed: typeof row?.pass === 'boolean', diagnostic: row?.diagnostic }));
  if (rows.some((row) => typeof row.id !== 'string' || !row.typed)) problems.push('receipt-malformed');
  if (rows.some((row) => (row.ok ? row.diagnostic !== undefined
    : typeof row.diagnostic !== 'string' || !row.diagnostic.startsWith(`FAIL ${row.id}: `)))) problems.push('receipt-diagnostic-malformed');
  const expectedStderr = rows.filter((row) => !row.ok).map((row) => `${row.diagnostic}\n`).join('');
  if (String(run.stderr ?? '') !== expectedStderr) problems.push('stderr-disagrees-with-receipt');
  const duplicates = [...tally(rows.map((row) => row.id))].filter(([, n]) => n > 1).map(([id]) => id);
  if (duplicates.length) problems.push(`duplicate:${duplicates.join(',')}`);
  const failed = rows.filter((row) => !row.ok).length;
  if (receipt && receipt.pass !== (failed === 0)) problems.push('receipt-pass-disagrees');
  if (run.status === 0 && failed) problems.push('exit-0-with-failures');
  if (run.status === 1 && !failed) problems.push('exit-1-without-failures');
  if (marker && !String(run.stdout || '').split('\n').includes(marker)) problems.push('control-marker-missing');
  if (sourceSha256 && receipt && receipt.sourceSha256 !== sourceSha256) problems.push('receipt-source-disagrees');
  if (receipt && (receipt.control ?? null) !== control) problems.push('receipt-control-disagrees');
  return { complete: problems.length === 0, problems, results: new Map(rows.map((row) => [row.id, row.ok])) };
}

/** The release gate's 'checks' report for a node:test file whose rows are an exact declared
 * inventory: one row per declared id, passing only when that id ran exactly once and passed, and
 * `inventory-exact`. A removed, renamed or duplicated row fails the gate. */
export function inventoryReport(suite, inventory, observed) {
  const ids = observed.map((entry) => entry.id);
  const exact = ids.length === inventory.length && new Set(ids).size === ids.length && inventory.every((id) => ids.includes(id));
  const results = [...inventory.map((id) => ({ name: id, pass: ids.filter((entry) => entry === id).length === 1 &&
    observed.some((entry) => entry.id === id && entry.pass) })), { name: 'inventory-exact', pass: exact }];
  return { exact, report: { suite, inventory, results,
    summary: { total: results.length, failed: results.filter((entry) => !entry.pass).length } } };
}

/** Kill admission for one control, given its complete all-passing baseline. */
export function admitControl({ baseline, run, control, inventory }) {
  const baselineIds = [...baseline.results.keys()];
  if (!baseline.complete || baselineIds.length !== inventory.length || inventoryProblems(baselineIds, inventory).length ||
    [...baseline.results.values()].some((ok) => !ok)) {
    return { verdict: 'baseline-failed', problems: baseline.problems || [] };
  }
  if (!run.complete) return { verdict: 'incomplete', problems: run.problems };
  if (inventoryProblems([...run.results.keys()], inventory).length) return { verdict: 'incomplete', problems: ['inventory'] };
  const declared = [...control.witnesses, ...control.collateral, ...(control.setups || [])];
  const undeclared = declared.filter((id) => !inventory.includes(id));
  if (undeclared.length) return { verdict: 'incomplete', problems: [`undeclared-rows:${undeclared.join(',')}`] };
  const setups = control.setups || control.witnesses.map((id) => `${id}.setup`).filter((id) => inventory.includes(id));
  const failed = [...run.results].filter(([, ok]) => !ok).map(([id]) => id);
  const allowed = new Set([...control.witnesses, ...control.collateral]);
  const unexpected = failed.filter((id) => !allowed.has(id));
  if (inventory.includes('F0') && run.results.get('F0') !== true) return { verdict: 'contaminated', problems: ['F0-failed'], failed };
  if (setups.some((id) => run.results.get(id) !== true)) return { verdict: 'contaminated', problems: ['witness-setup-failed'], failed };
  if (unexpected.length) return { verdict: 'contaminated', problems: [`unexpected:${unexpected.join(',')}`], failed };
  if (!control.witnesses.every((id) => run.results.get(id) === false)) return { verdict: 'survived', failed };
  return { verdict: 'killed', failed };
}

/** Stage the actual assessment modules once (the repository's own builder and file list, as in
 * verify-assessment-learning.mjs, plus assessment-finalization.mjs, whose imports are all in that
 * list); children reuse the directory through D23_ASSESSMENT_STAGE. */
export async function stageAssessmentAuthority(root, dir) {
  const { buildCorridorModules } = await import('../../../scripts/build-reading-module.mjs');
  mkdirSync(join(dir, 'modules'), { recursive: true });
  for (const module of buildCorridorModules(root)) writeFileSync(join(dir, module.path), module.bytes);
  for (const name of ['assessment-learning.mjs', 'assessment-cloze.mjs', 'assessment-question-practice.mjs', 'assessment-v2-controller.mjs',
    'teacher-context.mjs', 'sentence-practice.mjs', 'teacher-drafts.mjs', 'sentence-drafts.mjs', 'assessment-finalization.mjs']) {
    writeFileSync(join(dir, name), readFileSync(join(root, 'prototypes/corridor', name)));
  }
  return dir;
}

/** The evidence record of one child: what ran (normalized argv and cwd, the node that ran it, the
 * bounds), how it ended (status, signal, classified spawn error, times), where its exact captured
 * bytes are (stdout/stderr files with sha256), what it read (pins, the stage, its receipt with
 * sha256), which control and literal edits it carried, and how it was observed and admitted. */
export function childRecord({ id, kind, role, control = null, table = null, edits = null, marker = null, authoredSha256,
  sourceSha256, argv, env, root, evidence, bounds, times, raw, stdout, stderr, receipt = null, pins, stage, observation, verdict = null }) {
  const underRoot = (value) => {
    if (typeof value !== 'string' || !isAbsolute(value)) return value;
    const inside = relative(root, value);
    return inside && !inside.startsWith('..') && !isAbsolute(inside) ? inside : value;
  };
  const underEvidence = (value) => (value ? relative(evidence, value) : null);
  return {
    format: 'd23-child-evidence', version: 1, child: id, kind, role,
    control, mutation: { table, edits, authoredSha256, sourceSha256 }, marker,
    argv: ['node', ...argv.map(underRoot)], cwd: '.', root, execPath: process.execPath, nodeVersion: process.version,
    env: { D23_ASSESSMENT_STAGE: underEvidence(env.D23_ASSESSMENT_STAGE), KAIRO_EVIDENCE_DIR: underEvidence(env.KAIRO_EVIDENCE_DIR) },
    bounds, ...times,
    status: raw.status, signal: raw.signal,
    error: raw.error ? { class: classifyError(raw.error), code: raw.error.code || null, message: String(raw.error.message) } : null,
    stdout: { path: `${id}.stdout`, bytes: stdout.length, sha256: sha256(stdout) },
    stderr: { path: `${id}.stderr`, bytes: stderr.length, sha256: sha256(stderr) },
    receipt, pins, stage,
    // the parsed row outcomes beside the raw bytes, so a reviewer can recompute the admission
    observation: { complete: observation.complete, problems: observation.problems,
      rows: observation.results ? Object.fromEntries(observation.results) : null },
    verdict,
  };
}

/** Run every control and write controls-report.json. The 33 children run one at a time: the TAP
 * baseline, the 29 WORD_CONTROLS, the learning-record baseline and its 2 controls. Each child is
 * bounded (timeoutMs, then SIGKILL; CHILD_MAX_BUFFER per stream), and its raw bytes and evidence
 * record are kept under children/, referenced by path and sha256 from the report, whatever its
 * outcome. There is no total bound for the phase: the worst case is the staging plus 33 × timeoutMs. */
export async function runControls({ root, testFile, learningRecordFile, evidence, timeoutMs = CHILD_TIMEOUT_MS }) {
  const phaseStartedAt = new Date().toISOString();
  const phaseStart = performance.now();
  const stage = await stageAssessmentAuthority(root, join(evidence, 'assessment-stage'));
  const childrenDir = join(evidence, 'children');
  mkdirSync(childrenDir, { recursive: true });
  const corridorFile = join(root, 'prototypes/corridor/corridor.js');
  const pinned = { 'corridor.js': corridorFile, 'test-word-saved-answer.mjs': testFile,
    'word-saved-answer-controls.mjs': fileURLToPath(import.meta.url), 'verify-learning-record.mjs': learningRecordFile,
    'dict-v2/index.json': join(root, 'prototypes/corridor/data/share_alike/dict-v2/index.json'),
    'dict.json': join(root, 'prototypes/corridor/data/share_alike/dict.json'),
    'words.json': join(root, 'prototypes/corridor/data/share_alike/words.json') };
  const pinsNow = () => Object.fromEntries(Object.entries(pinned).map(([name, file]) =>
    [name, { path: relative(root, file), sha256: sha256(readFileSync(file)) }]));
  const pins = pinsNow();
  const stagePins = Object.fromEntries(readdirSync(stage, { recursive: true }).map(String).sort()
    .filter((name) => statSync(join(stage, name)).isFile()).map((name) => [name, sha256(readFileSync(join(stage, name)))]));
  const authored = readFileSync(corridorFile, 'utf8');
  const authoredSha256 = sha256(authored);
  const bounds = { timeoutMs, killSignal: 'SIGKILL', maxBufferBytesPerStream: CHILD_MAX_BUFFER };
  // a control child writes no gate report: it runs without the gate's evidence directory
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'KAIRO_EVIDENCE_DIR'));
  // the source a control child must report lifting; an edit the parent cannot apply names itself
  // instead, so no child can print a matching marker and the run is incomplete, not an abort
  const expectedSource = (table, control) => {
    if (!control) return authoredSha256;
    try { return sha256(applyControl(authored, table, control)); }
    catch (error) { return `unappliable:${error.message}`; }
  };
  const children = [];
  const verdicts = [];

  /** Spawn one child with the existing bounded capture and keep its exact bytes. */
  const spawnChild = (id, argv, env) => {
    const startedAt = new Date().toISOString();
    const start = performance.now();
    const raw = spawnSync(process.execPath, argv, { cwd: root, env, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: CHILD_MAX_BUFFER });
    const times = { startedAt, endedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - start) };
    const stdout = Buffer.isBuffer(raw.stdout) ? raw.stdout : Buffer.alloc(0);
    const stderr = Buffer.isBuffer(raw.stderr) ? raw.stderr : Buffer.alloc(0);
    writeFileSync(join(childrenDir, `${id}.stdout`), stdout);
    writeFileSync(join(childrenDir, `${id}.stderr`), stderr);
    const run = { status: raw.status, signal: raw.signal, error: raw.error || null,
      stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') };
    return { raw, run, times, stdout, stderr };
  };
  const keep = (record) => {
    const bytes = Buffer.from(JSON.stringify(record, null, 2) + '\n', 'utf8');
    writeFileSync(join(childrenDir, `${record.child}.json`), bytes);
    children.push({ child: record.child, role: record.role, control: record.control, evidence: `children/${record.child}.json`,
      evidenceSha256: sha256(bytes), complete: record.observation.complete, problems: record.observation.problems,
      verdict: record.verdict?.verdict ?? null });
  };

  // TAP children: test-word-saved-answer.mjs, the baseline and then each WORD_CONTROLS control
  const tapEnv = { ...inherited, D23_ASSESSMENT_STAGE: stage };
  const tapChild = (id, control) => {
    const sourceSha256 = expectedSource(WORD_CONTROLS, control);
    const marker = sourceMarker(control, WORD_CONTROLS, sourceSha256);
    const argv = ['--test-reporter=tap', testFile, ...(control ? ['--control', control] : [])];
    const child = spawnChild(id, argv, tapEnv);
    return { ...child, argv, marker, sourceSha256, observation: observeTapRun(child.run, INVENTORY, marker) };
  };
  const tapBaseline = tapChild('tap-baseline', null);
  keep(childRecord({ id: 'tap-baseline', kind: 'tap', role: 'baseline', marker: tapBaseline.marker, authoredSha256,
    sourceSha256: tapBaseline.sourceSha256, argv: tapBaseline.argv, env: tapEnv, root, evidence, bounds, times: tapBaseline.times,
    raw: tapBaseline.raw, stdout: tapBaseline.stdout, stderr: tapBaseline.stderr, pins, stage: stagePins, observation: tapBaseline.observation }));
  for (const [name, control] of Object.entries(WORD_CONTROLS)) {
    const id = `tap-${name}`;
    const child = tapChild(id, name);
    const verdict = { suite: 'test-word-saved-answer', control: name, note: control.note,
      ...admitControl({ baseline: tapBaseline.observation, run: child.observation, control, inventory: INVENTORY }) };
    verdicts.push({ ...verdict, child: id });
    keep(childRecord({ id, kind: 'tap', role: 'control', control: name, table: 'WORD_CONTROLS', edits: control.edits, marker: child.marker,
      authoredSha256, sourceSha256: child.sourceSha256, argv: child.argv, env: tapEnv, root, evidence, bounds, times: child.times,
      raw: child.raw, stdout: child.stdout, stderr: child.stderr, pins, stage: stagePins, observation: child.observation, verdict }));
  }

  // receipt children: verify-learning-record.mjs, each in a fresh evidence directory
  const receiptChild = (id, control) => {
    const dir = mkdtempSync(join(evidence, `${id}-`));
    const env = { ...inherited, KAIRO_EVIDENCE_DIR: dir };
    const sourceSha256 = expectedSource(LEARNING_RECORD_CONTROLS, control);
    const marker = control ? receiptMarker(control, sourceSha256) : null;
    const argv = [learningRecordFile, ...(control ? ['--control', control] : [])];
    const child = spawnChild(id, argv, env);
    const path = join(dir, 'learning-record.json');
    let receipt = null;
    let receiptPin = null;
    if (existsSync(path)) {
      const bytes = readFileSync(path);
      receiptPin = { path: relative(evidence, path), bytes: bytes.length, sha256: sha256(bytes) };
      try { receipt = JSON.parse(bytes.toString('utf8')); } catch { receipt = null; }
    }
    const observation = observeReceiptRun(child.run, receipt, { marker, sourceSha256, control });
    return { ...child, argv, env, marker, sourceSha256, receiptPin, observation };
  };
  const learning = receiptChild('learning-baseline', null);
  const learningInventory = [...learning.observation.results.keys()];
  keep(childRecord({ id: 'learning-baseline', kind: 'receipt', role: 'baseline', authoredSha256, sourceSha256: learning.sourceSha256,
    argv: learning.argv, env: learning.env, root, evidence, bounds, times: learning.times, raw: learning.raw, stdout: learning.stdout,
    stderr: learning.stderr, receipt: learning.receiptPin, pins, stage: null, observation: learning.observation }));
  for (const [name, control] of Object.entries(LEARNING_RECORD_CONTROLS)) {
    const id = `learning-${name}`;
    const child = receiptChild(id, name);
    const verdict = { suite: 'verify-learning-record', control: name, note: control.note,
      ...admitControl({ baseline: learning.observation, run: child.observation, control, inventory: learningInventory }) };
    verdicts.push({ ...verdict, child: id });
    keep(childRecord({ id, kind: 'receipt', role: 'control', control: name, table: 'LEARNING_RECORD_CONTROLS', edits: control.edits,
      marker: child.marker, authoredSha256, sourceSha256: child.sourceSha256, argv: child.argv, env: child.env, root, evidence, bounds,
      times: child.times, raw: child.raw, stdout: child.stdout, stderr: child.stderr, receipt: child.receiptPin, pins, stage: null,
      observation: child.observation, verdict }));
  }

  const pinsAfter = pinsNow();
  const pinsStable = JSON.stringify(pinsAfter) === JSON.stringify(pins);
  const expectedChildren = 2 + Object.keys(WORD_CONTROLS).length + Object.keys(LEARNING_RECORD_CONTROLS).length;
  const report = { format: 'd23-control-admission', version: 2, root, execPath: process.execPath, nodeVersion: process.version,
    phase: { startedAt: phaseStartedAt, endedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - phaseStart),
      children: children.length, expectedChildren, controls: verdicts.length, bounds, totalBound: null },
    pins: { before: pins, after: pinsAfter, stable: pinsStable }, stage: { dir: relative(evidence, stage), files: stagePins },
    inventory: INVENTORY, learningInventory, children, verdicts,
    pass: pinsStable && children.length === expectedChildren && verdicts.length === expectedChildren - 2 &&
      verdicts.every((row) => row.verdict === 'killed') };
  writeFileSync(join(evidence, 'controls-report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
