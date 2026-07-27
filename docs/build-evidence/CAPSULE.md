# Bunki build evidence capsule (resumable; controller §23)

## Current state
- Wave: W0 (WP-00 admission) — CLOSED this commit; W1 next
- origin/main: 852f5be18a40e66dbb89ad9a877649c349ceee0a (specs landed via PR #3; integrity self-check of all 14 files: OK, run 2026-07-27 against main's exact tree)
- Active branch: agent/bunki-phase0-closed-loop-wp00
- Design authority verified: v2 spec sha256 5ee28477054fc57f476e5e8cce8f4d35c5c309be5f21bac8adaf041ba91b0c55; controller de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47 (launcher expected-hash match)

## Operator authorizations (verbatim, 2026-07-27, session chat)
- OD-09: "Yes decide later and for now launch the full build" → build target AmitabhainArunachala/Bunki-app CONFIRMED; license: DECIDE LATER (rule: no dependency/data may constrain the future choice beyond v2-accepted share-alike seed data confined to packages/seed/)
- Staffing: "And staff at 20!! Design, reviewers, verifies, code detail all of it" → FULL-20 configuration (orchestration spec §1)
- Merge cadence: operator ordered continuous full build; Conductor adopts the orchestration spec §3 integration-branch flow (INT maintains agent/bunki-phase0-integration; draft PRs to main at wave boundaries for human merge). Operator may veto and switch to per-wave merges at any time.
- Deviation recorded: Conductor duties are executed by the operator's own session agent (Fable 5) rather than a separate Opus instance — implied by the operator issuing the launch order directly to this session. Builders/verifiers/testers are Opus per binding.

## WP-00 closure predicate status (controller §18)
- [x] v2 + integrity hashes verified (all 14 files OK on main tree)
- [x] Live origin/main recorded: 852f5be, tree = README + docs/{convergence,handoffs,specs}
- [x] Toolchain: node v22.22.2, npm 10.9.7, git 2.43.0 (linux)
- [x] Dependency register verified from npm registry 2026-07-27: expo 57.0.8 MIT; expo-router 57.0.8 MIT; react 19.2.8 MIT; react-native 0.86.0 MIT; react-native-web 0.21.2 MIT; expo-sqlite 57.0.1 MIT; ts-fsrs 5.4.1 MIT; zod 4.4.3 MIT; typescript 7.0.2 Apache-2.0; vitest 4.1.10 MIT; @playwright/test 1.62.0 Apache-2.0; eslint 10.8.0 MIT; prettier 3.9.6 MIT. All compatible with license-decide-later rule.
- [x] Operator admission items surfaced and ANSWERED (see authorizations above)
- [x] Capsule exists (this file)
- Carry-over check assigned to WP-06 builder: confirm ts-fsrs@5.4.1 implements FSRS-6 semantics from its primary-source docs/changelog before pinning (controller §14).

## Next safe command
- Open W1: builder B1 executes WP-01 (scaffold, ADR-001/002, TEST_PLAN, CI) on agent/bunki-phase0-closed-loop-wp01; verifier V1 re-verifies from clean checkout.

## Open PRs / blockers
- None. WP-11 (native device) and W7 (Codex 5.6 pass) remain external gates; W8 operator trial pending build.

<!-- ===== APPEND-ONLY: one section per agent (orchestration spec §2.6) ===== -->

## WP-01 / Builder B1 — W1 (appended 2026-07-27)

**File provenance:** this branch was cut from `origin/main` (852f5be), which does
not carry `CAPSULE.md`. The WP-00 section above is reproduced **verbatim** from
`origin/agent/bunki-phase0-closed-loop-wp00:docs/build-evidence/CAPSULE.md`
(sha256 of that blob: `5c8aac4c577fcb415bf783e28433b80b4b3f7f14e7c1fc1720b4e0e1d23ca3e5`,
byte-identical copy verified). This branch's version is a strict superset; on
merge, prefer it over a bare WP-00 copy.

### Integrity (re-verified this session, not trusted from documents)
- Controller sha256 observed: `de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47` — matches the launcher's expected value.
- Read in full before first edit: controller (§5 layout, §6 domain, §17.5 checks, §18 WPs), orchestration spec §2 + §4, launcher, WP-00 capsule.

### State
- Branch: `agent/bunki-phase0-closed-loop-wp01`, based on `origin/main` @ `852f5be18a40e66dbb89ad9a877649c349ceee0a`
- Toolchain: node v22.22.2, npm 10.9.7
- Wave: W1. WP-01 predicate met in full on this branch; awaiting V1 verification and human merge.

### WP-01 closure predicate status (controller §18)
| Predicate item | Status | Evidence |
|---|---|---|
| Monorepo scaffolding, workspaces, strict `tsconfig.base.json`, package skeletons with README + ownership header | met | `package.json`, `tsconfig.base.json`, `packages/*/README.md`, `apps/app/README.md` |
| Root scripts `lint`, `format:check`, `typecheck`, `test`, `test:replay`, `test:e2e`, `verify:export` defined | met | `package.json`; all seven run |
| ADR-001 (layout/boundaries per §5) | met | `docs/adr/ADR-001-layout-and-boundaries.md` |
| ADR-002 (event schema v1 per §6.1) | met | `docs/adr/ADR-002-event-schema-v1.md`; §6.1 table verified verbatim, 15/15 rows |
| T-01..T-17 plan mapping each test to its WP | met | `docs/build-evidence/TEST_PLAN.md` |
| CI runs lint+typecheck+test (trivially green) on the PR | met | `.github/workflows/ci.yml`, node 22, `npm ci`; also runs `format:check` |

### Commands run (verbatim results)
| Command | Result |
|---|---|
| `npm ci` | clean install from lockfile, 700 packages |
| `npm run lint` | pass, 0 problems |
| `npm run format:check` | pass, "All matched files use Prettier code style!" |
| `npm run typecheck` | pass, 6/6 workspaces, 0 errors |
| `npm run test` | pass, 6 test files, **14/14 tests** |
| `npm run test:replay` | placeholder, exit 0, prints "not yet implemented (WP-02)" |
| `npm run verify:export` | placeholder, exit 0, prints "not yet implemented (WP-03)" |
| `npm run test:e2e` | placeholder, exit 0, prints "not yet implemented (WP-10)" |
| `(cd apps/app && npx expo export --platform web)` | **pass** — 3 static routes (`/`, `/_sitemap`, `/+not-found`), bundle 1.1MB, `Exported: dist` |

### Boundary rules proven by probe (not assumed)
**CORRECTION (repair round, see below).** These five probes were real and their
results below are accurate, but they covered only the **bare package-specifier
form**, so the conclusion drawn from them — that the §5 boundaries held — was
over-claimed. V1 demonstrated that deep relative paths and dynamic `import()`
walked straight through. Superseded by the 26-case suite in
`test/boundaries.test.ts`. Original five retained for the record:
- `packages/domain/src` importing `react`, `node:fs`, `@bunki/persistence` → 3 errors
- `apps/app` importing `@bunki/persistence` → 1 error
- `packages/export` importing `ts-fsrs` → 1 error
- **negative control:** `packages/domain/src` importing `ts-fsrs` → clean (exit 0), so the rule permits the one legitimate call site.

### Deviations from the WP-00 pinned register (surfaced, not silent)
1. **`typescript` 6.0.3, not the capsule's 7.0.2.** 7.0.2 is not installable with the rest of the verified register: `typescript-eslint@8.65.0` declares `peer typescript ">=4.8.4 <6.1.0"`, and Expo SDK 57's template pins `~6.0.3`; `npm install` fails `ERESOLVE`. 6.0.3 is the highest version both accept. Recoverable conflict with a safe alternative (controller §3.6), **not** a §21.3 trigger — no license changed, no integrity check failed. Rationale in ADR-001. Revisit when typescript-eslint ships TS 7 support.
2. **`react` / `react-dom` 19.2.3, not the capsule's 19.2.8.** Expo SDK 57's own template resolves React at 19.2.3 against `react-native@0.86.0`; 19.2.3 is what the working export was built and proven with. Same minor line, no API delta relevant to Phase 0.
3. **`react-native-web` 0.21.2 and `expo-sqlite` 57.0.1 honoured as pinned**; `expo` 57.0.8, `expo-router` 57.0.8, `react-native` 0.86.0, `eslint` 10.8.0, `prettier` 3.9.6, `vitest` 4.1.10 all pinned exactly as recorded. `expo-sqlite`, `ts-fsrs@5.4.1`, `zod@4.4.3` are **not yet installed** — they belong to WP-02/WP-03 and installing them at WP-01 would be feature work.
4. **`@playwright/test@1.62.0` deliberately not installed.** `test:e2e` is a placeholder and `apps/app/e2e/` is WP-10's surface; WP-10 installs it at that exact pinned version.

### Scaffold path taken (controller WP-01 requires this recorded)
`npx create-expo-app@latest apps/app --template default --no-install --no-agents-md`, **then restructured**, because the template fought both the monorepo and the §5 layout:
- template routes live in `src/app/`; §5 mandates `apps/app/app/` → moved, and added `src/screens/`, `src/state/`, `e2e/`;
- template metro config assumes a single-package repo → committed `metro.config.js` adds `watchFolders` + explicit `nodeModulesPaths` and disables hierarchical lookup;
- template ships Expo's own MIT `LICENSE` → **removed**, since repo license is a pending operator decision (OD-09) and committing one would pre-empt it;
- template pins with `~` ranges → all repinned exact per §14;
- template demo tabs/themed components/tutorial assets/`.vscode/` removed as WP-05 would have had to delete them anyway.
  - **CORRECTION (repair round, see below).** This bullet originally also
    claimed "Expo-branded images" were removed. That was **false** at
    `8ada17e`..`3879866`: the same commit added all five Expo-branded PNGs
    (900,619 bytes) and `app.json` wired them in as the app icon, Android
    adaptive icon, and web favicon. Corrected in the repair round by replacing
    them with generated assets; the original wording is preserved here so the
    record shows a correction rather than a silent rewrite.

### Secrets check (controller §15)
Staged diff scanned for `api[_-]?key|secret|bearer|password|token` (excluding lockfile/binaries): **0 matches**. No `.env` committed; `.gitignore` excludes `.env`/`.env.*` while permitting `.env.example` (WP-07 adds it, with no secret).

### Surfaces touched (WP-01 ownership only)
`package.json`, `package-lock.json`, `tsconfig.base.json`, `eslint.config.mjs`, `vitest.config.ts`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `README.md`, `scripts/`, `packages/*` (skeletons), `apps/app/`, `.github/workflows/ci.yml`, `docs/adr/`, `docs/build-evidence/{TEST_PLAN.md,CAPSULE.md}`. **No frozen doc touched** (`docs/specs/`, `docs/convergence/`, `docs/handoffs/` untouched; also added to `.prettierignore` so no future `format --write` can rewrite them).

### Next safe command
- V1 verifies WP-01 from a clean checkout of this branch: `npm ci && npm run lint && npm run format:check && npm run typecheck && npm run test && (cd apps/app && npx expo export --platform web)`, then walks the predicate table above.
- On merge, open W2: WP-02 (domain kernel) ∥ WP-04 (seed) — disjoint surfaces, safe in parallel.

### Open items carried forward
- WP-06 builder still owes the controller §14 check that `ts-fsrs@5.4.1` implements FSRS-6 semantics per its primary-source docs/changelog (inherited from WP-00).
- Repository license remains **pending operator decision** (OD-09); recorded in every package README.
- `test:replay`, `verify:export`, `test:e2e` are placeholders. Leaving one in place past its owning WP (WP-02 / WP-03 / WP-10) is a closure-predicate failure for that WP.
- Native verification (T-16 native, §13 device numbers) remains **UNVERIFIED** — WP-11 only.

## WP-01 / Builder B1 — W1 repair round after V1 (appended 2026-07-27)

Both V1 findings were **P1 and both are fixed**. Controller hash re-verified
before the first edit: observed
`de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47`, matches the
launcher. Base for this round: `3879866a900907e26093b709d3f3dfef1cd72cd0`.

### P1-1 — Expo-branded template artwork shipped as the product's identity

**Reproduced.** All five PNGs added by `8ada17e` were Expo's chevron logo
(inspected visually, not inferred from filenames), wired in at `app.json` lines
7, 19–21, 26, while the commit message and the capsule both claimed
Expo-branded images had been removed.

**Fix — option (a), replacement.** `scripts/generate-app-icons.mjs` generates
all five from geometry defined in this repository: a stem forking into two
terminating nodes (分岐, "branching"), slate `#0F172A` / `#F8FAFC`, no
third-party asset input, so nothing constrains OD-09. `app.json` keeps pointing
at the same paths; its `adaptiveIcon.backgroundColor` moved from the template's
`#E6F4FE` to `#0F172A` to match the generated background layer. Total icon
weight 900,619 → 34,219 bytes. The mark is an explicit placeholder — the
operator or WP-13 may replace it, and nothing depends on its appearance.

The two false claims are corrected **in place and marked as corrections** (see
"Scaffold path taken" and "Boundary rules proven by probe" above); the original
wording is preserved so the record shows a correction, not a silent rewrite.

### P1-2 — §5 boundaries enforced only against the bare specifier form

**Reproduced at `3879866` before changing anything.** All four bypasses exited
0: `apps/app` → `../../../../packages/persistence/src/index.ts`;
`packages/domain/src` → `() => import('react-native')`; → `() =>
import('@bunki/persistence')`; and one V1 did not list —
`packages/domain/src` → `../../persistence/src/index.ts` (sibling-relative,
which no safe glob catches).

**Fix.** `eslint.config.mjs` now enforces each boundary twice:
`no-restricted-imports` (bare specifiers + `<globstar>/packages/<pkg>` deep
paths) and a new local rule `bunki/package-boundaries` that resolves each
specifier against the importing file and asks which package it lands in.
Resolver-based, so exact; visits `ImportDeclaration`, `ExportNamedDeclaration`,
`ExportAllDeclaration`, `ImportExpression`, and `require()`. Both read the same
lists. **No new dependency** — the pinned §14 register is untouched.
Boundary globs extended to `.js/.jsx/.mjs/.cjs` (the TS `require` ban is off in
plain JS, a fourth bypass).

Rationale for a local rule over `eslint-plugin-import`'s `no-restricted-paths`:
adding a dependency at WP-01 would change the WP-00 pinned register and pull a
new license into an OD-09-pending repo, for behaviour ~40 lines provide.

**Latent defect found while fixing this, not in V1's report.** Import patterns
match with gitignore semantics, so the unanchored builtin pattern `events` also
matched `./events/index.ts` — and controller §5 *mandates*
`packages/domain/src/events/`. WP-02's first intra-package import would have
been a lint error with no legitimate way to satisfy it. Fixed by anchoring all
bare-specifier patterns (`/events`), verified against 17 pattern/specifier
pairs. Regression cases are in the suite.

**The probe set is now a test, not a transcript** (V1 asked for it recorded in
ADR-001; recording it as an executable suite is strictly stronger).
`test/boundaries.test.ts` runs the real `eslint.config.mjs` over 26 cases — ten
bypass forms plus negative controls. Root `tsconfig.json` added so those files
are typechecked; without it they would have been the only `.ts` in the repo
`npm run typecheck` never saw.

| Probe (all previously clean at `3879866`) | After |
|---|---|
| `apps/app` → deep path into `packages/persistence` | error (both rules) |
| `packages/domain/src` → `../../persistence/src/index.ts` | error |
| `packages/domain/src` → `() => import('react-native')` | error |
| `packages/domain/src` → `() => import('@bunki/persistence')` | error |
| `packages/domain/src` → `require('react-native')` in `.js` | error |
| negative control: `packages/domain/src` → `ts-fsrs` | clean |
| negative control: `packages/domain/src` → `./events/index.ts` | clean (was error) |

Orchestration §6's Codex bypass audit — "UI direct `EventStorePort.append`" —
would have returned REFUTED at `3879866`; it now returns CONFIRMED.

### Commands re-run this round (verbatim results)
| Command | Result |
|---|---|
| `npm ci` | clean install from lockfile |
| `npm run lint` | **pass**, 0 problems |
| `npm run format:check` | **pass**, "All matched files use Prettier code style!" |
| `npm run typecheck` | **pass**, root + 6/6 workspaces, 0 errors |
| `npm run test` | **pass**, 7 test files, **40/40 tests** (was 6 files / 14 tests) |
| `npm run test:replay` / `verify:export` / `test:e2e` | placeholders, exit 0, unchanged |
| `(cd apps/app && npx expo export --platform web)` | **pass** — 3 static routes, bundle 1.1MB, `Exported: dist`; `favicon.ico` built from the generated favicon |

### Surfaces touched this round (WP-01 ownership only)
`eslint.config.mjs`, `vitest.config.ts`, `package.json` (typecheck script),
`tsconfig.json` (new), `test/boundaries.test.ts` (new),
`scripts/generate-app-icons.mjs` (new), `apps/app/app.json`,
`apps/app/assets/images/*.png` (5, regenerated), `docs/adr/ADR-001…`,
`docs/build-evidence/CAPSULE.md`. **No frozen doc touched.** No secrets: the
diff adds no credential-shaped string; the PNGs are generated output.

### Next safe command
- V1 re-verifies from a clean checkout: `npm ci && npm run lint && npm run format:check && npm run typecheck && npm run test && (cd apps/app && npx expo export --platform web)`, then re-runs its own bypass probes — they should now error — and confirms `apps/app/assets/images/` carries no third-party artwork.
- On merge, open W2: WP-02 (domain kernel) ∥ WP-04 (seed).

### Open items carried forward (unchanged unless noted)
- WP-06 still owes the §14 `ts-fsrs@5.4.1` FSRS-6 primary-source check.
- Repository license remains **pending operator decision** (OD-09). The icon set no longer bears on it.
- `test:replay`, `verify:export`, `test:e2e` remain placeholders.
- Native verification remains **UNVERIFIED** — WP-11 only.
- **New, for whoever owns identity:** the app mark is a deliberate placeholder. It is not a designed identity and makes no claim to be one.

## WP-02 / Builder B2 — W2 (appended 2026-07-27)

Append-only section per orchestration spec §2.6. Nothing above this line was edited.

### Integrity (re-verified this session against `origin/main`, not trusted from documents)

| File                                                                                | SHA-256 observed                                                   | Matches integrity record |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------ |
| `docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md`             | `de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47` | yes (launcher step 1)    |
| `docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md`              | `5ee28477054fc57f476e5e8cce8f4d35c5c309be5f21bac8adaf041ba91b0c55` | yes                      |
| `docs/specs/BUNKI_PHASE0_MULTI_AGENT_BUILD_ORCHESTRATION_SPEC_2026-07-27.md`         | `4163184050f6797e9e1e766c68fed112b73eca4c85e29031d83635d212155a71` | yes                      |
| `docs/specs/BUNKI_PHASE0_DEFINITION_OF_DONE_2026-07-27.md`                           | `92e575e14e5cd61556794e681c9804a0e156873ec60c9ae94eb936682c75155e` | yes                      |
| `docs/specs/BUNKI_V2_PHASE0_TRACEABILITY_MATRIX_2026-07-27.md`                       | `a32e6be17c5cdbb4e88b5e3674a735db41886f82e66234b792bc303084ec942c` | yes                      |
| `docs/specs/BUNKI_PHASE0_RISK_AND_FALSIFICATION_REGISTER_2026-07-27.md`              | `3279cf0cf90b58cc17e8f05dbafb71aaeae3f311bbaceeb09dca2700d9af16e7` | yes                      |

No mismatch. No stop-mutation trigger (§21.3) encountered.

### State

- Branch: `agent/bunki-phase0-closed-loop-wp02`, head `d4ce8f84ccf370b703b7d880cc1c65ced1bdb2ac`
- Base (see stacking appendix below): `origin/agent/bunki-phase0-integration` @ `f53ce4bd91dccd4cf7587b8b1bd2f5fff6fe6ca4`
- `origin/main` at session start and end: `bbaf0b31a0f469d6e7f26b4a0855bf8f3b787c78`
- Toolchain: node `v22.22.2`, npm `10.9.7`
- Five commits, all prefixed `WP02(B2):`

### Stacking appendix (required by the W2 launch note; controller §3 rule 1)

WP-01's scaffolding is **not yet on `main`** — PR #5 is open and awaiting human
merge. Controller §3 rule 1 says to base every branch on the latest fetched
`origin/main` and, when unmerged predecessors block that, to stack explicitly and
say so.

WP-02's closure predicate names WP-01 as its dependency and cannot be built
against a tree with no `packages/domain`, no `tsconfig.base.json`, and no lint
boundary to keep green. So this branch is cut from
`origin/agent/bunki-phase0-integration` @ `f53ce4b`, which carries the
V1-verified WP-01 scaffold, **not** from `origin/main`. The PR body states the
same. On merge of #5 this branch must be rebased onto refreshed `main` and the
§17.5 set re-run before WP-02 is claimed closed (controller §3
REFRESH-LIVE-MAIN / REVERIFY).

### WP-02 closure predicate status (controller §18 WP-02)

| #   | Predicate clause                                                                                     | Status  | Evidence                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | All §6.1 events typed + zod-validated, versioned `v:1`, envelope `eventId`/`occurredAt`/`idempotencyKey` | **met** | `packages/domain/src/events/catalog.ts` (15 families), `envelope.ts`; `test/events/catalog.test.ts` asserts the implemented set equals the spec list, written out independently of the code                                                                                             |
| 1b  | Unknown versions FAIL CLOSED — typed error, never a silent skip (T-04)                                | **met** | `src/events/parse.ts` (version checked before payload); `test/events/fail-closed.test.ts` — 23 assertions incl. "never returns a shorter log than it was given"                                                                                                                        |
| 2   | Pure reducers for thread state and promotion state, event-driven only                                  | **met** | `src/reducers/promotion.ts`, `src/reducers/thread.ts`; `test/reducers/*.test.ts` (38 assertions)                                                                                                                                                                                       |
| 2b  | No FSRS, no evidence gate, no session logic; clearly-marked seams                                      | **met** | `src/reducers/seams.ts` (`PHASE0_SEAMS`, four seams with owner/directory/rationale/anchors); `test/purity/seams-left-empty.test.ts` asserts `src/contracts`, `src/evidence`, `src/session` still hold only `.gitkeep`, that `ts-fsrs` is not installed, and that derived state carries no scheduling field |
| 3   | Injected clock/ID/randomness via a `DomainContext`; nothing calls `Date.now`/`Math.random`/`crypto`     | **met** | `src/context/index.ts` + `deterministic.ts`; `test/purity/no-ambient-nondeterminism.test.ts` scans all 19 files under `src/` for 12 ambient patterns and asserts the only bare import specifier anywhere in `src/` is `zod`. Additionally type-enforced: `tsconfig.json` compiles `src/` with `types: []` |
| 4   | Deterministic golden replay harness, ≥3 fixtures with expected-state snapshots                         | **met** | `src/replay/replay.ts`, `src/replay/golden.ts`; `test/fixtures/golden-00{1,2,3}-*.json`; `test/replay/golden.test.ts` discovers fixtures from the directory rather than a hand-maintained list                                                                                          |
| 4b  | `npm run test:replay` actually runs them (WP-01 placeholder replaced)                                  | **met** | root `package.json`: `"test:replay": "vitest run packages/domain/test/replay"`. See "Root files touched" below                                                                                                                                                                          |
| 5   | T-03 green (same log twice → deep-equal state)                                                         | **met** | `test/replay/determinism.test.ts` + a per-fixture T-03 case in `golden.test.ts`. Compared both structurally (`toStrictEqual`) and as canonical JSON text                                                                                                                                 |
| 5b  | T-04 green                                                                                             | **met** | see 1b                                                                                                                                                                                                                                                                                 |
| 5c  | Unit tests for every reducer and the fail-closed path                                                  | **met** | 187 domain tests pass (185 new + the 2 WP-01 scaffold assertions)                                                                                                                                                                                                                      |
| 5d  | Zero platform imports; WP-01 lint boundary stays green                                                 | **met** | `npm run lint` clean; `test/boundaries.test.ts` (WP-01's boundary proof) still 26/26                                                                                                                                                                                                    |

### Commands run (verbatim results, this session, from the branch head)

| Command                                          | Result                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `npm run lint`                                   | **pass** — eslint clean, no output                                                                |
| `npm run format:check`                           | **pass** — "All matched files use Prettier code style!"                                           |
| `npm run typecheck`                              | **pass** — root + all 6 workspaces; `@bunki/domain` runs both `tsconfig.json` and `tsconfig.test.json` |
| `npm run test`                                   | **pass** — 17 files, **225 tests**, 0 failed (domain: 11 files, 187 tests)                        |
| `npm run test:replay`                            | **pass** — 2 files, **40 tests**, 0 failed (`golden.test.ts` 17, `determinism.test.ts` 23)        |
| `npm run test:e2e`                               | placeholder, exit 0 — **WP-10**, unchanged by this WP; not evidence of anything                   |
| `npm run verify:export`                          | placeholder, exit 0 — **WP-03**, unchanged by this WP; not evidence of anything                   |
| `(cd apps/app && npx expo export --platform web)` | **pass** — 3 static routes, `Exported: dist`                                                      |

### Dependencies added (controller §14; both verified from the npm registry)

| Package       | Version      | License | Scope                                | Note                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ------------ | ------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zod`         | `4.4.3` exact  | MIT     | `@bunki/domain` dependency           | On the WP-00 register; WP-01's capsule recorded that installing it belongs to WP-02/WP-03                                                                                                                                                                                                                                                          |
| `@types/node` | `26.1.1` exact | MIT     | `@bunki/domain` **devDependency**    | **Not on the WP-00 register — surfaced, not silent.** Type-only, dev-only, and used by no file under `src/`: it exists so `tsconfig.test.json` can compile the two test suites that read the filesystem. It was already present transitively; pinning it makes the reliance explicit rather than accidental. Both licenses are compatible with the pending OD-09 choice |

`ts-fsrs` deliberately **not** installed — it is WP-06's, and
`seams-left-empty.test.ts` asserts its absence.

### Root files touched (outside `packages/domain/`), and why

1. **`package.json`** — one line: `test:replay` now runs the replay suites
   instead of `scripts/not-implemented.mjs`. Explicitly authorized for this WP
   ("replace the WP-01 placeholder for this script only — record that you did").
   `test:e2e` and `verify:export` still point at the placeholder and still belong
   to WP-10 and WP-03.
2. **`package-lock.json`** — the unavoidable consequence of the two dependency
   installs above in an npm-workspaces monorepo with a single lockfile. The diff
   is exactly the two additions; no other entry changed.

No other root file, no `apps/`, no sibling package, no `docs/specs`,
`docs/convergence`, `docs/handoffs`, and no other WP's surface was modified.
`git diff --name-only f53ce4b..HEAD` lists 40 files: 37 under
`packages/domain/`, the two root files above, and this capsule.

### Design decisions a reviewer should check rather than assume

1. **Version is checked before payload** in `parseEvent`. A v2 event whose fields
   this build has never seen is reported as a version problem, not as an unknown
   type — the second diagnosis invites "add the missing field" instead of "write
   a migration".
2. **Strict schemas.** An unrecognised key is a rejection, not an ignored field.
   This is the fail-closed rule one level below the version check.
3. **Derived state is sorted arrays, not records**, and comparison is on
   canonical JSON text. Two runs can build a record with the same entries in
   different insertion orders; `toEqual` passes and the serialised bytes differ,
   which is the exact divergence T-03 exists to catch and the form WP-03 will
   export (T-14).
4. **Replay throws rather than skipping** anything it cannot apply (a promotion
   for a thread with no capture, a purge with no tombstone, a supersession of an
   absent observation). A projection that skips what it does not understand is
   not auditable.
5. **Idempotency**: an identical re-append under one key is a no-op (a
   double-tapped capture is one thread); the same key claiming _different_
   content is rejected, because replay would otherwise have to choose between two
   histories.
6. **Promotion rejects a stale `from`, a no-op `from === to`, and off-ladder
   moves**; demotion is legal (REQ-DM-09 / DL-05: a mistaken promotion must be
   undoable). There is no `automatic` origin.
7. **The evidence-class partition is typed here, the gate is not built here.**
   WP-02 owns the schemas of
   `ReviewGraded`/`ProductionObserved`/`ExposureLogged`/`LookupFrictionLogged`/`EvidenceSuperseded`;
   the generic factory refuses to construct them (type-level, plus
   `EvidenceFactoryBoundaryError` at runtime) because minting accepted evidence
   is `src/evidence/`'s monopoly (REQ-ARCH-04, WP-06). `Candidate*` is
   deliberately outside the evidence class.
8. **`ReviewGraded` still _represents_ `easy` without `userConfirmedEasy`.**
   REQ-DM-07 is the gate's rule (§6.2, WP-06). Making it unrepresentable in the
   schema would delete the log's ability to record that a learner pressed easy
   and the gate turned it down. `userConfirmedEasy: false` _is_ rejected — the
   field records a confirmation, not its absence.
9. **`ExactOptional`** rewrites inferred `prop?: T | undefined` to `prop?: T`, so
   ADR-002's "absent must stay distinguishable from present-and-undefined"
   survives schema inference. Asserted with `@ts-expect-error` in
   `test/primitives.test.ts`.
10. **No `Date` anywhere in the package.** Instant validation is manual calendar
    arithmetic and ordering is byte comparison on the canonical fixed-width UTC
    form.

### Coordination requests for CON (no surface outside WP-02 was touched to resolve these)

1. **WP-06 blocker-in-waiting — contract→thread linkage.** `ContractCreated`
   implements REQ-DM-05's normative minimum exactly, which gives a contract a
   `targetComponentId` and **no thread link**. The evidence gate's "valid,
   promotion-active contract" test (controller §6.2) needs a component→thread
   edge that no Phase-0 event records. WP-02 did not invent a field: ADR-002
   froze the v1 set at WP-01, and widening another WP's schema unilaterally is
   the collision orchestration spec §2.4 forbids. Resolve by ADR-002 amendment or
   by a WP-06 projection built from `EncounterCaptured` — as a decision, not a
   patch. Recorded in code as `WP06_CONTRACT_THREAD_LINK_OPEN_QUESTION`
   (`src/reducers/seams.ts`) so it cannot be lost.
2. **Ambient-globals lint rule.** `no-ambient-nondeterminism.test.ts` stands in
   for a `no-restricted-globals` rule that belongs in `eslint.config.mjs` —
   WP-01's surface, so out of bounds for B2. If a later WP (WP-10's sweep is the
   natural home) moves it into lint, delete the test rather than keeping both.
   Note the scan is strictly wider than a globals rule: it also catches member
   expressions and dynamic `import()`.
3. **`@types/node` beyond the WP-00 register** — see the dependency table.
   Flagged for the same re-verification pass as WP-01's carried P2 item 5.

### Sub-predicates deliberately NOT claimed

- **T-02** ("capture does not activate FSRS until explicit promotion") is
  WP-06's; WP-02 supplies only its precondition — capture leaves a thread in
  `captured` and nothing here activates anything, asserted in
  `test/reducers/thread.test.ts`.
- **T-05/T-06/T-07/T-08** are gate assertions (WP-06). WP-02's fixtures _contain_
  the shapes those tests will exercise (two distinct contracts on one target; a
  reveal-before-recall review; a lookup with no tier; tier-D exposure) and assert
  only that they are recorded faithfully, never judged.
- **T-03 across adapters.** Green here for the pure in-memory reference, which is
  what controller §6.3 asks of WP-02. Web and ci-substitute sqlite are WP-03's,
  native is WP-11's, E2E-produced logs are WP-10's. The harness in
  `src/replay/golden.ts` ships in `src/` so those runs re-use it rather than
  writing a second, subtly different comparison.
- **Native anything** remains UNVERIFIED (WP-11 only).

### Secrets check (controller §15)

`git diff | grep -icE '(api[_-]?key|secret|bearer)'` → `0` on every staged diff.
Fixtures contain invented Japanese sentences, `example.invalid` URLs, and a
synthetic `sha256:` input hash; no credential-shaped string, no real user
content.

### Next safe command

- V2 verifies from a clean checkout of this branch:
  `npm ci && npm run lint && npm run format:check && npm run typecheck && npm run test && npm run test:replay && (cd apps/app && npx expo export --platform web)`,
  then walks the predicate table above and confirms via
  `git diff --name-only f53ce4b..HEAD` that nothing outside `packages/domain/`
  moved except the two root files listed.
- After PR #5 merges: rebase this branch onto refreshed `origin/main`, re-run the
  §17.5 set, and only then claim WP-02 closed (controller §3).

### Open items carried forward

- WP-06 owes the §14 `ts-fsrs@5.4.1` FSRS-6 primary-source check and the
  contract→thread decision above.
- Repository license remains **pending operator decision** (OD-09). Both
  dependencies added here are MIT and constrain nothing.
- `verify:export` and `test:e2e` remain placeholders (WP-03, WP-10).
- Native verification remains **UNVERIFIED** — WP-11 only.

---

## WP-02 (B2) — repair round 1: two P1 findings from V2

Appended, not rewritten. The sections above are the pre-repair record and stay
as they were; where this round makes one of their claims wrong, that is said
below in as many words.

### Stacking (unchanged, restated because this round re-cut nothing)

Branch `agent/bunki-phase0-closed-loop-wp02`, repaired from its own head
`2e0bf42`. It remains stacked on `origin/agent/bunki-phase0-integration` rather
than `origin/main`, because WP-01's scaffolding is not yet merged to main and
this package cannot build without it. Specs were re-verified from `origin/main`
before any edit: all nine files in
`docs/specs/BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt` hash as recorded, the
controller at
`de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47`.

### P1-1 — `DataExported.producedAt` was a field ADR-002 never froze

**Upheld in full.** `dataExportedSchema` carried `producedAt:
isoInstantSchema.optional()`, which appears in neither ADR-002's v1 table nor
controller §6.1, and golden-003 was already using it — so an unfrozen field was
baked into a T-03 fixture that WP-03 must round-trip losslessly (T-14/T-15).

Fixed by **option (a): the field is gone**, from
`packages/domain/src/events/catalog.ts` and from
`test/fixtures/golden-003-session-candidates-and-deletion.json:123`. Option (b),
an ADR-002 amendment, was not available to B2 and was not attempted: `docs/adr/`
is not on this WP's surface lock (W2 lock: `packages/domain/` is B2's,
"everything else LOCKED"), and amending a frozen ADR to legalise one's own drift
is the wrong direction of travel regardless of who holds the pen.

The fixture's `expectedState` is unchanged, as the finding predicted: replay
projects `ExportRecord` from `eventId`, `exportVersion`, `scope.kind`,
`scope.threadIds` and `occurredAt` only, and never read `producedAt`. Nothing
downstream lost information — `occurredAt` already answers "when did the export
run", which is why a second timestamp was never needed and why its removal costs
nothing.

The verifier is right that this is the opposite of the discipline applied in
coordination request #1, and the inconsistency was mine.

**The suite can now see this class of drift.**
`test/events/catalog.test.ts` gains `ADR_002_FIELDS`, ADR-002's table
transcribed by hand, and one test per family asserting that the schema accepts
**exactly** those keys — name *and* optionality, since an extra optional
property is invisible to a required-fields-only check and was precisely the
defect here. `ContractCreated` is transcribed from REQ-DM-05 (v2 spec §4.4),
which is what ADR-002's row defers to. A `covers every family` test keeps the
table from rotting silently if a family is added.

Negative control run, not assumed: re-adding `producedAt` turns
`DataExported accepts exactly the fields ADR-002 froze, no more` red and leaves
the other fourteen families green. The check fails for the right reason and
only there.

### P1-2 — the capsule's idempotency claim was stronger than the code

**Upheld in full**, and the finding's reproduction is accurate. Design decision
#5 above claims "the same key claiming _different_ content is rejected". The
check at `src/replay/replay.ts` keyed only on `eventId`: a repeated key naming
the *same* `eventId` incremented `skippedDuplicateCount` and returned without
ever comparing payloads, so a materially different second event was dropped in
silence. `determinism.test.ts`'s existing conflict test mutated both `eventId`
and `encounterId`, so it only ever exercised the differing-`eventId` branch.

Fixed by **hardening the code, not by weakening the claim.** Replay now records
`canonicalJson(event)` alongside the `eventId` that first claimed each key, and
throws `IdempotencyConflictError` when a repeat matches the id but not the
content. Design decision #5 is therefore now true as written and is left
standing; the module header, which had documented only the weaker
`eventId` rule, is corrected to state the actual guarantee.

Hardening was chosen over correcting the capsule because WP-03's idempotent
append will be built against this contract, and because the weaker rule
contradicts this module's own stated doctrine that nothing is ignored. A
silently discarded history is the same defect as a silently skipped event,
wearing a quieter costume.

Comparison is on **canonical** JSON, so field order cannot masquerade as a
difference and break honest re-appends from producers that serialise keys
differently — asserted by `still treats a re-append as identical when only key
order differs`.

`canonicalJson` moved from `src/replay/golden.ts` to a new
`src/replay/canonical-json.ts` so that `replay.ts` can use it without a cycle
(`golden.ts` already imports `replay.ts`). `golden.ts` re-exports it, so the
package's public surface is byte-for-byte what it was.

**Three tests added** for the branch that had none: same key + same `eventId` +
different payload throws with both `existingEventId` and `conflictingEventId`
reported as `ev-01`; the same case asserted as "throws at all", because the real
failure mode was no exception rather than a wrong one; and the key-order case
above. Negative control run: with the payload comparison disabled, exactly the
two new conflict tests fail and the key-order test still passes — confirming
they pin the missing branch and not merely "any difference throws".

### Checks re-run (full §17.5 set, from this branch head)

| Command | Result |
| --- | --- |
| `npm ci` | **pass** — 703 packages |
| `npm run lint` | **pass** — eslint clean, no output |
| `npm run format:check` | **pass** — "All matched files use Prettier code style!" |
| `npm run typecheck` | **pass** — root + all 6 workspaces |
| `npm run test` | **pass** — 17 files, **244 tests**, 0 failed (was 225; +19) |
| `npm run test:replay` | **pass** — 2 files, **43 tests**, 0 failed (`golden.test.ts` 17, `determinism.test.ts` 26; was 40) |
| `npm run test:e2e` | placeholder, exit 0 — **WP-10**; not evidence of anything |
| `npm run verify:export` | placeholder, exit 0 — **WP-03**; not evidence of anything |
| `(cd apps/app && npx expo export --platform web)` | **pass** — 3 static routes, `Exported: dist` |

The +19 reconciles exactly: 16 in `catalog.test.ts` (15 families + the coverage
guard) and 3 in `determinism.test.ts`.

### Surface touched this round

Seven files, all under `packages/domain/`, plus this capsule section:

- `src/events/catalog.ts` — `producedAt` removed, now-unused
  `isoInstantSchema` import removed, comment stating why the field is absent
- `src/replay/replay.ts` — payload comparison on repeated keys; header corrected
- `src/replay/canonical-json.ts` — **new**, extracted to avoid an import cycle
- `src/replay/golden.ts` — imports and re-exports `canonicalJson`
- `test/events/catalog.test.ts` — ADR-002 field table + per-family assertions
- `test/replay/determinism.test.ts` — three tests for the untested branch
- `test/fixtures/golden-003-session-candidates-and-deletion.json` —
  `producedAt` removed; `expectedState` untouched

No spec, ADR, convergence, handoff, orchestration-log, root or sibling-package
file was modified. `git diff --name-only 2e0bf42..HEAD` is the check.

### Secrets check (controller §15)

`git diff 2e0bf42..HEAD | grep -icE '(api[_-]?key|secret|bearer)'` → `0`.

### Still not claimed

Nothing in this round changes what WP-02 does not claim. T-02 and T-05..T-08
remain WP-06's; T-03 is green for the in-memory reference only; native remains
**UNVERIFIED** (WP-11). The contract→thread open question and the ambient-globals
lint item carry forward unchanged.

### For the verifier

The two negative controls above are the load-bearing evidence and are cheap to
repeat: re-add `producedAt` to `dataExportedSchema` and exactly one catalog test
should go red; replace the `canonicalJson(event) !== claim.canonical` guard in
`replay.ts` with a no-op and exactly two determinism tests should go red. If
either fails to fail, the corresponding fix is not actually pinned and I have
mis-reported it.

## WP-04 / Builder B3 — W2 (appended 2026-07-27)

### Integrity (re-verified this session, not trusted from documents)

- Controller sha256 observed `de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47` — matches the launcher's expected value.
- Also re-hashed and matched against `BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt`: v2 spec `5ee28477…`, orchestration spec `41631840…`, launcher `b0a6811d…`.
- Read in full before the first edit: controller §3, §4, §5, §8, §14, §15, §16, §17, §18 (WP-04), §21, §23; orchestration spec §0–§5; v2 REQ-SRC-01/02, DL-33, OD-02, P0-CAP-04; the `ORCHESTRATION_LOG.md` surface lock (W2: `packages/seed/` → B3).

### Branch stacking (deviation from controller §3.1, deliberate and recorded)

- Branch `agent/bunki-phase0-closed-loop-wp04` is cut from **`origin/agent/bunki-phase0-integration` @ `f53ce4bd91dccd4cf7587b8b1bd2f5fff6fe6ca4`**, not from `origin/main` (`bbaf0b31a0f469d6e7f26b4a0855bf8f3b787c78`).
- Reason: WP-01's scaffold is not yet merged to main, and WP-04 cannot exist without `packages/seed/`, the workspace root, the lint/typecheck/test scripts, or `vitest.config.ts`. Controller §3.1 provides for exactly this: "if unmerged predecessors block you, stack explicitly and say so".
- Consequence for review: this branch's diff against main includes WP-01's scaffold. Review WP-04 as the diff against `f53ce4b`.

### State

- Branch: `agent/bunki-phase0-closed-loop-wp04` @ `e6fd31d2ae999b1b645d6b4b76780e060d26f323` (the commit before this capsule section).
- Toolchain: node v22.22.2, npm 10.9.7.
- Wave W2. The WP-04 predicate is met except the two deferred source items below, which are recorded rather than papered over.

### WP-04 closure predicate status (controller §18)

| Predicate item | Status | Evidence |
| --- | --- | --- |
| §8 dataset committed | met | 16 lexemes, 10 kanji (incl. 分 + 岐), 3 constructions, 8 sentences, 1 passage (160 chars, embeds 分岐), 10 KanjiVG SVGs — `packages/seed/data/` |
| Every field carries provenance (REQ-SRC-01) | met | 199 field→provenance pairs; enforced by the type system, the loader, and two independent test walks |
| Provenance-completeness test walking all records (feeds T-15) | met | `packages/seed/test/provenance.test.ts`, wired into `npm run test` |
| Schema-checked with zod | met | `packages/seed/test/schema.test.ts`, zod 4.4.3 |
| `LICENSES.md` complete with verbatim attributions + URLs + retrieval dates | **partial — honestly** | KanjiVG **verified**; EDRDG and Tatoeba **deferred (D-1, D-2)**: hosts unreachable, and **no content from them ships** |
| Real KanjiVG SVGs, not hand-drawn | met | verbatim bytes at pinned commit `61e39cf`; `scripts/fetch-kanjivg.mjs --check` → 10/10 `MATCH` against upstream |
| Source entry ids recorded where available | met | KanjiVG: `source_entry_id: "kanji/XXXXX.svg"` per field. JMdict `ent_seq`: **none obtainable** — recorded as `null`, not invented |

### The one judgement call, stated plainly

Controller §8 names JMdict/KANJIDIC2 and Tatoeba as the intended sources. Every
EDRDG- and Tatoeba-controlled host returned `403 CONNECT` from this session's
egress proxy (reproduced with both `curl` and `WebFetch`; the proxy's own status
endpoint logged `connect_rejected … www.edrdg.org:443`). Per `/root/.ccr/README.md`,
a proxy 403 is an organisation policy denial to be reported, not routed around.

Two options existed. **Ship the content anyway** from a third-party
redistribution (`kanjidic2-json` and `kotobako-data` were both located on npm,
and one was downloaded and inspected), labelled EDRDG with licence text written
from memory. Or **ship nothing from those sources** and label the lexical content
as this project's own work. The first manufactures exactly the audit trail this
work package exists to make trustworthy. Took the second.

So: readings, senses, parts of speech and kanji meanings are `bunki-editorial`,
`review_status: "unreviewed"`, `confidence: "medium"`, `source_entry_id: null`.
Sentences, grammar explanations and the passage are `bunki-authored-text` —
original compositions carrying no third-party attribution obligation.
`test/dataset.test.ts` fails if any field's `source` or `attribution` so much as
mentions JMdict, KANJIDIC2, EDRDG or Tatoeba.

**Controller §21.3(3) is NOT triggered.** That trigger is unresolved source
licensing _entering fixtures or product data_. No EDRDG or Tatoeba asset is
present to be unresolved. What is open is content verification, not licence
exposure — a scoped deferral with a precise operator action, not a stop.

### Deferred items (full detail in `packages/seed/LICENSES.md` §6)

| Id | Item | Smallest operator action |
| --- | --- | --- |
| D-1 | JMdict/KANJIDIC2 subsets + verbatim EDRDG attribution text | allow `www.edrdg.org` + `ftp.edrdg.org` through the session egress policy, then re-run WP-04's source pass |
| D-2 | Tatoeba sentence subset with per-sentence attribution | allow `tatoeba.org` + `downloads.tatoeba.org`, then add a sourced subset |
| D-3 | CC BY-SA 4.0 / CC BY 2.0 FR legal code from `creativecommons.org` | closes with D-1/D-2 |

Closing D-1 is a small change by construction: the provenance registry plus
per-field `source_entry_id` overrides, both of which already exist and are
exercised by the KanjiVG fields.

### Commands run (verbatim results)

| Command | Result |
| --- | --- |
| `npm ci` | clean install from lockfile |
| `npm run lint` | **pass**, 0 problems |
| `npm run format:check` | **pass**, "All matched files use Prettier code style!" |
| `npm run typecheck` | **pass**, root + 6/6 workspaces, 0 errors |
| `npm run test` | **pass**, 11 test files, **124/124 tests** (was 7 files / 40; +87 in `packages/seed`) |
| `npm run test:replay` / `verify:export` / `test:e2e` | placeholders, exit 0, unchanged (WP-02/03/10) |
| `(cd apps/app && npx expo export --platform web)` | **pass** — 3 static routes, bundle 1.1MB, `Exported: dist` |
| `node packages/seed/scripts/fetch-kanjivg.mjs --check` | **pass** — 10/10 `MATCH` against pinned upstream `61e39cf` |

### Predicate probed, not asserted

Three mutations, each reverted and re-verified green afterwards:

| Mutation | Result |
| --- | --- |
| removed `lex-bunki.senses` from `fieldProvenance` | all 5 seed test files failed at import (`SeedDataError: … every field carries provenance`) |
| changed 分's `strokeCount` 4 → 5 | `strokes.test.ts` failed 1/26 — re-derivation from the SVG bytes disagreed |
| edited one path coordinate in `05206.svg` | `strokes.test.ts` failed 1/26 on the recorded digest |

A fourth was found by the suite rather than planted: `gram-koto-ni-suru` was
documented with no sentence attesting it. Fixed in the data (`sen-02`).

### Deviations from the WP-00 pinned register (surfaced, not silent)

1. **`@types/node@26.1.1` added** (MIT, verified from the registry this session) as a devDependency of `packages/seed`, with `types: ["node"]` in its tsconfig. Not in the §14 register. It is needed because the stroke-integrity test reads files and hashes them — the check that distinguishes a fetched KanjiVG file from a hand-drawn one. It was already present transitively; declaring it exactly stops a dependency bump elsewhere from silently breaking this typecheck. Type-only, no runtime footprint.
2. **`zod@4.4.3`** added as a devDependency of `packages/seed` — exactly the version and licence the WP-00 register records. Kept out of `dependencies` so `@bunki/seed` stays runtime-dependency-free.
3. **Root `package-lock.json` modified.** Mechanically unavoidable: npm workspaces keep one lockfile, so a devDependency declared in `packages/seed/package.json` must land there. The diff is those two entries and nothing else. Flagged as a coordination note rather than treated as an ordinary in-surface edit.

### Coordination requests (for CON)

1. **`eslint.config.mjs` Node-globals glob is root-only.** `files: ['scripts/**/*.mjs', …]` does not reach `packages/*/scripts/*.mjs`, so `packages/seed/scripts/fetch-kanjivg.mjs` needed a local `/* global … */` declaration. Widening that glob is WP-01's surface, so it is requested rather than edited. Severity P2.
2. **Lockfile touch acknowledged** (deviation 3) — WP-01 owns the root lockfile; this change is the projection of an in-surface manifest edit.

### Surfaces touched (WP-04 ownership only)

`packages/seed/**` — `data/` (7 JSON + 10 SVG), `licenses/KanjiVG-COPYING.txt`,
`scripts/fetch-kanjivg.mjs`, `src/{index,types,validate}.ts`,
`test/{provenance,schema,strokes,dataset}.test.ts`, `LICENSES.md`, `README.md`,
`package.json`, `tsconfig.json` — plus root `package-lock.json` (mechanical) and
this capsule section. **No frozen doc touched**; no other package, no `apps/app`,
no CI, no `eslint.config.mjs`.

### Secrets check (controller §15)

Staged diff scanned for `api[_-]?key|secret|bearer|password|token`, excluding the
lockfile: **0 matches**. Including `licenses/`: **0 matches**. No `.env`, no
credentials; every URL in the fetch script is public and unauthenticated.

### Next safe command

- V3 verifies WP-04 from a clean checkout of this branch: `npm ci && npm run lint && npm run format:check && npm run typecheck && npm run test`, then `node packages/seed/scripts/fetch-kanjivg.mjs --check` (needs network), then walks `LICENSES.md` against `packages/seed/data/` — in particular confirming that no shipped field claims a source whose licence this session could not verify.
- WP-05 may consume `@bunki/seed` (`seedDataset`, `findKanji`, `findLexeme`, `SEED_COVERAGE_DISCLOSURE`, `SEED_ENTRY_DISCLOSURE`) without modifying it.

### Open items carried forward

- D-1 / D-2 / D-3 above — the only WP-04 items not closed.
- Readings and senses carry `review_status: "unreviewed"` by design. Any UI that renders them must not present them as dictionary-verified; `SEED_ENTRY_DISCLOSURE` exists for that, and WP-05 should wire it into word and kanji pages.
- Repository license remains **pending operator decision** (OD-09); `packages/seed/README.md` records it, and every project-authored provenance record states it rather than asserting a licence.

## WP-03 / Builder B4 — W3 (appended 2026-07-27)

### Integrity (re-verified this session, before the first edit)

- Controller sha256 observed: `de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47` — matches the launcher's expected value.
- v2 design authority sha256 observed: `5ee28477054fc57f476e5e8cce8f4d35c5c309be5f21bac8adaf041ba91b0c55` — matches the controller header.
- Read in full before the first edit: launcher, controller (§7 persistence and §11 export in full, plus §0/§3/§5/§6/§16/§17/§18/§21), orchestration spec §2 ground rules + §4 role cards, `ORCHESTRATION_LOG.md` (W3 surface lock, W2 dispositions), ADR-001, ADR-002, VERIFY_WP01/02/04, and the WP-02 domain surface this WP consumes.

### Stacking (recorded per instruction)

This branch is **stacked**, not cut from `main`. Base:
`origin/agent/bunki-phase0-integration` @ `755c090557cffbe0f316445b77c74a0a909d9a46`
("WP02+WP04(CON): close wave W2"), because WP-01/02/04 are verified but not yet
merged to `main` and WP-03 depends on WP-02's event catalog and replay harness
(controller §3.1 permits explicit stacking; it must be stated in the PR body).
Branch: `agent/bunki-phase0-closed-loop-wp03`.

### Surfaces touched

`packages/persistence/**`, `packages/export/**`, this capsule section, and two
root files:

- `package.json` — **the `verify:export` script line only**, which the WP-03 role
  explicitly authorises and which controller §18 WP-01 requires be replaced by its
  owning WP (leaving a placeholder past its owner is a closure-predicate failure).
  `node scripts/not-implemented.mjs verify:export WP-03` →
  `vitest run packages/export/test/verify-export.test.ts`.
- `package-lock.json` — mechanical consequence of `packages/*/package.json`
  declaring their own dependencies (`@bunki/domain`, `@bunki/export`,
  `@types/node@26.1.1`, `zod@4.4.3`). Same class of touch W2 recorded and CON
  accepted. **Coordination note to CON:** npm nests `zod@4.4.3` under
  `packages/export/node_modules` because the hoisted root `zod` is `3.25.76`
  (pulled in by the Expo tree); this is correct resolution, not drift.

No frozen doc touched (`docs/specs/`, `docs/convergence/`, `docs/handoffs/`,
`docs/adr/` all untouched). No other lane's surface touched: `packages/domain/`
(B5), `apps/app/` (B6), `packages/seed/` (locked read-only) are unmodified —
`git diff --stat` against the base confirms it.

### WP-03 closure predicate status (controller §18)

| Predicate item                                                                                     | Status                                | Evidence                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ports per §7 — `append(events,{idempotencyKey})`, `readAll`, `readStream`, `snapshot`, `exportJson` + `QueryPort` | met                                   | `packages/persistence/src/port.ts` (exactly the five §7 methods; everything else on the read-only `QueryPort`)                                                  |
| A shared port contract-test suite any adapter must pass                                             | met                                   | `packages/persistence/src/contract/suite.ts` — 20 cases, framework-free, in `src/` so WP-11 can run the identical list on a device                              |
| sqlite adapter (native authority) with the §7 CI-substitute mechanism                               | met                                   | one adapter `src/sqlite/adapter.ts`; drivers `expo-driver.ts` (native) / `node-driver.ts` (`node:sqlite`); every substitute test name carries `ci-substitute`   |
| Provisional web adapter, labeled provisional in code and README                                     | met                                   | `src/web/adapter.ts` (`ProvisionalWebEventStore`, `runtimeLabel: 'web-provisional'`, `PROVISIONAL_WEB_ADAPTER_NOTICE`), README §Runtime honesty                 |
| Migration runner: forward + **down-migrations exercised in tests**                                  | met                                   | `src/migrations/{types,runner,schema}.ts`; `test/migrations.test.ts` drives every migration up→down→up against a canonical `sqlite_master` fingerprint          |
| Refuses destructive migration without verified rollback (§21.3(7))                                  | met                                   | `DestructiveMigrationWithoutRollbackError`; refuses a missing `down` **and** a `destructive:false` flag that disagrees with the SQL (`classifyStatements`)      |
| Idempotent append; conflicting payload under one key = typed error, matching WP-02                  | met                                   | `src/append-plan.ts` throws `@bunki/domain`'s own `IdempotencyConflictError`/`DuplicateEventIdError`; `test/idempotency.test.ts` asserts each outcome twice — once via the store, once via `replay` |
| Tombstone-then-purge; purge physically removes payload bytes; audit trail survives                  | met                                   | `src/purge.ts` + both adapters; `test/deletion.test.ts` scans the raw `.db`/`-wal`/`-shm` files                                                                 |
| `packages/export` envelope `{exportVersion:1, generatedAt, events, seedRefs, appVersions}`          | met                                   | `packages/export/src/envelope.ts`; `generatedAt` from the injected clock                                                                                        |
| `npm run verify:export` is REAL (T-14 skeleton)                                                     | met                                   | root script → `packages/export/test/verify-export.test.ts`; replays through `@bunki/domain` and asserts derived-state equality against **live stores**, both adapters, incl. a negative control |
| T-01 (append immediate + durable across adapter reopen)                                             | met (`ci-substitute`, `web-provisional`) | contract case `append-is-immediate-and-durable-across-reopen`                                                                                                   |
| T-16-web (restart simulation)                                                                       | met                                   | contract case `restart-preserves-the-whole-log-and-its-streams` + `test/t16-web-restart.test.ts` (full page-reload simulation)                                  |
| Provenance survives the store round trip (feeds T-15)                                               | met                                   | contract case `provenance-survives-the-store-round-trip`; `seedRefs` surfaces licence obligations at the envelope's top level                                   |
| Uses `@bunki/domain`'s replay harness; reduction NOT reimplemented                                  | met                                   | `replay` imported in `append-plan.ts`, `adapter.ts`, `web/adapter.ts`, `export/src/verify.ts`; no reduction logic in either package                             |

### Commands run (verbatim results)

| Command                                     | Result                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm ci` then `npm install`                 | clean; 712 packages audited; 1 package added                                        |
| `npm run lint`                              | **pass**, 0 problems                                                                |
| `npm run format:check`                      | **pass**, "All matched files use Prettier code style!"                              |
| `npm run typecheck`                         | **pass**, 6/6 workspaces, 0 errors                                                  |
| `npm run test`                              | **pass** — 31 files, **451/451 tests** (was 328 at the W2 base; +123 from WP-03)    |
| `npm run test:replay`                       | **pass** — 2 files, 43/43                                                           |
| `npm run verify:export`                     | **pass** — 1 file, **10/10** (no longer a placeholder)                              |
| `npm run test:e2e`                          | still the WP-10 placeholder, exits 0 with its "not evidence of anything working" banner |
| `(cd apps/app && npx expo export --platform web)` | **pass** — 3 static routes, bundle 1.1MB, `Exported: dist`                     |

### Runtime-claim honesty (P0-CAP-15, controller §7 — read this before quoting any result above)

- Every SQLite test name begins `[ci-substitute]`. That is evidence about the
  SQL, the transactions, the invariants, and reopen durability. It is **not**
  evidence about iOS, about `expo-sqlite`, or about a device.
- Every web test name begins `[web-provisional]`. Web persistence is never
  reported as native persistence.
- **T-16 native is UNVERIFIED.** It is WP-11's claim and only WP-11's. Nothing in
  this WP contributes to it.
- No test in this WP emits a passing `[native]` name. The `expo-sqlite` binding is
  tested against a recording fake and labeled "shape only — NOT native
  verification"; running the contract suite through it would have minted a
  `native`-labeled store in CI, which is the false assurance §7 forbids.

### Driver choice, verified from the registry and recorded (controller §14)

- **Chosen: `node:sqlite`** (`DatabaseSync`), built into Node. Verified working on
  the pinned toolchain **node v22.22.2** (the major CI selects via
  `actions/setup-node@v4`, `node-version: '22'`). Available since Node 22.5.0;
  experimental in Node 22 (emits `ExperimentalWarning`). **No npm dependency
  added** — nothing new constrains OD-09; it ships under Node's own MIT licence.
  Pinned by the Node major, and guarded at runtime by `DriverUnavailableError`
  so a runtime without it fails loudly instead of silently substituting.
- **Rejected: `better-sqlite3`**, verified from the npm registry as version
  **13.0.1**, licence **MIT** (`npm view better-sqlite3 version license`,
  2026-07-27). Compatible and acceptable; not taken because it is a native addon
  needing `node-gyp` in every CI run, and adding a dependency to support a
  _substitute_ for a runtime we explicitly do not claim to have verified is cost
  without evidence.
- `expo-sqlite` re-verified from the registry: **57.0.1, MIT** (matches the WP-00
  register). **Deliberately not installed** — see the WP-11 obligation below.

### Two defects found by this WP's own tests, and fixed

1. **The idempotency table retained purged content.** The batch fingerprint was
   the canonical JSON of the batch, stored verbatim, so `bunki_append_batches`
   held a copy of every event ever appended. Emptying `bunki_events` left the
   learner's encounter text intact one table over — the store would have reported
   a completed deletion while the bytes were on disk. Fixed by storing a SHA-256
   digest (`src/hash.ts`, no platform API, cross-checked against `node:crypto` in
   `test/hash.test.ts` over 14 inputs incl. block boundaries and surrogate pairs)
   **and** by dropping batch rows that reference purged events. Found only
   because the contract suite's purge case reads raw storage bytes rather than
   asking the port; that is why `AdapterHarness.rawStorageDump()` exists.
2. **SQLite retained purged bytes at the file level.** `UPDATE` frees the old cell
   without erasing it, and WAL keeps pre-update page images. Fixed with
   `PRAGMA secure_delete = ON` at open, plus `PRAGMA wal_checkpoint(TRUNCATE)` and
   `VACUUM` after any batch that purged — run _after_ the commit, so a crash in
   between leaves a purge that is recorded and re-runnable rather than neither.

### Interpretation choices recorded (controller §0.3 — conservative reading, surfaced not silent)

1. **`seedRefs` (controller §11 names the field, does not define its shape).**
   Read as a _derived_ index of the source/licence references the exported events
   actually cite, collected from each `EncounterCaptured`'s `sourceRef` and
   `provenance`, deduplicated and sorted. It asserts nothing the events do not
   already contain, so it cannot drift from them, and it makes T-15 answerable by
   inspection. The alternative reading — an injected `@bunki/seed` manifest —
   would let an export _claim_ provenance its events do not carry. **CON: flag to
   WP-09 in case the inspector expects the other reading.**
2. **`appVersions.fsrs` is `null` in this build.** No scheduler is pinned yet; the
   pin is WP-06's (controller §6.3). A plausible-looking version string would be a
   claim about a component that does not exist. The field is wired end to end —
   WP-06/WP-05 pass the real pin through `EventStoreConfig.appVersions`.
3. **`readStream` takes a discriminated selector** (`{threadId}` | `{contractId}`)
   rather than a bare string, because §7's `readStream(threadId|contractId)` is
   ambiguous for two opaque id spaces that can collide.
4. **The derived-state cache never answers `snapshot()`.** §7 asks for cache
   tables "rebuilt from replay"; they exist and are written on append, but
   `snapshot()` always replays and the cache is read only by
   `derivedStateCacheMeta()`. Conservative reading of §21.4: a cache that can
   answer is a second source of truth.
5. **No destructive migration ships in Phase 0.** All three forward migrations are
   additive; the §21.3(7) guard is exercised with fixture migrations that really
   are destructive, rather than putting a demonstration one-way door in a real
   user's upgrade path.

### Coordination requests to CON (not acted on — outside WP-03's surface)

1. **P1 — architectural gap, blocks WP-05/WP-09 wiring.** ADR-001 B2 forbids
   `apps/app` from importing `@bunki/persistence` _at all_, and controller §5
   makes `@bunki/domain` pure (no sibling packages). No package may therefore
   both construct a store and be reachable from the app. Someone must own the
   composition seam before the UI can persist anything. Options, cheapest first:
   (a) a thin `@bunki/composition` package that the app may import; (b) a single
   named wiring module under `apps/app` with an ADR-level lint exception;
   (c) inject a store instance at the app entry point from a non-app module.
   **This is an ADR-001 amendment path, which is an escalation, not an edit** —
   WP-03 has not touched it.
2. **P2 — `docs/build-evidence/TEST_PLAN.md` (CON-owned) is now stale**: the
   script-status table still lists `verify:export` as "placeholder, exits 0", and
   the T-01/T-14/T-16 rows should record their WP-03 halves as met. Not edited —
   not WP-03's surface.
3. **P2 — `.github/workflows/ci.yml` (WP-01/WP-10) does not run `verify:export`.**
   It is real now, so CI omitting it means T-14 is unguarded between PRs. WP-10
   owns the CI extension per its closure predicate; flagging so it is not lost.
4. **P2 — no §15 pre-commit secret hook is installed** (`.git/hooks` is empty, no
   husky). WP-01 recorded the requirement; nothing enforces it. Related: this WP
   renamed its purge canary from `SECRET_ENCOUNTER_TEXT` to `PURGE_CANARY_TEXT`
   so the fixture will not trip that hook once it exists.

### WP-11 obligations inherited from this WP (record in the native checkpoint doc)

1. Install `expo-sqlite@57.0.1` on the device build and compile
   `src/sqlite/expo-driver.ts` against its **own** typings. This package declares
   the four-method subset rather than importing it, so upstream signature drift is
   invisible to CI by construction.
2. Run `runPortContractSuite(deviceHarness)` — the identical 20-case list, no
   framework needed — and report the results as native evidence. A device harness
   needs `open()`, `rawStorageDump()`, `reset()`, `dispose()`.
3. Confirm on device what CI cannot: WAL behaviour under backgrounding, and that
   `secure_delete` + `VACUUM` remove purged bytes from the real filesystem.

### Secrets check (controller §15)

Staged diff scanned for
`api[_-]?key|secret|bearer|password|passwd|token|private[_-]?key`, excluding
`package-lock.json`: **0 matches** after the canary rename. No `.env`, no
credentials, no network calls in either package.

### Next safe command

- V4 verifies WP-03 from a clean checkout of this branch:
  `npm ci && npm run lint && npm run format:check && npm run typecheck && npm run test && npm run test:replay && npm run verify:export`,
  then `git diff --stat 755c090` to confirm no surface outside
  `packages/persistence/`, `packages/export/`, the `verify:export` script line,
  the lockfile, and this capsule section was touched.
- Paraphrase-audit target for V4: the contract suite's purge case
  (`tombstone-then-purge-removes-content-bytes-and-keeps-the-audit-trail`) — it
  must assert against **raw storage bytes**, not against what the port reports, or
  it does not assert what the controller says it asserts.
- WP-05/WP-09 may consume `@bunki/export` freely; they may consume
  `@bunki/persistence` only once coordination request 1 above is resolved.

### Open items carried forward

- T-16 **native**: UNVERIFIED. WP-11 only.
- T-14 full (export button in the inspector, round trip driven from the UI):
  WP-09. This WP delivered the skeleton the controller asked for.
- T-15 full: WP-09. This WP proves provenance survives the store round trip and
  surfaces licence obligations in `seedRefs`.
- `appVersions.fsrs` stays `null` until WP-06 pins the scheduler.
- Repository license remains **pending operator decision** (OD-09); recorded in
  both package READMEs.

## WP-06 / Builder B5 — W3 (appended 2026-07-27)

### Stacking and provenance (controller §3.1)

- **Branch:** `agent/bunki-phase0-closed-loop-wp06`, cut from `origin/agent/bunki-phase0-integration` @ **755c090** — _not_ from `origin/main`. WP-01/02/04 are verified but unmerged, and WP-06 consumes the WP-02 kernel directly (event catalog, replay, purity harness), so building on `main` would have meant reimplementing them. The stack is therefore `main (bbaf0b3) ← WP-01 ← WP-02 ← WP-04 ← WP-06`, and this branch must land after its predecessors.
- **Integrity re-verified this session** before any edit: `sha256sum docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md` → `de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47` (matches the launcher's expected hash); v2 spec → `5ee28477054fc57f476e5e8cce8f4d35c5c309be5f21bac8adaf041ba91b0c55`. Both match `BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt`.
- **Surface lock honoured:** the W3 lock table assigns `packages/domain/` to B5 as sole domain writer. Nothing outside `packages/domain/**` was modified except root `package-lock.json` (mechanical, see deviations) and this capsule section. `packages/domain/src/session/` is untouched and still empty (WP-08's).

### WP-00 carry-over check — does `ts-fsrs@5.4.1` implement FSRS-6?

**Verdict: YES.** Verified from primary sources inside the published tarball (`npm pack ts-fsrs@5.4.1`); nothing taken from a summary or from memory.

| Evidence               | Source                                     | Finding                                                                                                                                                             |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Changelog, 5.0.0       | `package/CHANGELOG.md`                     | "1. Upgraded to FSRS-6 algorithm" — PR #174 "Feat/FSRS-6"                                                                                                            |
| Changelog, 5.2.0       | `package/CHANGELOG.md`                     | "Fix/FSRS-6 default parameters" (PR #196)                                                                                                                            |
| Changelog, 5.0.0→5.4.1 | `package/CHANGELOG.md`                     | No entry reverts or re-generations the algorithm; 5.4.1 is a clip-range patch on `w[17]/w[18]`                                                                        |
| README badge           | `package/README.md`                        | `FSRS-v6`, linking the fsrs4anki wiki's FSRS-6 section                                                                                                                |
| Runtime self-report    | `dist/index.mjs`, executed                 | `FSRSVersion === 'v5.4.1 using FSRS-6.0'`                                                                                                                            |
| Structural check       | `dist/index.mjs`                           | `default_w` has **21** weights ending in `FSRS6_DEFAULT_DECAY = 0.1542`. FSRS-5 has 19 weights and fixed decay 0.5, which the library exports separately as `FSRS5_DEFAULT_DECAY` for migration only |
| Licence                | `npm view ts-fsrs@5.4.1 license` + `LICENSE` | **MIT** — compatible with the operator's pending licence choice (controller §4)                                                                                     |

Recorded in code at `packages/domain/src/reducers/fsrs-pin.ts` (header) and enforced at runtime by `verifyFsrsPin()`, which compares the installed library's self-reported version and all 21 default weights against the values written out by hand in that file. `test/reducers/fsrs-pin.test.ts` fails the build on any drift. No stop condition triggered.

### FSRS pin (controller §23 requires this in the capsule)

```
package            ts-fsrs
version            5.4.1            (exact, no caret/tilde, in packages/domain/package.json)
algorithm          FSRS-6           (self-report: "v5.4.1 using FSRS-6.0")
parameterSetId     bunki-fsrs6-r090-defaults-v1
request_retention  0.90             (DL-13, REQ-SCH-02; no user slider exists)
maximum_interval   36500 days
enable_fuzz        false            (randomness would break T-03 replay determinism)
enable_short_term  true
learning_steps     ["1m", "10m"]
relearning_steps   ["10m"]
w[0..20]           0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001,
                   1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014,
                   1.8729, 0.5425, 0.0912, 0.0658, 0.1542
statePrecision     8 decimals on stability/difficulty (cross-engine drift guard)
```

### Closure predicate status (controller §18 WP-06)

| Predicate                                     | Status | Evidence                                                                                                                     |
| --------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| §6.2 gate complete                            | met    | `src/evidence/gate.ts` + `mint.ts`; `test/evidence/gate.test.ts` reaches **every** entry in `GATE_REJECTION_REASONS` and asserts that coverage |
| Contracts per REQ-DM-05                       | met    | `src/contracts/retrieval-contract.ts`; `test/contracts/retrieval-contract.test.ts`                                            |
| FSRS pin per §6.3 with recorded version/params | met    | `src/reducers/fsrs-pin.ts`, table above, `test/reducers/fsrs-pin.test.ts`                                                     |
| Promotion flow per REQ-DM-09                  | met    | `src/contracts/promotion-activation.ts`; `test/contracts/promotion-activation.test.ts`; `test/evidence/t02-*.test.ts`         |
| T-02, T-05, T-06, T-07, T-08 passing          | met    | one named file each under `packages/domain/test/evidence/`                                                                   |
| Meaning/reading as separate contracts in fixtures | met | `golden-002` (same component, two skills, one memory state moved) and `golden-004`                                            |
| Contract→thread link (CON W2 disposition)     | met    | projection from `EncounterCaptured`, no ADR-002 change — see below                                                            |
| Golden replay extended with a scheduling fixture | met | `test/fixtures/golden-004-contracts-gate-and-fsrs-scheduling.json`, 19 events                                                 |
| Rate-limit seam recorded                      | met    | `PROMOTION_RATE_LIMIT_SEAM` + typed `PromotionRateLimitPolicy`, unimplemented on purpose                                      |
| `src/session/` left empty                     | met    | `test/purity/seams-left-empty.test.ts`                                                                                       |

### The contract→thread link, resolved without touching ADR-002

WP-02 raised it (`WP06_CONTRACT_THREAD_LINK_OPEN_QUESTION`): `ContractCreated` names a `targetComponentId`, `EncounterCaptured` names a `threadId`, and no v1 event joins them — so the gate's "promotion-active contract" test had nothing to stand on. The Conductor's W2 disposition chose a projection from `EncounterCaptured` with no schema change. Implemented as:

```
targetKey   = span ? text.slice(span.start, span.end) : text
componentId = "kc:" + targetKey
```

Soundness: REQ-LM-01/A12 (sparse instantiation) says a KnowledgeComponent is instantiated only on evidence or need, and in Phase 0 the sole instantiator is capture — so a component is not an independent row with an arbitrary key, and its identity can be canonical. The thread edge then comes free (REQ-DM-02: thread BEGAN_WITH / REENCOUNTERED_IN encounter). **No new field, no new event, no version bump**; the constraint lands on the _value_ of an existing field, which is validation, and validation is WP-06's own surface.

What it costs, stated rather than hidden: a contract naming a component that no capture instantiated can never be scheduled. That is the intended fail-closed behaviour and the gate says so by name (`component_never_captured`). Ambiguity — one target captured on two threads — also fails closed (`component_ambiguous`) rather than picking a thread. If a later phase needs components that outlive a single captured surface form, that is an ADR-002 amendment, i.e. an escalation, exactly as WP-02 asked.

`WP06_CONTRACT_THREAD_LINK_OPEN_QUESTION` is replaced by `WP06_CONTRACT_THREAD_LINK_RESOLUTION`, which names the mechanism and the constraint. The projection is folded **forward** with the log, so a capture arriving after a review does not retroactively make that review schedulable.

### What the evidence gate now guarantees

Sole factory (`src/evidence/mint.ts`) and sole judge (`src/evidence/gate.ts`). `createDomainEvent` still refuses evidence families at the type level and throws `EvidenceFactoryBoundaryError` through `any`. Admission rules, each with a named rejection reason recorded in `DerivedState.gateDecisions`:

- only `ReviewGraded` with `tier: "A"`, on a valid contract, linked to a non-deleted thread whose promotion state activates that contract's skill;
- `revealedBeforeRecall` forces `again` **at both doors** — written into the minted event (ADR-002's wording) _and_ re-applied at admission, so an event that entered the log by another route (fixture, import, future adapter) is corrected too;
- `LookupFrictionLogged` → `lookup_is_friction_not_a_grade` (T-07);
- `ExposureLogged`, tier D → `exposure_is_never_retrieval` (T-08);
- `ProductionObserved`, tier B/C → `production_is_not_tier_a`;
- `easy` without `userConfirmedEasy === true` → refused, **not** silently downgraded to `good`; a downgrade would be the system making a claim the learner did not make;
- a superseded observation stops scheduling (`evidence_superseded`), so the REQ-UI-06 correction affordance corrects something instead of merely annotating it;
- `Candidate*` cannot enter: `@ts-expect-error` assertions in `test/evidence/gate.test.ts` are checked by `tsc -p tsconfig.test.json`, and `assertNotCandidate` throws `CandidateEvidenceBoundaryError` on candidate markers that survived a JSON round trip (T-09 unit half).

Promotion: capture → `captured` (no scheduling); `keep` still none (REQ-DM-09.1, "no mandatory SRS"); `learn` activates recognition/reading/sense skills; `master` adds production/discrimination. Activation creates a `new` MemoryState due at the activation instant with **no FSRS call** — activation is not a review. Demotion sets `active: false` and keeps the history.

### Finding: latent span defect in a WP-02 fixture (found, fixed, reported)

`golden-002`'s capture of 憮然 carried `span {start: 3, end: 5}`, which slices `然と`, not `憮然` (0-indexed: 彼=0, は=1, 憮=2, 然=3). Latent while nothing read the span; load-bearing the moment the contract→thread projection did. Corrected to `{2, 4}`, consistent with the fixture's own `lexeme-buzen` / `component-buzen` naming. `thread-0102` gained the span `{0, 3}` it always meant (`案の定`). **Severity P2** — fixture data only, no production code path affected, no prior assertion depended on the value.

### Tests: 328 → 468, none weakened

`npm run test` was **328 passed** at the branch point and is **468 passed** now (+140). Six pre-existing assertions changed; all six were WP-02 statements about work that had not happened yet, and each was retargeted rather than deleted:

| Assertion                                                              | Was            | Now                                                                       | Why                                                                                            |
| ---------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `seams-left-empty`: `src/contracts`, `src/evidence` empty               | absence        | those are populated; `src/session` **still** asserted empty                | filling them is WP-06's closure predicate; WP-08's surface claim is intact                     |
| `seams-left-empty`: no `ts-fsrs` dependency                            | absent         | present, exactly `5.4.1`, in `dependencies` only                           | controller §6.3/§14 require it in this package                                                 |
| `seams-left-empty`: derived state has no `memoryState`/`stability`/`dueAt` | absent      | asserts no `sessionPlan`/`dueContracts` (WP-08's)                          | the words it banned are now the deliverable                                                    |
| `no-ambient-nondeterminism`: bare imports `['zod']`                    | one            | `['ts-fsrs', 'zod']`, plus a **new** assertion that `ts-fsrs` is imported by exactly two files | still exhaustive; a third bare import still fails                              |
| `no-ambient-nondeterminism`: one envelope minter                       | `factories.ts` | exactly `['events/factories.ts', 'evidence/mint.ts']`                      | two named files is a stronger claim than one file plus a convention; the split _is_ the evidence boundary |
| `determinism`: exhaustive `DerivedState` key list                      | 11 keys        | 13 keys, still exhaustive, still rejects `sessionPlan`/`dueContracts`      | `gateDecisions` + `memoryStates` added                                                          |

Golden snapshots for `golden-001/002/003` were regenerated because `DerivedState` grew two keys. Only `golden-002`'s **event log** changed (the span fix and the canonical component ids); `golden-001` and `golden-003` event logs are byte-identical and gained `"gateDecisions": []`, `"memoryStates": []`.

### Commands run (verbatim results)

```
npm run lint                → clean (0 problems)
npm run format:check        → All matched files use Prettier code style!
npm run typecheck           → clean (root + all 6 workspaces, incl. domain src and test projects)
npm run test                → Test Files 33 passed (33) | Tests 468 passed (468)
npm run test:replay         → Test Files  2 passed  (2) | Tests  47 passed  (47)
npm run test:e2e            → PLACEHOLDER, exits 0 (WP-10 owns it; not evidence of anything)
npm run verify:export       → PLACEHOLDER, exits 0 (WP-03 owns it; not evidence of anything)
(cd apps/app && npx expo export --platform web) → Exported: dist (web bundle 1.1MB, 3 static routes)
```

Branch-point baseline for comparison: `npm run test` → 328 passed (328).

### Deviations and coordination requests (for CON)

1. **Root `package-lock.json` modified** (+10 lines): `npm install ts-fsrs@5.4.1 --save-exact --workspace @bunki/domain`. Mechanically unavoidable with npm workspaces; the diff is that one package. Same class as WP-02/WP-04's accepted lockfile note.
2. **Not a register deviation:** `ts-fsrs@5.4.1` (MIT) was already in the WP-00 dependency register; this is only its first installation.
3. **P2, no action needed:** the `golden-002` span defect above is fixed in place; recorded because it is a change to a WP-02 artefact made by a different builder.
4. **For WP-08 (B8):** `src/session/` is untouched. The session planner will want `DerivedState.memoryStates` (sorted by `contractId`, with `active` and `dueAt` as a canonical instant) as its due-queue input, and must not compute intervals itself (REQ-SCH-01).
5. **For WP-03 (B4):** export `appVersions` can take `FSRS_PIN` directly; it is frozen plain data. `DerivedState` gained `gateDecisions` and `memoryStates`, both JSON-representable and canonically ordered — the export round trip (T-14) must carry them.

### Residual risk, stated rather than papered over

FSRS is transcendental arithmetic (`exp`, `log`, `pow`) and ECMAScript does not require bit-identical results across engines. Mitigation: intervals are integer days or fixed step minutes; stability and difficulty are rounded to 8 decimals on the way out **and the rounded values are fed back in on the next review**, so a last-bit difference is absorbed at each step instead of compounding across a review history. This is a real mitigation, not a proof — two engines could still straddle a rounding boundary. `golden-004` is the fixture that would catch it when WP-03's adapters and WP-11's device replay the same log. **No cross-runtime FSRS determinism claim is made here**; the in-memory reference is all this WP verified.

### Secrets check (controller §15)

Staged diff scanned for `api[_-]?key|secret|bearer|password|token`, excluding the lockfile: **2 matches, both this paragraph** — the heading above and the sentence you are reading, which contain the pattern because they describe it. **0 matches in code, tests, or fixtures.** No `.env`, no credentials, no network calls anywhere under `src/`. Recorded this way rather than as a bare "0" because a scan that reports zero while the file it lives in matches is a scan someone has already learned to disbelieve.

### REQ-GATE-03 claim check

No efficacy, burden-reduction, retention, or "scientifically optimized" claim appears in the code, the comments, or this section. FSRS is described as an engineering scheduler choice. The gate's rejection reasons state what did not count and why; nothing asserts what a learner knows.

### Next safe command

- V2 verifies WP-06 from a clean checkout of this branch: `git checkout agent/bunki-phase0-closed-loop-wp06 && npm ci && npm run lint && npm run format:check && npm run typecheck && npm run test && npm run test:replay`, then `git diff --stat 755c090..HEAD` to confirm no surface outside `packages/domain/**` (plus the lockfile and this capsule) was touched, then walk the controller §6.2 bullet list against `packages/domain/test/evidence/`.
- INT may stack this branch onto the integration branch after WP-01/02/04.

## Appendix — WP-05 (Builder B6): capture/search and layered word/kanji pages

**Agent:** B6 (Builder, WP-05) · **Wave:** W3 · **Date:** 2026-07-27
**Branch:** `agent/bunki-phase0-closed-loop-wp05`
**Surfaces touched:** `apps/app/` only, plus `docs/build-evidence/screenshots-wp05/`
and this appendix. Root `package-lock.json` moved mechanically (see deviations).

### Integrity (launcher step 1, controller §0)

Verified on this checkout before any edit:

| File | SHA-256 | Matches integrity record |
| --- | --- | --- |
| `docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md` | `de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47` | yes |
| `docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md` | `5ee28477054fc57f476e5e8cce8f4d35c5c309be5f21bac8adaf041ba91b0c55` | yes |
| `docs/specs/BUNKI_PHASE0_MULTI_AGENT_BUILD_ORCHESTRATION_SPEC_2026-07-27.md` | `4163184050f6797e9e1e766c68fed112b73eca4c85e29031d83635d212155a71` | yes |
| `docs/specs/BUNKI_PHASE0_FRESH_AGENT_LAUNCHER_2026-07-27.md` | `b0a6811d8e8fda6c2d5f1c7c1743cdb2355eae58b58e834787b79629e378fce7` | yes |

### Stacking (controller §3 rule 1)

Branched from `origin/agent/bunki-phase0-integration` at **`755c090`** — WP-01,
WP-02 and WP-04 are verified there but were not yet on `main` when this work
started. WP-05 depends on WP-02 (`@bunki/domain` events and reducers) and WP-04
(`@bunki/seed`), so basing on `origin/main` was not possible without them.

Re-checked at the end of the session: `origin/agent/bunki-phase0-integration`
has since advanced to `f9f4d0e` ("refresh from main, PRs #5/#6/#7 merged",
`origin/main` = `e02b8b2`). **`git diff --stat 755c090 f9f4d0e` is empty** — the
advance is merge commits only and the tree is identical, so this branch needs no
rebase and its checks were run against the same content the integration branch
now holds.

WP-03 is being built in a parallel lane and is deliberately **not** consumed;
see deferred item WP05-D1.

### Closure predicate status

| Predicate (controller §19 WP-05) | Status | Evidence |
| --- | --- | --- |
| Screens 1–3 functional on Expo Web against seed data | met | `expo export --platform web` green; 26 screenshots of the exported bundle in `docs/build-evidence/screenshots-wp05/` |
| Capture flow meets REQ-UI-01 (ack before enrichment) | met | shots 03/04/05; `apps/app/test/capture-flow.test.ts` (18 tests) |
| Layers render with provenance | met | shots 11/12; `apps/app/src/ui/notices.tsx`, `test/provenance-display.test.ts` |
| loading / error / empty / offline on every screen | met | shots 01,02,07,08,09,14,15,16,17,22,23,24,25; `test/view-state.test.ts`, `test/screen-contract.test.ts` |
| Screenshot evidence under `docs/build-evidence/` | met | `screenshots-wp05/` + `README.md` index + machine-readable `index.json` |
| SEED_ENTRY_DISCLOSURE on word and kanji pages | met | shots 11–13, 19–21; asserted in `test/screen-contract.test.ts` |
| Stroke-order animation from seed KanjiVG SVGs | met | shots 19/20/21; `src/data/kanjivg.ts` + `test/stroke-order.test.ts` (19 tests, parses all 10 real seed files) |
| Dictionary indices never rendered | met | `test/screen-contract.test.ts` scans every app source file for all eleven index names |
| Japanese typography: ruby, ink-and-paper, one vermilion accent, no rainbow | met | `src/ui/ruby.tsx`, `src/ui/furigana.ts`, `src/ui/theme.ts`; `test/furigana.test.ts`, `test/theme-contrast.test.ts` |
| Accessibility: labels, ≥44 pt targets, AA contrast | met | `accessibilityLabel` required by type on every control; `test/touch-targets.test.ts`; `test/theme-contrast.test.ts` (39 assertions, both schemes) |
| AppStore interface + in-memory impl, no `@bunki/persistence` | met | `src/state/store.ts`, `src/state/memory-store.ts`; lint boundary green; `test/screen-contract.test.ts` import scan |
| Capture events flow through `@bunki/domain`; app has no scheduling/grading/evidence logic | met | only `memory-store.ts` calls `createDomainEvent`; scan test asserts screens do not; lint boundary green |
| Expo web export still builds | met | `Exported: dist`, 869 modules, 5 static routes |

### Commands run (verbatim results)

| Command | Result |
| --- | --- |
| `sha256sum` on the four spec files | 4/4 match the integrity record |
| `npm install` | 704 + 13 packages added; no blocking failure |
| `npm run lint` | clean, exit 0 |
| `npm run format:check` | "All matched files use Prettier code style!" |
| `npm run typecheck` | clean across root + all 6 workspaces |
| `npm run test` | **30 files, 515 tests, all passed** (apps/app contributes 10 files / 189 tests) |
| `npm run test:replay` | 2 files, 43 tests passed |
| `npm run test:e2e` | WP-10 placeholder — exits 0 with an explicit "not evidence of anything working" notice |
| `npm run verify:export` | WP-03 placeholder — same |
| `(cd apps/app && npx expo export --platform web)` | `Exported: dist` — 1.4 MB bundle, 5 static routes |
| `node apps/app/scripts/capture-evidence.mjs` | **26/26 screenshots written**, exit 0 |

### What was built

- **`src/ui/`** — design tokens (ink-and-paper, exactly one vermilion accent),
  a WCAG contrast module, ruby/furigana rendering with an okurigana anchor
  walk, interactive primitives with `accessibilityLabel` required by the type
  system, the four REQ-UI-09 state panels, the stroke-order renderer, and the
  truth-label components.
- **`src/data/`** — read-only views over `@bunki/seed`: search/lookup, the
  KanjiVG stroke parser, provenance wording, and a stroke manifest cross-checked
  against the seed.
- **`src/state/`** — the `AppStore` seam, its in-memory implementation, the
  production `DomainContext`, the lookup state machine, the connectivity
  observer, and the deferred register.
- **`src/screens/`** — the three screens.
- **`app/`** — routes `/`, `/word/[lexemeId]`, `/kanji/[character]`.
- **`scripts/capture-evidence.mjs`** — the CDP screenshot harness (no new
  dependency: Node 22's global `WebSocket` plus the DevTools Protocol).

Two defects found and fixed, worth a verifier's attention:

1. **A real hydration bug.** `expo export` statically renders every route with
   no colour scheme, so a client whose first render disagreed (dark OS, or
   `?scheme=dark`) hydrated dark content onto the server's light markup — the
   screen background stayed light under dark cards for every node that never
   re-rendered. Reproduced in the browser (the scroll container still held the
   server's `rgba(251,248,243,1.00)` while a card held `rgb(30,27,22)`), fixed
   by resolving the scheme after mount in `ThemeProvider` and reading it through
   a component *inside* the provider in `app/_layout.tsx`. This affected real
   dark-mode users, not only the evidence harness.
2. **A double-tapped promotion threw.** The kernel rejects `from === to`
   (REQ-DM-09, correctly), so a second tap on the button that had just promoted
   a thread would have surfaced a `PromotionTransitionError` to the user.
   `memory-store.ts` now treats it as the idempotent repeat it is.

### Honesty boundaries held (REQ-GATE-03, P0-CAP-15)

- No screen claims durability. The store reports `in-memory-session-only` and
  the UI renders that sentence verbatim; T-01 belongs to WP-03.
- `SEED_ENTRY_DISCLOSURE` comes from `@bunki/seed` and is never retyped
  (asserted). Every project-authored field renders as "Written for this
  project · not reviewed · not from a published dictionary" — the wording is
  driven by `review_status`, so nothing unverified can read like a citation.
- Layer 2/3 sections the seed cannot fill say what is missing and why, rather
  than being silently omitted or filled with something plausible.
- No AI candidate exists on any of these screens; enrichment is a second pass
  over the bundled seed. `@bunki/ai` is WP-07's.
- No performance number is claimed; nothing was measured.
- Web results are labelled web results throughout.

### Deviations from the WP-00 pinned register (surfaced, not silent)

1. **`react-native-svg@15.15.4` added** to `apps/app` dependencies. MIT
   (`npm view react-native-svg license` → `MIT`, verified this session); pinned
   exactly to the version `expo@57.0.8` bundles
   (`expo/bundledNativeModules.json` → `15.15.4`). Not in the controller §14
   register. It is needed because REQ-UI-03 Layer 0 requires a stroke-order
   animation, which requires drawing individual bezier paths — nothing else in
   the dependency set can. Cross-platform (web + native), so it does not
   prejudge WP-11.
2. **`@types/node@26.1.1` added** to `apps/app` devDependencies (MIT,
   type-only). Same package and version WP-02/WP-04 already added; already
   recorded by CON as a register deviation to re-verify at WP-10. Confined to
   `tsconfig.test.json`; the app program compiles with **no** Node types, so a
   Node global in shipped code is a type error.
3. **`@bunki/domain` and `@bunki/seed` declared** as `apps/app` dependencies.
   They resolved through workspace hoisting already; declaring them makes the
   dependency real rather than incidental.
4. **Root `package-lock.json` modified** — mechanically unavoidable, as with
   WP-02/WP-04: npm workspaces keep one lockfile. Flagged, not treated as an
   ordinary in-surface edit.

### Deferred, with owners (also machine-readable in `apps/app/src/state/deferred.ts`)

| Id | Item | Owner | Closes with |
| --- | --- | --- | --- |
| WP05-D1 | Swap the in-memory `AppStore` for `@bunki/persistence` | W4 integration | Route appends through the domain command handler to `EventStorePort`, keeping the synchronous local acknowledgment ahead of the durable write; then re-label durability `device-local` and run T-01 |
| WP05-D2 | The uncertainty *dimension* is not in the event log | CON → ADR-002 decision | ADR-002 amendment widening `uncertaintyMark`, or an explicit ruling that the dimension stays app-local |
| WP05-D3 | Word layers 2–3 thin; kanji layers 2–3 absent | Operator (egress), then WP-04 | Licensed source data in `packages/seed`; the sections already render from the dataset |
| WP05-D4 | Native connectivity unobserved (`unknown`, no banner) | WP-11 | A verified network dependency, or a device-measured decision that the banner is unnecessary |
| WP05-D5 | No Layer 0 audio | WP-04 / later phase | A licence-verified local audio set with per-field provenance |

### Coordination requests (for CON)

1. **ADR-002 / REQ-UI-01 tension — needs a ruling, not an edit.** REQ-UI-01
   specifies a five-way one-gesture uncertainty mark
   (`meaning · reading · use · kanji · not sure`). The frozen v1 schema records
   `EncounterCaptured.uncertaintyMark` as `z.literal(true).optional()` — the
   *fact* of a mark, not the dimension. WP-05 took the conservative reading
   (controller §0.3): the UI offers all five, the event records `true`, and the
   dimension is held app-locally and labelled on screen as not exported.
   Widening the field is an ADR-002 amendment, which is an escalation. **P1** —
   the requirement is not fully satisfiable in the log until it is decided.
2. **`eslint.config.mjs` Node-globals glob is root-only** — the same P2 WP-04
   raised, second instance. `files: ['scripts/**/*.mjs']` does not reach
   `apps/app/scripts/*.mjs`. Worked around without touching WP-01's surface by
   importing `process`, `Buffer` and the timers from `node:` modules in the
   evidence harness. No change requested; recorded for the WP-10 sweep. **P2**
3. **Register deviations 1–3 above** need recording in the WP-10 licence pass.
   **P2**
4. **`src/data/stroke-sources.ts` reaches `packages/seed/data/strokes/*.svg` by
   relative path**, because `@bunki/seed` exports only `.` and widening its
   `exports` map would edit WP-04's surface. No share-alike data is copied out
   of `packages/seed` — the bundler reads the files in place (controller §4,
   DL-33). If WP-04 later exports the stroke text, this becomes a one-line
   change. **P2**

### Surfaces touched

`apps/app/**` — `app/` (3 routes + layout), `src/{ui,data,state,screens}/`,
`test/` (10 files), `scripts/capture-evidence.mjs`, `svg-text-transformer.js`,
`metro.config.js`, `package.json`, `tsconfig.json`, `tsconfig.test.json`,
`README.md`; `docs/build-evidence/screenshots-wp05/` (26 PNG + README +
`index.json`); this capsule section; root `package-lock.json` (mechanical).

Removed: `src/state/scaffold.ts` and `test/scaffold.test.ts`. The scaffold notice
read "No learning features are implemented yet", which stopped being true in this
work package — leaving it would have been a false statement in the codebase.

**No frozen doc touched.** No `docs/specs/`, `docs/convergence/`,
`docs/handoffs/`, `docs/adr/`. No other package. No CI. No `eslint.config.mjs`.
Nothing pushed to `main` or to the integration branch.

### Secrets check (controller §15)

`apps/app/**` and the evidence README scanned for
`api[_-]?key|secret|bearer|password|passwd|token`: **8 matches, all false
positives** — "design token", "change token", and a loop variable named `token`
in the palette test. No `.env`, no credentials, no network endpoint other than
the harness's own `127.0.0.1` server. Screenshots contain seed data and
timestamps only.

### Toolchain recorded at this checkpoint

`node v22.22.2` · `npm 10.9.7` · `typescript 6.0.3` · `eslint 10.8.0` ·
`prettier 3.9.6` · `vitest 4.1.10` · `expo 57.0.8` · `react-native 0.86.0` ·
`react-native-web 0.21.2` · `react-native-svg 15.15.4` · `zod 4.4.3` (via
`@bunki/domain`). FSRS is not pinned by this work package — no scheduler code
exists in `apps/app` and none may.

### Next safe command

- V5 verifies WP-05 from a clean checkout of this branch:
  `npm ci && npm run lint && npm run format:check && npm run typecheck && npm run test`,
  then `(cd apps/app && npx expo export --platform web)` and
  `node apps/app/scripts/capture-evidence.mjs` (needs a Chromium binary; set
  `CHROME_PATH` if no Playwright browser cache is present), then
  `git diff --stat 755c090` to confirm no surface outside `apps/app/` and the
  screenshot directory was touched.
- W4 may consume `apps/app/src/ui/*` and `src/state/app-context.tsx`. Per
  orchestration spec §4, `app/_layout.tsx` and the shared `src/ui` primitives
  stay with B6; B8's session/canvas screens should request changes via CON.

---

## Appendix — WP-05 (Builder B6, repair round): two P1 honesty defects closed

**Agent:** B6 (Builder, WP-05) · **Wave:** W3 · **Date:** 2026-07-27
**Branch:** `agent/bunki-phase0-closed-loop-wp05` · **Repair base:** `ef689ba`
**Surfaces touched:** `apps/app/` and `docs/build-evidence/screenshots-wp05/`,
plus this appendix. Nothing else.

This section is **appended, not a rewrite**. Where it contradicts the earlier
WP-05 appendix, this one supersedes it, and it says so explicitly below — the
earlier text is left standing because a capsule that quietly edits its own past
claims is exactly the failure mode both of these defects were.

### Integrity re-verified before any edit (launcher step 1)

| File | SHA-256 | Matches `BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt` |
| --- | --- | --- |
| `…CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md` | `de7b6fcc…859b47` | yes |
| `…V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md` | `5ee28477…1b0c55` | yes |
| `…MULTI_AGENT_BUILD_ORCHESTRATION_SPEC_2026-07-27.md` | `41631840…155a71` | yes |
| `…FRESH_AGENT_LAUNCHER_2026-07-27.md` | `b0a6811d…78fce7` | yes |

### Stacking (controller §3 rule 1)

This repair round continues the existing WP-05 branch at **`ef689ba`**, which was
itself cut from `origin/agent/bunki-phase0-integration` at **`755c090`**
(WP-01/02/04 verified there, not yet on `main`). Re-checked this session:
integration has advanced to **`f9f4d0e`** and `git diff --stat 755c090 f9f4d0e`
is still empty — merge commits only, identical tree — so no rebase is needed and
these checks ran against the content the integration branch holds today.

### Finding 1 (P1) — ruby pieces were *not* hidden from the accessibility tree

**What was actually wrong.** `ruby.tsx` hid its furigana pieces with
`importantForAccessibility="no"`. That prop is Android/iOS-only.
`react-native-web@0.21.2` forwards only the props in `modules/forwardedProps` —
`aria-hidden` is in that table, `importantForAccessibility` is not — so on Expo
Web, the Phase-0 target runtime (REQ-ARCH-01), the prop was dropped and every
piece stayed exposed. The header comment and the predicate row both said the
opposite. Two aggravating details were real as well: the `opacity: 0`
ideographic-space placeholder was an exposed text node of its own, and the
intended single label sat as `aria-label` on a `role=generic` container, where
ARIA prohibits naming.

**Reproduced, not taken on trust.** The pre-repair bundle was rebuilt and audited
over CDP. Chrome reported five exposed named nodes under the headword:

```
分かれる（わかれる） | わ | 分 | 　 | かれる
```

**What was done.**

- Both pieces now carry **`aria-hidden`**. React Native ≥0.71 maps it onto
  `accessibilityElementsHidden` (iOS) and
  `importantForAccessibility: 'no-hide-descendants'` (Android), so the modern
  spelling is strictly more portable than the one it replaces rather than a
  web-only concession.
- The empty ruby slot is a **sized spacer `View`**, not transparent text. An
  empty text node is content: it reached the accessibility tree and a copied
  selection alike.
- The single spoken label is carried as **real text content** in a clipped 1×1
  node, not only as an `accessibilityLabel`.

**A deliberate deviation from the prescribed fix, with the measurement behind
it.** The finding proposed `accessibilityRole="text"` on the container so the
name would sit on a leaf rather than a generic. Measured against the installed
react-native-web, that does not work: `AccessibilityUtil/propsToAriaRole` maps
`text → null`, so the role is dropped and the element stays `role=generic`. The
prop is kept for its native meaning, but it is *not* what makes the label
reachable — the text content is. Adopting the prescription alone would have
re-shipped an unverified accessibility claim, which is the defect class being
repaired.

**Guards added.**

- `apps/app/test/ruby-accessibility.test.ts` (renderer-free, 6 tests). Its
  load-bearing assertion reads the **installed** react-native-web and checks that
  the prop the component relies on is one that version actually forwards — the
  check whose absence let this ship. Run against the pre-repair source, 5 of its
  6 tests fail.
- An `Accessibility.queryAXTree` audit in `scripts/capture-evidence.mjs`, run
  against the real `expo export` output, asserting one exposed named node whose
  name is the whole word. Results in
  `docs/build-evidence/screenshots-wp05/accessibility-audit.json`.

**Falsified before trusted.** Against the pre-repair build the audit fails 7 of 8
checks and reprints the interleaving above; against the repaired build it passes
8 of 8, reporting exactly one exposed node named `分かれる（わかれる）` and one
named `分岐（ぶんき）`.

**No visual change.** Shots `11-word-layers-0-1.png` and
`12-word-layers-2-3.png` are byte-identical before and after, which is the
intended outcome: the ruby column looks the same and only the accessibility tree
changed.

### Finding 2 (P1) — the screens stated a falsehood about the event log

**What was actually wrong.** Both screens said unconditionally that the log
records the *fact* of an uncertainty mark. That is true only for a mark chosen
**before** Keep, which rides on `EncounterCaptured.uncertaintyMark`. A mark
applied **after** Keep writes nothing at all: `applyMarkUncertainty` emits no
event by design. On that path the learner saw a selected chip, a thread row
reading `keep · uncertain: reading`, an acknowledgment listing
`EncounterCaptured, ThreadPromotionChanged` with no mark anywhere in it, and a
sentence telling them the fact of their mark was durable and exportable. It was
not — fact and dimension were both lost. This is the REQ-GATE-03 / P0-CAP-15
class the work package is judged on.

**What was done.** The sentence is now derived from the thread rather than
asserted, by `uncertaintyLogNote` in `src/state/store.ts`, which both screens
call. Four branches, each true of the state it describes:

| State | What the screen now says |
| --- | --- |
| not kept yet | "Keeping this with a mark records in the event log that a mark exists; which dimension you chose is kept on this device only…" |
| kept, mark was on the captured event | "The event log records that a mark exists; which dimension you chose is kept on this device only…" |
| kept, mark applied after Keep | "This mark was applied after Keep, so it is on this device only — it is not in the event log and will not be exported…" |
| kept, no mark now | "A mark added now stays on this device only — the log records a mark only on the captured event…" |

The fourth branch exists for a case the finding did not name and a naïve fix
would have got wrong: **clearing** a mark after Keep cannot retract the
`uncertaintyMark` already on the captured event, so the screen must not claim the
log is now free of one. `test/capture-flow.test.ts` asserts that asymmetry
directly.

**Guards added.** `test/capture-flow.test.ts` gains the case the finding asked
for — a capture with `uncertainty: null` followed by `markUncertainty` leaves no
`uncertaintyMark` in `readAll()` — plus five cases that derive the sentence from
a real store run, so the wording cannot drift from the behaviour. A scan in
`test/screen-contract.test.ts` fails if either screen states the claim as a
literal again. Screenshot `27-capture-mark-after-keep.png` photographs the
corrected path.

**Deferred item widened.** `WP05-D2` said only that the *dimension* was missing,
which understated the loss. It now records that a post-capture mark reaches the
log in no form at all, and that clearing one cannot retract it. See the corrected
row below.

### Corrected predicate rows (supersede the rows in the WP-05 appendix above)

| Predicate | Earlier status | Corrected status | Evidence |
| --- | --- | --- | --- |
| Accessibility: labels, ≥44 pt targets, AA contrast | met | **met** — but the ruby half of it was *unverified* when first claimed, and was false on the web target | `accessibility-audit.json` (8/8 measured on the export); `test/ruby-accessibility.test.ts`; `test/touch-targets.test.ts`; `test/theme-contrast.test.ts` |
| Japanese typography: ruby, ink-and-paper, one vermilion accent | met | met (unchanged visually — shots 11/12 byte-identical) | `src/ui/ruby.tsx`, `test/furigana.test.ts` |
| No screen makes a claim it cannot support (REQ-GATE-03) | implied by "Honesty boundaries held" | **was not met** on the mark-after-Keep path; now met and guarded | `test/capture-flow.test.ts`, `test/screen-contract.test.ts`, shot 27 |
| Screenshot evidence under `docs/build-evidence/` | met (26 shots) | met — **27 shots plus a measured accessibility audit** | `screenshots-wp05/` + `README.md` + `index.json` + `accessibility-audit.json` |

### Corrected deferred row (supersedes the `WP05-D2` row above)

| Id | Item | Owner | Closes with |
| --- | --- | --- | --- |
| WP05-D2 | A mark made **before** Keep loses only its dimension; a mark made **after** Keep reaches the event log in no form at all, and clearing one cannot retract the `uncertaintyMark` already on the captured event | CON → ADR-002 decision | An ADR-002 decision covering both halves: an amendment widening `uncertaintyMark`, and an amendment giving a post-capture mark an event family — or an explicit ruling that a mark is a capture-time-only fact and everything after it stays app-local |

Coordination request 1 in the WP-05 appendix above should be read with this wider
scope: the tension is not only "the dimension is not in the log", it is
"REQ-UI-01 requires the mark to remain editable and the v1 schema cannot record
an edit". Still **P1**, still a ruling rather than an app edit.

### Commands run (verbatim results)

| Command | Result |
| --- | --- |
| `sha256sum` on the four spec files | 4/4 match the integrity record |
| `npm ci` | clean install in a fresh worktree |
| `npm run lint` | clean, exit 0 |
| `npm run format:check` | "All matched files use Prettier code style!" |
| `npm run typecheck` | clean across root + all 6 workspaces |
| `npm run test` | **31 files, 529 tests, all passed** (was 30/515; +1 file, +14 tests) |
| `npm run test:replay` | 2 files, 43 tests passed |
| `(cd apps/app && npx expo export --platform web)` | `Exported: dist` — 5 static routes |
| `node apps/app/scripts/capture-evidence.mjs` | **27/27 screenshots, 8/8 accessibility checks**, exit 0 |
| same harness against the **pre-repair** build | 27/27 screenshots, **1/8** accessibility checks — the defect reproduced |
| `npx vitest run apps/app/test/ruby-accessibility.test.ts` against pre-repair source | **5 of 6 fail** — the guard has teeth |

### Surfaces touched

`apps/app/src/ui/{ruby.tsx,furigana.ts}`,
`apps/app/src/state/{store.ts,deferred.ts}`,
`apps/app/src/screens/{capture-screen.tsx,word-screen.tsx}`,
`apps/app/scripts/capture-evidence.mjs`,
`apps/app/test/{ruby-accessibility.test.ts (new),capture-flow.test.ts,deferred.test.ts,screen-contract.test.ts}`,
`docs/build-evidence/screenshots-wp05/` (13 re-captured PNGs, 1 new PNG,
`README.md`, `index.json`, new `accessibility-audit.json`), and this appendix.

**No frozen doc touched.** No `docs/specs/`, `docs/convergence/`,
`docs/handoffs/`, `docs/adr/`. No other package, no other lane's surface, no CI,
no `eslint.config.mjs`, no dependency added or changed (`package.json` and
`package-lock.json` are untouched this round). Nothing pushed to `main` or to the
integration branch.

### Secrets check (controller §15)

Changed files scanned for `api[_-]?key|secret|bearer|password|passwd|token`:
matches are the pre-existing "design token" / "change token" prose only. The new
`accessibility-audit.json` contains seed vocabulary and Chrome-computed roles; no
host, no credential, no path outside the repo.

### Next safe command

- V5 re-verifies from a clean checkout of this branch:
  `npm ci && npm run lint && npm run format:check && npm run typecheck && npm run test`,
  then `(cd apps/app && npx expo export --platform web)` and
  `node apps/app/scripts/capture-evidence.mjs` (needs Chromium; set `CHROME_PATH`
  if no Playwright cache is present) — the run must report **8/8 accessibility
  checks**, not merely "screenshots written".
- To falsify the audit rather than trust it:
  `git show ef689ba:apps/app/src/ui/ruby.tsx > apps/app/src/ui/ruby.tsx`,
  re-export, re-run the harness, and confirm it drops to 1/8 and prints the
  interleaved node list. Restore with `git checkout apps/app/src/ui/ruby.tsx`.
- `git diff --stat 755c090` to confirm no surface outside `apps/app/` and
  `docs/build-evidence/screenshots-wp05/` (plus this capsule section) was touched.

## Appendix — WP-08 (Builder B8): session orchestrator, integration canvas, repair branch

**Agent:** B8 (Builder, WP-08) · **Wave:** W4 · **Date:** 2026-07-27
**Branch:** `agent/bunki-phase0-closed-loop-wp08`
**Surfaces touched:** `packages/domain/src/session/` (new), `packages/domain/test/session/`
(new), `apps/app/src/screens/{session*,canvas*}` (new), `apps/app/test/session-*.test.ts`
(new), and this appendix. Three files outside those were touched and each is
justified below under "Edits outside the new surfaces".

### Integrity (launcher step 1, controller §0)

Verified on `origin/main` before any edit, by piping the blob through `sha256sum`
rather than trusting a checked-out copy:

| File | SHA-256 observed | Matches `BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt` |
| --- | --- | --- |
| `docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md` | `de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47` | yes |
| `docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md` | `5ee28477054fc57f476e5e8cce8f4d35c5c309be5f21bac8adaf041ba91b0c55` | yes |
| `docs/specs/BUNKI_PHASE0_MULTI_AGENT_BUILD_ORCHESTRATION_SPEC_2026-07-27.md` | `4163184050f6797e9e1e766c68fed112b73eca4c85e29031d83635d212155a71` | yes |

### Stacking (controller §3 rule 1)

Cut from `origin/agent/bunki-phase0-integration` at
**`c30560b6dae7beaa09fdccaf4157ba0740e3e38f`** ("WP03+05+06(CON): close wave W3,
open W4 locks"), which carries verified WP-01..WP-06 plus the WP-05 UI. WP-08
depends on WP-05 (screens/shell), WP-06 (contracts, evidence gate, FSRS) and
WP-04 (`@bunki/seed` passage), none of which were on `origin/main` at `e02b8b2`
when this work started, so `origin/main` was not a possible base.

Re-fetched at the end of the session: `origin/agent/bunki-phase0-integration` is
still `c30560b` (unchanged); `origin/main` has advanced to `c87a2ee`. No rebase
was needed and none was performed.

**Cross-lane rule observed:** `apps/app/src/state` (AppStore) is untouched and
`@bunki/persistence` is not imported from `apps/app` — the swap-in remains WP-10
integration work. `apps/app/app/` (navigation) is untouched; see COORD-B8-3.

### Closure predicate status (controller §19 WP-08)

| Predicate | Status | Evidence |
| --- | --- | --- |
| 1. Session orchestrator is a **pure planner**: `{timeBudgetMin, dueContracts, newBudget, canvasId?}` → finite plan | met | `packages/domain/src/session/plan.ts`; `test/session/plan.test.ts` (31 tests) incl. 400 randomised inputs asserting `estimatedMinutes ≤ timeBudgetMin` |
| 1a. Plan shape: reactivation/precision → one bounded new item → one canvas visit → closure | met | `SESSION_STEP_KINDS`; `plan.test.ts` "the §6.4 running order" asserts the exact sequence; `PHASE0_MAX_NEW_ITEMS = 1`, `PHASE0_MAX_CANVAS_VISITS = 1` |
| 1b. Emits `SessionStarted` / `SessionClosed` | met | `runtime.ts` `startSession`/`closeSession` via `createDomainEvent`; `test/session/commands.test.ts` asserts the events, their budget, and a terminal `completionState` |
| 1c. **The plan cannot grow during a session** (T-13 unit half, property test) | met | `test/session/t13-plan-cannot-grow.test.ts`: 300 random interleavings of every v1 event family × 30 moves asserting plan **identity** (`toBe`), plus 60 random command sequences over a real replayed log, plus a case where new evidence makes another contract due |
| 1d. Session reaches a finite completion state | met | same file, "the session reaches a finite completion state" (5 tests) |
| 2. Session screen (REQ-UI-05): finite plan visible, progress, explicit completion | met (component + behaviour); **not yet routed** | `apps/app/src/screens/session-screen.tsx`; `apps/app/test/session-screens.test.ts` (plan/recipe/progress/completion/backlog-ordering); `apps/app/test/session-canvas.test.ts` drives the same functions the screen calls. Route wiring is COORD-B8-3 |
| 2a. loading / error / empty / offline on all three new screens | met | all three go through `useLookup` + `ScreenShell`; asserted in `session-screens.test.ts` "every WP-08 screen defines all four REQ-UI-09 states" |
| 3. Integration canvas renders the seed's thematic passage (分岐) | met | `canvas-screen.tsx` renders `pas-bunki-01` through `canvas-passage.ts`; `session-canvas.test.ts` asserts the segmentation reproduces the body byte-for-byte and finds the target |
| 3a. Inline interactions classified per REQ-SCH-06 (declared probe vs exposure) | met | `packages/domain/src/session/canvas.ts`; `test/session/canvas-req-sch-06.test.ts` (21 tests) covers **every** closed-list exposure reason |
| 3b. **A reveal-before-recall grades `Again`; a passive tap logs exposure only** | met | asserted twice: in the kernel (`canvas-req-sch-06.test.ts`) and from the app end against the real store, seed, contracts and gate (`apps/app/test/session-canvas.test.ts`) |
| 4. Minimal repair branch: one hard-coded diagnostic → branch → rejoin | met | `packages/domain/src/session/repair.ts` + `apps/app/src/screens/session-repair-screen.tsx`; `test/session/repair.test.ts` (28 tests) |
| 4a. **Rejoin declared by an evidence criterion, not step count** | met | `REJOIN_CRITERION` + `satisfiesRejoin`; the test drives 50 non-qualifying attempts (branch stays open) then one qualifying success (closes); `session-screens.test.ts` asserts no comparison on the attempt count exists in the screen |
| 4b. No generalized routing | met | `JourneyCompiler` declared and deliberately unimplemented; `JOURNEY_COMPILER_SEAM` records what is missing |
| 5. All prior tests stay green | met | `npm run test` → **60 files, 939 tests, 0 failed** |
| 5a. Grading/evidence logic stays in the domain gate; screens submit commands only | met | every evidence event is minted by `src/evidence/mint.ts` and judged by `admitToScheduler` inside `replay`; `commands.test.ts` asserts every evidence-class event this handler emits has a gate decision; `session-screens.test.ts` asserts no screen calls `applySessionCommand` or `createDomainEvent` directly |

### Commands run (controller §17.5), verbatim results

| Command | Result |
| --- | --- |
| `npm run lint` | pass (no output) |
| `npm run format:check` | `All matched files use Prettier code style!` |
| `npm run typecheck` | pass — all five workspaces, no diagnostics |
| `npm run test` | `Test Files 60 passed (60)` · `Tests 939 passed (939)` |
| `npm run test:replay` | `Test Files 2 passed (2)` · `Tests 47 passed (47)` |
| `npm run verify:export` | `Test Files 1 passed (1)` · `Tests 10 passed (10)` |
| `npm run test:e2e` | placeholder, exits 0, prints "not yet implemented (WP-10)" — **not** evidence of anything |
| `(cd apps/app && npx expo export --platform web)` | `Exported: dist` · 1 web bundle (1.5 MB) · **5 static routes** (`/`, `/_sitemap`, `/+not-found`, `/word/[lexemeId]`, `/kanji/[character]`) |

WP-08's own suites: **145 tests** across 7 files (`packages/domain/test/session/*`
= 103, `apps/app/test/session-canvas.test.ts` = 21,
`apps/app/test/session-screens.test.ts` = 21).

### Edits outside the new surfaces (three files, each justified)

1. **`packages/domain/src/index.ts`** — one line,
   `export * from './session/index.ts';`. The package's `exports` map is
   `{".": "./src/index.ts"}`, so without it the session module is unreachable
   from `apps/app` at all. The header note claiming `src/session/` stays empty
   was updated in the same edit because it had become false.
2. **`packages/domain/test/purity/seams-left-empty.test.ts`** — retargeted the
   assertion that `src/session/` is empty, exactly as WP-06 retargeted the same
   file for `src/contracts/` and `src/evidence/`. Nothing was weakened: the
   emptiness claim is replaced by a **stronger** one (the directory is populated
   *and* contains no scheduler import and no interval arithmetic), and replay is
   still asserted to derive no plan and no due queue.
3. **`apps/app/test/screen-contract.test.ts`** — the `src/screens/` listing was an
   exhaustive `toEqual` of WP-05's three files and would fail for any W4 builder.
   It is now an exhaustive `toEqual` over a `SCREEN_OWNERS` table naming the
   owning WP of each file, so it stays exhaustive and documents the §4 file-level
   split. **B7 will need to add its `candidate*` entries to the same table** —
   flagged here because it is a predictable merge conflict.

### Coordination requests (orchestration spec §2.4 / §5)

**COORD-B8-1 — flip the WP-08 seam status.** `PHASE0_SEAMS` in
`packages/domain/src/reducers/seams.ts` still reads `status: 'open'` for the
session planner, which is now false. `src/reducers/` is outside B8's W4 write
lock, so this is a request rather than an edit. The mismatch is **pinned as an
assertion** in `test/purity/seams-left-empty.test.ts` ("WP-08's entry is stale
pending COORD-B8-1") so that closing it forces the test and its comment to be
updated together. Requested change: `status: 'closed'`, with the rationale
updated to point at `src/session/`.

**COORD-B8-2 — join the session log to the AppStore.** `apps/app/src/state/`
(AppStore) is B6's and stays in-memory this wave by the cross-lane rule, so the
session's own events (`SessionStarted`, embedded/standalone `ReviewGraded`,
`ExposureLogged`, `SessionClosed`, the two `ContractCreated`) live in the
screen's workspace beside the store's log rather than inside it. Consequence,
stated on screen and in `SESSION_INTEGRATION_NOTE`: the evidence inspector
(WP-09) will not see session events until they are joined. `useSessionLoop`
already takes an `onEvents` callback that emits exactly the new events, so the
WP-10 integration is: give `AppStore` a way to accept them (an `append(events)`,
or route the session through the same command handler `memory-store.ts` uses),
pass `onEvents`, and delete `SESSION_INTEGRATION_NOTE`.

**COORD-B8-3 — three route files.** `apps/app/app/` is navigation and B6's. The
three screens are complete and take navigation callbacks, so wiring them is three
new files and no change to any existing one. The gap is pinned by an assertion in
`screen-contract.test.ts` ("leaves WP-08's screens unrouted pending COORD-B8-3").
Exact contents requested:

```tsx
// apps/app/app/session.tsx
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { SessionScreen } from '@/screens/session-screen';
import { createRuntimeContext } from '@/state/runtime';

const context = createRuntimeContext();

export default function SessionRoute(): ReactNode {
  const router = useRouter();
  return (
    <SessionScreen
      context={context}
      onBack={() => router.push('/')}
      onOpenCanvas={() => router.push('/canvas')}
      onOpenRepair={() => router.push('/repair')}
    />
  );
}
```

```tsx
// apps/app/app/canvas.tsx
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { CanvasScreen } from '@/screens/canvas-screen';
import { createRuntimeContext } from '@/state/runtime';

const context = createRuntimeContext();

export default function CanvasRoute(): ReactNode {
  const router = useRouter();
  return <CanvasScreen context={context} onBack={() => router.push('/session')} />;
}
```

```tsx
// apps/app/app/repair.tsx
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { SessionRepairScreen } from '@/screens/session-repair-screen';
import { createRuntimeContext } from '@/state/runtime';

const context = createRuntimeContext();

export default function RepairRoute(): ReactNode {
  const router = useRouter();
  return <SessionRepairScreen context={context} onBack={() => router.push('/session')} />;
}
```

Note for whoever wires these: a per-route `DomainContext` means each route
bootstraps its own workspace, so the three screens do **not** share session state
across navigation. Sharing it is the same change as COORD-B8-2 (one workspace
above the navigator), and doing them together is cheaper than doing either alone.

### Honest limitations of this work package

- **Not verified in a browser.** `expo export --platform web` is green but the
  three new screens are not in the bundle, because nothing routes to them
  (COORD-B8-3). Their behaviour is verified against the exact functions they
  call, and their rendering by source assertions; neither is a substitute for a
  screenshot, and none is claimed to be.
- **No render tests.** This project installs no React Native test renderer, so
  every behavioural assertion runs against `bootstrapSessionWorkspace` and
  `applySessionCommand` directly. `bootstrapSessionWorkspace` is exported for
  exactly that reason and is the same function the hook calls.
- **`STEP_COST_MINUTES` is a budgeting convention, not a measurement.** No timing
  study produced it and none is claimed (REQ-GATE-03). It is exported so a later
  WP can replace it with measured values.
- **REQ-SCH-04 part (5), transfer, is not implemented.** Recorded in
  `SESSION_PHASE0_COLLAPSE.notImplemented` rather than left as an absence: it
  needs REQ-JRN-04 contrast gating and a second context, and a step that
  resembled transfer while being a second review would misreport what the learner
  did.
- **The repair diagnostic writes no event.** The v1 catalog has no family for a
  diagnostic answer and inventing one would be an ADR-002 change made in the
  wrong package, so the answer lives on the repair state. Same shape as WP-05's
  uncertainty-dimension deferral (WP05-D2).
- **The seed passage embeds 分岐 only inside 分岐点.** The segmenter therefore
  prefers the promoted target over a longer word containing it; under a plain
  longest-first rule the canvas would have offered no probe at all while looking
  like a working page. The rule and its reason are asserted in
  `apps/app/test/session-canvas.test.ts`.

### Environment note (not a repo defect — recorded so nobody re-chases it)

This branch was built in a git worktree with no `node_modules` of its own. Module
resolution fell back to the parent checkout, where the root hoists `zod@3.25.76`
(a transitive dependency) while the lockfile places `zod@4.4.3` under
`packages/{domain,export,seed}/node_modules`. Until per-package `node_modules`
were linked into the worktree, two `packages/domain/test/events/catalog.test.ts`
cases and the `@bunki/seed` typecheck failed against zod v3 semantics
(`.refine()` has no `.shape`; no `z.prettifyError`). **After linking, all 939
tests and every typecheck pass.** Nothing in the repository was changed for this,
and a normal `npm install`/`npm ci` at the repo root does not reproduce it.

### Next safe command

```bash
git fetch origin && git log --oneline -3 origin/agent/bunki-phase0-integration
npm run lint && npm run format:check && npm run typecheck && npm run test
```

V-role verifier: re-run the above from a clean checkout of
`agent/bunki-phase0-closed-loop-wp08`, then
`git diff --stat c30560b..HEAD` to confirm no surface outside the list at the top
of this appendix was touched.

## Appendix — WP-08 (Builder B8, repair round): the canvas told the kernel what it wished were true

**Agent:** B8 (Builder, WP-08 repair) · **Wave:** W4 · **Date:** 2026-07-27
**Branch:** `agent/bunki-phase0-closed-loop-wp08` · **Repair base:** `b3d5d06`
**Surfaces touched:** `apps/app/src/screens/{canvas*,session*}`,
`apps/app/test/{session-canvas,session-screens,screen-contract}.test.ts`,
`packages/domain/src/session/commands.ts` (comment + two comments at the key
sites), `packages/domain/test/session/commands.test.ts`, and this appendix.
Nothing else. `apps/app/src/state/` and `apps/app/app/` are untouched, and
`@bunki/persistence` is still not imported from `apps/app`.

### Integrity (launcher step 1, re-verified this round)

| File | SHA-256 observed | Matches the integrity record |
| --- | --- | --- |
| `docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md` | `de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47` | yes |
| `docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md` | `5ee28477054fc57f476e5e8cce8f4d35c5c309be5f21bac8adaf041ba91b0c55` | yes |
| `docs/specs/BUNKI_PHASE0_MULTI_AGENT_BUILD_ORCHESTRATION_SPEC_2026-07-27.md` | `4163184050f6797e9e1e766c68fed112b73eca4c85e29031d83635d212155a71` | yes |

### Stacking, and one deliberate deviation from the wave instruction

The wave instruction says to cut from the **current**
`origin/agent/bunki-phase0-integration` head, which is now
**`795cc8c`** (was `c30560b` when WP-08 was cut). This round did **not** rebase.
A repair round is re-verified against the findings it answers, and rebasing would
have made the diff a mixture of the repair and three other lanes' merges, so the
one thing a verifier needs to read — what changed because of the findings —
would no longer be readable. `git log --oneline c30560b..795cc8c` is four
refresh/merge commits from `main` (PRs #8/#9/#10) and carries no lane work WP-08
depends on, so nothing was gained by taking them. **Flagged for the Conductor:**
integrating this branch is still a normal merge onto `795cc8c` or its successor.

### Findings answered

#### P0 — the screen reported `targetWasHidden: true` while showing the word

Reproduced exactly as filed. `canvas-screen.tsx` held the real answer in
`targetHidden` and then wrote the literal `true` on both probe paths
(`answer()` and `reveal()`), and the four grade buttons carried no `disabled`
prop while the reveal button did. So after one honest answer the word was
printed in the passage and the grades stayed live, and each further press minted
a tier-A `ReviewGraded` that the gate admitted. That is REQ-SCH-06's priming rule
defeated at the one seam where the kernel has to trust its caller, and DL-19's
"relabelled exposure → false mastery" arriving through the app rather than
through the classifier.

**What changed.** The presentation is now a state machine —
`apps/app/src/screens/canvas-cloze.ts` — with three phases (`hidden`,
`revealed`, `answered`) and one predicate, `targetIsHidden`, read by the cloze
mask, the accessibility label, both `disabled` props and the `targetWasHidden`
the kernel is told. They can no longer disagree, because there is one of them.
`canAttempt` is false once the blank is settled, and `disabled={settled}` is on
the reveal **and** the four grades, so one blank yields at most one declared
probe. Revealing settles it too: a reveal already mints a complete probe graded
`again`, and grading afterwards would be a second tier-A observation of one
attempt.

**Why it is a module rather than three corrected lines.** The reason 145 tests
could not see this is that every app-level test *supplied* `targetWasHidden:
true` by hand. A test that provides the field under test cannot fail for this
class of defect. The state machine is pure and exported, so the new tests drive
the same transitions and the same interaction payloads the component dispatches
and never state the field themselves.

**Verified by mutation, not by assertion.** Restoring the literal
(`targetWasHidden: true` in `answerCloze`) and re-running turns four tests red —
three behavioural in `session-canvas.test.ts` ("classifies a second press as
exposure…", "moves memory once for ten presses of Good on one blank", "settles
the blank on a reveal too…") and one source scan in `session-screens.test.ts`
("never states targetWasHidden as a literal"). The mutation was then reverted;
the file is byte-identical to the version under test.

The ten-press case now reads: **1** `ReviewGraded`, **9** `ExposureLogged`, one
admitted gate decision, and `derived.memoryStates` byte-identical after press 2
through press 10.

#### P1 — the idempotency docstring described a rule only one path follows

Confirmed and corrected, and the correction is the *second* option offered in
the finding rather than the first. The first option — deriving the canvas key
from the interaction's content — does not do what it appears to: `replay`
collapses a repeated `idempotencyKey` only when the second event is
byte-identical **including its `eventId` and `occurredAt`**, and every mint draws
a fresh id from the injected generator and a fresh instant from the injected
clock. A content-derived key on that path therefore would not collapse a genuine
repeat; it would raise `IdempotencyConflictError` and refuse the whole log. It is
also the wrong model: two taps on a word are two encounters, and two repair
probes are two attempts `REJOIN_CRITERION` has to count separately.

So the docstring on `applySessionCommand` now states each path — `answerStep`
keyed by session and step (a step settles when it is answered, so a racing double
tap does collapse), canvas and repair keyed positionally and why — and says
plainly what protects the probe path instead: the screen's one-attempt rule and
the classifier's `target_was_already_visible`, neither of which is the key.
Four tests in `packages/domain/test/session/commands.test.ts` pin it, including
one that rewrites the two canvas keys to a shared content key and asserts
`replay` throws.

**Open §17.2 item (recorded, not implied):** canvas and repair double taps are
**not** deduplicated by their idempotency keys. Closing that needs the handler to
look up a prior event by content key and reuse its `eventId` and `occurredAt`
rather than minting — a real design decision about whether a repeated exposure is
one encounter or two, and not something to settle inside a repair round.

#### P1 — `latencyMs: 0` was a constant in all three screens

Now measured, in all three, from the injected clock via `loop.now()` and never
`Date.now`. `apps/app/src/screens/session-timing.ts` holds the two pieces:
`elapsedMs(from, to)` and `usePresentedAt(now, presentationKey)`, which marks the
instant the thing in front of the learner became answerable and re-marks it when
the presentation changes (a new step, the next repair attempt). The canvas marks
at mount, which is when the blank went on screen.

Three details worth a verifier's attention:

- a **`0` now means the clock did not move** — which is the truth under a pinned
  fixture clock — rather than "nobody measured". `elapsedMs` clamps a backwards
  clock to `0` (the field is `int().min(0)`, and a negative duration is not a
  thing that can be true of an attempt) and deliberately does **not** rescue an
  unparseable instant into a zero: that produces `NaN` and fails at the
  fail-closed parser, which is where a broken clock should surface;
- the **reveal path also carries a measured latency** now. It used to fall
  through to the kernel's default attempt, which is `latencyMs: 0` — accurate as
  "nothing was recorded", indistinguishable from a fabricated zero once in the
  ledger. Giving up took time and that interval is real;
- `revealedBeforeRecall` on the answer path is **derived** from the phase rather
  than asserted. Under the one-attempt rule it is provably always `false` today;
  it is computed anyway so that a future change re-opening grading after a reveal
  reports the truth instead of inheriting a literal that used to be true.

#### P1 — the three screens are still unreachable in the built app

**Still not met, and still not B8's to close.** `apps/app/app/` is B6's under the
W4 surface lock; B8 left it untouched. What this round could do, and did, is make
the coordination request *correct*, because as filed it would have shipped a
second defect — see the revised COORD-B8-3 below.

The web export was re-run in this worktree and is **not usable as evidence in
either direction this round**: `npx expo export --platform web` exits 0, bundles
both the client and the static-render bundle, and emits **zero** static routes —
including `/`, `/word/[lexemeId]` and `/kanji/[character]`, which are WP-05's,
predate this branch, and are byte-identical to the base commit. Routes that
cannot be affected by this diff disappearing is what shows the degradation is the
worktree's synthesized `node_modules` (see the environment note in the previous
appendix) and not the change. The recorded 5-route baseline stands; this run
replaces nothing.

### Closure predicate status, updated (controller §19 WP-08)

Only the rows this round moved are repeated; everything else stands as recorded
in the previous appendix.

| Predicate | Status | Evidence |
| --- | --- | --- |
| 3a. Inline interactions classified per REQ-SCH-06 (declared probe vs exposure) | **met on the app path** (was claimed met; it was not) | `canvas-cloze.ts` + `apps/app/test/session-canvas.test.ts` "one blank yields at most one declared probe" (6 tests) driving the screen's own state machine; mutation-checked (four tests go red when the literal returns) |
| 3b. A reveal-before-recall grades `Again`; a passive tap logs exposure only | met, and now also after the blank settles | same file: revealing settles the blank, and a grade press afterwards is `ExposureLogged` with `memoryStates` unchanged |
| 2/3/4 (latency precondition of REQ-SCH-06) | **met** (was silently unmet) | `session-timing.ts`; `session-canvas.test.ts` "a graded attempt carries a measured latency" (4 tests); `session-screens.test.ts` asserts no `latencyMs: <digit>` literal survives in any screen |
| 4. Integration canvas + session + minimal repair branch **functional in the app** | **partial — unrouted** | unchanged; pinned by `screen-contract.test.ts` "leaves WP-08's screens unrouted pending COORD-B8-3", now scanned recursively so an `app/(session)/` group cannot pass it by accident |
| 5. All prior tests stay green | met | `npm run test` → **60 files, 956 tests, 0 failed** (was 939; +17) |

### Commands run (controller §17.5), verbatim results

| Command | Result |
| --- | --- |
| `npm run lint` | pass (no output) |
| `npm run format:check` | `All matched files use Prettier code style!` |
| `npm run typecheck` | pass — all six workspaces, no diagnostics |
| `npm run test` | `Test Files 60 passed (60)` · `Tests 956 passed (956)` |
| `npm run test:replay` | `Test Files 2 passed (2)` · `Tests 47 passed (47)` |
| `npm run verify:export` | `Test Files 1 passed (1)` · `Tests 10 passed (10)` |
| `npm run test:e2e` | placeholder, exits 0, prints "not yet implemented (WP-10)" — **not** evidence of anything |
| `(cd apps/app && npx expo export --platform web)` | exits 0; **0 static routes**, including WP-05's three — see the P1 note above; environment-degraded, not evidence |

WP-08's own suites are now **201 tests** across 8 files (`packages/domain/test/session/*`
= 107, `apps/app/test/session-canvas.test.ts` = 30,
`apps/app/test/session-screens.test.ts` = 25,
`apps/app/test/screen-contract.test.ts` = 39).

### COORD-B8-3, revised — do **not** apply the version in the previous appendix

The route files as originally specified each called `createRuntimeContext()` at
module scope. Three routes, three contexts, three independent workspaces:
pressing "Open the passage" from a session would land on a canvas that had
started a session of its own, and the canvas's probe would never appear in the
session the learner thought they were in. Applying that verbatim would have
closed the routing gap by opening a state-sharing one.

The mechanism to avoid it is now in place inside B8's own lock:
`apps/app/src/screens/session-workspace.tsx` exports `SessionWorkspaceProvider`,
and `useSessionLoop` returns a provided workspace when there is one and builds
its own when there is not — so a screen rendered alone (a test, the screenshot
harness) behaves exactly as before, and **no screen file changes when the routes
land**.

The provider is deliberately *not* for `app/_layout.tsx`. Bootstrapping a session
captures the seeded target through the same store the capture screen writes to,
on purpose, so the sitting runs over the learner's own thread — at the app root
that would put an encounter nobody captured into the capture list on every
launch. It belongs around the session routes only, which an expo-router group
gives us **as four new files and no change to any existing one**:

```tsx
// apps/app/app/(session)/_layout.tsx
import { Stack } from 'expo-router';
import { type ReactNode } from 'react';

import { SessionWorkspaceProvider } from '@/screens/session-workspace';
import { createRuntimeContext } from '@/state/runtime';

// One context and one workspace for all three routes beneath this layout.
const context = createRuntimeContext();

export default function SessionGroupLayout(): ReactNode {
  return (
    <SessionWorkspaceProvider context={context}>
      <Stack screenOptions={{ headerShown: false }} />
    </SessionWorkspaceProvider>
  );
}
```

```tsx
// apps/app/app/(session)/session.tsx
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { SessionScreen } from '@/screens/session-screen';
import { createRuntimeContext } from '@/state/runtime';

const context = createRuntimeContext();

export default function SessionRoute(): ReactNode {
  const router = useRouter();
  return (
    <SessionScreen
      context={context}
      onBack={() => router.push('/')}
      onOpenCanvas={() => router.push('/canvas')}
      onOpenRepair={() => router.push('/repair')}
    />
  );
}
```

```tsx
// apps/app/app/(session)/canvas.tsx
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { CanvasScreen } from '@/screens/canvas-screen';
import { createRuntimeContext } from '@/state/runtime';

const context = createRuntimeContext();

export default function CanvasRoute(): ReactNode {
  const router = useRouter();
  return <CanvasScreen context={context} onBack={() => router.push('/session')} />;
}
```

```tsx
// apps/app/app/(session)/repair.tsx
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { SessionRepairScreen } from '@/screens/session-repair-screen';
import { createRuntimeContext } from '@/state/runtime';

const context = createRuntimeContext();

export default function RepairRoute(): ReactNode {
  const router = useRouter();
  return <SessionRepairScreen context={context} onBack={() => router.push('/session')} />;
}
```

Two things to know before applying it:

1. **The per-route `context` above is a fallback, not the live one.** With the
   layout mounted, `useSessionLoop` returns the layout's workspace and each
   route's own `createRuntimeContext()` is used only for the discarded fallback
   bootstrap (which appends nothing: `AppStore.execute` short-circuits on the
   command's content key). Routes are written this way so each is still valid on
   its own; a reviewer who prefers one context can lift it to a shared module.
2. **COORD-B8-2 is still open and is still the durable fix.** The provider makes
   the three screens share *one in-session workspace*; it does not join that
   workspace to the `AppStore`'s log, so WP-09's inspector still will not see
   session events until they are joined. `useSessionLoop` already takes
   `onEvents`, and the provider forwards it.

### Incidental defect found while in the file (disclosed, not smuggled)

`session-screen.tsx` cleared `hintsUsed` and `revealed` when a step was
**answered** but not when it was **skipped**, so hints taken on a skipped step
were carried into the next step's attempt and logged against it. One step's hints
attributed to another step's answer is the same family of small lie as the
fabricated latency, and the fix is two lines in a new `skip()` handler. Called
out here because it was not in the findings list and a verifier should not have
to discover it in the diff.

### What a verifier should try to break

1. **Re-run the mutation.** Put `targetWasHidden: true` back in `answerCloze`
   and confirm four tests fail; put `latencyMs: 0` back in any screen and confirm
   `session-screens.test.ts` fails. A guard that does not go red is not a guard.
2. **Check the claim about `replay` rather than believing it.** The reason the
   canvas key stayed positional is that a content key would throw rather than
   collapse. `commands.test.ts` "shows why: a content-derived key on that path
   would refuse the whole log" is that claim as an executable one.
3. **Look for a fourth place a probe can be minted from the app.** The argument
   that one blank yields one probe rests on `canAttempt` being the only gate; if
   another path into `canvasInteraction` with a `declaredContractId` exists in
   `apps/app`, the argument is incomplete.
4. **Re-run the web export in an environment with a real `npm ci`.** Zero static
   routes here is an artifact; if it reproduces on a clean checkout, that is a
   finding and this appendix is wrong about it.

### Next safe command

```bash
git fetch origin && git log --oneline -3 origin/agent/bunki-phase0-integration
npm run lint && npm run format:check && npm run typecheck && npm run test
npx vitest run apps/app/test/session-canvas.test.ts apps/app/test/session-screens.test.ts
```
