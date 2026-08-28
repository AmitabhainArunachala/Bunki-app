# CN SWEEP — fine-toothed repo review & cleanup packet

**Date:** 2026-08-28
**Assigned lane:** Kimi (or any frontier coding agent with filesystem access)
**Requested by:** operator, via the coordinating agent (Claude, in Cursor)
**Base branch:** `claude/live-tweaks-20260827` (commit `19a132db` or later)
**Your branch:** `review/cn-sweep-20260828` — you are already checked out on it in this worktree. Never switch branches, never touch `main`, never push.

---

## 1. Mission

Comb the entire repository with a fine-toothed comb and clean it up wherever you find:

1. **Bugs** — code that does the wrong thing, races, swallowed errors, broken edge cases.
2. **Inconsistencies** — two places that disagree: code vs comment, doc vs reality, JA copy vs EN copy, naming drift, duplicate logic that has already diverged.
3. **Confusion** — anything a competent newcomer would misread: misleading names, dead code that looks alive, stale TODO/FIXME, comments that lie.
4. **Bad taste / low quality** — needless duplication, dead CSS, magic numbers with no story, fragile string matching, copy-paste rot.

You FIX what is safely fixable, PROPOSE what needs judgment, and FLAG what needs the operator. Every single thing you touch must be independently reviewable in minutes — that constraint shapes everything below.

## 2. What this repository is (orientation — read before hunting)

- **The live product** is `prototypes/corridor/` — one integrated, build-free, vanilla-JS PWA (Japanese learning: shelf, reader, dictionary, kanji, SRS, drift opening surface, AI tutor). `index.html` + `corridor.js` (~14k lines) + `corridor.css` + `drift-layer.js/css` + `sw.js` + `dictionary-worker.js` + `corridor-ink.js`. Deployed to GitHub Pages by `.github/workflows/pages-app.yml` ("the corridor IS the site"). It is used daily on an iPhone.
- **The deterministic kernel** is `apps/app` (Expo) + `packages/*` (`domain`, `persistence`, `seed`, `ai`, `export`) — spec-governed Phase-0 code with lint-enforced boundaries (see `eslint.config.mjs` and ADRs in `docs/adr/`). Be conservative here: bugs yes, taste refactors no.
- **History, not authority:** `prototypes/bunki-sites-v11/` (an older product line) and `prototypes/drift/` (the standalone drift artifact). Do not modernize these; only FLAG rot.
- **The Mac shell** is `prototypes/bunki-desktop/` (Electron wrapper + static server + live reload). Recent, lightly reviewed — read it skeptically.
- Architecture facts you must respect in `corridor.js`: a single state object `S`, full re-render via `render()`, guarded persistence through `commitStorePatch` (never write `localStorage` directly), bilingual copy through `tx(ja, en)`, strict layer law (exactly one live layer; everything else `inert`), a11y is load-bearing (aria-pressed/expanded, roles, keyboard paths — there is a real verifier battery).
- The most recent commit (`19a132db`, operator live session) added: search doors in three chromes, synchronous focus into the search room, a list drawer under 覚える, per-list pages with export, a study-progress fold, and the desktop shell. **Review that commit's additions with the same severity as everything else** — it has NOT been battery-tested.

## 3. Hard boundaries — files you must never modify

Violating any of these voids the whole run:

- `docs/specs/**` — frozen, hash-verified against `docs/specs/BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt`.
- `prototypes/corridor/data/**`, `prototypes/corridor/vendor/**`, `prototypes/corridor/fonts/**`, `prototypes/corridor/audio/**` — licensed/immutable shards.
- `prototypes/corridor/corridor-standalone.html` and `prototypes/drift/drift-artifact.html` — generated single-file builds.
- `packages/seed/**` — share-alike licensed seed data.
- `node_modules`, `package-lock.json` (root and nested), any `release/`, `site/`, `dist/`, `.wrangler/`.
- No dependency additions, removals, or version changes. No new tooling. No `git push`. No branch changes. No history rewriting.

Also forbidden as *actions*: wholesale reformatting (run Prettier only via `npm run format` and only if `format:check` already fails — otherwise leave formatting alone); renaming public files; changing URLs/paths the Pages workflow copies; altering the app's bilingual voice or its long-form "why" comments (they are intentional, operator-authored style — fix them only when they are factually wrong); breaking `localStorage` schema compatibility (existing learner records must load unchanged).

## 4. Severity and action classes

Severity: **P0** breaks function or data · **P1** wrong/contradictory behavior or docs · **P2** confusing but harmless · **P3** taste/quality.

Action classes:
- **FIX** — you changed code/docs. Only for changes that are behavior-preserving OR fix a clear defect with an argument you can state in two sentences.
- **PROP** — a behavior-changing or judgment-dependent change you believe is right. Implement it, but in its OWN commit labeled PROP so the reviewer can drop it wholesale with `git revert`.
- **FLAG** — ledger entry only, no code change. For anything touching boundaries above, licensing, product design intent, or where two defensible answers exist.

## 5. Working agreement (this is what makes you reviewable)

1. **One finding = one commit.** Never batch unrelated findings. Message format, exactly:
   `[F-012][FIX][P1] corridor: srsWhen shows 明日 for cards due later today`
   First line ≤ 90 chars; body states WHAT was wrong, WHY the fix is right, HOW you verified (command + result).
2. **The ledger** `docs/build-evidence/cn-sweep/FINDINGS.md` is append-only, one row per finding, updated in the same commit as the finding:
   `| F-012 | FIX | P1 | corridor | corridor.js:4817 | srsWhen mislabels same-day due | rewrote day-boundary check | node --check ok; manual: due 23:00 shows 今日 | <short-sha> |`
   FLAG rows use commit `—`. Number findings sequentially, no gaps.
3. **Baseline first.** Before touching anything, run the full gate (§6) and save output to `docs/build-evidence/cn-sweep/gate-baseline.txt` (first commit: `[F-000][FIX][P3] sweep: record baseline gate`). Pre-existing failures belong to the baseline, not to you — note them in the ledger as FLAG entries.
4. **Gate after every FIX to the corridor JS**: at minimum `node --check` the four files (§6 item 4). Full gate at the end, saved to `gate-final.txt`.
5. **Scope order** (depth-first, in this priority): ① `prototypes/corridor/` core files ② `prototypes/bunki-desktop/` ③ `.github/workflows/` + root `scripts/` + `tools/` ④ `packages/*` and `apps/app` (bugs only) ⑤ `docs/` (dead links, wrong paths, stale claims — mostly FLAG) ⑥ `test/`. If you exhaust your budget, a finished ledger for ①–③ beats a shallow pass over everything.
6. **Stop conditions.** Stop and write the summary when: the hunt list is exhausted, OR you hit 60 findings, OR further findings are all P3 taste in history-only directories.

## 6. The verification gate (exact commands, run from repo root)

1. `npm install` (first time in this worktree; workspaces need it)
2. `npm run lint`
3. `npm run format:check`
4. `npm run typecheck`
5. `npm run test`
6. `for f in corridor.js corridor-ink.js dictionary-worker.js sw.js drift-layer.js; do node --check "prototypes/corridor/$f" || echo "FAIL $f"; done` and `node --check prototypes/bunki-desktop/main.cjs`
7. Corridor battery: `bash docs/build-evidence/renkan/battery.sh` — attempt it; if the environment cannot run it (missing browsers etc.), record `SKIPPED: <reason>` honestly. Never claim green for something you did not run.
8. Boundary guard — must print nothing:
   `git diff --name-only $(git merge-base HEAD claude/live-tweaks-20260827)..HEAD -- docs/specs prototypes/corridor/data prototypes/corridor/vendor prototypes/corridor/fonts prototypes/corridor/audio prototypes/corridor/corridor-standalone.html prototypes/drift/drift-artifact.html packages/seed | tee /dev/stderr | wc -l`

## 7. The hunt list (explicit; check every item, record even "clean" verdicts for ★ items)

**corridor.js** ★
- Dead code: functions/branches unreachable after the 2026-08 reworks; unused CSS classes it references.
- `render()` re-entrancy: handlers that mutate `S` then call `render()` twice, or forget `keepScroll()`/`returnScroll()` pairs.
- Every `commitStorePatch` call: does the caller handle `false` (persist failure)? Any path that mutates `S` BEFORE a failed commit and leaves ghost state?
- `S.listMenuFor` / `S.studyOpen` / `S.listOpen` (new ephemeral keys): stale-state leaks across entries — e.g., drawer staying open for the WRONG word after `go()` to another node; folds left open across different sheets. Fix with the narrowest correct scoping.
- The new `trayLine` extraction: confirm start-button now matches deck rows by `t/id` everywhere; confirm no other identity-comparison (`t === item`) remains against list copies.
- The new `renderListPage`: deleted-list navigation, empty monthly bucket after やめる, `startReview(items)` with suspended/unstarted rows.
- The new search doors: `S.stack = []` before `openSearchPage()` from the top chrome — does it need `dismissSheet()`'s fuller cleanup (stroke page, scroll restore, invoker)? Compare paths; unify if inconsistent.
- The synchronous focus in `openSearchPage`: confirm it cannot steal focus from the sheet-restore path (`S.sheetFocus`) or the repaint-restore in `renderSearchPage`.
- obslog rows: every writer uses the `[ts, kind, key, ...]` shape; the new study-fold reader assumes `r[2]` is the key — verify against ALL writers (`drift`, `note`, `dojo`, `probe`).
- Bilingual copy: every user-visible string flows through `tx()`/`biLabel`/`withEn`; find raw JA-only or EN-only strings on interactive elements; aria-labels present on new buttons.
- Date/day math: `dayKey`, `monthKey`, `srsWhen` around midnight and timezone boundaries.
- Duplicated logic candidates: the two list-maker forms (tray + sheet drawer), the three search-door constructions, the magnifier SVG string ×3 — dedupe ONLY if the result is clearly simpler (PROP otherwise).

**corridor.css** ★ — selectors with no remaining DOM producer (grep classes against corridor.js/drift-layer.js/index.html); duplicate rules; the 2026-08-27 block: collisions with earlier rules, dark-world contrast of `.fold-head`/`.study-fact` (vars must come from theme, not hardcoded).

**sw.js / index.html / manifest.webmanifest** ★ — SHELL list vs files actually shipped by `pages-app.yml` (fonts.css? fonts/? audio/manifest.json?): a shell file missing from the cache list breaks offline; VERSION bump policy documented vs real; the https-only registration guard note still true.

**dictionary-worker.js, corridor-ink.js, drift-layer.js** — message-shape agreement with corridor.js callers; leaked globals; error paths that go silent.

**prototypes/bunki-desktop/** ★ — `main.cjs`: path traversal in `safeJoin` (encoded `..`, symlinks); Range parser edge cases (suffix ranges, `start>end`, non-numeric); SSE client leak on repeated reloads; `fs.watch` recursive behavior; the hardcoded absolute paths (FLAG with a proposed env-first refactor); shim script quoting; README accuracy.

**Workflows & scripts** — `pages-app.yml`, `pages-preview.yml`, `bunki-v11.yml`, `ci.yml`, `corpus-tests.yml`: paths that no longer exist, steps that can never fire, claims in comments that drifted. Root `scripts/`, corridor `tools/`: shebangs, set -euo pipefail, references to renamed files.

**packages/* & apps/app** — bugs and contradictions only (boundary rules in `eslint.config.mjs` are law); test suites that assert stale copy.

**docs/** — `README.md` claims vs reality (commands actually work?); `docs/operator/`, `docs/build-evidence/` internal links; dead relative links repo-wide (check, don't rewrite prose).

**Repo hygiene** — `.gitignore` gaps (files tracked that shouldn't be, e.g. `test-results/`, `tsconfig.tsbuildinfo` in bunki-sites-v11); stray committed artifacts; files >2MB outside data/vendor/fonts/audio (list them as FLAG).

## 8. Final deliverables (the last commit, `[F-999][FIX][P3] sweep: close out`)

1. `docs/build-evidence/cn-sweep/FINDINGS.md` — complete ledger.
2. `docs/build-evidence/cn-sweep/REVIEW_ME_FIRST.md` — exactly this structure:
   - base sha, head sha, total commits
   - counts by class × severity (table)
   - **Top 5 riskiest changes** (sha + one paragraph each: what could break and how to check it in 60 seconds)
   - list of all PROP commits (sha + one line) — the revert menu
   - list of all FLAG items needing operator decision
   - gate-baseline vs gate-final: what changed
   - the exact commands a reviewer runs to re-verify everything (copy-paste block)
3. `docs/build-evidence/cn-sweep/gate-baseline.txt` and `gate-final.txt`.

## 9. How you will be graded (the reviewer's checklist — optimize for it)

- `git log --oneline` alone tells the whole story; any commit's diff is understandable in under 3 minutes.
- Ledger rows ↔ commits are 1:1; no diff exists without a ledger row.
- The boundary guard (§6.8) prints nothing.
- Gate-final is no worse than gate-baseline on every command; improvements are called out.
- Zero scope creep: no new features, no reformatting noise, no dependency drift. `git diff --stat` against base contains only intentional lines.
- Claims are falsifiable: every "verified" has a command and its observed output. Anything not run says SKIPPED.
- Honesty over volume: 25 real findings with airtight receipts beat 60 padded ones. Padding, restating known facts as findings, or "fixed" claims without receipts are the failure modes that void the run.
