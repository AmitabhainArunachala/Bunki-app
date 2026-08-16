# ADR-003 — Corridor scheduler policy: fuzz off, monotonic review clock

- **Status:** Accepted (RENKAN R2-A)
- **Date:** 2026-08-16
- **Authority:** `packages/domain/src/reducers/fsrs-pin.ts` (`FSRS_ENABLE_FUZZ`,
  `FSRS_REVIEW_TIME_POLICY_ID = 'append-order-monotonic-clamp-v1'`);
  `docs/goal/BUNKI_END_TO_END_GOAL_LEDGER.md` "Frozen temporal policy";
  constitution §4 (`docs/operator/BUNKI_CURRENT_PRODUCT_CONSTITUTION_2026-08-15.md`)
- **Supersedes:** the corridor's app-level fuzz-on decision and its
  `S.stats.fuzzOff` override flag

## Context

The product has one scheduler pin and two engines that read it: the domain
kernel (`packages/domain/src/reducers/memory-state.ts`) and the corridor
prototype (`prototypes/corridor/corridor.js`, via `data/fsrs-pin.json`). Before
this ADR the two engines disagreed on scheduler **policy** while agreeing on
parameters:

1. **Fuzz.** The pin says `enableFuzz: false` — any randomness inside the
   scheduler lets two replays of one log disagree, which is what every evidence
   claim rests on. The corridor nevertheless enabled fuzz by app-level decision
   ("keeps batch-captured cards from staying due-synchronized"), with a dead
   `S.stats.fuzzOff` boolean nothing in the app ever set.
2. **Review time.** The pin names a review-time policy,
   `append-order-monotonic-clamp-v1`: the scheduler receives a nondecreasing
   per-card instant derived from append order while raw event timestamps stay
   in the evidence. The domain kernel implements it (`schedulerAnchorAt`); the
   corridor passed the raw wall clock straight into `scheduler.repeat` and its
   revlog interval math. `ts-fsrs@5.4.1` throws `FSRSValidationError` on a
   negative day delta, so a device clock moved backward could crash the grade
   row mid-session or, where it did not throw, corrupt interval pricing.

Matching weights with mismatched policy is a scheduler-policy mismatch: an
export produced by one engine could not be replayed byte-for-byte by the other.

## Decision

One scheduler policy — the pin's — now holds in both engines.

1. **Fuzz is off in the corridor.** The scheduler is built with
   `enable_fuzz: pin.enableFuzz` (false), and the dead `S.stats.fuzzOff` read
   is deleted. If interval spreading is ever wanted it belongs in session
   planning, where it changes presentation and never recorded memory state.
   The store validator still _admits_ a boolean `stats.fuzzOff` so a learner
   record written under the old build is never quarantined for carrying the
   now-meaningless field; nothing reads it.
2. **The corridor grades on a monotonic per-card clock.**
   `srsSchedulerInstant(card, now)` clamps the instant handed to FSRS up to the
   card's stored `last_review` (its scheduler anchor — the effective instant of
   its previous grade, which `ts-fsrs` writes back on every result card). The
   raw press time still lands in the revlog row (`row[0]`) as audit truth;
   `elapsed` and retrievability in the row are computed at the clamped instant,
   so they record what the engine actually priced and are never negative. A
   backward device clock therefore neither crashes nor corrupts grading.

## Rollback and compatibility

- **Existing scheduled dates stay valid.** Fuzz only jittered _future_
  intervals at grade time; no stored due date, stability, or difficulty is
  rewritten by this change, and no migration runs. From the next grade onward
  intervals are simply the deterministic ones.
- **Existing revlogs stay valid.** The row layout is unchanged; only the
  documented meaning of `elapsed`/`r` is sharpened (clamped instant). The undo
  revocation rows are untouched.
- **Reverting this ADR** would reintroduce the policy mismatch but would not
  invalidate any store written under it: fuzz-off output is a legal fuzz-on
  input, and clamped `last_review` values are ordinary instants.

## Consequences

- Two replays of one review log agree in both engines; the corridor's export
  can carry the pin's `reviewTimePolicyId` honestly.
- Batch-captured cards may keep synchronized due dates. That is a session
  planning concern (presentation), deliberately not a scheduler one.
- `verify-corridor.mjs` and `verify-corridor-storage-integrity.mjs` probe the
  policy: fuzz-off against the pin, clamp behavior under a backward clock, and
  raw-timestamp audit truth in the revlog.
