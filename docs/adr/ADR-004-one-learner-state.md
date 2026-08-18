# ADR-004: One learner state — narrowing by contract parity

**Status:** Proposed (ratification: operator decision sheet, RENKAN campaign)
**Date:** 2026-08-16
**Campaign:** 連環 RENKAN terminal T2

## Context

Two learner-state implementations exist:

1. **`@bunki/domain` + `@bunki/persistence`** — the event-sourced kernel
   (ADR-001 boundaries, ADR-002 event schema): evidence gate, tiered evidence,
   contracts, pinned FSRS-6 (`ts-fsrs` 5.4.1, fuzz off, 8-dp determinism
   rounding), replay equality, lossless export. Serves `apps/app`.
2. **The corridor store** (`kairo-corridor-v1`) — the deployed prototype's
   direct-mutation store: validated fail-closed envelope, quarantine-on-
   unreadable, append-only `revlog`/`obslog`, transactional `commitStorePatch`,
   vendored FSRS engine sharing the kernel's parameter set.

The PR70 reconciliation (2026-08-15) named the migration backlog. A wholesale
runtime unification — replacing the deployed corridor's store with the kernel
inside one campaign — would rewrite the operator's living vessel while it is
the product, with rollback risk exceeding any integrity gain. The constitution
demands one learner state as a _law of truth_, not as a demand that one
codebase import the other today.

## Decision

Unification is narrowed to **contract parity, enforced by verifiers**, until
native packaging (an operator-scoped later phase) collapses the two vessels:

1. **The corridor store is the learner state of the deployed prototype; the
   domain kernel is the semantic authority.** Where they disagree, the kernel's
   law wins and the corridor is repaired: fuzz-off + monotonic scheduler clamp
   (ADR-003, RENKAN R2), no-debt capture (landed), exposure-never-schedules
   (landed: drift and dojo write obslog observations only), transactional
   mutation (landed: `commitStorePatch` rolls back on failed persist),
   append-only audit rows (landed), T-06 reveal-forces-Again (RENKAN R3).
2. **No second authority anywhere.** `bunki-drift-v1` judgments flow to the
   corridor obslog and roll back if the host cannot persist (landed R1). AI
   transcripts are an append-only archive with no learner-model authority
   (landed R1). Any future surface state is either derived or an observation.
3. **The export envelope `{v:1, taken, srs, revlog, obslog, …}` is the
   canonical interchange.** The FSRS optimizer reads it (landed R0); kernel
   replay/export gates remain the reference semantics for any migration.
4. **PR70 backlog disposition** (each item, named):
   - P0-1 lesson disposition → RENKAN R2 build (practice writes evidence only).
   - P0-2 review-target identity → substrate landed (`entrySeq`/`cueReading`
     provenance, seq-honoring lookup); the full key migration triggers when a
     real homograph collision surfaces in learner data, with the kernel's
     replay-tested migration discipline (ADR-002).
   - P0-3 evidence-honest grading → transactional half landed; declared-recall
     (T-06) semantics in RENKAN R3.
   - P0-4 deep validation/transactional writes → landed with test coverage;
     the universal transactional helper sweep completes in RENKAN R3.
   - P1-1 no-debt legacy migration, P1-2 bounded review plan → RENKAN R2.
   - P2-1 recycler polling → deferred: battery win does not justify the
     interaction-audit cost on the web prototype; revisit at native packaging.

### Sibling: one AI stack (terminal T6)

The corridor's `aiConverse` choke point now implements the `@bunki/ai` runtime
contract behavior — 10s abort, quiet bilingual failure, provider/model seam,
lossless append-only archive — gated by `verify-corridor-ai.mjs` (19 checks).
Literal package import into the single-file corridor is deferred to the native
phase for the same reasons as §1. No third stack may appear; any new AI surface
must route through the choke point or the package.

## Tests and rollback fixtures

- `verify-corridor-storage-integrity.mjs` (29 checks): quarantine fixtures
  (empty/malformed/future-version bytes), malformed-row rejection for every
  envelope key, unknown-key byte preservation, drift-bridge rollback probes,
  save-failure rollback, callers ledger exactness.
- `verify-corridor.mjs` (121 checks) — includes dojo practice-evidence probes
  and capture/no-debt walks in a real browser.
- Kernel: replay equality (`test:replay`), export round-trip (`verify:export`),
  boundary suite (26 cases), e2e (39 specs).

## Consequences

- T2 closes as "narrowed by ratified ADR with tests + rollback fixtures" once
  the operator ratifies this document (decision sheet) and the R2/R3 parity
  items land.
- The kernel remains the target architecture for native packaging; nothing in
  this decision licenses new divergence.
