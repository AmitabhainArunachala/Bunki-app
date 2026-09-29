# KAIRO / Bunki (分岐)

One Japanese-learning app: source-anchored reading and listening → contextual
understanding → explicit learning → finite retrieval → later reuse, with a
durable learner record and explainable adaptation.

## Current integrated prototype — the Corridor

The product prototype is **`prototypes/corridor/`** — one integrated browser
app (shelf, reader, dictionary, kanji, writing room, SRS, Drift, AI, mock practice
and KAGAMI Mirror). The September 10 committed baseline is `124f08b3`, through
[PR #90](https://github.com/Amitabhainarunachala/Bunki-app/pull/90). Local September
14 work combines recovered R35 record history with Perplexity's PRs #91/#92 and
the observed PR #93 head `7d47063f`. This candidate has not been published.
It is a preproduction app; native delivery and the full learning loop remain to prove.
Start with the [production build and acceptance plan](docs/operator/KAIRO_PRODUCTION_BUILD_2026-09-10.md)
and the
[current product constitution](docs/operator/BUNKI_CURRENT_PRODUCT_CONSTITUTION_2026-08-15.md);
it is the dated front door to the frozen product laws, current visual rulings,
ten public worlds, and the quiet writing-room contract.

- [Open the deployed corridor](https://amitabhainarunachala.github.io/Bunki-app/)
  (GitHub Pages, deployed from `main` by `.github/workflows/pages-app.yml`)
- [KAGAMI](docs/prompts/BUNKI_KAGAMI_CAMPAIGN_2026-08-25.md) governs the shared
  learner model and its consumers; [TENOHIRA](docs/prompts/KAIRO_TENOHIRA_CAMPAIGN_2026-08-19.md)
  governs native daily use. The production plan adds Mac/iPhone sync, broader
  authentic reading, personalized original articles and complete assessments.

Sites v5 is preserved without modification on
[`sites/v5-import`](https://github.com/AmitabhainArunachala/Bunki-app/tree/sites/v5-import)
at `a3de88251d7ea0acde086b190bdd8f3afda46b94`. It is a donor, not an alternate
authority. The exact port boundary and remote-agent handoff are recorded in
[`SITES_V5_CLAUDE_HANDOFF_2026-08-15.md`](docs/handoffs/SITES_V5_CLAUDE_HANDOFF_2026-08-15.md).

The older Sites v11 material below remains useful implementation history, but
it is not the current visual or interaction baseline.

**Code licence: pending operator decision** (OD-09). The repository and the
Pages preview are public. Existing third-party code and content keep their own
licences and attribution, including the separate source pools in Corridor's
data. Public availability is not a new licence grant.

## Run the corridor locally

The corridor is static — serve the directory and open it:

```bash
npm run bunki:web:dev
# → http://localhost:8000/
```

Its browser verifiers live in `prototypes/corridor/tools/`; the required checks
are registered in [the release gate runner](scripts/verify-release-gates.mjs).
Build artifacts and executed evidence belong outside the checkout.

### SKIP kanji lookup

Open **字引 → SKIP**, or open search and type `1-3-8`, `skip:1-3-8`,
`1-3`, or `1-*-8`. The four scrolling columns select pattern, first count,
second count (solid subtype for pattern 4), and an optional radical filter.
The radical is not a fourth part of the SKIP code. Recorded alternates are
opt-in and labeled; kanji results use the existing detail sheets.

The attributed, pinned sidecar covers the source's 10,384 kanji records.
One invalid canonical source code and three invalid alternate codes are
preserved for provenance but excluded from strict matching. See the
[data contract, licensing record and verification commands](docs/operator/SKIP_LOOKUP_2026-09-14.md).
This lookup change does not alter the frozen specifications, old stripped
corpus, quiet writing room, or learning ledger.

```bash
node prototypes/corridor/tools/test-skip-core.mjs
node prototypes/corridor/tools/test-skip-packaging.mjs
node prototypes/corridor/tools/verify-skip-ui.mjs
node prototypes/corridor/tools/verify-skip-standalone.mjs
```

Historical prototypes remain runnable as history, not authority: Sites v11
(`npm --prefix prototypes/bunki-sites-v11 run dev`, source `prototypes/bunki-sites-v11/`) and the
preserved Sites v5 donor on `sites/v5-import`.

## Status

The repository holds one product prototype and one semantic authority: the
runnable corridor under `prototypes/corridor/`, and the deterministic Phase-0
kernel under `apps/` and `packages/` (the corridor is held to the kernel's laws
by contract parity — see ADR-004). Product features are real and interactive;
claims about efficacy, retention, or review burden remain outside the evidence
currently collected (REQ-GATE-03).

## Governing documents

The production plan links the current campaigns and accepted additions.
Earlier specifications under `docs/specs/` are frozen historical inputs. They are
hash-verified against `docs/specs/BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt` and
**must never be edited**:

| Document                                                          | Role                                                     |
| ----------------------------------------------------------------- | -------------------------------------------------------- |
| `BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md`     | original controller — historical work packages and tests |
| `BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md`      | design authority                                         |
| `BUNKI_PHASE0_MULTI_AGENT_BUILD_ORCHESTRATION_SPEC_2026-07-27.md` | who builds what, when                                    |

Architecture decisions live in `docs/adr/`. Preserve historical evidence in
`docs/build-evidence/`; write new local run output under `~/.dharma/` and CI
output to uploaded workflow artifacts. The native Codex goal executes the
current work; the superseded July goal JSON is historical state.

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
npm ci

npm run lint          # eslint, incl. the boundary rules above
npm run format:check  # prettier
npm run typecheck     # tsc --noEmit in every workspace
npm run test          # vitest, all workspaces

npm run test:replay   # golden replay equality (packages/domain)
npm run verify:export # export→replay equality (packages/export)
npm run test:e2e:build && npm run test:e2e   # Playwright suite on the exported web bundle

bash docs/build-evidence/renkan/battery.sh <outdir>   # the full gate battery

# Assemble the same static product that release checks exercise.
# The output must be a new absolute directory outside the checkout.
npm run bunki:web:build -- --out "$HOME/.dharma/kairo/site-candidate"
```

The replay, export, and e2e scripts are real gates (44 e2e tests across 12
specs on the exported bundle). The battery additionally runs the corridor verifiers
(`verify-corridor`, accessibility, writing-room, storage-integrity, drift,
AI runtime, mock assessments, KAGAMI, native readings) and the corpus pytest gates.
Use `KAIRO_SITE_DIR` to test an assembled site and `KAIRO_EVIDENCE_DIR` to direct
supported verifier reports outside the checkout. Deployment is owned by the
tested Pages workflow; the old `bunki:web:deploy` shortcut does not publish.

## Runtime honesty

Web results are never reported as native results. Native persistence, capture
loss, and latency numbers come only from on-device runs (WP-11) and are marked
UNVERIFIED until then.
