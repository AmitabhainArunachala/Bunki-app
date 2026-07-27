# WP-01 verification record (V1)

Workflow wf_95aa33a7-49a, 2026-07-27. Round 1: FAIL (2 P1, 9 P2) -> B1 repair (82e88cb, d0bbeb5) -> Round 2: PASS (3 P2 carried, batched).


---

## Round 1 — verdict: FAIL

- **P1** — apps/app ships Expo's own branded template artwork as the product's app icon, Android adaptive icon, and web favicon — while commit 8ada17e's message ("Also dropped the template's demo tabs, themed components, tutorial assets, Expo-branded images, and .vscode/") and docs/build-evidence/CAPSULE.md ("template demo tabs/themed components/tutorial assets/Expo-branded images/.vscode/ removed") both claim they were removed. The same commit 8ada17e is the commit that ADDS all five PNGs (900,619 bytes total: icon.png 799,005 B, android-icon-foreground.png 78,796 B, android-icon-background.png 17,549 B, android-icon-monochrome.png 4,140 B, favicon.png 1,129 B). Visual inspection of each confirms they are the Expo chevron logo, and apps/app/app.json wires them in at lines 7, 19, 20, 21 and 26. This also re-introduces the exact OD-09 pre-emption concern B1 used to justify deleting Expo's MIT LICENSE file: brand marks constrain the operator's pending identity/license decision more directly than a code license does.
  - fix: Either (a) replace the five files with neutral placeholder assets (or a Bunki mark) and leave app.json pointing at them, or (b) keep them deliberately and correct both the commit-message claim (via a follow-up commit note) and the CAPSULE.md "Scaffold path taken" bullet, recording the Expo template asset provenance and MIT license per controller §4. Do not leave the tree contradicting the capsule — the capsule is the resumable evidence record (§23) and a later agent will trust it.
- **P1** — The controller §5 boundary that "closes the gate-bypass hole" is enforced only against the bare package-specifier form. Verified by probe against eslint.config.mjs at 3879866: (1) apps/app/src/state/__probe2__.ts containing `import '../../../../packages/persistence/src/index.ts'` lints CLEAN (exit 0) — a screen can hold an EventStorePort and append a ReviewGraded that never met the evidence gate; tsconfig.base.json sets allowImportingTsExtensions:true and metro.config.js watches the workspace root, so this import both typechecks and bundles. (2) Dynamic import bypasses all three boundaries: `const p = () => import('react-native')` in packages/domain/src and `() => import('@bunki/persistence')` in packages/domain/src were both NOT flagged (ESLint's core no-restricted-imports does not visit ImportExpression). B1's predicate item 4 is reported "met ... PROVEN BY PROBE", but the five probes B1 ran covered only the package-specifier form. Controller §18 assigns WP-01 cost-of-wrong "boundary erosion later" — this is cheapest to close now, before WP-02..WP-09 write any code, and orchestration §6 has the Codex pass explicitly attempting "UI direct EventStorePort.append" as a written bypass, which would today return REFUTED.
  - fix: In eslint.config.mjs add deep-path patterns alongside the package specifiers — for the apps/app block: {group:['**/packages/persistence','**/packages/persistence/**']}; for the domain block: {group:['**/packages/persistence/**','**/packages/ai/**','**/packages/seed/**','**/packages/export/**','**/apps/app/**']}. I verified this exact pattern shape closes the hole: with it, `import '../../../../packages/persistence/src/index.ts'` errors ("deep path") while the package specifier still errors separately. For dynamic import, add a no-restricted-syntax rule matching ImportExpression with a literal source in the restricted groups, or adopt eslint-plugin-import's no-restricted-paths (resolver-based, covers both forms). Re-run the probe set and record it in ADR-001.
- **P2** — Boundary 1 (domain purity) is scoped to files:['packages/domain/src/**/*.ts'] — .tsx is not covered. Probe: packages/domain/src/__probe__/g2.tsx importing 'react' and 'node:fs' lints CLEAN. Confirmed the file is linted at all (a .tsx probe importing ts-fsrs does error via the repo-wide block), so the gap is the glob, not ESLint ignoring the file.
  - fix: Change the boundary-1 glob to 'packages/domain/src/**/*.{ts,tsx}' (and the domain test block likewise). Domain should never contain JSX, but the rule that proves it should not be the thing that assumes it.
- **P2** — react and react-dom are pinned 19.2.3, but the WP-00 capsule's verified register records react 19.2.8. The recorded rationale (ADR-001 / CAPSULE.md: "Expo SDK 57 resolves React there against react-native 0.86.0") overstates necessity — I confirmed from the registry that react-native@0.86.0 declares peer react ^19.2.3, which admits 19.2.8, and 19.2.8 is published. The pin comes from create-expo-app's template default, not from a resolution constraint. By contrast the typescript 6.0.3 deviation IS genuinely forced: I independently confirmed typescript-eslint@8.65.0 (current latest) declares peer typescript ">=4.8.4 <6.1.0" while typescript latest is 7.0.2 — that deviation's evidence holds exactly as B1 recorded it.
  - fix: Either bump react/react-dom to the registered 19.2.8 and re-run the export proof, or keep 19.2.3 and correct the rationale to "create-expo-app template default; kept because the passing export was built with it" — then reconcile the WP-00 register entry so WP-13's exact-SHA tabulation does not inherit a contradiction.
- **P2** — Eight direct dependencies were added beyond the WP-00 verified register (expo-constants 57.0.7, expo-linking 57.0.4, expo-status-bar 57.0.1, react-native-safe-area-context 5.7.0, react-native-screens 4.26.0, @types/react 19.2.2, @eslint/js 10.0.1, typescript-eslint 8.65.0) with no recorded controller §4/§14 license check. I verified all eight from the registry: all MIT, so there is no actual OD-09 risk. Separately, a census of the installed tree found 12 MPL-2.0 packages (lightningcss and its platform bindings, transitive via Expo web bundling) and one dual-licensed (BSD-3-Clause OR GPL-2.0) package (node-forge). Neither constrains the operator's pending choice — MPL-2.0 is file-level copyleft on build tooling, and node-forge offers BSD-3 — but the capsule's blanket "All compatible with license-decide-later rule" covers only the 13 registered direct deps.
  - fix: Append the eight added direct dependencies with their verified licenses to the capsule's register section, and add a one-line note that the transitive tree includes MPL-2.0 build tooling and one dual BSD-3/GPL-2.0 package, neither of which reaches distributed product source. This keeps WP-04's and WP-13's license audits from re-discovering it late.
- **P2** — docs/build-evidence/TEST_PLAN.md "Split-test bookkeeping" states "Four tests are deliberately split across work packages. Both halves must be green before the test counts as met; a half-green test is reported as unmet" and tabulates T-03, T-12, T-13, T-16. But the main map on the same page also splits T-14 (WP-03 skeleton + WP-09 full) and T-15 (WP-04 provenance walk + WP-09 full). Those two therefore do not inherit the half-green=unmet rule.
  - fix: Change "Four" to "Six" and add T-14 and T-15 rows to the split table, or state explicitly why they are tracked differently.
- **P2** — .github/workflows/ci.yml omits the `(cd apps/app && npx expo export --platform web)` build proof, even though that check is genuinely implemented and green today (I ran it: Web Bundled 1660ms, 3 static routes, Exported: dist). The file's stated rationale for omission covers only the three placeholder scripts ("They exit 0 by design"), which does not apply to the build proof. Until WP-10 extends CI, a change that breaks the web build lands green.
  - fix: Add a build-proof step to ci.yml running the export from apps/app. It is the one §17.5 check outside the current four that has a real implementation, so including it costs nothing in false signal.
- **P2** — apps/app/.gitignore retains create-expo-app's bare `example` entry (line 30). As a bare pattern it matches any file or directory named `example` at any depth under apps/app, so a future `apps/app/src/screens/example/` or `apps/app/e2e/example.spec.ts` would be silently untracked.
  - fix: Delete the `example` line — it is template residue with no purpose in this repo.
- **P2** — Root README.md was rewritten (85 lines added, 1 removed). Controller §18 WP-01's surface list reads "root config, .github/, docs/adr/, package skeletons" and does not name README.md. The change is defensible — the root workspace package.json is new and §4 requires "LICENSE: pending operator decision" in the README of any new package, and the content itself is accurate and honestly scoped — but it is not literally an enumerated surface.
  - fix: No content change needed. CON should record README.md against WP-01 in the ORCHESTRATION_LOG surface-lock table so the next wave's collision check is unambiguous.
- **P2** — B1's predicate item 2b claims the scaffold path is "Recorded in the apps/app scaffold commit, apps/app/README.md, and CAPSULE.md". apps/app/README.md records only the metro.config deviation ("not the create-expo-app default"); it does not record the create-expo-app invocation or the four restructuring reasons. The predicate itself is met — commit 8ada17e's message and CAPSULE.md both record the path in full, which satisfies controller WP-01's "record which".
  - fix: Either add three lines to apps/app/README.md pointing at the scaffold-path record, or drop apps/app/README.md from that evidence list in the capsule.
- **P2** — `npm run typecheck` runs `tsc --noEmit` per workspace only, so root-level TypeScript — vitest.config.ts — is not covered by any workspace tsconfig and is never typechecked. It is linted, so this is narrow.
  - fix: Add a root tsconfig.json including vitest.config.ts, or accept it and note it in ADR-001 alongside the strict-TS decision.

### Full report

## Verifier V1 — WP-01 findings report

- **Branch under review:** `agent/bunki-phase0-closed-loop-wp01` @ `3879866a900907e26093b709d3f3dfef1cd72cd0`
- **Base:** `origin/main` @ `852f5be18a40e66dbb89ad9a877649c349ceee0a` (merge-base confirmed identical)
- **Verifier:** V1 (orchestration §4 verifier card) — read-only on code, clean isolated worktree checkout, all commands re-run independently
- **Verdict: FAIL — 2 × P1, 0 × P0, 9 × P2.** PASS requires zero P0/P1.

**Read this verdict proportionately.** WP-01 is substantially and unusually well built: every command B1 reported reproduces exactly, the §5 layout is complete, ADR-002 is verbatim-identical to the controller under programmatic comparison, and the honesty discipline (placeholder banners, runtime-claim rules, surfaced deviations, a self-declared "partial") is the kind of work that makes later verification cheap. Both P1s are narrow and each is a sub-hour fix. Neither is a §21.3 stop condition.

---

### Step-1 integrity (performed before any other action)

`sha256(origin/main:docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md)` = `de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47` — **matches** the launcher's expected value. Controller read in full (§0, §3, §5, §6, §14, §15, §17, §18, §20, §21, §23), plus orchestration §2/§4 and the WP-00 capsule, before verification began.

---

### Closure predicate walk (controller §18 WP-01), line by line

| Predicate clause | Verdict | Independent evidence |
|---|---|---|
| Monorepo scaffolding: root `package.json` + workspaces | **MET** | `private:true`, `workspaces:["apps/*","packages/*"]`, `engines.node>=22.0.0`. `npm ci` installs 702 packages cleanly. |
| Strict `tsconfig.base.json` | **MET** | `strict` + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `isolatedModules`, `noUnusedLocals/Parameters`, `noImplicitOverride/Returns`, `noFallthroughCasesInSwitch`. All six workspaces extend it. |
| Empty packages with README + ownership header | **MET** | All 25 §5-mandated directories and 7 mandated files present (programmatic walk). Six READMEs each name their owning WP, their boundary rules, and `LICENSE: pending operator decision`. Later-WP files (`port.ts`, `LICENSES.md`, `envelope.ts`, `fsrs-pin.ts`) correctly absent. No root `LICENSE` — correct, OD-09 pending. |
| Seven root scripts defined and working | **MET** | `lint`, `format:check`, `typecheck`, `test` genuinely execute and pass. `test:replay`/`verify:export`/`test:e2e` are explicit banner-printing placeholders, owner-mapped precisely (WP-02 / WP-03 / WP-10) rather than generically. |
| ADR-001 (layout/boundaries per §5) | **MET** | Records the layout, the three lint boundaries with the reason each exists, strict-TS, exact-pinning, accepted costs, and the TypeScript deviation with its ERESOLVE evidence. |
| ADR-002 (event schema v1 per §6.1) | **MET** | **Verbatim confirmed programmatically**: normalised cell-by-cell comparison against the controller's §6.1 table → "controller rows: 15, ADR-002 rows: 15, VERBATIM MATCH: all rows identical". `ThreadTombstoned`, `ContentPurged`, `userConfirmedEasy?` all present and exact. |
| `docs/build-evidence/TEST_PLAN.md` mapping T-01..T-17 to owning WPs | **MET** | All 17 mapped; each mapping cross-checked against the owning WP's own closure predicate in §18 and consistent. T-18 correctly marked as WP-12's operator gate that no agent may mark passed. |
| CI runs lint+typecheck+test (trivially green) on the PR | **MET** | `.github/workflows/ci.yml`: `pull_request` + push-to-main, `actions/setup-node` node-version 22, `npm ci` (not `npm install`), then lint / format:check / typecheck / test. Correctly excludes the placeholders. |
| Scaffold path RECORDED with reason | **MET** | Fully recorded in commit `8ada17e` and CAPSULE.md, satisfying "record which". (Minor: not in `apps/app/README.md`, contrary to B1's evidence list — P2-8.) |
| Absolute rules | **MET** | No push to main (`merge-base --is-ancestor` exit 1; commits contained only in the WP-01 branch). No merge/approve. Frozen-doc diff empty. Explicit-path staging. No secrets. |
| ESLint §5 boundary rules | **PARTIAL → P1-2** | Enforced correctly for the package-specifier form (7 expected errors, negative control clean). Bypassable via relative path and dynamic `import()`. |

---

### P1 findings

**P1-1 — Expo-branded artwork shipped as the product's own icon, contradicting the capsule and the commit message.**

Commit `8ada17e`'s message says the template's "Expo-branded images" were dropped, and `CAPSULE.md` repeats it. That same commit adds five Expo-logo PNGs (900,619 bytes), and `apps/app/app.json` wires them in as `icon` (line 7), the three Android adaptive-icon layers (lines 19–21), and the web `favicon` (line 26). Visual inspection confirms the Expo chevron mark.

Two consequences. First, the capsule is the resumable evidence record (§23) and a fresh agent will trust it — a claim contradicted by the tree in the same commit is exactly the failure mode the capsule exists to prevent. Second, it re-opens the concern B1 correctly reasoned about elsewhere: B1 deleted Expo's MIT `LICENSE` so as not to pre-empt OD-09, then shipped Expo's brand mark as Bunki's app icon and favicon. A brand mark constrains the operator's pending identity decision more directly than a code license does.

*Fix:* replace with neutral placeholders (or a Bunki mark), **or** keep them deliberately and correct both claims plus record the Expo template asset provenance/license in the capsule. Either is acceptable; leaving the tree contradicting the capsule is not.

**P1-2 — The gate-bypass boundary is enforced only against the bare package specifier.**

Controller §5 calls the `apps/app` → persistence lint restriction the rule that "closes the gate-bypass hole". Probes against `eslint.config.mjs` at this SHA:

- `apps/app/src/state/…` containing `import '../../../../packages/persistence/src/index.ts'` → **lints clean, exit 0.** With `allowImportingTsExtensions: true` in `tsconfig.base.json` and `metro.config.js` watching the workspace root, that import both typechecks and bundles. A screen can hold an `EventStorePort` and append a `ReviewGraded` that never met the gate's preconditions.
- `packages/domain/src/…` containing `() => import('react-native')` or `() => import('@bunki/persistence')` → **not flagged.** ESLint's core `no-restricted-imports` does not visit `ImportExpression`.

B1 reports this predicate "met … PROVEN BY PROBE", but the five probes run covered only the specifier form. Orchestration §6 has the Codex pass explicitly attempting "UI direct `EventStorePort.append`" as a written bypass — today that returns REFUTED.

*Fix (validated, not speculative):* I confirmed by probe that adding `{group:['**/packages/persistence','**/packages/persistence/**']}` to the `apps/app` block makes the relative-path import error while the specifier still errors separately; mirror the pattern in the domain block for all sibling packages. For dynamic import, add a `no-restricted-syntax` rule matching `ImportExpression` with a literal source, or adopt `eslint-plugin-import`'s resolver-based `no-restricted-paths`, which covers both forms at once. Then re-run the probe set and record it in ADR-001.

Controller §18 assigns WP-01 the cost-of-wrong "boundary erosion later". Closing this now, before WP-02..WP-09 write a line of code, is the entire reason the rule was front-loaded into WP-01.

---

### P2 findings (batched — do not reopen the wave for these)

| # | Finding |
|---|---|
| P2-1 | Boundary 1's glob is `packages/domain/src/**/*.ts`; a `.tsx` in domain importing `react`/`node:fs` lints clean. Widen to `*.{ts,tsx}`. |
| P2-2 | `react`/`react-dom` pinned 19.2.3 vs the register's 19.2.8. Not forced — `react-native@0.86.0` peers `^19.2.3` and 19.2.8 is published. (The **typescript** 6.0.3 deviation *is* genuinely forced; I confirmed `typescript-eslint@8.65.0` peers `>=4.8.4 <6.1.0` against `typescript` latest 7.0.2. B1's classification as a §3.6 recoverable conflict rather than a §21.3 trigger is correct.) |
| P2-3 | Eight direct deps added beyond the WP-00 register with no recorded §4/§14 license check — I verified all eight are MIT. Transitive tree also carries 12 MPL-2.0 (lightningcss build tooling) and one dual BSD-3/GPL-2.0 (node-forge). Neither constrains OD-09; record it so WP-04/WP-13 don't re-discover it late. |
| P2-4 | TEST_PLAN's split-test table says "Four tests are deliberately split" but the main map also splits T-14 and T-15, which therefore miss the half-green=unmet rule. |
| P2-5 | CI omits the `expo export --platform web` build proof although it is implemented and green. The stated rationale covers only the placeholders. |
| P2-6 | `apps/app/.gitignore` retains the template's bare `example` entry — would silently ignore any future path named `example` under `apps/app`. |
| P2-7 | Root `README.md` rewritten; not literally in §18's WP-01 surface list. Defensible under "root config" + §4's README rule. CON should record it in the surface-lock table. |
| P2-8 | B1's evidence list claims the scaffold path is recorded in `apps/app/README.md`; it isn't (only the metro deviation). Predicate still met via commit + capsule. |
| P2-9 | Root `vitest.config.ts` is in no workspace tsconfig, so `npm run typecheck` never typechecks it. |

---

### Negative assertions and claim audit

- **Secrets (§15):** diff scan for `api[_-]?key|secret|bearer|password|token|PRIVATE KEY|sk-…|AKIA…` → 6 hits, all benign (a `.gitignore` comment, the capsule's own check note, the ai README's privacy section, "token counts" in the §12 observability rule). Lockfile independently scanned for `_auth`/`authToken`/registry credentials → 0 hits; all external `resolved` URLs point at `registry.npmjs.org` with no proxy URL leaked.
- **Forbidden claims (§20 / REQ-GATE-03):** 3 hits, all prohibitive — the README disclaimer, the app README's claim-discipline rule, and a test named `makes no efficacy or optimisation claim (REQ-GATE-03)`. No forbidden claim is asserted anywhere in code, copy, comments, or commit messages.
- **Runtime honesty (P0-CAP-15):** TEST_PLAN and both READMEs state that ci-substitute is never native verification, web is never native, and T-16 native is WP-11's claim alone. `packages/persistence/src/index.ts` encodes the three runtime labels as types. Correct and load-bearing.
- **Frozen docs:** `git diff origin/main...HEAD -- docs/specs docs/convergence docs/handoffs` → empty, and all three are in `.prettierignore` so no future `format --write` can rewrite them.

### Surface audit

69 files changed (+11,509/−1). Filtering `git ls-tree -r HEAD` against WP-01's allowed surfaces returns **empty** — no out-of-surface file. The single note is `README.md` (P2-7). **No P0.**

### Smallest next action

Return to B1 with P1-1 and P1-2. Both are contained edits to `apps/app/app.json` + assets and to `eslint.config.mjs`, plus a capsule correction. Re-verification needs only the boundary probe set and one `npm run lint`. W2 (WP-02 ∥ WP-04) should not open until P1-2 is closed — its whole value is being in place before domain and app code exist.



---

## Round 2 — verdict: PASS

- **P2** — The local `bunki/package-boundaries` rule still ignores every specifier node that is not a string `Literal`. Four forms lint clean at d0bbeb5b: `import(`react-native`)` from packages/domain/src, `import(`@bunki/persistence`)` from apps/app, `require(`react-native`)` in a domain .js file, and `const m = 'react-native'; import(m)`. eslint.config.mjs:242 early-returns unless `sourceNode.type === 'Literal'`, so a no-substitution template literal — a one-character edit away from a form that IS caught — walks through both mechanisms. This does not reopen the finding being re-verified (all four of V1's originally-open bypasses now error, as do 16 further adversarial forms), and inline eslint-disable already defeats any lint rule by design, so this is an accident-guard gap rather than a breach.
  - fix: In eslint.config.mjs `check()`, also accept a `TemplateLiteral` whose `expressions.length === 0`, reading `quasis[0].value.cooked` as the specifier — roughly three lines, closing G1/G3 and the template form of G2. Add the three cases to test/boundaries.test.ts. The variable-indirection form (`import(m)`) needs dataflow analysis and is out of lint's reach: document it in ADR-001 §2a as a known residual rather than chase it.
- **P2** — Over-claim in the eslint.config.mjs header comment, lines 34-37: the local rule is described as covering "every import form by *resolving* the specifier". Its true scope is every import form whose specifier is a string literal. ADR-001 §2a is careful and accurate by comparison (it enumerates ten forms without claiming exhaustiveness), so the inaccuracy is confined to the config comment. Flagged because the P1 just repaired was itself a false claim in the evidence record; the same standard applies to a comment a future agent will read as a guarantee.
  - fix: Change "covers every import form" to "covers every import form whose specifier is a string literal" and name the residual (template-literal and variable specifiers) in the same paragraph, so the comment and ADR-001 §2a agree.
- **P2** — Environment, not the branch. The shared checkout /home/user/Bunki-app has its local ref refs/heads/agent/bunki-phase0-closed-loop-wp01 at the stale pre-repair commit 3879866a900907e26093b709d3f3dfef1cd72cd0, while refs/remotes/origin/... is correctly at d0bbeb5b. My first clean clone, taken from the local path, silently checked out the pre-repair tree (no tsconfig.json, no test/, 900KB of Expo artwork still present) and would have reproduced both P1s as still-open. Any downstream agent reviewing from the shared checkout without fetching first reviews the wrong code.
  - fix: Fast-forward the stale local ref: `git -C /home/user/Bunki-app fetch origin && git -C /home/user/Bunki-app branch -f agent/bunki-phase0-closed-loop-wp01 origin/agent/bunki-phase0-closed-loop-wp01`. As a standing rule for verifiers, clone from the origin URL and `git checkout <sha>` at the exact commit under review, then assert `git rev-parse HEAD` equals it before running anything.

### Full report

## Addendum to VERIFY_WP01.md — V1 re-verification of the repair round

**Verifier:** V1 · **Date:** 2026-07-27 · **Subject:** `agent/bunki-phase0-closed-loop-wp01` @ `d0bbeb5b27eac8e53c335ac414fb3e43cc3f865c`
**Scope (as assigned):** confirm only that each previously-found P0/P1 is resolved and that the §17.5 check set still passes from a clean checkout.

**Verdict: PASS.** Both P1s are resolved. The check set is green from a clean checkout at the exact commit. No new P0 or P1. Three P2s are recorded below; none block merge.

### Preconditions re-established, not inherited

Launcher step 1 was re-run before anything else: controller sha256 observed `de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47`, matching the launcher's expected value. The v2 spec, orchestration spec and launcher also match `BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt`. On the branch tree itself, `sha256sum -c` over the integrity record returns **14/14 OK**, and `git diff 852f5be d0bbeb5b -- docs/specs docs/convergence docs/handoffs` is empty — no frozen document was touched.

### P1-1 — Expo-branded template artwork shipped as the product identity → **RESOLVED**

Verified four independent ways rather than by reading the commit message:

1. **Visual.** `icon.png` and `android-icon-foreground.png` render a stem forking into two terminating nodes (分岐). No Expo chevron. `android-icon-background.png` is solid `#0F172A`.
2. **Provenance, proven not asserted.** Running `node scripts/generate-app-icons.mjs` in the clean checkout left `git status` **empty** — the committed bytes are exactly that script's deterministic output. The script imports only `node:zlib`, `node:fs`, `node:path`, `node:url` and defines its geometry inline, so no third-party asset enters the repository and OD-09 stays unconstrained.
3. **Nothing left behind.** Across all 89 tracked files, the only binaries are those five PNGs, and there is no `LICENSE`/`NOTICE`/`COPYRIGHT` file anywhere.
4. **Not hollow.** `android-icon-monochrome.png` renders blank when flattened onto white, so I decoded its alpha directly: 25,426 opaque + 1,318 semi-transparent pixels, bbox `[364,336]-[659,706]`. The layer carries the real mark; Android tints by alpha, which is correct for a monochrome layer.

Weight dropped 900,619 → 34,219 bytes. `app.json` paths are unchanged and `adaptiveIcon.backgroundColor` now matches the generated background layer. The two false claims in `CAPSULE.md` were corrected **in place and marked as corrections with the original wording preserved** — the right treatment for an evidence record.

### P1-2 — §5 boundaries enforced only against bare specifiers → **RESOLVED**

I did not rely on `test/boundaries.test.ts`. I wrote a separate 32-case harness driving the ESLint API against the real `eslint.config.mjs`, so a bug in their test could not conceal a bug in the config. Result: **28 pass / 4 fail**.

All four bypasses open at `3879866` now error:

| Probe | Result at `d0bbeb5b` | Rules that fired |
|---|---|---|
| `apps/app` → `../../../../packages/persistence/src/index.ts` | **error** | both |
| `packages/domain/src` → `../../persistence/src/index.ts` | **error** | `bunki/package-boundaries` |
| `packages/domain/src` → `() => import('react-native')` | **error** | `bunki/package-boundaries` |
| `packages/domain/src` → `() => import('@bunki/persistence')` | **error** | `bunki/package-boundaries` |

Sixteen further forms I devised beyond the builder's set also error: `export {…} from` and `export * from` over relative paths; `require()` bare and deep-relative in `.js`; dynamic `import('node:fs')`; subpath specifiers (`@bunki/persistence/src/port`); `..` renormalisation (`packages/ai/../persistence`); the package directory itself; `.tsx`/`.mts`/`.cjs` coverage; expo-router route files under `apps/app/app/`; `ts-fsrs` from `packages/persistence`; and a bare builtin without the `node:` prefix.

All eight negative controls stay clean, including the regression the builder found while fixing this — `packages/domain/src` → `./events/index.ts`, which the unanchored `events` pattern had been rejecting. That one was a genuine latent blocker for WP-02's first intra-package import, caught and closed here.

Two structural points raise my confidence in durability: the two mechanisms read the same package lists, so adding a package cannot silently un-enforce it in one of them; and the suite runs under `npm run test`, which CI runs on every PR, so a reopened boundary fails the PR rather than waiting for a verifier three waves later. Converting the probe transcript into an executable suite is strictly stronger than what I asked for.

Orchestration §6's Codex bypass audit — "UI direct `EventStorePort.append`" — would have returned REFUTED at `3879866`; it now returns CONFIRMED.

### §17.5 check set, from a clean checkout at `d0bbeb5b`

| Command | Result |
|---|---|
| `npm ci` | 702 packages, clean from lockfile |
| `npm run lint` | **pass**, 0 problems |
| `npm run format:check` | **pass** |
| `npm run typecheck` | **pass** — root + 6/6 workspaces, 0 errors |
| `npm run test` | **pass** — 7 files, **40/40** |
| `npm run test:replay` / `verify:export` / `test:e2e` | placeholders, exit 0, each printing that exit 0 is not evidence |
| `(cd apps/app && npx expo export --platform web)` | **pass** — 3 static routes, bundle 1.1MB, `Exported: dist` |

Working tree remained clean after both the export and the icon regeneration. Secrets scan of the full branch diff: 0 credential matches. All eight commits conform to `WP01(B1): <predicate>`. `852f5be` is an ancestor of `d0bbeb5b`; main is untouched.

### P2 findings (recorded, not blocking)

1. **Non-`Literal` specifier nodes still pass.** `import(\`react-native\`)`, `import(\`@bunki/persistence\`)`, `require(\`react-native\`)` and `const m = 'react-native'; import(m)` all lint clean — `eslint.config.mjs:242` early-returns unless the source node is a string `Literal`. The first three are statically knowable and cost ~3 lines to close (accept `TemplateLiteral` with `expressions.length === 0`, read `quasis[0].value.cooked`); the variable form needs dataflow and should be documented as a residual instead. This does not reopen P1-2 — every natural form is caught, and an inline `eslint-disable` already defeats any lint rule by design, which the config itself flags as an ADR-level act.
2. **Over-claim in a comment.** `eslint.config.mjs:34-37` says the local rule covers "every import form". True scope is "every import form whose specifier is a string literal". ADR-001 §2a is accurate by comparison. Worth tightening precisely because the P1 just repaired *was* a false claim in the evidence record.
3. **Stale ref in the shared checkout (environment, not the branch).** `/home/user/Bunki-app` has local `agent/bunki-phase0-closed-loop-wp01` at the pre-repair `3879866` while origin is at `d0bbeb5b`. My first clone, taken from that local path, silently produced the pre-repair tree and would have reported both P1s as still open. Fast-forward the local ref, and verifiers should clone from origin and assert `git rev-parse HEAD` before running anything.

### Recommendation

WP-01 is verified. Ready for human merge and for W2 to open (WP-02 domain kernel ∥ WP-04 seed — disjoint surfaces). Fold P2-1 and P2-2 into whichever WP next touches `eslint.config.mjs`; WP-02 is the natural owner, since it writes the first real imports inside `packages/domain/src`. P2-3 should be fixed now, before another agent reads the stale tree.

Open items carried forward are unchanged and correctly recorded in the capsule: WP-06 still owes the §14 `ts-fsrs@5.4.1` FSRS-6 primary-source check; the three placeholder scripts must not survive past WP-02/WP-03/WP-10; native verification remains UNVERIFIED pending WP-11; repository license remains pending OD-09, and the icon set no longer bears on it.

