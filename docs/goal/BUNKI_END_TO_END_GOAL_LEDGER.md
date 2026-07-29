# Bunki End-to-End Goal Ledger

**Schema:** human-readable companion to
`docs/goal/BUNKI_END_TO_END_GOAL_STATE.json`  
**Snapshot date:** 2026-07-29  
**Repository:** `AmitabhainArunachala/Bunki-app`  
**State:** `ACTIVE` for F03

## Plain outcome

John selected the full Bunki end-to-end autonomous controller and instructed:
“Publish G00 and start.”

G00 governs execution. F02 is human-merged and closed. F03 is the one active
bounded child: make the pinned FSRS scheduler safe when a device clock moves
backward, without dropping an admitted review, rewriting its evidence time, or
making replay nondeterministic.

## Bootstrap and closure receipts

- PR #15 was human-merged at 2026-07-29T10:43:47Z.
- Reviewed PR #15 head:
  `29e2fa46020c3dd2a4d32f7acc8b6764ebb1deea`
- Resulting `main`:
  `307ddc222ee63e2b8a9b66627a2591f55493a847`
- PR #15 makes the unresolved-save warning truthful. Real idempotent
  reconciliation remains F06.
- G00 PR #16 was human-merged at 2026-07-29T11:17:14Z.
- Reviewed G00 head:
  `6387917e37096fe9ebde816d0b42b950187ca135`
- Resulting `main`:
  `c4e1662dfffae362462e6cf42e53e9647c9c80f4`
- F02 PR #17 was human-merged at 2026-07-29T12:43:22Z.
- Reviewed F02 head:
  `f9b58c416fbd5943cc55d0a2230a1f52e321b068`
- Resulting `main`:
  `c45af9ccd6aa54a3059200073380214a81b378bf`
- Comparing the reviewed F02 head to the merge reports one merge commit and
  zero changed files. The human-merged tree is exactly the admitted F02 tree.
- F02 exact-head CI passed, both independent reviews reported no P0/P1, and no
  other Bunki implementation PR was open when F03 was frozen.

## Selected controller

- Repository path:
  `docs/prompts/BUNKI_END_TO_END_ONE_LONG_GOAL_2026-07-29.md`
- G00 input SHA-256:
  `6e7449149efb0fb60c8475809f451e6faecdfeb83e830e96f26f6ca04e9bcbb7`
- Product-completeness falsifier: PASS.
- Autonomous-controller falsifier: PASS.
- The Product Lock and frozen specifications remain higher authority.

## F02 closure receipt

- PR: `#17`
- State: `MERGED`
- Exact reviewed head:
  `f9b58c416fbd5943cc55d0a2230a1f52e321b068`
- Human merge:
  `c45af9ccd6aa54a3059200073380214a81b378bf`
- Exact-tree equivalence: PASS; zero file differences from reviewed head to
  merge commit.
- Exact-head CI: PASS.
- Independent code/security review: PASS, no P0/P1.
- Independent test/contract review: PASS, no P0/P1.
- Outcome: the export test server proves lexical and real-path containment,
  fails malformed and traversal inputs closed, keeps valid route fallbacks, and
  exposes no runner path in its generic 404.

## F03.1 child contract

**Milestone:** `F03`  
**Child:** `F03.1`  
**Base:** `main@c45af9ccd6aa54a3059200073380214a81b378bf`  
**Branch:** `agent/bunki-f03-fsrs-clock-skew`  
**Writer:** one Integrator  
**Merge authority:** John only

Allowed paths:

1. `packages/domain/src/reducers/fsrs-pin.ts`
2. `packages/domain/src/reducers/memory-state.ts`
3. `packages/domain/test/reducers/fsrs-pin.test.ts`
4. `packages/domain/test/reducers/memory-state.test.ts`
5. `packages/domain/test/adversarial/t1-clock-skew.test.ts`
6. `packages/domain/test/replay/clock-skew.test.ts`
7. `packages/persistence/test/adversarial/t1-concurrent-append.test.ts`
8. `packages/export/src/ui-hooks.ts`
9. `packages/export/test/ui-hooks.test.ts`
10. `packages/domain/test/fixtures/golden-002-promotion-ladder-and-supersession.json`
11. `packages/domain/test/fixtures/golden-004-contracts-gate-and-fsrs-scheduling.json`
12. `docs/goal/BUNKI_END_TO_END_GOAL_STATE.json`
13. `docs/goal/BUNKI_END_TO_END_GOAL_LEDGER.md`

### Observed defect

- Event append order is authoritative, but `occurredAt` is not guaranteed to be
  monotonic after an NTP correction, a device clock change, or a future merged
  device log.
- `applyAdmittedReview` passed a raw regressed review time directly into
  `ts-fsrs`.
- `ts-fsrs@5.4.1` computes elapsed time across UTC calendar dates and throws
  `FSRSValidationError` for a negative day delta.
- A first review at `2026-07-27T09:03:00.000Z` followed by a review at
  `2026-07-26T23:59:00.000Z` therefore made replay fail even though the log was
  valid and parseable.
- Replay is also the persistence append gate, so the acknowledged review was
  refused rather than durably recorded.
- Merely wrapping the library error in a domain error would fix taxonomy only;
  it would still lose the review and does not satisfy F03.

### Frozen temporal policy

- Add a separate `schedulerAnchorAt` to derived `MemoryState`.
- Initialize the anchor to `activatedAt`.
- For every admitted review, compute the effective scheduler time as the later
  of the raw review time and the prior scheduler anchor.
- Give FSRS the prior anchor as `last_review` and the effective time as the
  current review instant.
- Preserve the raw event time in `lastReviewedAt`, the observation ledger, and
  the gate decision.
- Advance `schedulerAnchorAt` to the effective time.
- Pin the wrapper policy as
  `append-order-monotonic-clamp-v1` in the scheduler stamp.
- Carry that policy id in export build metadata so an importer cannot mistake
  matching FSRS weights for matching scheduling semantics.
- Do not change `ts-fsrs`, its weights, desired retention, interval cap,
  randomness setting, learning steps, or state precision.

The separate anchor is required. Clamping against raw `lastReviewedAt` repairs
one backward review but lets a second, older review move the effective FSRS
clock backward again.

### Closure predicate

- a first admitted review dated before activation is accepted and counted;
- same-instant reviews are all counted rather than collapsed;
- same-day, one-millisecond, UTC-boundary, multi-day, and multi-year backward
  reviews are accepted;
- an arbitrarily descending review sequence never decreases
  `schedulerAnchorAt`;
- the raw timestamp remains visible in the event, observation, gate decision,
  and `lastReviewedAt`;
- every admitted review produces one gate verdict and increments
  `admittedReviewCount`;
- stability, difficulty, and scheduled days remain finite and nonnegative;
- `dueAt`, `lastReviewedAt`, and `schedulerAnchorAt` remain canonical instants;
- `dueAt` never precedes the scheduler anchor;
- a skewed persistence append lands exactly once, survives read and snapshot,
  and a later forward review still lands;
- replaying the same skewed log twice produces byte-identical canonical JSON;
- existing golden scheduling scenarios migrate only by the explicit new
  scheduler-anchor and review-time-policy fields, with their chronological
  interval values otherwise unchanged; and
- no ambient clock, timezone conversion, event reordering, event-schema,
  dependency, UI, adapter, provider, dataset, or release behavior changes.

### Verification

Focused gate:

```text
npx vitest run packages/domain/test/reducers/fsrs-pin.test.ts packages/domain/test/reducers/memory-state.test.ts packages/domain/test/adversarial/t1-clock-skew.test.ts packages/domain/test/replay/clock-skew.test.ts packages/persistence/test/adversarial/t1-concurrent-append.test.ts packages/export/test/ui-hooks.test.ts
npm run test:replay
```

Full exact-head gate:

```text
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run test:replay
npm run verify:export
npm run test:e2e:build
npm run test:e2e
sha256sum -c docs/operator/BUNKI_OPERATOR_LOCK_INTEGRITY_SHA256_2026-07-29.txt
```

Before the new policy has accepted learner data, rollback is the thirteen-file
F03 delta only. After any review has landed because F03 contained a backward
clock, do not return to the F02 scheduler without a full replay-compatibility
scan or an equivalent forward fix: F02 can reject that now-valid stored log.
The event schema itself requires no migration because `MemoryState` is
replay-derived.

### Non-goals

- no event timestamp rewriting or log reordering;
- no typed-rejection substitute for durability;
- no timezone or NTP service;
- no FSRS dependency, weight, retention, fuzz, step, precision, or interval-cap
  change;
- no sync or conflict-resolution design;
- no session-planning, UI, provider, source, dataset, Apple, licensing, deploy,
  or release work;
- no new golden harness or unrelated fixture change; and
- no harvesting of any divergent branch.

## Visual references

No operator screenshot bytes were available in the G00 publication context.
The manifest remains honestly empty. New images must be appended with their
hash, received date, visible surface, actual evidence, accepted
preference/constraint, supersession state, and exact build/SHA when known.

## Evidence boundary

The checked-in state intentionally leaves the F03 PR number, final head SHA,
and exact-head verification fields null. Adding those after verification would
change the reviewed head. The draft PR body, checks, and review threads are the
post-freeze live overlay keyed to the exact candidate SHA.

The state, this ledger, and the visual-reference manifest are mutable runtime
evidence. They are schema- and semantic-validated inside each active child
rather than frozen by the operator-lock integrity check.

## Next safe action

1. Recheck exact merged `main` and confirm no competing open PR.
2. Create the F03 branch from that exact SHA.
3. Publish only the thirteen allowed files and fetch back every remote byte.
4. Run focused tests and the full repository CI ladder on the exact candidate
   head.
5. Obtain independent temporal-code and replay/persistence reviews.
6. Resolve every P0/P1 and rerun on any changed head.
7. Ask John to human-merge only the final verified F03 head.
