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

## Status

WP-01 skeleton only. No domain logic yet — see `docs/build-evidence/TEST_PLAN.md`
for which tests land in which WP.
