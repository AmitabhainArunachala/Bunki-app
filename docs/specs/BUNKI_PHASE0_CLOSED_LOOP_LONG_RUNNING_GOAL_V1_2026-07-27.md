---
title: "Bunki — Phase-0 Closed-Loop Long-Running Build /goal Controller v1"
date: 2026-07-27
project: bunki
artifact_type: long_running_goal_controller
version: v1.0
status: frozen_at_publication
executor: "a separate long-running coding agent (NOT the authoring context)"
design_authority:
  file: docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md
  sha256: 5ee28477054fc57f476e5e8cce8f4d35c5c309be5f21bac8adaf041ba91b0c55
repository: AmitabhainArunachala/Bunki-app
operator: John Shrader
---

# Bunki Phase-0 closed-loop build controller v1

You are a long-running autonomous coding agent. This document is your entire
runtime controller. Paste it into `/goal`, then execute it exactly. It is not
a summary or a roadmap: every requirement traces to a stable requirement ID in
the frozen converged v2 specification (your design authority), and you run
until the exact completion condition in §21 or one irreducible gate in §22.

## 0. Identity, authority, and integrity

1. Your design authority is the frozen v2 specification named in the YAML
   header. Before any other action, verify it:

   ```bash
   sha256sum docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md
   # must equal the sha256 in this controller's header. Mismatch = STOP
   # (integrity stop condition, §21.3). Report per §23; do not synthesize
   # a replacement spec.
   ```

2. Requirement IDs cited here (`REQ-*`, `P0-CAP-*`, `DL-*`, `OD-*`, `H*`)
   resolve inside that v2 file. `T-xx` are this controller's mandatory tests
   (§17). `WP-xx` are work packages (§19).
3. Never edit the v2 spec, either frozen v1, the convergence documents, the
   handoff, the recovery packet, or this controller. If you find a
   contradiction, record it in the evidence capsule, choose the
   conservative reading (the one that claims less), and surface it in your
   next report; if it materially alters Phase-0 scope, that is an operator
   gate (§21.3.8).
4. Never trust any SHA in this controller as the *live* repository state.
   Independently refresh live state at every ORIENT and REFRESH step.

## 1. Mission

Build and prove exactly one closed learning loop (REQ-PH-01):

> paste or select one provenance-labeled seeded encounter → immediate durable
> thread → bounded AI candidate explanation → explicit promotion → one stable
> retrieval contract → one contextual reuse → scored probe → finite session →
> inspect and export the evidence.

The deliverable is a working, tested Expo/React Native project in this
repository satisfying all fifteen Phase-0 capabilities `P0-CAP-01..15`, all
mandatory tests `T-01..T-17` (§17), and the engineering-completion half of the
success gates (REQ-GATE-01/02) — with the native checkpoint (WP-11) and
operator trial (WP-12) honestly gated where they exceed your environment.

**You optimize for one coherent vertical slice, not maximum parallel
activity.**

## 2. Non-goals (hard exclusions)

Everything in REQ-PH-02 is out of scope: no full JMdict/KANJIDIC2 import, no
production iOS Share Extension, no OCR/camera/audio/voice, no web/YouTube
scraping or Firehose connectors, no Postgres/sync/accounts/backend fleet, no
deployed Python service, no generalized conversation diagnosis, no
generalized journey compiler, no `ContentReadinessEstimate` ranking, no Anki
`.apkg` migration, no Observatory, no AI kanji art, no etymology
productization, no handwriting recognition, no curriculum, no social/
marketplace/subscription features, no efficacy claims. Preserve seams
(ports, event compatibility, policy-manifest types) without implementing
them. If a step seems to need one of these, you have mis-decomposed the
step; re-read the relevant WP.

## 3. Operating contract

You operate as this state machine:

`ORIENT → ADMIT → EXECUTE → VERIFY → REVIEW → WAIT-FOR-HUMAN-MERGE →
REFRESH-LIVE-MAIN → REVERIFY → CLOSE`

- **ORIENT:** refresh live repository state (`git fetch origin && git
  status && git log --oneline -10 origin/main`); read repository-local
  `AGENTS.md`, `CLAUDE.md`, onboarding, ownership, and CI rules before any
  edit; verify §0 integrity.
- **ADMIT:** complete WP-00 (§19). No other WP may start first.
- **EXECUTE:** work WPs in dependency order; small reviewable commits, each
  bound to a completed closure predicate or a coherent sub-step of one.
- **VERIFY:** run the full check set (§17.5) and record results verbatim in
  the evidence capsule.
- **REVIEW:** open/refresh the draft PR; keep it draft unless the operator
  explicitly changes readiness; never merge, self-approve, weaken
  protection, or bypass required checks.
- **WAIT-FOR-HUMAN-MERGE:** while waiting, you may EXECUTE a
  non-colliding WP (see per-WP parallelism), maintain the capsule, or stop
  cleanly if nothing safe remains.
- **REFRESH-LIVE-MAIN / REVERIFY:** after each merge, re-fetch main, rebase
  or restart the next branch from it, and re-run the affected checks on the
  merged state before claiming the WP closed.
- **CLOSE:** §21.1.

Rules (binding, from the handoff operating contract):

1. Branches: create `agent/bunki-phase0-closed-loop-<date-or-suffix>` (one
   active WP branch at a time per surface; suffix with the WP id, e.g.
   `agent/bunki-phase0-closed-loop-wp02`). **Never push to `main`.** Base
   every new branch on the latest fetched `origin/main`; if unmerged
   predecessors block you, stack explicitly and say so in the PR body.
2. All PRs are draft; human merge only.
3. Stage only task-owned files (`git add <explicit paths>`; never `git add
   -A` from the repo root); preserve unrelated changes.
4. Run and record: lint, format check, typecheck, unit, integration,
   replay, E2E, accessibility checks, build — and native checks when WP-11
   is executable (§17.5).
5. Keep all provider secrets out of git, logs, fixtures, and screenshots
   (§16).
6. Continue through recoverable failures (flaky installs, transient network,
   fixable test failures). Stop only at the completion condition or one
   precise irreducible gate after exhausting safe alternatives. Time
   expiry, context pressure, backlog size, or a merely failing test is
   neither completion nor an irreducible blocker.
7. After every material checkpoint, write the resumable evidence capsule
   (§23) to `docs/build-evidence/CAPSULE.md` (committed with the work).
8. A report counts as progress only if it closes a predicate, repairs a
   failing gate, produces exact-SHA evidence, or isolates one irreducible
   external action.

## 4. Admission and repository-bootstrap packet

The target repository **exists** (`AmitabhainArunachala/Bunki-app`, private,
default branch `main`) and currently contains documentation only (a README
plus `docs/`). There is no application code, no CI, no license file. WP-00
therefore performs admission against the live repo, and WP-01 bootstraps
project scaffolding **inside a PR**, never by pushing scaffolding to main.

Admission facts you must re-verify (do not trust this paragraph):

```bash
git fetch origin && git ls-tree -r origin/main --name-only
sha256sum docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md
cat docs/specs/BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt   # cross-check all spec hashes
node --version && npm --version                              # record toolchain
```

Operator-owned admission items (OD-09; surface, do not decide):

- confirmation that this repository is the authorized Phase-0 build target;
- repository license choice (currently deliberately undecided). **Until the
  operator chooses a license you may add code** (the repo is private) **but
  must not add any dependency or data whose license would constrain that
  choice beyond what v2 already accepts** (REQ-SRC-02 share-alike seed data
  is accepted by DL-33 and confined to `packages/seed/`), and must record
  `LICENSE: pending operator decision` in the capsule and README of any new
  package;
- deployment accounts (none needed in Phase 0; EAS/TestFlight would be a
  WP-11 operator gate).

## 5. Repository layout and ownership

Create exactly this layout (WP-01), an npm-workspaces monorepo at the repo
root. Ownership = which WP may modify the surface; touching a surface
outside your active WP's ownership is a collision violation.

```
package.json                 # workspaces root (WP-01)
tsconfig.base.json           # strict TS config (WP-01)
.github/workflows/ci.yml     # CI pipeline (WP-01; WP-10 may extend)
apps/app/                    # Expo app, web + native targets (WP-05/07/08/09 UI)
  app/                       # expo-router routes
  src/screens/               # screen components + state machines
  src/state/                 # app-side wiring of domain commands (no logic)
  e2e/                       # Playwright web E2E (WP-10)
packages/domain/             # @bunki/domain — PURE core (WP-02 then WP-06)
  src/events/                # versioned event types + schemas
  src/reducers/              # pure reducers incl. FSRS wrapper
  src/contracts/             # RetrievalContract types + validation
  src/evidence/              # evidence gate (sole EvidenceEvent factory)
  src/session/               # session orchestrator (pure planner)
  src/replay/                # replay + golden fixture harness
  test/
packages/persistence/        # @bunki/persistence (WP-03)
  src/port.ts                # EventStorePort + QueryPort interfaces
  src/sqlite/                # expo-sqlite adapter (native authority)
  src/web/                   # provisional web adapter (labeled)
  src/migrations/            # forward + verified rollback
packages/seed/               # @bunki/seed (WP-04)
  data/                      # JSON fixtures, per-field provenance
  LICENSES.md                # exact attributions (EDRDG/KanjiVG/Tatoeba)
packages/ai/                 # @bunki/ai (WP-07)
  src/envelope.ts            # candidate envelope schema
  src/provider/              # single remote provider behind interface
  src/fallback/              # scripted offline fallback fixtures
packages/export/             # @bunki/export (WP-03 with WP-09 UI hooks)
docs/build-evidence/         # capsules, test logs, screenshots (all WPs)
docs/adr/                    # architecture decision records (WP-01+)
```

Boundary rules (enforced by ESLint import rules + code review):

- `@bunki/domain` imports nothing from React, persistence, AI, Expo, or
  Node APIs; clock/ID/randomness are injected (REQ-ARCH-02).
- Only `@bunki/domain/src/evidence` constructs accepted `EvidenceEvent`s
  (REQ-ARCH-04). `@bunki/ai` output types are `Candidate*` and are not
  assignable to evidence types.
- `apps/app` contains no scheduling, grading, or evidence logic — it maps
  user interactions to domain commands and renders domain state.
- `apps/app` never calls `EventStorePort.append` directly: every append
  flows through the domain command handler, which routes evidence-class
  events through the evidence gate (lint-enforced import restriction on
  the persistence write path). This closes the gate-bypass hole.
- One scheduler implementation: the FSRS reducer inside `@bunki/domain`
  (REQ-SCH-01). Nothing else computes intervals.

## 6. Domain specification (WP-02, WP-06)

### 6.1 Event families (all versioned; `v: 1`; unknown versions fail closed — REQ-DM-04)

| Event | Required fields (beyond `eventId`, `v`, `occurredAt`, `idempotencyKey`) |
|---|---|
| `EncounterCaptured` | `encounterId`, `threadId` (new or existing), `text`, `span?`, `sourceRef`, `provenance` (REQ-SRC-01 fields), `uncertaintyMark?` |
| `ThreadPromotionChanged` | `threadId`, `from`, `to` (`captured\|keep\|learn\|master`), `origin` (`user\|nomination_accepted`) |
| `ContractCreated` | full REQ-DM-05 field set |
| `ReviewGraded` | `contractId`, `grade` (`again\|hard\|good\|easy`), `latencyMs`, `hintsUsed`, `revealedBeforeRecall`, `probeContext` (`standalone\|embedded`), `tier: "A"` |
| `ProductionObserved` | `contractId?`, `rubricId?`, `rubricVersion?`, `elicited: boolean`, `tier: "B"\|"C"` |
| `ExposureLogged` | `componentIds`, `experienceId`, `tier: "D"` |
| `LookupFrictionLogged` | `targetRef`, `context` |
| `CandidateAttached` | `threadId`, `candidateId`, envelope metadata (§9), `status: "generated"` |
| `CandidateAcceptedAsNote` | `candidateId`, `userAction: true` (never auto) |
| `EvidenceSuperseded` | `supersededEventId`, `reason`, `correction` |
| `SessionStarted` / `SessionClosed` | `sessionId`, `budget` / `completionState` |
| `DataExported` | `exportVersion`, `scope` |

### 6.2 Evidence gate (REQ-DM-06/07/08, REQ-SCH-06)

Pure function set, exhaustively unit-tested:

- only `ReviewGraded` with `tier === "A"` and a valid, promotion-active
  contract reaches the FSRS reducer (T-02, T-08);
- `revealedBeforeRecall === true` forces grade `again` regardless of
  submitted grade (T-06);
- `LookupFrictionLogged` never produces a grade (T-07);
- `ExposureLogged` never reaches FSRS (T-08);
- meaning and reading contracts are distinct contracts; a grade on one
  never mutates the other's `MemoryState` (T-05);
- `Candidate*` types cannot enter the gate (compile-time + runtime guard,
  T-09);
- `easy` requires `userConfirmedEasy: true` (REQ-DM-07).

### 6.3 FSRS pinning and replay (REQ-SCH-01, REQ-DM-04)

- Use `ts-fsrs`, exact-version pinned in `package.json` (no `^`/`~`);
  record version + parameter set in `packages/domain/src/reducers/
  fsrs-pin.ts` and in the capsule. Wrap it in `@bunki/domain`'s own reducer
  interface so a future version bump is an explicit, replay-tested
  migration.
- Desired retention default 0.90 (DL-13); expose no user slider in Phase 0.
- Golden replay: `packages/domain/test/fixtures/golden-*.json` event logs +
  expected derived state snapshots; `npm run test:replay` must prove
  identical derived state across repeated runs and across web/native
  adapters (T-03; WP-10 extends to E2E-produced logs).

### 6.4 Session orchestrator (REQ-SCH-04; P0-CAP-11)

Pure planner: input `{timeBudgetMin, dueContracts, newBudget, canvasId?}` →
finite plan (≤ budget) with the six-part shape collapsed for Phase 0 to:
reactivation/precision reviews → one bounded new item → one integration
canvas visit → closure. Output includes an explicit `SessionClosed`
completion state; the plan cannot grow during the session (T-13).

## 7. Persistence (WP-03)

- `EventStorePort`: `append(events, {idempotencyKey})`, `readAll()`,
  `readStream(threadId|contractId)`, `snapshot()`, `exportJson()`.
- Native adapter: `expo-sqlite`, single database, append-only event table +
  derived-state cache tables rebuilt from replay; WAL mode; migration
  runner with forward migrations and **verified rollback** (each migration
  ships a down-migration exercised in tests; destructive migration without
  verified rollback = stop condition §21.3).
- Web adapter: IndexedDB (or in-memory + localStorage snapshot if IndexedDB
  proves unstable in CI), **labeled provisional** in code, UI (about
  screen), and README (REQ-ARCH-05). Web persistence results are never
  reported as native persistence (P0-CAP-15 honesty).
- Durability tests: restart simulation per runtime actually claimed (T-16);
  idempotent re-append (same `idempotencyKey`) is a no-op.

## 8. Seed data (WP-04; P0-CAP-04, DL-33)

- Hand-assembled fixtures in `packages/seed/data/`: approximately 12–20
  lexemes, 8–12 kanji (must include 分 and 岐 to support the default
  canonical fixture 分岐 per OD-02), 2–3 grammar constructions, 6–10 example
  sentences, one KanjiVG-derived stroke SVG set for the seed kanji.
- Every field carries provenance per REQ-SRC-01. Sources: JMdict/KANJIDIC2
  subsets (EDRDG CC BY-SA 4.0 — attribution text verbatim in
  `LICENSES.md`), KanjiVG (CC BY-SA 3.0), Tatoeba sentences (CC BY 2.0 FR,
  per-sentence attribution), plus the operator's seeded encounter labeled
  with its real source.
- The UI never claims complete dictionary coverage; empty-search states say
  the dataset is a Phase-0 seed.
- Verify each license text against the primary source during WP-04 and
  record URLs + retrieval dates in `LICENSES.md`.

## 9. AI adapter (WP-07; P0-CAP-10, REQ-AI-02/03)

- Envelope (zod-validated): request `{taskClass: "T2", inputHash,
  promptFamilyId, promptVersion, threadContext (minimal), maxTokens}`;
  response `{candidateId, payload, model, provider, promptVersion,
  createdAt, checks: {targetFormPresent, isLabeled: true}}`.
- One remote provider behind `AiProviderPort`; API key via environment
  variable only (`.env` git-ignored; `.env.example` committed with no
  secret); requests time out at 10 s default and are cancellable; on
  timeout/offline the scripted fallback in `packages/ai/src/fallback/`
  serves a fixture-based candidate labeled `offline-fallback` (T-10, T-11).
- Candidates render with a visible "AI candidate / generated" label
  (T-12); accepting one is an explicit user action producing
  `CandidateAcceptedAsNote`; nothing in `@bunki/ai` can touch canonical
  fields or memory state (T-09).
- Log route class, latency, token counts, fallback use — without message
  content (§15).

## 10. Screens and states (WP-05/08/09; REQ-UI-01..06, REQ-UI-09)

Seven screens, each with defined loading/error/empty/offline states:

1. **Capture/search** — REQ-UI-01 flow; save acknowledgment is local and
   immediate; enrichment async.
2. **Word page** — REQ-UI-02 layers 0–1 fully; layers 2–3 as far as seed
   data allows, with provenance shown.
3. **Kanji page** — REQ-UI-03 layers 0–1; stroke animation from seed SVGs;
   indices never rendered.
4. **Session** — finite plan, progress, explicit completion (REQ-UI-05).
5. **Integration canvas** — one thematic passage embedding the promoted
   target; inline reveal/cloze interactions produce contract-conforming or
   exposure events per REQ-SCH-06.
6. **Evidence inspector** — REQ-UI-06: event chain, tiers, versions,
   supersession, correction affordance, export button.
7. **Repair branch (minimal)** — one hard-coded diagnostic→branch→rejoin
   flow for the seeded target (REQ-JRN-02 Phase-0 scope).

Typography/accessibility (WP-05, verified WP-10): ruby/furigana rendering,
Japanese line-breaking sanity, dynamic type survival, screen-reader labels
on all interactive elements, ≥44 pt touch targets, WCAG AA contrast in both
light/dark (REQ-UI-08/09). Automated: eslint-plugin accessibility rules +
Playwright axe scan on web (record scope honestly: web-only).

## 11. Export (WP-03/09; P0-CAP-12, REQ-ARCH-08)

`exportJson()` emits `{exportVersion: 1, generatedAt, events: [...],
seedRefs, appVersions: {domain, fsrs, schema}}` — complete, versioned,
lossless. `npm run verify:export` replays an export through the domain
reducer and asserts derived-state equality with the live store (T-14).
Provenance/license metadata survives the round trip (T-15).

## 12. Observability (WP-09; REQ-ARCH-07)

Local structured log (dev console + ring buffer surfaced in a debug screen):
event appends, command latencies, AI route/latency/fallback, persistence
timings. Never log encounter text, AI payloads, or secrets. Sufficient to
diagnose REQ-ARCH-06 latency budget misses.

## 13. Performance budgets (provisional — REQ-ARCH-06, H10)

Measure and record; never claim achieved numbers without measurement, and
label all results with the runtime they were measured on: local save ack
p95 ≤150 ms; warm lookup p95 ≤200 ms; capture-to-durable median ≤2 s / p95
≤4 s (native, WP-11 only); zero lost captures in a 100-trial
background/kill test (native, WP-11); five ordinary captures feel no slower
than the operator's current dictionary flow (operator-judged — belongs to
the WP-12 trial script). Web measurements are demonstration data only.

## 14. Dependency register (verify at WP-00; record in capsule)

Candidates with expected licenses — verify name/current version/license from
the npm registry at admission (`npm view <pkg> version license`) and pin
exact versions:

| Package | Purpose | Expected license |
|---|---|---|
| `expo` + `expo-router`, `react`, `react-native`, `react-native-web` | app shell | MIT |
| `expo-sqlite` | native persistence | MIT |
| `ts-fsrs` | FSRS-6 engine (wrapped, pinned) | MIT |
| `zod` | schema validation | MIT |
| `typescript`, `eslint`, `prettier` | toolchain | Apache-2.0 / MIT |
| `vitest` | unit/integration tests | MIT |
| `@playwright/test` | web E2E + axe scan | Apache-2.0 |

If a verified license differs from the expectation or is incompatible with
the operator's pending license choice (§4), record it and choose an
alternative or surface the gate — do not proceed silently. Confirm the
pinned `ts-fsrs` version implements FSRS-6 semantics from its own
documentation/changelog (primary source), and record the check.

## 15. Privacy and secrets (all WPs)

No secret in git history, logs, fixtures, screenshots, or PR bodies —
enforced by `.gitignore`, a pre-commit scan (`git diff --cached | grep -iE
'(api[_-]?key|secret|bearer)'` as a minimum), and review. Only seeded
fixture content may be sent to the AI provider in Phase 0 (OD-08 default).
A leaked secret = immediate stop-mutation (§21.3), revoke/rotate via
operator, scrub history before resuming.

## 16. Branch/commit/PR protocol (all WPs)

- Branch per WP: `agent/bunki-phase0-closed-loop-wpNN`.
- Commits: small, reviewable, message = what closed or advanced which
  predicate (e.g., `WP-03: sqlite adapter passes T-16 restart durability`).
- One draft PR per WP (or per contiguous WP pair when a single PR is more
  reviewable, stated in the body). PR body: WP purpose, closure-predicate
  status table, commands run + results, evidence paths, what is
  deliberately not done.
- Rollback: every WP is revertable by `git revert` of its merge commit;
  data-affecting changes (migrations) additionally ship tested
  down-migrations (§7).

## 17. Mandatory tests and negative assertions

### 17.1 Test map (all must exist and pass; IDs are traceability anchors)

| ID | Assertion (from v2/handoff) | Level |
|---|---|---|
| T-01 | Saving an encounter is immediate and durable (survives reload) | integration |
| T-02 | Capture does not activate FSRS until explicit promotion | unit |
| T-03 | Replaying the same events produces identical derived state | replay |
| T-04 | Unknown event versions fail closed | unit |
| T-05 | A missed reading does not erase known meaning | unit |
| T-06 | Reveal-before-recall grades `Again` | unit |
| T-07 | Lookup grades neither `Again` nor success | unit |
| T-08 | Passive/contextual exposure never updates FSRS | unit |
| T-09 | AI output cannot mutate canonical fields or memory state | unit + type-level |
| T-10 | Capture/lookup/review/export work with AI unavailable | integration |
| T-11 | A timed-out AI call neither loses nor blocks capture | integration |
| T-12 | Candidate/generated content is visually and structurally labeled | E2E |
| T-13 | Session reaches a finite completion state; queue cannot silently grow | unit + E2E |
| T-14 | Exported JSON is complete, versioned, and replays to identical state | integration |
| T-15 | Source/license/provenance metadata survives capture and export | integration |
| T-16 | Persistence survives restart/background on every claimed runtime | integration (per runtime) |
| T-17 | The exact closed loop passes one automated E2E flow (web) | E2E |

T-18 (operator puts a second real encounter through the loop without
developer intervention) is WP-12's gate, not an automated test.

### 17.2 Adversarial additions (WP-10)

Property/fuzz tests: random event interleavings preserve gate invariants;
malformed/hostile AI responses (oversized, mislabeled, schema-violating,
prompt-injection text) are rejected and never render unlabeled; double-tap/
concurrent capture produces exactly one thread (idempotency); clock skew
does not corrupt scheduling.

### 17.5 Check set (run at every VERIFY)

```bash
npm run lint && npm run format:check && npm run typecheck
npm run test            # unit + integration + replay, all workspaces
npm run test:e2e        # Playwright web flow incl. axe scan
npx expo export --platform web   # build proof
```

CI (`.github/workflows/ci.yml`, WP-01) runs the same set on every PR.
Record outputs verbatim (pass/fail counts) in the capsule.

## 18. Work-package DAG

Order: WP-00 → WP-01 → (WP-02 ∥ WP-04) → WP-03 → (WP-05 ∥ WP-06) → WP-07 →
WP-08 → WP-09 → WP-10 → WP-11 → WP-12 → WP-13. Parallel pairs are safe only
because their write surfaces are disjoint (per-WP ownership, §5); never
parallelize two WPs that both write `packages/domain`.

Common fields to read as defaults unless a WP overrides: branch/PR per §16;
rollback per §16; commands per §17.5; capsule update per §3.7.

### WP-00 — Integrity, orientation, authority, baseline receipt
- **Purpose/closure predicate:** v2 + integrity-file hashes verified; live
  `origin/main` state recorded (exact SHA + tree list); toolchain versions
  recorded; dependency register verified per §14; operator admission items
  (§4) surfaced in the capsule; `docs/build-evidence/CAPSULE.md` exists on
  the WP-00 branch. Closure = all six recorded with exact values.
- **Dependencies:** none. **Allowed surfaces:** `docs/build-evidence/` only.
- **Cost of wrong:** building against a corrupted spec — everything after
  is invalid. **Stop conditions:** hash mismatch (§0); repo unreachable.
- **Not done here:** any scaffolding, any dependency installation.

### WP-01 — Traceability freeze, ADR/schema freeze, acceptance-test plan, CI bootstrap
- **Closure predicate:** monorepo scaffolding (root `package.json`,
  workspaces, strict `tsconfig.base.json`, empty packages with README +
  ownership header) exists in a PR; root scripts `lint`, `format:check`,
  `typecheck`, `test`, `test:replay`, `test:e2e`, `verify:export` are
  defined (later WPs fill their implementations; undefined script names in
  this controller are a WP-01 defect); ADR-001 (layout/boundaries per §5)
  and ADR-002 (event schema v1 per §6.1) committed under `docs/adr/`; the
  T-01..T-17 plan committed as `docs/build-evidence/TEST_PLAN.md` mapping
  each test to its WP; CI runs lint+typecheck+test (trivially green) on
  the PR.
- **Scaffold commands (verify current templates at admission, then
  record):** `npx create-expo-app@latest apps/app` (or manual Expo config
  inside the workspace if the template fights the monorepo — record which),
  then hand-create `packages/*` per §5.
- **Dependencies:** WP-00. **Surfaces:** root config, `.github/`,
  `docs/adr/`, package skeletons.
- **Cost of wrong:** boundary erosion later; medium. **Parallelism:** none
  (root files).
- **Not done:** any feature logic.

### WP-02 — Pure domain kernel: events, reducers, deterministic golden replay
- **Closure predicate:** all §6.1 events typed + zod-validated; reducers for
  thread/promotion state; injected clock/ID; golden replay harness with ≥3
  fixtures; T-03, T-04 passing; `@bunki/domain` has zero platform imports
  (lint rule proves it).
- **Dependencies:** WP-01. **Surfaces:** `packages/domain/` only.
- **Cost of wrong:** highest in the project — every later WP consumes this.
  **Parallelism:** safe alongside WP-04.
- **Not done:** FSRS, evidence gate (WP-06); persistence (WP-03).

### WP-03 — Local persistence, migrations, idempotency, deletion, export
- **Closure predicate:** ports per §7; sqlite + provisional web adapters
  passing the same port contract-test suite; migration up/down tested;
  idempotent append tested; tombstone-then-purge deletion path tested;
  `@bunki/export` round-trip passing T-14 skeleton (T-01, T-16-web).
  Native T-16 execution belongs to WP-11.
- **Dependencies:** WP-02. **Surfaces:** `packages/persistence/`,
  `packages/export/`.
- **Cost of wrong:** silent data loss — high; stop condition on any
  unexplained loss or replay divergence (§21.3).
- **Not done:** sync, Postgres, encryption-at-rest, multi-device
  anything.

### WP-04 — Licensed seed data, field provenance, truth labels
- **Closure predicate:** §8 dataset committed; `LICENSES.md` complete with
  verbatim attributions + primary-source URLs + retrieval dates; every
  field carries provenance; a provenance-completeness test walks all seed
  records (feeds T-15).
- **Dependencies:** WP-01 (parallel with WP-02). **Surfaces:**
  `packages/seed/` only.
- **Cost of wrong:** license contamination — high; stop condition if a
  needed asset's license cannot be verified (§21.3: unresolved licensing).
- **Not done:** full JMdict/KANJIDIC2 import; any scraped content.

### WP-05 — Capture/search/save fast path and layered word/kanji pages
- **Closure predicate:** screens 1–3 of §10 functional on Expo Web against
  seed data; capture flow meets REQ-UI-01 (ack before enrichment); layers
  render with provenance; loading/error/empty/offline states implemented;
  screenshot evidence saved under `docs/build-evidence/`.
- **Dependencies:** WP-02, WP-03, WP-04. **Surfaces:** `apps/app/` only.
- **Parallelism:** safe alongside WP-06 (domain) — collision boundary: WP-05
  may consume but not modify `packages/domain`.
- **Not done:** conversation UI; vertical-text mode; any layer-2/3 content
  the seed cannot support honestly.

### WP-06 — RetrievalContract, evidence gates, Keep/Learn/Master, pinned FSRS
- **Closure predicate:** §6.2 gate complete; contracts per REQ-DM-05; FSRS
  pin per §6.3 with recorded version/params; promotion flow per REQ-DM-09;
  T-02, T-05, T-06, T-07, T-08 passing; meaning/reading as separate
  contracts demonstrated in fixtures.
- **Dependencies:** WP-02. **Surfaces:** `packages/domain/` only.
- **Cost of wrong:** epistemic core corrupted — highest severity class.
- **Not done:** per-user FSRS parameter fitting; Tier-B/C learner-state
  math beyond logging the events.

### WP-07 — Bounded AI candidate path with offline/scripted fallback
- **Closure predicate:** §9 adapter complete; T-09, T-10, T-11, T-12
  passing; candidate UI labeled; env-only key handling verified; fallback
  fixtures cover the seeded target.
- **Dependencies:** WP-05, WP-06. **Surfaces:** `packages/ai/`, plus the
  candidate UI slice of `apps/app/`.
- **Stop condition:** any path where AI output reaches canonical/memory
  state (§21.3: evidence-boundary bypass).
- **Not done:** streamed conversation (T3); multi-provider routing;
  anything beyond the one bounded exchange.

### WP-08 — Contextual reuse, one repair branch, evidence-defined rejoin, finite session
- **Closure predicate:** integration canvas + session + minimal repair
  branch (§10.4/5/7) functional; embedded interactions classified per
  REQ-SCH-06 (declared probe vs exposure) and tested; T-13 passing;
  session completion produces `SessionClosed`.
- **Dependencies:** WP-05, WP-06, WP-07. **Surfaces:** `apps/app/`,
  session module in `packages/domain/src/session/`.
- **Not done:** generalized journey routing; adaptive session-mixture
  logic (H9 is not Phase 0).

### WP-09 — Evidence ledger UI, correction/supersession, observability
- **Closure predicate:** evidence inspector (REQ-UI-06) shows the full
  chain for the seeded thread; correction produces `EvidenceSuperseded`;
  export button wired (T-14, T-15 full); §12 observability in place.
- **Dependencies:** WP-06, WP-03 (parallel with WP-08 where surfaces are
  disjoint screens). **Surfaces:** `apps/app/` inspector screen,
  `packages/export/` UI hooks.
- **Not done:** global calibration dashboard; any aggregate mastery view.

### WP-10 — Integrated web loop and adversarial test matrix
- **Closure predicate:** T-17 E2E green in CI (full REQ-PH-01 loop on
  Expo Web); §17.2 adversarial suite green; accessibility scan green with
  recorded scope; full §17.5 set green on the merged integration branch;
  performance measurements recorded per §13 (web-labeled).
- **Dependencies:** WP-02..WP-09 merged. **Surfaces:** `apps/app/e2e/`,
  CI config, fixes anywhere with owner-WP review notes in the PR.
- **Not done:** native measurements (WP-11); performance claims beyond
  web-labeled data.

### WP-11 — Native iPhone SQLite and incoming-capture proof
- **Closure predicate (environment-dependent):** iOS development build runs
  the same event fixtures on native SQLite; T-16 native + capture-loss and
  latency measurements per §13 recorded from the device; share-in spike
  documented (clipboard/deep-link acceptable; production extension
  forbidden — REQ-PH-02).
- **If you lack macOS/Xcode/device access:** do not simulate or claim.
  Close WP-11 as **EXTERNAL-GATE: documented** — commit
  `docs/build-evidence/WP11_NATIVE_CHECKPOINT.md` with the exact build/run/
  measure instructions for the operator, and mark native verification
  UNVERIFIED in the capsule and PR (P0-CAP-15). This is the honest closure.
- **Dependencies:** WP-10. **Cost of wrong:** claiming unmeasured native
  behavior — a REQ-GATE-03 violation.

### WP-12 — Operator field trial and explicit continue/pivot/stop result
- **Closure predicate:** trial script committed (capture a *real* second
  encounter end-to-end, T-18; REQ-GATE-01 checklist); operator runs it and
  their verdict (continue/pivot/stop + notes) is recorded verbatim in
  `docs/build-evidence/OPERATOR_TRIAL.md`. **This WP is an operator gate:**
  your closure is delivering the runnable trial + request; the verdict
  itself is irreducibly the operator's.
- **Dependencies:** WP-10 (WP-11 native if available, else web trial with
  the limitation stated).
- **Not done:** any efficacy, retention, or burden-reduction claim from
  trial results (REQ-GATE-03; H2 measures desire-to-continue only).

### WP-13 — Independent audit, exact-merged-main verification, closure receipt
- **Closure predicate:** on freshly fetched merged `main`: full §17.5 set
  re-run and green; export→replay verified; every P0-CAP and T-xx status
  tabulated with exact SHAs; an independent review pass (fresh agent or
  operator-designated reviewer) finds no unresolved P0/P1 issue — its
  findings and resolutions recorded; final capsule + closure receipt
  committed (`docs/build-evidence/CLOSURE_RECEIPT.md`).
- **Dependencies:** WP-12. **Not done:** merging anything yourself.

## 19a. What "improving the decomposition" permits

You may split a WP into sub-branches or reorder *within* dependency
constraints. You may not: merge WPs across an operator gate, delete a
closure predicate, weaken a test, or reclassify an exclusion (§2) as
in-scope.

## 20. Scientific and product claim boundaries

REQ-GATE-03 binds all code, UI copy, comments, PR text, and reports. In
particular: no "reduced review burden" claims (H4 untested); no comprehension
percentages; no global level; no "scientifically optimized"; AI grades stay
provisional; FSRS presence is never cited as product efficacy.

## 21. Completion, blockage, and stop conditions

### 21.1 DONE

Every closure predicate of WP-00..WP-10 and WP-13 passes on refreshed merged
`main`; WP-11 is either device-verified or honestly EXTERNAL-GATE-documented;
WP-12's trial is delivered and the operator verdict recorded; exported data
replays successfully; all receipts bind to exact SHAs; the independent review
finds no unresolved P0/P1 issue. Engineering completion (REQ-GATE-02) is the
only stratum you may declare yourself.

### 21.2 BLOCKED

Allowed only after safe alternatives are exhausted, recording: the one
precise irreducible blocker, evidence, impact, owner, and the smallest
operator action. Waiting on human merge or the WP-12 verdict is WAIT, not
BLOCKED.

### 21.3 Immediate stop-mutation triggers

(1) frozen-input integrity failure (§0); (2) missing edit or merge
authority; (3) unresolved source licensing entering fixtures or product
data; (4) unexplained data loss or replay divergence; (5) canonical AI
writes bypassing the evidence boundary; (6) secret or privacy exposure;
(7) destructive migration without verified rollback; (8) an operator
decision whose alternatives materially alter Phase 0. On trigger: stop
writes, capture state in the capsule, report per §23.

### 21.4 Kill criteria (architecture honesty)

If during WP-10 an architectural element demonstrably fails to beat a
cheaper baseline within Phase-0 scope (e.g., derived-state caches vs direct
replay; the repair-branch flow vs a plain review), simplify or delete it
and record the decision — do not protect elegance (REQ-HYP-01 preamble).

## 22. Operator gates, ranked

1. **Admission (blocks WP-01+):** confirm build-target repository (OD-09).
2. **Admission-adjacent (blocks nothing yet, constrains dependencies):**
   license choice (OD-09; §4 rule applies meanwhile).
3. **Execution (blocks WP-07 live path only):** AI provider key + budget
   cap (OD-08). Fallback path lets WP-07 close without it; live-call
   evidence then remains open.
4. **Native verification (blocks WP-11 device closure):** macOS/Xcode/
   device or TestFlight access.
5. **Acceptance (blocks WP-12 verdict):** operator trial.
6. **Later phases (blocks nothing in Phase 0):** OD-01..OD-07 as listed in
   the v2 §19 defaults.

## 23. Resumable evidence capsule (after every material checkpoint)

`docs/build-evidence/CAPSULE.md`, always containing: current exact SHA
(branch + origin/main); completed WPs with predicate status; active WP and
next safe command; open PRs + who owns the merge; test/evidence artifact
paths; unresolved risks; precise blocker + smallest operator action (if
any); dependency/toolchain versions; FSRS pin + parameters. A fresh agent
must be able to resume from the capsule plus this controller with no
narrative guesswork.

## 24. Reporting

Report to the operator at WP closures and at any gate/stop: exact branch,
commit, tree state, commands run with verbatim result summaries, closed and
remaining predicates, remaining gates ranked, and the single smallest next
operator action. Never report progress that fails §3.8's definition.
