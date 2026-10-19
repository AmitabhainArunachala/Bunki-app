/** VH-1 independent rosters reviewed against 384d4a70. These are frozen obligations,
 * never extracted from the running producer or inferred from a reported count.
 * Fresh attempt containment, producer/input digests and invocation are the outer runner's obligation.
 */
import { realpathSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
export const ASSESSMENT_CASES = Object.freeze({
  'assessment-bank': [
    'Preserved original N2 draft copies retain their source bytes',
    'N2 authored counts and genuine separate forms',
    'Full N2 follows its declared 2018 workbook allocation, including reading breadth',
    'Full-form numbered grammar gaps match the visible question position',
    'N2 integrated audio plays once for linked questions',
    'Written candidates are real native versions and reject tampering',
    'Null presentation permits only an empty media-free written delivery',
    'Narrow written publication preserves pending mocks and exact form bytes',
    'Shipped written section retains reviewed bytes and its strictly limited scope',
    'N1 authoring maps exactly, binds its manuscript and keeps doubts out of the form',
    'Written specs retain a distinct original-rights basis through mapping and publication',
    'N1 authoring policy refuses excluded, undeclared and relabelled tasks',
    'Unfilled N1 pin and unknown levels fail before any publication step',
    'Custom written pins reject omitted, public and aliased targets before any work',
    'N1-only and both-level publication and rebuild keep each section once',
    'Written publication refuses changed bytes, cross-track, source, rights and process',
    'Written review authority is exact to the revision, AI-labelled and media-free',
    'No audio placeholders can make a full form',
    'Dictionary mappings pin tested item versions only',
    'Importer refuses unsafe identities and public self-approval',
    'Importer preserves private immutable bytes and actual hash',
    'Importer rejects wrong content signatures and excessive download size',
    'Asset paths reject traversal and symlink escape',
    'Audio bytes and measured duration are verified before materialization',
    'Correct media structure still grants no editorial approval',
    'Listening deadlines include all audio and independently validate transition allowance',
    'Unscored examples precede their scored audio without adding answers',
    'A stale trusted review cannot publish a changed form',
    'A form-only approval cannot publish unreviewed delivery metadata',
    'Historical admitted revisions retain immutable paths for saved learning cards',
    'Machine-checked written tests verify from public files, stay labelled and never widen host review',
    'Machine-checked records reject self-review, disagreement, flags, one family and edited forms',
    'answer-balance: every machine-checked form keys each position evenly, and a skewed form fails',
    'Balancing moves options only: a skewed manuscript comes out balanced with every key text and pinned order kept',
    'Revised machine-checked forms keep every question and key text; the prior revision stays addressable',
    'Machine-checked tests sit the official written papers and times; practice sets declare none',
    'Machine-checked forms lay out as the official paper: 問題, continuous numbers, official wording, marks',
    'Results report the official 得点区分 with raw counts; published marks are facts, never a conversion',
    'A native rebuild keeps every machine-checked entry exactly',
    'Registered sources cite real official URLs and distinguish reference rights',
  ],
  'assessment-v2-controller': [
    'same library retains exact form, all questions and safe current question',
    'dictionary help is durable before an answer, never reveals a key or locks the response',
    'dictionary lookups stay tied to their questions beside explanations and unanswered items',
    'deadline checkpoint persists with blanks and explicit next-block activation',
    'ownership mismatch, stale revision and parallel active attempt are rejected',
    'stopping produces no inferred weaknesses and retains earlier attempts',
    'malformed, tampered, unsupported and accessor inputs fail without executing accessors',
    '511 finished attempts stay reused while the active attempt is written',
    '600 finished attempts stay reused while the active attempt is written',
  ],
  'assessment-learning': [
    'mistake and flagged uncertainty enroll; skip and not-reached remain pacing',
    'same followup retries never duplicate a card',
    'existing schedule, suspension and removal are preserved',
    'undo preserves reviewed cards and terminal evidence; later retry stays suppressed',
    'stopped tests generate no weakness or cards',
    'missing mapping and unreviewed content remain saved without false enrollment',
    'wrong unflagged answers survive reload and feed cross-app priorities with exact source provenance',
    'provisional wrong answers remain practice suggestions without being promoted to reviewed evidence',
    'tampered outcome and foreign scope cannot become Sensei evidence',
    'assessment-item context is v2 and cannot masquerade as v1',
    'reviewed one-blank questions become source clozes in the same patch without inventing a grade',
    'a repeated mistake keeps one canonical cloze, its first capture and reviewed schedule',
    'a repeated mistake cannot recreate an explicitly removed cloze',
    'untargeted reading and grammar mistakes become exact question cards while missing dictionary targets stay pending',
    'repeat question mistakes retain one source plan and never overwrite an existing review schedule',
    'suppression prevents question re-enrollment without deleting retained source history',
    'enrichment adds only missing question plans and preserves prior action bytes',
    'one enrollment rule through the evidence adapter, the wire adapter and the planner',
    'assisted answers enroll with the mark as provenance, never as a grade',
    'an assisted answer whose target already exists keeps that card and its schedule',
    'the record validator binds every evidence mark to its attempt',
    'E1: a pending-mapping retry keeps assisted evidence and prior actions, adding only the unresolved target',
    'E2: dropping the mark in finalization, or separately in enrichment, is refused with prior state intact',
    'PENDING-JOHN-Q1 (a regression boundary, not a ruling): a stopped practice with an assisted answer creates no followup work',
    'the sheet stays closed until the mark is durable; results partition honestly, history included',
    'C1: an aggregate assisted condition without item attribution withholds the independent count',
    'D1: a later lawful explanation keeps inherited unknown attribution; a fresh one stays complete',
  ],
  'assessment-question-practice': [
    'reviewed exact source produces a question card without lexical inference or grades',
    'unreviewed, denied-rights, and manually marked source cannot create cards',
    'front excludes answer key and rationale; repeated exposure is explicit',
    'repeat sittings deduplicate identity and preserve first capture',
    'question IDs distinguish same answer labels across distinct items',
    'content, refs, key and presentation tampering fail before use',
    'only later constrained response can create a grade; wrong and reveal force Again',
    'exact response/grade retries are idempotent and changed retries are refused',
    'I do not know reveals without fabricating a response and can only grade Again',
    'historical bytes survive source deletion while new response and grade stop',
    'record validation links each grade to one real scheduler row and preserves undo',
    'ordered and exact written responses keep their actual response contracts',
    'audio needs native full review and exact reviewed presentation, never transcript fallback',
    'actual media byte digest is required; supplied hash JSON is not a capability',
    'forged successful grades and unknown root fields fail historical validation',
  ],
  'assessment-question-source': [
    'real local terminal evidence without wire kind resolves an enrolled reviewed question',
    'local missing or ambiguous result views never bypass source visibility',
    'local current result must still name the exact submitted form and terminal revision',
    'local enrollment, suspension, eligible outcome and current form trust are required',
    'received exact bound applied evidence resolves with body-free wire item refs',
    'received stale projection, hidden source, conflict or unbound followup cannot issue a grade',
    'received changed heads and source refs remain blocked even with a current projection digest',
    'received wrong or flagged evidence is eligible; skips and unflagged correct are not',
    'local mark and received wire flag drive the fixed truth table; truthy stand-ins do not',
    'remote undo preserves a reviewed retained-history card and explicit removal remains absent',
  ],
  'assessment-question-view': [
    'selected-and-reveal',
    'give-up-is-not-an-answer',
    'real-audio-example-and-replay',
    'first-listen-is-genuine-recall',
    'changed-media-refused-and-retried',
    'pending-load-disposal-does-not-revive',
    'actual-play-suspend-remount-and-stale-promise',
    'no-browser-errors',
    'offline-before-source-creation',
    'offline-after-preparation',
    'pagehide-handler-stops-real-audio',
    'visibilitychange-handler-stops-real-audio',
  ],
  'assessment-written-section': [
    'machine-checked-form-sits-as-the-official-paper',
    'machine-checked-heading-is-one-tab-stop',
    'public-catalog-and-dojo-practice-labels',
    'study-word-lookup-persists-and-unbookmarked-error-feeds-practice',
    'study-word-menu-records-help-only-on-reveal',
    'prose-roving-accessibility',
    'prose-timed-plain-text',
    'timed-written-completion-to-learn-review-and-sensei',
    'untimed-written-offline-reload-answer-and-stop',
    'untimed-mixed-written-assisted-why-enrolls-exactly',
    'untimed-assisted-why-keeps-an-existing-card',
  ],
  'assessment-v2-finalize': [
    'atomic-result-followup-outbox-preserves-study-history',
    'assisted-finalization-carries-the-mark-through-the-validator',
    'assisted-lost-ack-retry-confirms-once-and-keeps-the-mark',
    'assisted-finalization-keeps-existing-removed-and-suspended-targets',
    'assessment-input-producer-runs-after-queued-write-and-retains-exact-retry',
    'assessment-async-input-producer-is-rejected-before-write',
    'native-quota-abort-rolls-back-entire-assessment',
    'lost-ack-retry-confirms-once-without-reenrollment',
    'stale-profile-and-owner-loss-prevent-writes',
    'independent-app-gate-rejects-host-omitted-operations',
    'undo-emits-suppression-and-preserves-existing-study',
    'remove-retry-does-not-delete-a-later-manual-retake',
    'suppression-quota-abort-keeps-card-and-outbox-unchanged',
    'large-undo-completes-in-bounded-atomic-batches',
    'received-assisted-correct-enrolls-once-through-the-wire-flag',
    'received-stripped-flag-makes-the-assisted-action-ineligible',
    'received-question-reconstructs-exact-source-without-a-local-sitting-or-fake-grade',
    'received-question-suppression-and-source-deletion-retain-history-without-resurrection',
    'received-question-cannot-substitute-a-different-target-identity',
    'received-pending-target-keeps-verified-sensei-evidence-and-scheduling',
    'received-result-without-followup-stays-explicitly-pending',
    'received-matched-projection-is-real-idempotent-study-integration',
    'received-missing-form-is-pending-and-later-cache-load-retries',
    'received-claims-cannot-override-trusted-form-answer-key',
    'received-independent-app-guard-rejects-incomplete-host-projection',
    'received-reconciliation-quota-failure-keeps-journal-retryable',
    'received-lost-ack-retry-does-not-resurrect-a-later-removal',
    'received-suppression-removes-automatic-card-but-preserves-manual-retake',
    'received-cloze-is-rederived-from-owned-form-in-the-same-projection',
    'received-tombstone-retracts-unreviewed-projection-and-survives-redelivery',
    'received-conflicting-followup-does-not-authorize-cards',
    'enrichment-assisted-mark-survives-mapping-retry-through-the-validator',
    'enrichment-historical-question-adds-one-card-without-regrading-or-changing-evidence',
    'enrichment-question-removal-before-mapping-is-authoritative',
    'enrichment-adds-only-new-mappings-and-one-explicit-followup-revision',
    'enrichment-unavailable-mapping-noop-can-later-resolve-without-fake-grade',
    'enrichment-pending-removal-suppresses-later-card',
    'enrichment-quota-abort-keeps-pending-and-exact-retry-resolves',
    'enrichment-lost-ack-retry-preserves-later-removal-and-current-noop',
    'enrichment-deleted-source-does-not-produce-cards-or-followup-update',
    'enrichment-independent-app-gate-rejects-missing-followup-operation',
    'enrichment-bounded-batch-resumes-without-new-results-or-card-duplicates',
    'received-undo-preserves-srs-but-explicit-removal-wins',
    'received-undo-preserves-revlog-but-explicit-removal-wins',
    'received-another-verified-result-retains-canonical-cloze-when-first-is-deleted',
    'received-another-verified-result-retains-card-when-first-is-deleted',
  ],
  'assessment-room': [
    'chromium: actual verified audio source prepared online survives network loss before native play and three recordings end exactly once',
    'chromium/320: responsive catalog/example/listening/results, origin-unavailable page reload, offline audio, hidden example question, fixed order, three native audio-ended events on one element, deadline counts and exact cached bytes',
    'chromium/1280: responsive catalog/example/listening/results, origin-unavailable page reload, offline audio, hidden example question, fixed order, three native audio-ended events on one element, deadline counts and exact cached bytes',
    'chromium: quota, altered media and unadmitted pack rejected before starting',
    'chromium: repeat admission rechecks durable bytes, evicts corruption, rejects quota, and restores exact missing assets online before any attempt',
    'chromium: late media load cannot play or write after owner loss',
    'chromium: background-media cancels pending playback and explicit resume completes each recording once',
    'chromium: leave-media cancels pending playback and explicit resume completes each recording once',
    'chromium: background-ack cancels pending playback and explicit resume completes each recording once',
    'chromium: owner loss stops native playback and prevents advancement or late writes',
    'chromium: controlled autoplay refusal records interruption, keeps order and resumes actual native playback',
    'chromium: deadline during audio-start transaction closes the test without calling native play',
    'chromium: answer/flag/visit and same-session return resume dwell timing without resetting wall deadline or removing interruption evidence',
    'webkit: actual verified audio source prepared online survives network loss before native play and three recordings end exactly once',
    'webkit/320: responsive catalog/example/listening/results, origin-unavailable page reload, offline audio, hidden example question, fixed order, three native audio-ended events on one element, deadline counts and exact cached bytes',
    'webkit/1280: responsive catalog/example/listening/results, origin-unavailable page reload, offline audio, hidden example question, fixed order, three native audio-ended events on one element, deadline counts and exact cached bytes',
    'webkit: quota, altered media and unadmitted pack rejected before starting',
    'webkit: repeat admission rechecks durable bytes, evicts corruption, rejects quota, and restores exact missing assets online before any attempt',
    'webkit: late media load cannot play or write after owner loss',
    'webkit: background-media cancels pending playback and explicit resume completes each recording once',
    'webkit: leave-media cancels pending playback and explicit resume completes each recording once',
    'webkit: background-ack cancels pending playback and explicit resume completes each recording once',
    'webkit: owner loss stops native playback and prevents advancement or late writes',
    'webkit: controlled autoplay refusal records interruption, keeps order and resumes actual native playback',
    'webkit: deadline during audio-start transaction closes the test without calling native play',
    'webkit: answer/flag/visit and same-session return resume dwell timing without resetting wall deadline or removing interruption evidence',
  ],
  'assessment-app': [
    'question-card-response-grade-skip-undo-reload',
    'question-card-give-up-keeps-null-response-and-forces-again',
    'question-card-offline-exact-source-and-review',
    'source-return-opens-the-exact-question',
    'report-entry-in-unavailable-question',
    'older-card-removal-after-test',
    'received-cloze-reloads-and-keeps-offline-source',
    'received-paper-is-recorded-as-prior-exposure',
    'source-device-deletion-hides-history-and-sensei-but-retains-bytes',
    'dictionary-ready-enrichment-and-submit-are-serialized',
    'retry-route-restores-a-result-with-no-question-open',
    'retry-route-kept-target-yields-to-an-unsupported-view',
    'retry-route-kept-target-yields-to-a-deliberate-return',
    'question-card-deleted-result-blocks-fresh-grade',
    'local-canonical-card-keeps-assessed-context',
    'received-canonical-card-keeps-assessed-context',
    'local-assisted-card-backs-name-where-help-was-recorded',
    'dictionary-assisted-card-backs-name-where-help-was-recorded',
    'received-assisted-card-backs-name-where-help-was-recorded',
    'AR1-retry-exact-item',
    'AR2-retry-retained-result',
  ],
  'assessment-standalone': ['public', 'synthetic'],
  'assessment-private-import': [
    'tampered-pack-refused',
    'imported',
    'stored-in-indexeddb',
    'question-1-rendered',
    'printed-page-shown',
    'answered-written',
    'listening-playing',
    'listening-continuous-once',
    'results-by-official-section',
    'backup-export',
    'no-network-for-private-assets',
    'removed',
  ],
  'assessment-controller': [
    'strict-library-rehydration-owns-data-and-keeps-local-scope',
    'source-form-is-pinned-on-start-and-legacy-display-stays-short-unreviewed',
    'two-completed-attempts-on-one-form-retain-earlier-answers-after-done-and-reload',
    'answer-changes-retain-every-response-and-genuine-prompt-exposure',
    'pure-proposals-deterministic-replay-and-stale-cas-do-not-mutate-the-caller',
    'start-replay-is-idempotent-without-reopening-a-finished-attempt',
    'new-source-revision-does-not-rebind-earlier-attempts',
    'cross-profile-and-inactive-attempt-commands-fail-without-changing-history',
    'reload-interruption-keeps-answers-cursor-and-known-time-without-inventing-downtime',
    'monotonic-time-deltas-charge-the-current-block-and-wall-clock-rollback-is-only-observed',
    'partial-abandonment-is-preserved-and-neither-partial-submit-nor-unfinished-dismiss-is-accepted',
    'assistance-and-interruptions-stay-in-the-sitting-and-never-admit-measured-evidence',
    'historical-bundles-retain-every-original-field-and-never-bind-old-position-indices',
    'tampered-content-history-scope-pointers-and-duplicate-identities-fail-closed',
    'malformed-command-and-accessor-inputs-reject-without-executing-getters',
    '500-full-short-practice-attempts-retain-all-answers-and-one-form-on-rehydration',
    'capacity-and-untrusted-shallow-freeze-cannot-bypass-validation',
  ],
  'annotation-lookup': [
    'control:list-form-reenabled-before-reload',
    'control:list-form-reenabled-before-reload-after-capture',
    'control:annotation-by-kana-shape',
    'list-new-existing-and-retained-card',
    'failed-list-write-is-honest-and-recoverable',
    'failed-capture-inside-a-list-is-honest-and-recoverable',
    'exact-entry-mini-and-conflict-protection',
    'assistance-commit-precedes-hints',
    'skip-search-stroke-door',
    'shelf-filters-match-and-survive-navigation',
    'enhancement-preserves-prose-and-protected-rooms',
    'plain-prose-parentheticals-are-annotations-only-when-they-read',
  ],
  'reading-candidates': [
    'twenty-generated-readings-create-zero-review-debt',
    'all-twenty-passages-survive-reload-without-promotion',
    'one-explicit-suggestion-promotion-creates-only-that-review',
    'explicit-tutor-card-request-remains-available',
  ],
  'personal-reading': [
    'preferences-and-separate-kagami-bands-reach-provider-without-private-record',
    'full-version-brief-and-reported-model-preserved-with-pending-editorial-state',
    'article-and-editable-preferences-survive-real-reload',
    'cancelled-reply-cannot-replace-new-job-or-create-review-debt',
    'phone-reader-and-preferences-fit-viewport',
    'saved-reading-remains-accessible-without-provider-credentials',
    'dictionary-walk-returns-to-the-same-place-in-personal-reading',
    'tampered-projection-is-quarantined-with-original-bytes-preserved',
    'rejected-truncated-response-preserves-accepted-article-and-learning',
    'rejected-authority-response-preserves-accepted-article-and-learning',
    'rejected-malformed-response-preserves-accepted-article-and-learning',
    'rejected-oversized-response-preserves-accepted-article-and-learning',
  ],
  'source-shelf': [
    'browser-has-publisher-doors-and-honest-native-headline-availability',
    'source-choice-persists-on-reload-with-unknown-record-fields-intact',
    'native-id-only-refresh-reaches-actual-shelf-with-safe-titles-and-publication-dates',
    'search-filters-headlines-without-losing-input-focus',
    'saved-link-retains-no-publisher-headline-or-body-and-creates-no-learning-debt',
    'invalid-native-reply-preserves-earlier-headlines-and-saved-record',
    'muting-removes-source-headlines-without-deleting-saved-links',
    'phone-source-controls-fit-viewport-and-keep-touch-targets',
    'restart-retains-bookmarks-and-truthfully-shows-cadence-without-cached-headlines',
    'malformed-restored-source-record-is-protected-without-silent-field-stripping',
  ],
  mock: [
    'the catalog is schema 1 and names its law',
    'five papers per JLPT level ship, 25 in all',
    'each short set has its expected schema, four distinct options, an indexed answer and attribution fields',
    'no paper tests vocabulary above its own level (review round 7: the graded list numbers N5 as 5, so a raw comparison reads backwards)',
    'every item subject resolves in the pinned dictionary — the fail-closed law holds in the data',
    'most items carry a subject, so a sitting leaves real evidence',
    'no shipped string predicts a pass',
    'earlier exercises retain all 25 papers, and no provenance chip or line stands on the page or a row',
    'the run persists the learner’s place with its complete pinned question version',
    'mid-paper, no answer is marked right or wrong — the traditional posture',
    'the door re-enters the open paper, not the list',
    'a reload resumes at the same pinned question with unknown process downtime',
    'unreviewed practice keeps full response facts without inventing measured obslog grades',
    'submission retains every selected answer for this exact question version',
    'sitting a paper moves NO schedule: no deck row, no FSRS card, no review row',
    'the result screen refuses to predict a pass — and says so in as many words',
    'the missed words are offered, never taken',
    'one press mints the missed words as ordinary started cards — and only then',
    'even adoption schedules nothing itself — FSRS stays the only scheduler',
    'full submitted answers cross a reload whole without measured legacy grades',
    'Done clears the active pointer and keeps complete history accessible',
    'opening completed history renders every pinned question for review',
    'an unreachable catalog settles after one attempt instead of spinning',
    'もう一度 is a deliberate second attempt — and only one',
    'no console or page errors across the 模試 walk',
  ],
  kagami: [
    'every level cell matches the rows the ledger actually holds',
    'the band reads the edge it cleared, and claims nothing above it',
    'clearing N5 and missing N4 is not a contradiction — it is what learning looks like',
    'no averaged score, no percentage, no claim about what level the learner IS',
    'the page says outright that a pass is not knowable here',
    'the same store yields a byte-identical model, twice',
    'and the same model again after a reload — nothing carried in memory',
    'walking the mirror writes nothing — native record and revision stay identical',
    'the model is nowhere in the envelope: it is derived, and stays derived',
    'the mirror moves no schedule: no FSRS state, no review row, no new card',
    'the confusion pair the ledger recorded is the pair the mirror shows, normalized so a↔b and b↔a are one edge',
    'the frontier is the unsettled words, hardest first — the N4 five, not the N5 ones',
    'a band resting only on mined rows says so, in as many words',
    'and it is observed evidence only — measured stays at zero',
    'but clearing N4 while N5 fails IS flagged — the sample tells two stories and the page says so',
    'an undone drill withdraws its grade and counts as nothing itself',
    'a word whose every drill was undone leaves no judged evidence at all',
    'a reviewed grammar card lands in sentence form and never inflates vocabulary',
    'a grammar point carries its own level, so sentence form can actually clear one',
    'a grammar point on the frontier reads as its pattern, never as its ascii id',
    'and its door still opens the grammar point the key names',
    'a ledger of confusions and no grades still shows them, and says the grades are missing',
    'four mined successes clear nothing — observed evidence is never sufficient alone',
    'and the sentence says the MEASURED evidence is short, not that nothing was answered',
    'a card recalled the hard way is a recall — Again alone is the miss',
    'a level answered 25 times and cleared by none reads as failing, never as unsampled',
    'unverified legacy practice preserves question modalities and raw answers without measuring ability',
    'a judged answer on an untagged word is counted, shown as 級外, and clears no level',
    'an empty ledger reflects nothing rather than guessing a level',
    'no console or page errors across the 鏡 walk',
    'chromium: same-count rest swap refreshes the warm mirror and preserves native records',
    'webkit: same-count rest swap refreshes the warm mirror and preserves native records',
  ],
  'srs-today': [
    'standard · "today only: raise the limit" opens exactly the held-back reviews',
    "retention reaches FSRS · the same card's Good interval is longer at 85% than at 90%",
    'cap-50 · the button reads the capped day and equals the session',
    'cap-50 · the home pill reads the same 50',
    'pause every 10 · the break comes after 10 grades, hides nothing, and 続ける goes on',
    'Gentle → Standard rebuilds the live scheduler at 90% and 1m 10m, one row per change',
    'a hand-set number relabels the preset "Custom (from Standard)"',
    'no console or page errors',
    "gentle · the button reads §4's day for the seed (100)",
    'gentle · button == new + learn + review, the All-cards row and todayQueue',
    'gentle · the tray names the held-back reviews',
    'gentle · __KAIRO_SRS__.params() reports 85% retention and a step of 10m',
    'gentle · a changed schedule policy is one params row; an unchanged one writes none',
    "gentle · the session freezes exactly the button's queue and counts the held-back",
    "gentle · the session accepts exactly the button's number of grades, then says done",
    "gentle · the done screen names the cards the day's limit held back",
    "standard · the button reads §4's day for the seed (200)",
    'standard · button == new + learn + review, the All-cards row and todayQueue',
    'standard · the tray names the held-back reviews',
    'standard · __KAIRO_SRS__.params() reports 90% retention and steps 1m 10m',
    'standard · a changed schedule policy is one params row; an unchanged one writes none',
    "standard · the session freezes exactly the button's queue and counts the held-back",
    "standard · the session accepts exactly the button's number of grades, then says done",
    "standard · the done screen names the cards the day's limit held back",
    "hardcore · the button reads §4's day for the seed (330)",
    'hardcore · button == new + learn + review, the All-cards row and todayQueue',
    'hardcore · the tray names the held-back reviews',
    'hardcore · __KAIRO_SRS__.params() reports 90% retention and steps 1m 10m',
    'hardcore · a changed schedule policy is one params row; an unchanged one writes none',
    "hardcore · the session freezes exactly the button's queue and counts the held-back",
    "hardcore · the session accepts exactly the button's number of grades, then says done",
    "hardcore · the done screen names the cards the day's limit held back",
  ],
});
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const nonempty = (value) => typeof value === 'string' && value.length > 0;
const exact = (want, got) =>
  Array.isArray(got) &&
  want.length > 0 &&
  want.length === got.length &&
  new Set(got).size === got.length &&
  want.every((x) => got.includes(x));
const engines = (value) => (value === 'all' ? ['chromium', 'webkit'] : [value || 'chromium']);
const hashAt = (context, path) =>
  Array.isArray(context.runtimeFiles)
    ? context.runtimeFiles.find((row) => row.path === path)?.sha256
    : context.runtimeFiles?.[path];
const inputAt = (context, path) => context.sourceFiles?.[path];
const realPath = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
};
const driverPath = (url) => {
  try {
    return realpathSync(fileURLToPath(url));
  } catch {
    return null;
  }
};
const questionSources = [
  'assessment-question-source.mjs',
  'assessment-question-practice.mjs',
  'assessment-v2-controller.mjs',
  'assessment-learning.mjs',
  'assessment-cloze.mjs',
  'sentence-practice.mjs',
  'teacher-context.mjs',
  'teacher-drafts.mjs',
  'sentence-drafts.mjs',
];
export const ASSESSMENT_SOURCE_INPUTS = Object.freeze({
  'assessment-question-practice': Object.freeze([
    'prototypes/corridor/assessment-question-practice.mjs',
  ]),
  'assessment-question-source': Object.freeze(
    questionSources.map((name) => `prototypes/corridor/${name}`),
  ),
});
function runtime(require, context, actual, path) {
  require(digest(actual), `${path}: missing digest`);
  const expected = hashAt(context, path);
  require(digest(expected) && actual === expected, `${path}: not bound to selected artifact`);
}
function artifact(require, report, context, actual = report.artifactSha256) {
  require(digest(actual), 'Missing artifact digest');
  if (context.artifactSha256) require(actual === context.artifactSha256, 'Wrong artifact');
}
function verifier(require, report, context, actual = report.verifierSha256) {
  require(digest(actual), 'Missing verifier digest');
  if (context.verifierSha256) require(actual === context.verifierSha256, 'Wrong verifier');
}
function make(
  producer,
  {
    paths = ['receipt.json'],
    field = 'results',
    status = 'pass',
    actualEngine = (row) => row.engine,
    expectedEngine = engines,
    rowName = (row) => row.name,
    pure = false,
    literal = false,
    extra = () => {},
  } = {},
) {
  const expectedCases = (engine) =>
    literal
      ? ASSESSMENT_CASES[producer]
      : pure
        ? ASSESSMENT_CASES[producer].map((name) => `node/${name}`)
        : expectedEngine(engine).flatMap((e) =>
            ASSESSMENT_CASES[producer].map((name) => `${e}/${name}`),
          );
  return {
    producer: `prototypes/corridor/tools/verify-${producer}.mjs`,
    paths,
    expectedCases,
    identityMode: pure ? 'fresh-source-invocation' : 'producer-specific-artifact-or-runtime',
    validate(report, context = {}) {
      const errors = [],
        require = (ok, message) => {
          if (!ok) errors.push(message);
        };
      const wanted = expectedCases(context.engine);
      if (!report || typeof report !== 'object' || Array.isArray(report))
        return {
          passed: false,
          errors: ['Missing report object'],
          expectedCases: wanted,
          observedCases: [],
        };
      const rows = Array.isArray(report[field]) ? report[field] : [];
      const observed = rows.map((row) =>
        literal
          ? row
          : pure
            ? `node/${typeof row === 'string' ? row : row?.name}`
            : `${actualEngine(row, report)}/${rowName(row)}`,
      );
      require(exact(wanted, observed), 'Missing, duplicate, extra or filtered case/engine roster');
      if (!literal)
        for (const row of rows) {
          if (typeof row === 'string') {
            require(status === 'string', 'Unexpected string result');
            continue;
          }
          require(row &&
            typeof row === 'object' &&
            row[status] === true &&
            !row.error &&
            !row.failure, 'Failed or incomplete result');
        }
      for (const key of ['error', 'integrityError', 'counterfactualSource'])
        if (key in report) require(!report[key], `${key} prevents acceptance`);
      for (const key of ['failures', 'failed'])
        if (key in report)
          require(report[key] === 0 ||
            (Array.isArray(report[key]) && !report[key].length), `${key} is nonzero/malformed`);
      for (const key of ['pageErrors', 'errors'])
        if (key in report)
          require(Array.isArray(report[key]) &&
            !report[key].length, `${key} is nonempty/malformed`);
      for (const key of ['externalRequestsSent', 'externalNetworkRequestsSent', 'externalRequests'])
        if (key in report) require(report[key] === 0, `${key} must be zero`);
      for (const key of ['pass', 'passed'])
        if (typeof report[key] === 'boolean') require(report[key] === true, `${key} is false`);
      if (typeof report.passed === 'number')
        require(report.passed === rows.length, 'Passed count contradicts required roster');
      if ('status' in report) require(report.status === 'passed', 'Status is not passed');
      if (context.args)
        require(!context.args.some((arg) =>
          /^--(?:case(?:=|$)|received-only$|enrichment-only$|question-only$|offline-transition-only$)/u.test(
            arg,
          ),
        ), 'Narrowing CLI cannot accept');
      extra(report, context, require, rows);
      return {
        passed: errors.length === 0,
        errors,
        expectedCases: wanted,
        observedCases: observed,
      };
    },
  };
}
const defs = {};
defs['assessment-bank'] = make('assessment-bank', {
  paths: ['bank-*/result.json'],
  field: 'checks',
  status: 'passed',
  pure: true,
  extra(r, c, q) {
    q(
      r.schema === 'kairo-assessment-bank-verification/1' && r.passed === true,
      'Bank schema/verdict missing',
    );
  },
});
defs['assessment-v2-controller'] = make('assessment-v2-controller', {
  paths: ['runtime-*/result.json'],
  field: 'checks',
  status: 'passes',
  pure: true,
  extra(r, c, q) {
    q(
      r.format === 'kairo-assessment-v2-controller-verification' && r.failed === 0,
      'Wrong controller format/failure count',
    );
    q(
      digest(r.controllerSha256) &&
        digest(r.coreSha256) &&
        Array.isArray(r.inputs) &&
        r.inputs.length > 0,
      'Compiled controller/core/input identities missing',
    );
  },
});
defs['assessment-learning'] = make('assessment-learning', {
  paths: ['check-*/receipt.json'],
  field: 'checks',
  status: 'string',
  pure: true,
  extra(r, c, q, rows) {
    q(r.status === 'passed' && r.count === rows.length, 'Learning status/count invalid');
  },
});
defs['assessment-question-practice'] = make('assessment-question-practice', {
  paths: ['check-*/receipt.json'],
  pure: true,
  extra(r, c, q) {
    q(
      r.format === 'kairo-assessment-question-practice-verification',
      'Wrong question-practice format',
    );
    verifier(q, r, c);
    q(digest(r.sourceSha256), 'Question-practice source missing');
    const want = inputAt(c, 'prototypes/corridor/assessment-question-practice.mjs');
    q(digest(want) && want === r.sourceSha256, 'Question-practice source changed or unpinned');
  },
});
defs['assessment-question-source'] = make('assessment-question-source', {
  paths: ['check-*/receipt.json'],
  pure: true,
  extra(r, c, q) {
    q(r.format === 'kairo-assessment-question-source-verification', 'Wrong question-source format');
    q(
      exact(
        questionSources,
        (r.sources || []).map((row) => row.path?.split('/').at(-1)),
      ),
      'Question-source module roster incomplete',
    );
    for (const row of r.sources || []) {
      const file = `prototypes/corridor/${row.path?.split('/').at(-1)}`;
      const want = inputAt(c, file);
      q(
        digest(row.sha256) && nonempty(row.path) && row.path.endsWith(`/${file}`),
        'Question-source hash/path missing',
      );
      q(digest(want) && want === row.sha256, 'Question-source bytes changed or unpinned');
    }
  },
});
const questionView = make('assessment-question-view', {
  paths: ['question-view-*/receipt.json'],
  field: 'checks',
  actualEngine: (row) => `${row?.browser}/${row?.width}`,
  expectedEngine: () => ['chromium/320', 'chromium/1280', 'webkit/320', 'webkit/1280'],
  extra(r, c, q, rows) {
    q(
      r.format === 'kairo-question-view-browser-observation/1' &&
        r.caseSelection === 'all' &&
        r.runtimeMode === 'immutable-artifact',
      'Question-view filtered/staged scope',
    );
    artifact(q, r, c);
    verifier(q, r, c);
    q(
      r.total === rows.length && r.mediaEventsAreNative === true,
      'Question-view completion/native media evidence missing',
    );
    q(
      exact(
        ['assessment-question-practice.mjs', 'assessment-question-view.mjs', 'corridor.css'],
        (r.sourcePins || []).map((row) => row.path),
      ),
      'Question-view source pin roster wrong',
    );
    for (const row of r.sourcePins || []) {
      q(row.provenance === 'selected-immutable-artifact', 'Staged source pin');
      runtime(q, c, row.sha256, row.path);
    }
  },
});
defs['assessment-question-view'] = questionView;
defs['assessment-written-section'] = make('assessment-written-section', {
  paths: ['written-section-results.json'],
  status: 'passed',
  extra(r, c, q, rows) {
    q(
      r.format === 'kairo-public-written-section-walk' && r.passed === true,
      'Wrong written-section format/status',
    );
    artifact(q, r, c);
    verifier(q, r, c);
    q(
      r.formSha256 === '56d6ea3b6024cd04447a72c36640ee99c672808d93bcd22f7ccdb4c1e2c198a2',
      'Written fixture changed; independent roster re-review required',
    );
    q(
      exact(
        ['N2'],
        (r.sections || []).map((row) => row.level),
      ),
      'Written section scope changed',
    );
    const planned = r.caseInventory?.planned;
    q(
      exact(
        rows.map((row) => `${row.engine}/${row.name}`),
        (planned || []).map((row) => `${row.engine}/${row.name}`),
      ) && planned.every((row) => row.selected === true),
      'Written filter or incomplete planned inventory',
    );
    for (const key of ['assistedWhy', 'assistedWhyExistingCard']) {
      q(
        r[key]?.claimable === true &&
          exact(
            engines(c.engine),
            r[key]?.runs?.map((row) => row.engine),
          ) &&
          r[key].runs.every(
            (row) => row.passed === true && row.acceptedTerminal === true && !row.failedStage,
          ),
        'Assisted terminal evidence missing',
      );
    }
    q(
      Array.isArray(r.assistedWhy?.skipped) && !r.assistedWhy.skipped.length,
      'Pinned assisted case was skipped',
    );
  },
});
defs['assessment-v2-finalize'] = make('assessment-v2-finalize', {
  paths: ['run-*/receipt.json'],
  status: 'passes',
  extra(r, c, q) {
    q(
      r.format === 'kairo-assessment-v2-finalization-verification' &&
        Array.isArray(r.failures) &&
        !r.failures.length,
      'Finalization format/failures invalid',
    );
    q(
      Array.isArray(r.assets) &&
        r.assets.length > 0 &&
        r.assets.every((row) => nonempty(row.path) && digest(row.sha256)),
      'Finalization compiled asset identities missing',
    );
  },
});
defs['assessment-room'] = make('assessment-room', {
  paths: ['run-*/receipt.json'],
  field: 'checks',
  literal: true,
  extra(r, c, q) {
    q(
      r.status === 'passed' && r.fixture === 'synthetic-not-editorial-approval',
      'Room completion/fixture missing',
    );
    artifact(q, r, c);
  },
});
defs['assessment-app'] = make('assessment-app', {
  paths: ['assessment-app.json'],
  status: 'passes',
  extra(r, c, q) {
    q(
      r.format === 'kairo-assessment-instrumented-app-verification' &&
        Array.isArray(r.failures) &&
        !r.failures.length,
      'App format/failures invalid',
    );
    artifact(q, r, c);
    q(
      r.instrumentation?.gradeDiagnostics === false && !r.assessmentRetry?.caseFilter,
      'App diagnostic/filter scope cannot accept',
    );
    verifier(q, r, c, r.assessmentRetry?.harnessSha256);
    const wanted = engines(c.engine).flatMap((e) =>
      ['AR1-retry-exact-item', 'AR2-retry-retained-result'].map((name) => `${e}/${name}`),
    );
    q(
      exact(
        wanted,
        (r.assessmentRetry?.evidence || []).map((row) => `${row.engine}/${row.name}`),
      ) &&
        (r.assessmentRetry?.evidence || []).every((row) => row.status === 'passed' && !row.error),
      'Native assessment retry evidence incomplete',
    );
  },
});
defs['assessment-standalone'] = make('assessment-standalone', {
  paths: ['assessment-standalone.json'],
  status: 'passes',
  rowName: (row) => row?.variant,
  extra(r, c, q, rows) {
    q(
      r.format === 'kairo-assessment-standalone-verification' &&
        Array.isArray(r.failures) &&
        !r.failures.length,
      'Standalone format/failures invalid',
    );
    artifact(q, r, c);
    q(r.clickDiagnostics === false, 'Standalone diagnostic instrumentation');
    q(
      digest(r.originalSha256) && digest(r.syntheticSha256),
      'Standalone source identities missing',
    );
    for (const row of rows)
      q(
        Array.isArray(row.blockedExternalRequests) &&
          !row.blockedExternalRequests.some((url) => /assessment|\.mjs(?:$|\?)/u.test(url)),
        'Standalone requested an external assessment module',
      );
  },
});
const privateBase = make('assessment-private-import', {
  paths: ['private-import.json'],
  extra() {},
});
defs['assessment-private-import'] = {
  ...privateBase,
  validate(r, c = {}) {
    const errors = [],
      q = (ok, message) => {
        if (!ok) errors.push(message);
      },
      wanted = privateBase.expectedCases(c.engine),
      observed = [];
    q(
      r?.mode === 'synthetic-pack',
      'Real/private or unidentified scope cannot satisfy synthetic controls',
    );
    q(Array.isArray(r?.failures) && !r.failures.length, 'Private import failures missing/nonempty');
    q(Number.isInteger(r?.probes) && r.probes >= 3, 'Independent private text probes missing');
    q(
      exact(
        engines(c.engine),
        (r?.engines || []).map((row) => row.engine),
      ),
      'Private import engine roster incomplete',
    );
    for (const row of r?.engines || []) {
      q(row.verdict === 'pass' && !row.error, 'Private import engine failed');
      for (const step of row.steps || []) observed.push(`${row.engine}/${step.name}`);
      const backup = row.steps?.find((step) => step.name === 'backup-export')?.detail;
      q(
        backup?.importable === 'ok' &&
          backup.omitted >= 1 &&
          backup.bytes > 0 &&
          Array.isArray(backup.probes) &&
          backup.probes.length >= 3 &&
          backup.probes.every((probe) => probe.backup === 0 && probe.liveRecord >= 1),
        'Backup omission/native retained-text controls incomplete',
      );
    }
    q(exact(wanted, observed), 'Private import step roster incomplete/duplicated');
    return { passed: !errors.length, errors, expectedCases: wanted, observedCases: observed };
  },
};
defs['assessment-controller'] = make('assessment-controller', {
  pure: true,
  extra(r, c, q) {
    q(
      r.format === 'kairo-assessment-controller-verification',
      'Wrong assessment controller format',
    );
    q(
      Array.isArray(r.currentInputDifferences) && !r.currentInputDifferences.length,
      'Compiled source changed',
    );
    q(
      digest(r.source?.sha256) &&
        digest(r.core?.sha256) &&
        Array.isArray(r.modules) &&
        r.modules.length > 0 &&
        r.modules.every((row) => digest(row.sha256)),
      'Controller compiler/source/module identities missing',
    );
    q(
      r.stress?.attempts === 500 &&
        r.stress.itemsPerAttempt === 18 &&
        r.stress.totalRetainedResponses === 9000 &&
        r.stress.forms === 1 &&
        r.stress.serializedBytes > 0,
      'Controller retained-history stress missing',
    );
    if (r.sourceArtifact) artifact(q, r, c, r.sourceArtifact.artifactSha256);
  },
});
defs['annotation-lookup'] = make('annotation-lookup', {
  paths: ['annotation-lookup.json'],
  status: 'passed',
  extra(r, c, q, rows) {
    q(
      r.passed === true && Array.isArray(r.failures) && !r.failures.length,
      'Annotation failures/status invalid',
    );
    artifact(q, r, c, r.identity?.artifactSha256);
    verifier(q, r, c);
    q(
      digest(r.sourceSha256) && digest(r.fixtureSha256) && digest(r.shimSha256),
      'Annotation source/shim identities missing',
    );
    q(
      exact(
        [
          'list-form-reenabled-before-reload',
          'list-form-reenabled-before-reload-after-capture',
          'annotation-by-kana-shape',
        ],
        (r.controls || []).map((row) => row.name),
      ) && (r.controls || []).every((row) => digest(row.fixtureSha256)),
      'Annotation controls missing',
    );
    for (const row of rows)
      if (row.name.startsWith('control:'))
        q(nonempty(row.observations?.rejectedBy), 'Annotation control did not reject at assertion');
    for (const e of engines(c.engine))
      q(nonempty(r.browserVersions?.[e]), 'Annotation actual engine version absent');
  },
});
for (const producer of ['reading-candidates', 'personal-reading', 'source-shelf'])
  for (const engine of ['chromium', 'webkit']) {
    defs[producer + (engine === 'webkit' ? '-webkit' : '')] = make(producer, {
      paths: [
        producer === 'reading-candidates' ? 'verify-reading-candidates.json' : 'receipt.json',
      ],
      actualEngine: (_row, r) => (typeof r.browser === 'string' ? r.browser : r.browser?.name),
      expectedEngine: () => [engine],
      extra(r, c, q) {
        runtime(q, c, r.corridorSha256, 'corridor.js');
        q(Array.isArray(r.pageErrors) && !r.pageErrors.length, 'Page errors missing/nonempty');
        if (producer === 'reading-candidates') {
          q(
            r.generated === 20 && r.externalNetworkRequestsSent === 0,
            'Reading generation/egress contract incomplete',
          );
        } else {
          runtime(
            q,
            c,
            r.controllerSha256,
            producer === 'personal-reading' ? 'reading-controller.mjs' : 'feed-controller.mjs',
          );
          if (producer === 'personal-reading') {
            q(
              !r.counterfactualSource &&
                r.externalRequestsSent === 0 &&
                nonempty(r.browser?.version),
              'Personal reading source/egress/browser invalid',
            );
            const intended = nonempty(c.root)
              ? realPath(join(c.root, 'node_modules', 'playwright-core'))
              : null;
            const used = driverPath(r.browser?.driverUrl);
            const within = intended && used ? relative(intended, used) : '';
            q(
              !Object.hasOwn(c.env || c.environment || {}, 'KAIRO_PLAYWRIGHT_MODULE') &&
                r.browser?.driverModule === 'playwright-core' &&
                nonempty(within) &&
                !within.startsWith('..') &&
                !isAbsolute(within),
              'Personal reading did not run on the workspace playwright-core driver',
            );
          } else q(r.externalRequests === 0, 'Source shelf egress invalid');
        }
      },
    });
  }
defs.mock = make('mock', {
  paths: ['mock-report.json'],
  actualEngine: () => 'chromium',
  expectedEngine: () => ['chromium'],
  extra(r, c, q) {
    q(
      r.schemaVersion === 1 && r.pass === true && r.failed === 0 && !r.error,
      'Mock completion invalid',
    );
    artifact(q, r, c, r.artifact?.sha256);
    verifier(q, r, c, r.sources?.verifier);
    q(digest(r.sources?.nativeRecordHelper), 'Mock native helper identity missing');
  },
});
const kagamiExpected = () =>
  ASSESSMENT_CASES.kagami.map(
    (name) => `${name.startsWith('webkit:') ? 'webkit' : 'chromium'}/${name}`,
  );
const kagami = make('kagami', {
  paths: ['kagami-report.json'],
  extra(r, c, q) {
    q(
      r.schemaVersion === 2 &&
        r.fullAcceptance === true &&
        r.requestedScope === 'full' &&
        nonempty(r.runId),
      'Kagami completion/scope/run identity missing',
    );
    if (c.runId) q(r.runId === c.runId, 'Kagami wrong attempt');
    artifact(q, r, c);
    verifier(q, r, c);
    q(exact(['chromium', 'webkit'], r.engines), 'Kagami actual engine roster missing');
    const fresh = r.freshness;
    q(
      fresh?.pass === true &&
        exact(
          ['chromium', 'webkit'],
          fresh.results?.map((row) => row.engine),
        ) &&
        fresh.results.every(
          (row) => row.pass === true && nonempty(row.browserVersion) && !row.error,
        ),
      'Kagami native freshness incomplete',
    );
    q(
      Array.isArray(fresh?.errors) &&
        !fresh.errors.length &&
        Array.isArray(fresh?.externalRequests) &&
        !fresh.externalRequests.length,
      'Kagami freshness errors/egress missing/nonempty',
    );
  },
});
defs.kagami = {
  ...kagami,
  expectedCases: kagamiExpected,
  validate(r, c = {}) {
    const result = kagami.validate(r, c);
    result.expectedCases = kagamiExpected();
    result.errors = result.errors.filter(
      (error) => error !== 'Missing, duplicate, extra or filtered case/engine roster',
    );
    if (!exact(result.expectedCases, result.observedCases))
      result.errors.push('Missing, duplicate, extra or filtered case/engine roster');
    result.passed = !result.errors.length;
    return result;
  },
};
const mutantTargets = {
  'uncapped-count': 'cap-50 · the button reads the capped day and equals the session',
  'retention-unwired': 'gentle · __KAIRO_SRS__.params() reports 85% retention and a step of 10m',
};
defs['srs-today'] = make('srs-today', {
  field: 'checks',
  actualEngine: () => 'chromium',
  expectedEngine: () => ['chromium'],
  extra(r, c, q, rows) {
    q(
      r.format === 'kairo-srs-today-verification' && r.status === 'passed',
      'SRS today status/format missing',
    );
    artifact(q, r, c);
    verifier(q, r, c);
    q(r.seed?.reviews === 300 && r.seed.fresh === 40, 'SRS seed narrowed');
    q(
      r.summary?.checks === rows.length &&
        r.summary.failed === 0 &&
        r.summary.mutants === 2 &&
        r.summary.mutantsCaught === 2,
      'SRS summary incomplete',
    );
    q(
      exact(Object.keys(mutantTargets), Object.keys(r.mutants || {})),
      'SRS mutation roster incomplete',
    );
    for (const [id, target] of Object.entries(mutantTargets)) {
      const m = r.mutants?.[id];
      q(m?.caught === true && m.mustFail === target, 'SRS intended mutation not killed');
      const wanted =
        id === 'uncapped-count'
          ? [target, 'cap-50 · the home pill reads the same 50', 'no console or page errors']
          : [
              ...ASSESSMENT_CASES['srs-today']
                .filter((name) => name.startsWith('gentle ·'))
                .slice(0, 5),
              'no console or page errors',
            ];
      q(
        exact(
          wanted,
          m?.checks?.map((row) => row.name),
        ),
        'SRS mutant check roster incomplete',
      );
      q(
        m?.checks?.find((row) => row.name === target)?.pass === false &&
          m.checks.every((row) => typeof row.pass === 'boolean') &&
          m.checks.find((row) => row.name === 'no console or page errors')?.pass === true,
        'SRS mutation did not fail its intended assertion cleanly',
      );
    }
  },
});
for (const [name, contract] of Object.entries(defs)) {
  const validate = contract.validate;
  defs[name] = Object.freeze({
    ...contract,
    validate(report, context = {}) {
      try {
        return validate(report, context);
      } catch (error) {
        return {
          passed: false,
          errors: [`Malformed receipt: ${error.message}`],
          expectedCases: contract.expectedCases(context.engine),
          observedCases: [],
        };
      }
    },
  });
}
export const assessmentReportContracts = Object.freeze(defs);
export const assessmentReportNarrowingEnvironment = Object.freeze([
  'KAIRO_QUESTION_STAGED_SOURCE',
  'KAIRO_QUESTION_VIEW_CASES',
  'KAIRO_OVERFLOW_PROBE',
  'KAIRO_GRADE_DIAGNOSTICS',
  'KAIRO_ASSESSMENT_CLICK_DIAGNOSTICS',
  'KAIRO_PRIVATE_PACK',
  'KAIRO_PERSONAL_READING_SOURCE',
  'KAIRO_PLAYWRIGHT_MODULE',
  'KAIRO_ASSESSMENT_SITE_DIR',
  'KAIRO_ASSESSMENT_SITE_SHA256',
]);
export function validateAssessmentReport(name, report, context = {}) {
  const c = assessmentReportContracts[name];
  if (!c)
    return {
      passed: false,
      errors: [`Unsupported assessment report ${name}`],
      expectedCases: [],
      observedCases: [],
    };
  try {
    return c.validate(report, context);
  } catch (error) {
    return {
      passed: false,
      errors: [`Malformed receipt: ${error.message}`],
      expectedCases: c.expectedCases(context.engine),
      observedCases: [],
    };
  }
}
