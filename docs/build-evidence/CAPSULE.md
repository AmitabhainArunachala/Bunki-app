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
