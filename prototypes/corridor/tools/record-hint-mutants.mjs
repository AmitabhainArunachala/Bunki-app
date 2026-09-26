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


// v3 receipt contract. Verifier declarations must match this data before setup can run.
// This is a record-hint-suite schema, not closure of the pending assessment retry matrix.
export const RECORD_HINT_AUTO_ROWS = Object.freeze(['max-one-outstanding-query', 'served-script-identity', 'no-page-errors', 'completed']);
// Required observed app documents, per role, for a completed case. Plain harness pages
// carry no app bytes. W1's declared early stop, W2's failed reload, and W5's Back branch
// are resolved explicitly by the adjudicator; receipt-supplied inventories are not authority.
export const RECORD_HINT_DOCUMENT_SCHEMA = Object.freeze({
  W1: { A: 1, B: 2 }, W2: { A: 21, B: 1 }, W3: { A: 1, B: 2, C: 2 },
  W5: { A: 2, B: 1 }, W6a: { A: 1, B: 2 }, W6b: { A: 1, B: 2 },
  W7a: { A: 1, B: 2 }, W7b: { A: 1, B: 1 }, W7c: { A: 1, B: 3 },
  W7d: { A: 11 }, W8: { A: 1, B: 1 }, W9: { A: 1, B: 1 },
  L1: { A: 1, B: 1 }, L2: { A: 1, B: 1 }, L3: { A: 1, B: 1 },
  L4: { A: 1, B: 1 }, L5: { A: 1, B: 1 }, L6: { A: 1, B: 1 },
  L7: { A: 1, G: 1, K: 1 }, L8: { A: 1, B: 1 },
  L9: { A: 1, B1: 1, B2: 1 }, L10: { A: 1, B: 1 },
});
export const RECORD_HINT_CASE_SCHEMA = Object.freeze({
  "W1": Object.freeze({"rows":["W1.owner-still-held","W1.owner-query-established","W1.lock-free-after-owner-close","W1.seed-and-owner-before-first-grade","W1.owner-grade-durable","W1.blocked-boot-lost","W1.no-offer-while-owner-lives","W1.observer-never-queued","W1.observer-held-identity","W1.zero-observer-acquisition-attempts","W1.offer-within-4s-of-close","W1.retry-new-document-and-ownership","W1.owner-revlog-exact","W1.writable-after-retry"],"optional":["W1.mutant-held-gate-established"],"browser":true}),
  "W2": Object.freeze({"rows":["W2.blocked-at-start","W2.owner-every-reload","W2.blocked-never-held-or-queued","W2.blocked-zero-observer-attempts","W2.blocked-kept-looking"],"optional":[],"browser":true}),
  "W3": Object.freeze({"rows":["W3.both-offered","W3.both-rebooted","W3.exactly-one-named-owner","W3.loser-blocked","W3.loser-hint-restarted","W3.history-equals-single-window","W3.winner-writable"],"optional":[],"browser":true}),
  "W4": Object.freeze({"rows":[],"optional":["W4.renderer-crash"],"browser":false}),
  "W5": Object.freeze({"rows":["W5.offer-after-owner-navigates-away","W5.back-outcome","W5.offer-follows-lock"],"optional":["W5.bfcache-restore-stays-departed","W5.fresh-document-reacquires"],"browser":true}),
  "W6a": Object.freeze({"rows":["W6a.seed-and-owner-before-first-grade","W6a.acknowledged-row-and-card-coherent","W6a.blocked-before-close","W6a.offer","W6a.retry-new-document-and-ownership","W6a.row-present-exactly-once","W6a.writable-after-retry"],"optional":[],"browser":true}),
  "W6b": Object.freeze({"rows":["W6b.seed-and-owner-before-first-grade","W6b.blocked-before-race","W6b.settled-store-read","W6b.absent-or-one-coherent-row","W6b.offer","W6b.retry-new-document-and-ownership","W6b.boot-preserved-settled-record"],"optional":[],"browser":true}),
  "W7a": Object.freeze({"rows":["W7a.offer","W7a.retry-new-document-and-ownership","W7a.note-draft-survives"],"optional":["W7a.chat-draft-survives"],"browser":true}),
  "W7b": Object.freeze({"rows":["W7b.offer","W7b.refusal-injected","W7b.no-reload","W7b.visible-alert","W7b.text-intact"],"optional":[],"browser":true}),
  "W7c": Object.freeze({"rows":["W7c.passage-opened","W7c.first-offer-genuine","W7c.holder-acquired","W7c.offer-still-shown-while-held","W7c.losing-boot-new-document","W7c.losing-boot-blocked","W7c.losing-boot-same-passage","W7c.losing-boot-no-offer-while-held","W7c.second-offer","W7c.second-retry-ownership","W7c.second-retry-same-passage","W7c.writable-after-second-retry"],"optional":[],"browser":true}),
  "W7d": Object.freeze({"rows":["W7d.valid-reader-route-restores-and-is-spent","W7d.malformed-json-dropped","W7d.wrong-version-dropped","W7d.expired-dropped","W7d.future-timestamp-dropped","W7d.non-finite-timestamp-dropped","W7d.over-long-id-dropped","W7d.bad-character-id-dropped","W7d.unknown-view-dropped","W7d.unknown-attempt-lands-in-room","W7d.restore-writes-no-record-state"],"optional":[],"browser":true}),
  "W8": Object.freeze({"rows":["W8.injection-fired","W8.no-offer","W8.no-hint-timer-or-channel","W8.manual-reload-remains"],"optional":[],"browser":true}),
  "W9": Object.freeze({"rows":["W9.hidden-no-queries","W9.visible-wakes-offer"],"optional":[],"browser":true}),
  "L1": Object.freeze({"rows":["L1.visible-free-result-publishes","L1.hide-retires-offer","L1.late-free-result-after-hide-not-published","L1.no-queries-while-hidden","L1.return-looks-afresh","L1.pagehide-retires-offer","L1.late-free-result-after-pagehide-not-published","L1.no-queries-after-pagehide"],"optional":[],"browser":true}),
  "L2": Object.freeze({"rows":["L2.old-free-look-and-new-holder-established","L2.old-rejection-established","L2.single-outstanding-across-generations","L2.old-free-result-not-published","L2.completion-rechecks-current-generation","L2.current-held-result-no-offer","L2.old-rejection-does-not-stop","L2.after-old-rejection-offer-returns"],"optional":[],"browser":true}),
  "L3": Object.freeze({"rows":["L3.crossing-event-observed","L3.offer-before-crossing","L3.stale-retires-offer","L3.no-queries-while-stale","L3.abort-resumes-looking","L3.pre-crossing-result-not-published","L3.abort-looks-afresh","L3.fresh-result-after-abort-publishes"],"optional":[],"browser":true}),
  "L4": Object.freeze({"rows":["L4.clock-and-timers-installed","L4.looking-before-deadline","L4.deadline-stops-looking","L4.focus-after-deadline-does-not-restart","L4.visibility-return-restarts"],"optional":[],"browser":true}),
  "L5": Object.freeze({"rows":["L5.timer-tracer-live","L5.burst-query-starts-bounded","L5.one-wake-timer","L5.max-one-outstanding"],"optional":[],"browser":true}),
  "L6": Object.freeze({"rows":["L6.injection-fired","L6.one-failed-query-then-none","L6.no-offer-manual-reload","L6.no-unhandled-rejection"],"optional":[],"browser":true}),
  "L7": Object.freeze({"rows":["L7.getter-throw-fired","L7.getter-throw-no-hint","L7.bind-throw-fired","L7.bind-throw-no-hint","L7.manual-reload-remains"],"optional":[],"browser":true}),
  "L8": Object.freeze({"rows":["L8.pending-only-control-established","L8.pending-only-no-offer","L8.transform-can-offer","L8.unrelated-rows-present","L8.unrelated-names-offer"],"optional":[],"browser":true}),
  "L9": Object.freeze({"rows":["L9.held-free-looks-established","L9.deadline-timers-fired","L9.free-offer","L9.deadline-hides-offer","L9.channel-stopped","L9.no-overlapping-query","L9.resolved-old-look-does-not-revive","L9.rejected-old-look-does-not-revive","L9.no-unhandled-rejection"],"optional":[],"browser":true}),
  "L10": Object.freeze({"rows":["L10.no-unexpected-errors","L10.sync-throw-fired","L10.no-unhandled-rejection","L10.hint-retired-manual-reload","L10.no-later-queries","L10.zero-record-requests-beyond-boot"],"optional":[],"browser":true}),
});
export const RECORD_HINT_MUTANT_EVIDENCE = Object.freeze({
  m0: Object.freeze({"requires":["W1.seed-and-owner-before-first-grade","W1.owner-grade-durable","W1.blocked-boot-lost","W1.owner-still-held","W1.lock-free-after-owner-close"],"witness":{"W1.offer-within-4s-of-close":"offer-deadline-missed"},"allowed":{"W1.owner-query-established":"failed","W1.completed":"stopped-at:W1.offer-within-4s-of-close","W1.retry-new-document-and-ownership":"unreached","W1.owner-revlog-exact":"unreached","W1.writable-after-retry":"unreached"}}),
  m1: Object.freeze({"requires":["W1.seed-and-owner-before-first-grade","W1.owner-grade-durable","W1.blocked-boot-lost","W1.owner-still-held","W1.owner-query-established"],"witness":{"W1.no-offer-while-owner-lives":"offer-while-native-owner-held"},"allowed":{}}),
  m2: Object.freeze({"requires":["W1.seed-and-owner-before-first-grade","W1.owner-grade-durable","W1.blocked-boot-lost","W1.owner-still-held","W1.mutant-held-gate-established","W2.blocked-at-start"],"witness":{"W1.observer-held-identity":"observer-native-held","W1.zero-observer-acquisition-attempts":"observer-record-request"},"allowed":{"W1.owner-query-established":"failed","W1.observer-never-queued":"failed","W1.lock-free-after-owner-close":"failed","W2.owner-every-reload":"failed","W2.blocked-never-held-or-queued":"failed","W2.blocked-zero-observer-attempts":"failed","W2.blocked-kept-looking":"failed"}}),
  m3: Object.freeze({"requires":["L8.pending-only-control-established"],"witness":{"L8.pending-only-no-offer":"offer-with-native-pending-row"},"allowed":{}}),
  m4: Object.freeze({"requires":["L8.pending-only-control-established","L8.transform-can-offer","L8.unrelated-rows-present"],"witness":{"L8.unrelated-names-offer":"unrelated-locks-suppressed-offer"},"allowed":{}}),
  m5: Object.freeze({"requires":["L4.clock-and-timers-installed","L4.looking-before-deadline"],"witness":{"L4.deadline-stops-looking":"deadline-still-active"},"allowed":{"L4.focus-after-deadline-does-not-restart":"failed"}}),
  m6: Object.freeze({"requires":["L2.old-free-look-and-new-holder-established","L2.single-outstanding-across-generations"],"witness":{"L2.old-free-result-not-published":"old-free-result-published"},"allowed":{"L2.completion-rechecks-current-generation":"failed"}}),
  m7: Object.freeze({"requires":["L6.injection-fired"],"witness":{"L6.one-failed-query-then-none":"look-after-current-query-rejection"},"allowed":{"L6.no-offer-manual-reload":"failed"}}),
  m8: Object.freeze({"requires":["L3.offer-before-crossing","L3.crossing-event-observed"],"witness":{"L3.stale-retires-offer":"offer-survived-crossing"},"allowed":{"L3.pre-crossing-result-not-published":"failed"}}),
  m9: Object.freeze({"requires":["L5.timer-tracer-live"],"witness":{"L5.burst-query-starts-bounded":"burst-look-bound-exceeded"},"allowed":{}}),
  m10: Object.freeze({"requires":["L2.old-free-look-and-new-holder-established","L2.single-outstanding-across-generations","L2.old-rejection-established"],"witness":{"L2.old-rejection-does-not-stop":"old-rejection-stopped-new-period"},"allowed":{"L2.completed":"stopped-at:L2.old-rejection-does-not-stop","L2.after-old-rejection-offer-returns":"unreached"}}),
  m11: Object.freeze({"requires":["W7c.passage-opened","W7c.first-offer-genuine","W7c.holder-acquired","W7c.offer-still-shown-while-held","W7c.losing-boot-new-document","W7c.losing-boot-blocked"],"witness":{"W7c.losing-boot-same-passage":"losing-retry-wrong-passage"},"allowed":{"W7c.second-retry-same-passage":"failed"}}),
  m12: Object.freeze({"requires":["L9.free-offer","L9.held-free-looks-established","L9.deadline-timers-fired"],"witness":{"L9.deadline-hides-offer":"offer-survived-deadline"},"allowed":{"L9.channel-stopped":"failed"}}),
  m13: Object.freeze({"requires":["L10.sync-throw-fired","L10.no-unexpected-errors"],"witness":{"L10.no-unhandled-rejection":"expected-sync-query-rejection"},"allowed":{"L10.no-page-errors":"expected-sync-errors-only","L10.hint-retired-manual-reload":"failed","L10.no-later-queries":"failed"}}),
});
export const RECORD_HINT_HARNESS_PATHS = Object.freeze([
  "prototypes/corridor/tools/record-hint-mutants.mjs",
  "prototypes/corridor/tools/make-corridor-mutant.mjs",
  "prototypes/corridor/tools/record-test-support.mjs",
  "prototypes/corridor/tools/browser-audio-silence.mjs",
  "scripts/resolve-corridor-site.mjs",
  "prototypes/bunki-desktop/lib/artifact.cjs",
  "prototypes/bunki-desktop/lib/static-host.cjs",
  "scripts/verify-release-gates.mjs",
  "scripts/build-corridor-site.mjs"
]);
export const RECORD_HINT_W0_ROWS = Object.freeze({
  common: ['W0.base-artifact-verified', 'W0.constants-match-served-source'],
  'release-artifact': ['W0.served-identity-is-base-manifest', 'W0.served-script-matches-manifest'],
  'test-mutation': ['W0.mutation-provenance-verified', 'W0.served-identity-is-declared-mutation', 'W0.served-script-is-mutant-bytes'],
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
