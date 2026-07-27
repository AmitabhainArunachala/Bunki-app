# Bunki (分岐)

Phase-0 build of one closed learning loop: paste or select a provenance-labeled
seeded encounter → durable thread → bounded AI candidate explanation → explicit
promotion → one retrieval contract → one contextual reuse → scored probe →
finite session → inspect and export the evidence.

**LICENSE: pending operator decision** (OD-09). The repository is private. Until
the operator chooses, no dependency or data may constrain that choice beyond the
share-alike seed data confined to `packages/seed/`.

## Status

Early scaffold (WP-01). No learning features are implemented yet. Nothing in this
repository should be read as a claim about efficacy, retention, or review burden
(REQ-GATE-03).

## Governing documents

The build is driven by frozen specifications under `docs/specs/`. They are
hash-verified against `docs/specs/BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt` and
**must never be edited**:

| Document                                                          | Role                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| `BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md`     | the controller — work packages, tests, stop conditions |
| `BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md`      | design authority                                       |
| `BUNKI_PHASE0_MULTI_AGENT_BUILD_ORCHESTRATION_SPEC_2026-07-27.md` | who builds what, when                                  |

Architecture decisions live in `docs/adr/`; build evidence and the resumable
capsule live in `docs/build-evidence/`.

## Layout (controller §5)

npm workspaces monorepo, Node ≥ 22.

```
apps/app/              Expo app, web + native targets
packages/domain/       @bunki/domain — pure core (events, reducers, evidence gate, session)
packages/persistence/  @bunki/persistence — event store ports + adapters
packages/seed/         @bunki/seed — licensed seed dataset with per-field provenance
packages/ai/           @bunki/ai — bounded AI candidate path
packages/export/       @bunki/export — versioned lossless export
```

Each package README states its owning work package and its boundary rules.

## Boundaries that are enforced, not merely documented

See ADR-001. The short version, all lint-enforced in `eslint.config.mjs`:

- `@bunki/domain` imports no React, React Native, Expo, Node builtin, or sibling
  package — clock/ID/randomness are injected, which is what makes deterministic
  replay possible.
- `apps/app` reaches `@bunki/persistence` from exactly one directory,
  `apps/app/src/state/persistence/`; no screen, route, or test can obtain an
  `EventStorePort`, so every append still flows through the domain command
  handler and evidence-class events still pass the evidence gate (WP-10 narrowed
  WP-05's blanket ban rather than dropping it; `test/boundaries.test.ts` proves
  the seam is that one directory).
- Only `@bunki/domain` imports `ts-fsrs` — one scheduler, nothing else computes
  intervals.

## Commands

```bash
npm install

npm run lint          # eslint, incl. the boundary rules above
npm run format:check  # prettier
npm run typecheck     # tsc --noEmit in every workspace
npm run test          # vitest, all workspaces

npm run test:replay   # golden replay        — placeholder until WP-02
npm run verify:export # export→replay equality — placeholder until WP-03
npm run test:e2e      # Playwright web flow  — placeholder until WP-10

(cd apps/app && npx expo export --platform web)   # build proof
```

The three placeholder scripts print that they are unimplemented and exit 0. They
are defined now because the controller's check set names them; they are not
evidence of anything passing.

## Runtime honesty

Web results are never reported as native results. Native persistence, capture
loss, and latency numbers come only from on-device runs (WP-11) and are marked
UNVERIFIED until then.
