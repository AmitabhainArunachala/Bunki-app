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
Temporary probe files were linted and deleted. All three §5 boundaries error correctly:
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
- template demo tabs/themed components/tutorial assets/Expo-branded images/`.vscode/` removed as WP-05 would have had to delete them anyway.

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
