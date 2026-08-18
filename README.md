# Bunki (分岐)

Phase-0 build of one closed learning loop: paste or select a provenance-labeled
seeded encounter → durable thread → bounded AI candidate explanation → explicit
promotion → one retrieval contract → one contextual reuse → scored probe →
finite session → inspect and export the evidence.

## Current integrated prototype — the Corridor

The product prototype is **`prototypes/corridor/`** — one integrated browser
app (shelf, reader, dictionary, kanji, writing room, SRS, drift, AI surfaces),
merged to `main` through PRs #71 and #73. Start with the
[current product constitution](docs/operator/BUNKI_CURRENT_PRODUCT_CONSTITUTION_2026-08-15.md);
it is the dated front door to the frozen product laws, current visual rulings,
ten public worlds, and the quiet writing-room contract.

- [Open the deployed corridor](https://amitabhainarunachala.github.io/Bunki-app/)
  (GitHub Pages, deployed from `main` by `.github/workflows/pages-app.yml`)
- The 連環 RENKAN campaign (PR #74) drives the app toward its terminal
  conditions; round-by-round state lives in
  `docs/build-evidence/renkan/RUN_STATE.md`.

Sites v5 is preserved without modification on
[`sites/v5-import`](https://github.com/AmitabhainArunachala/Bunki-app/tree/sites/v5-import)
at `a3de88251d7ea0acde086b190bdd8f3afda46b94`. It is a donor, not an alternate
authority. The exact port boundary and remote-agent handoff are recorded in
[`SITES_V5_CLAUDE_HANDOFF_2026-08-15.md`](docs/handoffs/SITES_V5_CLAUDE_HANDOFF_2026-08-15.md).

The older Sites v11 material below remains useful implementation history, but
it is not the current visual or interaction baseline.

**LICENSE: pending operator decision** (OD-09). The repository is private. Until
the operator chooses, no dependency or data may constrain that choice beyond the
share-alike seed data confined to `packages/seed/`.

## Run the corridor locally

The corridor is static — serve the directory and open it:

```bash
python3 -m http.server 8000 --directory prototypes/corridor
# → http://localhost:8000/
```

Its verifier battery (real Chromium) lives in `prototypes/corridor/tools/` and
runs via `docs/build-evidence/renkan/battery.sh`.

Historical prototypes remain runnable as history, not authority: Sites v11
(`npm run bunki:web:dev`, source `prototypes/bunki-sites-v11/`) and the
preserved Sites v5 donor on `sites/v5-import`.

## Status

The repository holds one product prototype and one semantic authority: the
runnable corridor under `prototypes/corridor/`, and the deterministic Phase-0
kernel under `apps/` and `packages/` (the corridor is held to the kernel's laws
by contract parity — see ADR-004). Product features are real and interactive;
claims about efficacy, retention, or review burden remain outside the evidence
currently collected (REQ-GATE-03).

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

npm run test:replay   # golden replay equality (packages/domain)
npm run verify:export # export→replay equality (packages/export)
npm run test:e2e:build && npm run test:e2e   # Playwright suite on the exported web bundle

bash docs/build-evidence/renkan/battery.sh <outdir>   # the full gate battery
```

The replay, export, and e2e scripts are real gates (39 e2e specs on the
exported bundle). The battery additionally runs the corridor verifiers
(`verify-corridor`, accessibility, writing-room, storage-integrity, drift,
AI runtime, native readings) and the corpus pytest gates.

## Runtime honesty

Web results are never reported as native results. Native persistence, capture
loss, and latency numbers come only from on-device runs (WP-11) and are marked
UNVERIFIED until then.
