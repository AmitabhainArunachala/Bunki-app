# @bunki/domain

**Owner WP:** WP-02 (events, reducers, golden replay), then **WP-06** (contracts,
evidence gate, promotion, pinned FSRS). `src/session/` is **WP-08**'s surface.

> **Single-writer rule (orchestration spec §0.6):** `packages/domain` has exactly
> one writer at any moment in the entire build plan. If this package is not your
> active WP's surface, you may _consume_ it but must not modify it.

**LICENSE: pending operator decision** (controller §4, OD-09). Until the operator
chooses, do not add any dependency whose license would constrain that choice.

## What this package is

The pure core of Bunki. It holds every rule that decides what counts as evidence
of learning, and it holds them where they can be tested without a device, a
database, a network, or a renderer.

## Boundary rules (controller §5 — lint-enforced, see `eslint.config.mjs`)

- **No platform imports.** `@bunki/domain` imports nothing from React, React
  Native, Expo, Node builtins, persistence, AI, or seed. Clock, ID generation,
  and randomness are **injected** (REQ-ARCH-02) — never read ambiently.
- **Sole evidence factory.** Only `src/evidence/` constructs accepted
  `EvidenceEvent`s (REQ-ARCH-04). `@bunki/ai` produces `Candidate*` types, which
  are deliberately **not assignable** to evidence types.
- **One scheduler.** The FSRS reducer inside this package is the only thing in
  the repository that computes intervals (REQ-SCH-01). It wraps a pinned
  `ts-fsrs` behind our own reducer interface so a version bump is an explicit,
  replay-tested migration.
- **Determinism.** Replaying the same event log must produce identical derived
  state (T-03). Anything non-deterministic belongs behind an injected port.

## Directory map (controller §5)

| Path             | Contents                                           | Owner WP      |
| ---------------- | -------------------------------------------------- | ------------- |
| `src/events/`    | versioned event types + zod schemas                | WP-02         |
| `src/reducers/`  | pure reducers incl. FSRS wrapper + `fsrs-pin.ts`   | WP-02 / WP-06 |
| `src/contracts/` | `RetrievalContract` types + validation             | WP-06         |
| `src/evidence/`  | evidence gate; sole `EvidenceEvent` factory        | WP-06         |
| `src/session/`   | session orchestrator (pure planner)                | WP-08         |
| `src/replay/`    | replay + golden fixture harness                    | WP-02         |
| `test/`          | unit + replay tests, `test/fixtures/golden-*.json` | owning WP     |

## Status — WP-02 delivered (events, reducers, deterministic replay)

### What exists

- **`src/events/`** — the closed v1 catalog: all fifteen controller §6.1 /
  ADR-002 families as TypeScript types and strict zod schemas, sharing the
  `eventId` / `v` / `occurredAt` / `idempotencyKey` envelope. `parseEvent`
  checks the version **before** the payload and throws
  `UnknownEventVersionError` on anything but `v: 1` (T-04). Nothing in the
  parser skips: `parseEventLog` throws on the first rejected entry with its
  index rather than returning a shorter log.
- **`src/context/`** — `DomainContext` (clock, ids, randomness) plus
  deterministic implementations shipped in `src/` so WP-03's adapters and
  WP-11's device run can share one harness rather than growing three.
- **`src/reducers/`** — the promotion state machine (REQ-DM-09) and the thread
  projection. Pure, frozen output, exhaustive switches with `never` checks.
- **`src/replay/`** — `replay(events) → DerivedState`, canonically ordered and
  JSON-representable, plus the golden-fixture harness. Idempotent re-appends are
  a no-op; a key reused for different content is rejected.
- **`test/fixtures/golden-*.json`** — three fixtures (event log + expected-state
  snapshot) run by `npm run test:replay`.

## Status — WP-06 delivered (contracts, evidence gate, promotion, pinned FSRS)

### What exists

- **`src/contracts/`** — the `RetrievalContract` entity and its REQ-DM-05
  validation, including the coherence rules that decide whether a contract can
  actually score a retrieval; the promotion→skill activation table (REQ-DM-09);
  and the **contract→thread projection**. A Phase-0 KnowledgeComponent is
  identified canonically as `"kc:" + the captured target`, so the component→
  thread edge is derived from `EncounterCaptured` with **no ADR-002 schema
  change** (Conductor W2 disposition; full argument in
  `src/contracts/component-identity.ts`).
- **`src/evidence/`** — the gate. `mint.ts` is the sole factory for
  evidence-class events; `gate.ts` is the sole judge of which of them may reach
  the scheduler. Every rejection carries a reason from a closed list, so
  "why did that review not count" is answerable from derived state.
- **`src/reducers/fsrs-pin.ts`** — `ts-fsrs` 5.4.1 (FSRS-6), desired retention
  0.90, fuzz off, all 21 weights written out. `verifyFsrsPin()` fails if the
  installed library stops agreeing.
- **`src/reducers/memory-state.ts`** — the only thing in the repository that
  computes an interval, wrapping `ts-fsrs` behind this kernel's own
  `MemoryState`.
- **`test/fixtures/golden-004-*.json`** — the scheduling fixture, so
  `npm run test:replay` covers FSRS determinism as well as projection.

### What is deliberately absent

No session planner. `src/session/` is still empty for WP-08, and
`test/purity/seams-left-empty.test.ts` asserts it. The seam is recorded as data
in `PHASE0_SEAMS` (`src/reducers/seams.ts`), so "we left that alone" is
checkable rather than merely stated. Promotion **rate limiting** is also absent
and recorded as a typed seam (`PROMOTION_RATE_LIMIT_SEAM`): Phase 0 guarantees
promotion is explicit and never automatic, and does not implement a workload
cap.

### Two things worth knowing before you edit

**Purity is type-enforced, not just lint-enforced.** `tsconfig.json` compiles
`src/` with `types: []`, so `process`, `Buffer`, and every other Node global are
type errors inside the kernel. Tests compile under `tsconfig.test.json`, which
does load Node types — the golden harness reads fixtures from disk and the
purity scan reads `src/` as text. `npm run typecheck` in this workspace runs
both projects.

**Nothing calls `Date.now`, `Math.random`, or `crypto`.**
`test/purity/no-ambient-nondeterminism.test.ts` scans every file under `src/`
for those and for dynamic `import()`, `require`, `fetch`, and timers — including
`new Date(...)`, which is why the FSRS wrapper passes ISO strings into `ts-fsrs`
and serialises the `Date` it gets back rather than constructing one. A lint rule
cannot see ambient globals, and this is what stands in for one — see the file
header for why it lives here rather than in `eslint.config.mjs`.

**Two files mint event envelopes, and the split is the evidence boundary.**
`src/events/factories.ts` builds every non-evidence family and refuses the
evidence ones at the type level; `src/evidence/mint.ts` is the only thing that
can build an evidence-class event. The purity scan asserts that list is exactly
those two.

See `docs/build-evidence/TEST_PLAN.md` for which tests land in which WP.
