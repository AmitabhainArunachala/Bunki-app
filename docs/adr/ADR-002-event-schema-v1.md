# ADR-002 — Event schema v1

- **Status:** Accepted (WP-01) — frozen field set; implemented by WP-02/WP-06/WP-08
- **Date:** 2026-07-27
- **Authority:** controller §6.1 (`docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md`, sha256 `de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47`)
- **Supersedes:** nothing

## Context

The event log is the only authority in this system. Derived state — thread
promotion, memory state, session plans, the evidence inspector — is a projection
that must be reproducible from the log alone (T-03). Anything the log fails to
record is not merely missing from a screen; it is missing from the evidence.

This ADR freezes the v1 field set at WP-01 so that WP-02 (types and validation),
WP-03 (persistence and export), WP-06 (contracts, gate, FSRS), WP-08 (session),
and WP-09 (inspector) all build against one schema rather than converging on one
by accident.

## Decision

### Envelope: every event carries `eventId`, `v`, `occurredAt`, `idempotencyKey`

`v: 1` on every event. **Unknown versions fail closed** (REQ-DM-04, T-04) — an
event whose version this build does not recognise is rejected, never
best-effort-parsed. A schema this system half-understands is worse than one it
refuses.

`idempotencyKey` is what makes a double-tapped capture produce exactly one
thread; re-appending the same key is a no-op (controller §7).

### Event families (verbatim from controller §6.1)

| Event                              | Required fields (beyond `eventId`, `v`, `occurredAt`, `idempotencyKey`)                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EncounterCaptured`                | `encounterId`, `threadId` (new or existing), `text`, `span?`, `sourceRef`, `provenance` (REQ-SRC-01 fields), `uncertaintyMark?`                                                 |
| `ThreadPromotionChanged`           | `threadId`, `from`, `to` (`captured\|keep\|learn\|master`), `origin` (`user\|nomination_accepted`)                                                                              |
| `ContractCreated`                  | full REQ-DM-05 field set                                                                                                                                                        |
| `ReviewGraded`                     | `contractId`, `grade` (`again\|hard\|good\|easy`), `latencyMs`, `hintsUsed`, `revealedBeforeRecall`, `userConfirmedEasy?`, `probeContext` (`standalone\|embedded`), `tier: "A"` |
| `ProductionObserved`               | `contractId?`, `rubricId?`, `rubricVersion?`, `elicited: boolean`, `tier: "B"\|"C"`                                                                                             |
| `ExposureLogged`                   | `componentIds`, `experienceId`, `tier: "D"`                                                                                                                                     |
| `LookupFrictionLogged`             | `targetRef`, `context`                                                                                                                                                          |
| `CandidateAttached`                | `threadId`, `candidateId`, envelope metadata (§9), `status: "generated"`                                                                                                        |
| `CandidateAcceptedAsNote`          | `candidateId`, `userAction: true` (never auto)                                                                                                                                  |
| `EvidenceSuperseded`               | `supersededEventId`, `reason`, `correction`                                                                                                                                     |
| `SessionStarted` / `SessionClosed` | `sessionId`, `budget` / `completionState`                                                                                                                                       |
| `DataExported`                     | `exportVersion`, `scope`                                                                                                                                                        |
| `ThreadTombstoned`                 | `threadId`, `reason` (sync-safe deletion marker)                                                                                                                                |
| `ContentPurged`                    | `targetIds`, `tombstoneEventId` (records that the physical purge of user content ran; the purge itself removes payload bytes from the store)                                    |

### Notes on the fields that carry the most weight

**`tier`** is the evidence-strength label and it is not decorative. Only
`ReviewGraded` with `tier: "A"` and a valid, promotion-active contract may reach
the FSRS reducer (T-02, T-08). `ProductionObserved` (`B`/`C`) and
`ExposureLogged` (`D`) are recorded and surfaced, never scheduled on.

**`revealedBeforeRecall`** forces grade `again` regardless of the submitted grade
(T-06). A learner who saw the answer did not recall it, whatever they then
pressed.

**`userConfirmedEasy?`** is optional because it is only meaningful for
`grade: "easy"` — and for that grade it is **required**: `easy` requires
`userConfirmedEasy: true` (REQ-DM-07). This is why `exactOptionalPropertyTypes`
is on in `tsconfig.base.json` (ADR-001): absent must stay distinguishable from
present-and-undefined, because "the user was never asked" and "the user declined
to confirm" are different evidence.

**`LookupFrictionLogged`** deliberately carries no grade field. Looking a word up
is neither a success nor a failure (T-07); giving it a grade shape would invite
one.

**`CandidateAcceptedAsNote.userAction: true`** is a literal, not a boolean that
happens to be true. Nothing may construct this event automatically — accepting an
AI candidate is always an explicit human act (controller §9).

**`ThreadTombstoned` then `ContentPurged`** are two events, in that order,
on purpose. The tombstone is a sync-safe deletion marker that survives; the purge
records that the physical removal of payload bytes ran, referencing the tombstone
via `tombstoneEventId`. Deletion therefore stays auditable without the audit
trail retaining the deleted content. Collapsing these into one event would force
a choice between an unverifiable deletion and an undeletable record.

**`ContractCreated`** defers to the full REQ-DM-05 field set in the v2 spec
rather than restating it here; WP-06 implements it against that source. Meaning
and reading are **distinct contracts**, and a grade on one never mutates the
other's `MemoryState` (T-05).

### Only the domain may mint evidence

`@bunki/domain/src/evidence` is the sole factory for accepted `EvidenceEvent`s
(REQ-ARCH-04). `@bunki/ai` produces `Candidate*` types which are deliberately not
assignable to evidence types, enforced at compile time and by a runtime guard
(T-09). The lint boundary in ADR-001 (B2) keeps the UI from routing around this
by appending directly.

## Consequences

- WP-02 defines these as versioned TypeScript types with zod schemas, and
  implements the fail-closed unknown-version check (T-04).
- WP-03 persists and exports them losslessly; provenance and license metadata
  must survive the round trip (T-15).
- Adding a field in Phase 0 means a schema version bump with a replay-tested
  migration, not an optional property quietly appended.
- The set above is complete for Phase 0. Anything a later phase needs
  (`ContentReadinessEstimate`, conversation diagnosis, journey compilation) is
  explicitly out of scope per controller §2 — the seams stay, the events do not.
