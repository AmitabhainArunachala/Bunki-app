# @bunki/assessment

Pure assessment content and attempt contracts for the active KAIRO app. This package does not provide complete exam content, storage, playback, timers, cloud transport or a human review service. None of its test fixtures is an approved exam.

## Content and authority

`createItemVersion`, `createPassageVersion`, `createMediaVersion` and `createFormVersion` produce immutable, canonical SHA-256 revisions. The corresponding `parse*Version` functions recompute all hashes and cross-references at storage/network boundaries. A form embeds its exact item, passage and media metadata revisions. Changing a question, answer key, source claim, permission, timing block or authoring rule changes the relevant revisions. Audio metadata pins an opaque asset locator and a byte digest; the host still has to verify and play the actual bytes. `MediaVersion` is a discriminated union: `AudioMediaVersion` keeps the existing audio fields, while `ImageMediaVersion` declares `kind: "image"`, an opaque `assetId`, `bytesSha256`, a PNG/JPEG/WebP `mimeType`, integer `width` and `height` from 1 through 8192, and nonblank `alt` text of at most 2000 UTF-16 code units. Image asset keys start with an ASCII alphanumeric character and contain only ASCII alphanumeric, underscore and hyphen characters; URL, namespace, path and encoded-data syntax are refused. The host must resolve the key through its own asset store. These metadata claims do not establish that bytes exist, match the digest, decode safely, have the claimed dimensions, or may be displayed. Existing audio payloads and their revisions receive no new fields or normalization.

Selected choices, ordered tokens, exact written answers and manually marked writing have separate types. A valid key index or token permutation establishes structure. It cannot establish grammatical correctness, unique distractors, appropriate level, audio quality or exam parity. `inspectFormStructure` checks known task/timing requirements and declared authoring counts, and explicitly returns `linguisticCorrectness: 'not-established'` and `completeOfficialCoverage: 'requires-editorial-review'` even when those checks pass.

`createEditorialDecision` records a digest-bound assertion. Automated reviewers may record review observations but cannot assert human approval. `evaluateReleaseReview` also requires host-verified reviewer authority and the expected checklist version. An imported reviewer name, successful test, model vote or matching hash cannot provide that authority. A form-level decision binds its entire embedded content. A new revision invalidates the old decision; conflicting current approval and rejection block release without selecting the latest timestamp. Unknown source/retention rights and unverified legacy provenance remain blockers despite an approval assertion.

The seven `EDITORIAL_ASPECTS` remain required exactly once in every v1 decision. Both exported aspect arrays are frozen at runtime, so a JavaScript consumer cannot alter the required checklist or the optional catalog. A separately exported `OPTIONAL_EDITORIAL_ASPECTS` list contains `visual`; a decision may explicitly add that eighth aspect. No visual result is supplied by default, so old seven-aspect decisions keep their exact bytes and hashes. Every image-bearing form needs an explicit visual `pass` on an otherwise acceptable, exact form decision. Visual review must assess the illustration and alternative text, including accidental answer disclosure; this schema cannot perform that review. Image-only forms may mark audio `not-applicable`; mixed forms still require audio `pass`. Listening items must reference actual audio metadata, audio facts cannot target images, and listening completion checks examine only audio references.

The small authority boundary is intentional: **`EditorialDecision` is evidence of a recorded assertion; `ReviewAuthority` is a host-supplied grant; a resulting release observation is not a domain learning event.** Authenticating reviewers and providing complete, unrevoked decisions belongs to the host. This library cannot determine an external reviewer's identity, unseen decisions or legal permission.

## Official facts are separate from authoring rules

`OFFICIAL_BLUEPRINTS` contains facts checked by the repository audit on 2026-09-10. They are a partial catalogue, not a complete authoring specification or a question bank. Listening durations are nominal and can vary. No universal fixed item count is claimed. Form `authoring.requirements` are explicitly local authoring rules; they must not be advertised as official item counts.

| Exam   | Track | Timing blocks in minutes | Notes                                                     |
| ------ | ----- | ------------------------ | --------------------------------------------------------- |
| JLPT   | N5    | 20 / 40 / ~30            | Vocabulary; grammar/reading; listening                    |
| JLPT   | N4    | 25 / 55 / ~35            | Vocabulary; grammar/reading; listening                    |
| JLPT   | N3    | 30 / 70 / ~40            | Vocabulary; grammar/reading; listening                    |
| JLPT   | N2    | 105 / ~50                | Combined language/reading; listening                      |
| JLPT   | N1    | 110 / ~55                | Combined language/reading; listening; no orthography task |
| J.TEST | A–C   | 80 / ~45                 | Reading/writing; listening; written responses             |
| J.TEST | D–E   | 70 / ~35                 | Reading/writing; listening; written responses             |
| J.TEST | F–G   | 60 / ~25                 | Reading/writing section; listening; selected responses    |

Primary references: [JLPT sections and timing](https://www.jlpt.jp/e/guideline/testsections.html), [N1 task purposes](https://www.jlpt.jp/e/guideline/pdf/n1_e_revised.pdf), [N5 task purposes](https://www.jlpt.jp/e/guideline/pdf/n5_e_revised.pdf), [JLPT scaled scoring](https://jlpt.jp/e/about/pdf/scaledscore_e.pdf), [J.TEST tracks](https://j-test.jp/newjtest), [J.TEST brochure](https://j-test.jp/wp-content/uploads/2025/09/Brochure_20250904.pdf).

This package does not reproduce official questions or infer a JLPT scaled score from raw accuracy. J.TEST facts do not select it as the operator's accepted alternative exam family. Its complete task blueprint, scoring rules, authored forms and editorial decisions remain future work.

## Attempt lifecycle

`beginAttempt(form, input)` requires a fresh caller-supplied attempt ID, account/learner scope, starting instant, practice/timed mode, prior-exposure status, editorial status at start and clock status. Account/learner identifiers are scope keys, not authentication. A local unlinked profile can use stable opaque IDs. The host must atomically reject duplicate attempt IDs; a pure function cannot know IDs already committed elsewhere.

`checkpointAttempt(form, previous, command)` proposes the next immutable revision. A command contains `expectedRevisionId`, recorded instant, cursor, absolute accumulated timing for every block, clock status, newly appended facts and outcome. Facts have stable unique IDs and retain exposure, every response change, assistance, media actions and interruptions. The current answer list is recomputed from those facts. Prompt exposure must precede a response; duplicate fact IDs, stale revisions, altered content references and timing regression fail closed. Timed cursors advance at most one block and cannot return to a previous block.

Both elapsed and active milliseconds are host observations. They never derive from wall-clock timestamps. The host must use a reliable monotonic clock, record background/restart/device changes and persist checkpoints at appropriate boundaries. A process stop or clock discontinuity permanently marks that attempt's timing unverified. Advancing the UI before the proposed revision is durably committed would defeat this contract.

Minimal unreviewed legacy practice integration:

```ts
const savedForm = adaptLegacySet(rawSet);
const form = savedForm.form;
const attempt = beginAttempt(form, {
  attemptId: newOpaqueAttemptId,
  scope: { accountId: localAccountId, learnerId: localLearnerId },
  mode: 'practice',
  priorExposure: 'unknown',
  editorialAtStart: {
    status: 'unreviewed',
    authorityPolicyVersion: null,
    decisionRevisionIds: [],
  },
  startedAt: observedInstant,
  clockStatus: 'continuous',
});
// Commit the form snapshot (once per revision) and new attempt before showing success.

const item = form.items[0];
const itemRef = { ...artifactReference(item), kind: 'item' as const };
const next = checkpointAttempt(form, attempt, {
  expectedRevisionId: attempt.revisionId,
  recordedAt: observedInstant,
  cursor: attempt.cursor,
  timings: updatedTimingsForEveryBlock,
  clockStatus: attempt.clockStatus,
  facts: [
    {
      id: newExposureId,
      recordedAt: observedInstant,
      timingBlockId: attempt.cursor.timingBlockId,
      elapsedMs: observedElapsed,
      kind: 'exposure',
      item: itemRef,
      content: 'prompt',
    },
    {
      id: newResponseId,
      recordedAt: observedInstant,
      timingBlockId: attempt.cursor.timingBlockId,
      elapsedMs: observedElapsed,
      kind: 'response',
      item: itemRef,
      response: { kind: 'selected', optionId: selectedOptionId },
    },
  ],
  status: 'in-progress', // Or submitted / abandoned, retaining the complete attempt.
});
// CAS + atomic durable commit using attempt.revisionId; only then advance the UI.
```

`parseAttempt(form, stored)` checks the exact form reference, state, accumulated facts and revision. A finalized attempt cannot be reopened; a rerun gets a new ID. `scoreAttempt` only scores submitted attempts and returns a **raw practice result**, with manual writing left pending. It never returns official scoring, certification or a pass prediction.

`assessAttemptAdmission` is a conservative eligibility observation. Short/unreviewed practice, uncleared content, known assistance/reveals, prior exposure, interruption, overrun, incomplete responses and unverified listening prevent clean eligibility. Listening needs matching playback start/end facts and a response after playback began. Even a clean report only says `candidate-for-separate-domain-gate`; it always returns `evidenceAdmitted: false` and `scheduling: 'unchanged'`. Hosts must verify editorial authority, media bytes, actual exposure and policy before any separate domain admission. `DomainEventv1` is unchanged.

## Preserving legacy data

`adaptLegacySet(raw)` retains the complete original JSON value, its canonical content digest, and a normalized immutable form. `parseLegacySetAdaptation(raw)` recomputes both sides of that wrapper. The current 25 sets contain 423 short item placements, no listening media and no reviewed complete forms. Their legacy titles and approval/rights assertions remain in `original`; the normalized label always says **short practice · unreviewed**. Three sets have legitimately empty URL fields for app-original passages: those exact originals survive, while normalized absent URI is `null`.

`preserveLegacySummary(setId, raw)` keeps latest-per-set summaries as `summary-only`, without inventing attempt identity, form version, response history or overwritten sittings. Unusual but finite historical score/timestamp claims are retained and labelled unverified.

`preserveLegacyRun(raw)` keeps completed and unfinished old runs as unverified, index-based evidence with `resumeAllowed: false`. A current set ID or matching item count cannot establish what content an old run displayed. The host should preserve that evidence and offer a separate new practice attempt. It must not silently attach the old answers to a current form version. `parseLegacyEvidence` rehydrates any of the three wrapper types by recomputing every projected field.

All parsers accept bounded ordinary JSON, reject unknown contract fields and reject malformed/cyclic/accessor-bearing data without invoking getters. Historical source fields unknown to the adapter are retained inside `original`. Source URI and license strings are preserved claims; they are not URL fetch authorization or permission grants.

## Verification and remaining integration

```sh
npm run typecheck --workspace @bunki/assessment
npm run test --workspace @bunki/assessment
npm run lint --workspace @bunki/assessment
```

Tests use all 25 real legacy source files, synthetic content and review fixtures, exact-digest counterexamples, response history/restart round trips, stale checkpoints, clock rollback/process interruption, assistance/reveal facts and media-state negatives. They do not validate Japanese pedagogy or perform native playback. The intentionally tiny `fullForm()` fixture proves that passing structural checks alone cannot imply complete coverage.

The host still owns atomic persistence/outbox commits, migration UI, content retention rights, reliable timers and interruptions, audio caching/playback, raster-byte authentication/decoding and accessible image rendering, editorial authentication, complete coverage authoring, manual writing marks, item exposure across previous attempts, and actual end-to-end/device acceptance. `@bunki/sync`'s existing exam operation cannot yet carry ordered responses or this complete checkpoint history; do not stringify those facts into a text answer or silently discard them. Extend that vocabulary explicitly before replicating these records. No existing legacy record or source file is mutated by this package.
