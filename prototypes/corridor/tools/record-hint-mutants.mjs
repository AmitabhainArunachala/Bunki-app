/**
 * Mutation controls for verify-record-hint.mjs. Each entry is ONE literal edit of the served
 * corridor.js (every `from` counted exactly once at 9f121437 and 0ec38015), the case groups a mutant run must
 * select, and the NAMED assertion rows that must fail for adjudicate-record-hint-mutants.mjs to
 * record behavioral_mutant_killed. A setup or identity rejection is never a kill.
 *
 *   m0   the hint never starts (the pre-B2a build's behaviour)          → W1 offer after close
 *   m1   the held/pending filter removed: always "free"                 → W1 no offer while owned
 *   m2   the look becomes a queued exclusive locks.request (the v4
 *        watcher), its callback held open by the probe's mutant gate   → W1 held identity + attempts
 *   m3   pending rows ignored                                           → L8 pending-only
 *   m4   any lock of any name counts                                    → L8 unrelated names
 *   m5   focus renews the ten-minute window                             → L4 deadline
 *   m6   a result from an earlier generation may publish                → L2 ABA resolve
 *   m7   a failed query keeps polling instead of stopping               → L6 one failed query
 *   m8   staleness does not retire the offer                            → L3 stale
 *   m9   no minimum spacing between looks                               → L5 burst
 *   m10  an older generation's rejection stops the current period       → L2 ABA reject
 *   m11  the retry writes no route                                      → W7c same passage
 *   m12  the deadline timer does not suspend                            → L9 deadline with a pending look
 *   m13  the query is invoked outside the promise (sync throw escapes)  → L10 unhandled rejection
 *
 * m2's callback awaits `globalThis.__recordHintMutantGate.enter()`, which the verifier's probe
 * provides in every app document and production never calls: the held interval is then as long as
 * the verifier needs to read the exact-name held list, instead of a microtask it might miss.
 *
 * Usage (never while the machine is below its disk floor; see make-corridor-mutant.mjs):
 *   node record-hint-mutants.mjs <base-site> <base-artifact-sha256> <out-root> [name ...]
 * Every requested mutant is validated and simulated before any copy is made. Each output line is
 * JSON with the environment for its verifier run:
 *   KAIRO_SITE_DIR=<base-site> KAIRO_ARTIFACT_SHA256=<base digest>
 *   KAIRO_TEST_MUTANT_DIR=<out>/<name>/site KAIRO_TEST_MUTANT_SHA256=<mutationSha256>
 *   KAIRO_RECORD_HINT_ONLY=<cases>  node verify-record-hint.mjs
 */
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeMutant, planMutation, validateBase } from './make-corridor-mutant.mjs';

const FILTER = 'const free = !named(snapshot.held) && !named(snapshot.pending);';
const FAILURE = 'if (generation === recordHint.generation && hintEligible()) stopRecordHint();';
const mutant = (from, to, cases, kills, note) => Object.freeze({ file: 'corridor.js', from, to, cases: Object.freeze(cases), kills: Object.freeze(kills), note });

export const RECORD_HINT_MUTANTS = Object.freeze({
  m0: mutant('if (!lock && !recordDeparted) startRecordHint();', 'if (!lock && !recordDeparted) void 0;',
    ['W1'], ['W1.offer-within-4s-of-close'], 'pre-fix negative control'),
  m1: mutant(FILTER, 'const free = true;', ['W1'], ['W1.no-offer-while-owner-lives'], 'the held/pending filter removed'),
  m2: mutant("query = typeof navigator.locks?.query === 'function' ? navigator.locks.query.bind(navigator.locks) : null;",
    "query = () => new Promise((done) => navigator.locks.request(RECORD_LOCK, { mode: 'exclusive' }, async () => { await globalThis.__recordHintMutantGate?.enter(); done({ held: [], pending: [] }); }));",
    ['W1', 'W2'], ['W1.observer-held-identity', 'W1.zero-observer-acquisition-attempts'], 'the rejected v4 watcher'),
  m3: mutant(FILTER, 'const free = !named(snapshot.held);', ['L8'], ['L8.pending-only-no-offer'], 'pending rows ignored'),
  m4: mutant('const named = (rows) => rows.some((row) => row?.name === RECORD_LOCK);', 'const named = (rows) => rows.length > 0;',
    ['L8'], ['L8.unrelated-names-offer'], 'the name filter dropped'),
  m5: mutant('if (recordHint.active && !recordHint.suspended) wakeRecordHint(0);',
    'if (recordHint.active && !recordHint.suspended) { recordHint.visibleSince = hintNow(); armRecordHintDeadline(); wakeRecordHint(0); }',
    ['L4'], ['L4.deadline-stops-looking'], 'focus renews the visible window'),
  m6: mutant('if (generation !== recordHint.generation || !hintEligible()) {', 'if (!hintEligible()) {',
    ['L2'], ['L2.old-free-result-not-published'], 'the generation fence on results removed'),
  m7: mutant(FAILURE, 'if (generation === recordHint.generation && hintEligible()) wakeRecordHint(RECORD_HINT_POLL_MS);',
    ['L6'], ['L6.one-failed-query-then-none'], 'a failed query keeps polling'),
  m8: mutant('if (protectedNow && !recordHint.suspended) suspendRecordHint();', 'if (false) suspendRecordHint();',
    ['L3'], ['L3.stale-retires-offer'], 'staleness does not retire the offer'),
  m9: mutant('const at = Math.max(hintNow() + delay, (recordHint.lastStart || -Infinity) + RECORD_HINT_MIN_SPACING_MS);',
    'const at = hintNow() + delay;', ['L5'], ['L5.burst-query-starts-bounded'], 'no minimum spacing'),
  m10: mutant(FAILURE, 'if (hintEligible()) stopRecordHint();', ['L2'], ['L2.old-rejection-does-not-stop'],
    'an older generation\'s rejection stops the current period'),
  m11: mutant('if (route) sessionStorage.setItem(RECORD_RETRY_ROUTE_KEY, JSON.stringify(route));',
    'if (false) sessionStorage.setItem(RECORD_RETRY_ROUTE_KEY, JSON.stringify(route));',
    ['W7c'], ['W7c.losing-boot-same-passage'], 'the retry writes no route'),
  m12: mutant('if (recordHint.active && !recordHint.suspended) suspendRecordHint();', 'if (false) suspendRecordHint();',
    ['L9'], ['L9.deadline-hides-offer'], 'the deadline timer does not suspend'),
  m13: mutant('const outstanding = Promise.resolve().then(() => recordHint.query());', 'const outstanding = recordHint.query();',
    ['L10'], ['L10.no-unhandled-rejection'], 'a synchronous query throw escapes'),
});

const SELF = fileURLToPath(import.meta.url);
const invokedDirectly = (() => {
  try { return !!process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(SELF); } catch { return false; }
})();
if (invokedDirectly) {
  const [baseSite, baseArtifactSha256, outRoot, ...requested] = process.argv.slice(2);
  if (!baseSite || !baseArtifactSha256 || !outRoot)
    throw new Error('Usage: node record-hint-mutants.mjs <base-site> <base-artifact-sha256> <out-root> [name ...]');
  const names = requested.length ? requested : Object.keys(RECORD_HINT_MUTANTS);
  for (const name of names) if (!Object.hasOwn(RECORD_HINT_MUTANTS, name)) throw new Error(`Unknown mutant ${name}`);
  const base = validateBase(resolve(baseSite), baseArtifactSha256);
  const edits = (name) => [{ file: RECORD_HINT_MUTANTS[name].file, from: RECORD_HINT_MUTANTS[name].from, to: RECORD_HINT_MUTANTS[name].to }];
  // all-or-nothing planning: every edit must match exactly once before the first copy is made
  for (const name of names) planMutation({ base, name, edits: edits(name) });
  for (const name of names) {
    const made = makeMutant({ base, outRoot: resolve(outRoot), name, edits: edits(name) });
    console.log(JSON.stringify({ ...made, env: {
      KAIRO_SITE_DIR: base.root, KAIRO_ARTIFACT_SHA256: base.manifest.artifactSha256,
      KAIRO_TEST_MUTANT_DIR: made.site, KAIRO_TEST_MUTANT_SHA256: made.mutationSha256,
      KAIRO_RECORD_HINT_ONLY: RECORD_HINT_MUTANTS[name].cases.join(','),
    }, kills: RECORD_HINT_MUTANTS[name].kills }));
  }
}
