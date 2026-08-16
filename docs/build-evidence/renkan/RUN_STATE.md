# 連環 RENKAN — RUN_STATE

**Campaign:** `docs/prompts/BUNKI_RENKAN_ONE_PUSH_CAMPAIGN_2026-08-16.md`
**Branch:** `claude/renkan-one-push-2026-08-16`
**Base:** `main` @ `e335ab7aad68caf43747bb9bde4c04c06b1b81b3` (PR #73 merged)
**Round:** 0 (bootstrap)
**Last updated:** 2026-08-16

## Terminal board (§1)

| #   | Terminal          | State | Evidence |
| --- | ----------------- | ----- | -------- |
| T1  | Every gate green  | OPEN  | —        |
| T2  | One learner state | OPEN  | —        |
| T3  | Reading Crown     | OPEN  | —        |
| T4  | The feed          | OPEN  | —        |
| T5  | Ledger zero       | OPEN  | —        |
| T6  | AI stack honest   | OPEN  | —        |
| T7  | SRS complete      | OPEN  | —        |
| T8  | Truth pass        | OPEN  | —        |

States: OPEN → IN-ROUND → CLOSED(sha, evidence) | DECISION-SHEET(item).

## Round ledger

### Round 0 — bootstrap + recon + safe landings (closed this commit)

- Branch created from `main` @ `e335ab7`, pushed; draft PR #74 opened.
- Ground truth absorbed: constitution, rubric+closure spec, full-review LEDGER,
  PR70 reconciliation, campaign spec, Wayfinder #32/#37, reading-excellence goal,
  GOSAI/HASSAI/full-instrument distillations, ADR-001/002.
- **Baseline battery: 14/14 GREEN** on `d1604e9` tree (see `battery-baseline/SUMMARY.md`).
  Environment notes: e2e requires `npm run test:e2e:build` first (now in battery.sh);
  corpus pytest needs the venv at `/home/user/.venv-bunki-corpus` (Debian setuptools
  breaks unidic-lite sdist outside a venv).
- **B1 CLOSED**: corpus spine landed as ancestry merge `a14dcbd` — recon proved all
  seven corpus branches byte-identical subset of main (harvest ledger concurs);
  merge-tree verified conflict-free no-op. PR #60's ancestry debt closes when the
  campaign merges.
- **T7 optimizer harvested**: `f8c3b03` cherry-picked as `fa78a65` — 11/11 tests,
  typecheck/lint/format green. Reads the real corridor export envelope `{v:1,…}`.
- **30-article donor superseded**: `codex/native-readings-20260812` (307a4dd) fully
  landed+evolved on main via PR #73 (`1606a1e`/`774f1dc`). Do NOT merge the donor.
- Ledger staleness measured (triage, 83 findings): 33 FIXED on head / 39 OPEN /
  11 PARTIAL. Detail lands with Round 1 integration.
- New confirmed defect (optimizer brief): corridor passes raw wall-clock to
  `scheduler.repeat` — violates `append-order-monotonic-clamp-v1` pin. → Round 2.
- Decision-sheet proposal drafts written under `proposals/` (#35 thread/weave,
  #38/#40 cards+overrides incl. fuzz conflict, TTS 澄/語/話 samples plan,
  #49 rename inventory: corridor is already KAIRO internally).

### Round 1 — CLOSED at `e8b0ccd` (workflow wf_0c28e955-c23: 13 agents, 4/4 builds CONFIRMED)

All four builds adversarially CONFIRMED (independent verifiers reproduced claims
end-to-end, incl. an independent CDP flick smoke for A1a) and landed serially:

- **A1a** `db46914` — drift judgments commit synchronously to obslog via
  commitStorePatch, ack-gated with drift-store rollback on persist failure.
  Never touches S.srs/S.taken/revlog. +7 storage-integrity probes.
- **A1b** `f757944` — dojo drills on non-taken items stamp practice obslog rows
  only (no FSRS state, no revlog, no new-slot burn); taken items unchanged.
  corridor suite grew 116→121.
- **A2** `bdddc28` — aiConverse: 10s AbortController; provider/model store seam;
  IndexedDB append-only AI archive (all six surfaces, "not a word is lost");
  24-turn chat destruction removed (render from durable transcript). New
  verifier `verify-corridor-ai.mjs` (19 checks) joined the battery.
- **B3** `ca14e09` — all 70 primary index rows carry titleEn as data
  (titleEnSource: shelf-map-2026 ×40, renkan-ai-2026-08 ×30); TITLES_EN map
  deleted; archive render honors titleEn when present; native-readings verifier
  grew to 44 checks.
- `0f3aac3` standalone regenerated (builder-only); `e8b0ccd` sent-door 44px hit
  region — the integrated walk exposed a latent sub-44px control the baseline
  viewport had hidden; fixed with the established button.tok ::before pattern.
- Integration notes: residual-storage-callers.json is a line-pin; recompute from
  the merged corridor.js on every landing (script pattern in session log).
- Triage: `triage-round1.json` — 83 findings, 33 FIXED / 39 OPEN / 11 PARTIAL.
  Key PARTIAL details: PR70-P0-2/3/4 substrate landed post-audit (remaining:
  key/data migration, T-06 reveal-forces-Again, universal transactional helper);
  P1-4: one lost を in wikinews-1403 remains.
- Battery: fresh full run on `e8b0ccd` → `battery-round1/SUMMARY.md`.

### Terminal board notes (post round 1)

- T2: obslog is now the one observation ledger (drift + dojo bridges). ADR-003
  disposition next (R2). PR70 backlog: 4 items PARTIAL-with-substrate, 3 OPEN.
- T4: B1 ✅ B3 ✅; feed pipeline + review queue = R2-D.
- T5: burn-down map = triage-round1.json (50 OPEN/PARTIAL, minus round-1 closures).
- T6: deployed AI now has timeout/abort + lossless persistence + provider seam at
  the choke point (behavior parity with @bunki/ai runtime). Open honesty item:
  whether "routes through @bunki/ai" needs literal package unification or an ADR
  documenting contract parity — goes into ADR-003's sibling section (R2/R3).
- T7: optimizer ✅ + revlog reader ✅; R2: monotonic clamp, fuzz-off ADR, bounded
  plan, settings; R3: param round-trip demo on real export.

### Round 2 — landings complete; battery running (workflow wf_03729f77-e93: 17 agents, 0 errors)

All four builds CONFIRMED and landed serially (worktree bases were `main`/e335ab7,
so cross-round merges were the lander's ring — resolved semantically, verified
per landing):

- **R2-B** `78bfaad` — 覚える top-right of every capture-eligible surface;
  un-memorize (revlog append-only, FSRS state retained); list create/rename/
  delete on the lists surface. Corridor suite 121→~140s range with A: 151 total.
- **R2-A** `98c0eab` — fuzz OFF per pin + ADR-003; monotonic clamp
  (`srsSchedulerInstant`, raw ts stays audit truth); overdueness-ordered dues;
  bounded Review ≤ learner's limit with あと N; no-debt `started` mark (未着手
  + 始める); ペース fold (newPerDay 0–50, reviewLimit 5–100) as validated
  `srsPrefs`. Corridor 151/151 on A+B (committed evidence).
- **R2-D** `a83b2b9` + convergence commit — the feed loop: `feed_ingest.py`
  (deterministic, level-balanced tranche from committed archive stock; live
  fetch degrades honestly), minting through `build_articles.py`, 12 検収前
  candidates on the shelf with addedAt/titleEn, curation/cull report, TWO
  consecutive runs committed under `feed/`, `verify-feed.mjs` (27 checks) +
  `feed_apply_review.py` (idempotent, fail-closed). Convergence: the queue
  gained kind `legacy` — 30 pre-feed pending originals now queue rows, so
  `docs/content/feed-review-queue.json` (44 rows) is the ONE operator decision
  file (OD-2 + OD-3 unified).
- **R2-C** `83b16c4` — shelf category sections; nested-button a11y repair;
  用例 hold hint; glossary cross-refs resolved; glossary rows honestly labeled;
  tray 今日このあと reconciliation. P1-4 CLOSED as source-faithful: the
  original Wikinews text has no を at 「（北海道）含め」 — the ledger's suspicion
  was wrong; body untouched, verified against corpus sample.
- **Fleet** `c17bd76` — 694 archive titleEn (now 682 archive + 12 promoted),
  lander-verified coverage + fidelity spot-check.
- **R2-X** `184b258` — apps/app: session budget is the learner's (5–60 chips,
  plan-integrated, persisted); real lookups mint LookupFrictionLogged (T-07,
  no grade); e2e 39→41. Independently CONFIRMED.
- **R2-Y** (drift ring edge fix + first-touch cue, 544d93b): verdict PARTIAL —
  ring+cue+builders CONFIRMED with teeth, but a hunt-07 (lock-member reveal)
  regression signal must be reconciled. Sent back to its builder; NOT landed.

HUNT lenses (13 findings, `hunts-round2.json`): headline P1 — tokenizer
furigana misteaches deity-name readings (神→しん where the name reads 〜のかみ)
in the flagship 検収前 texts, lander-verified against token data (60/70
articles carry rubySource:tokenizer). Also: device-Back exits the SPA outside
the writing room (sentinel exists, one room uses it); galaxy nav-search state
razed; archive scroll context; keyboard Tab on invisible button; full-render()
100–200ms long tasks; crumb lies (dojo/galaxy).

Decision sheet grew: OD-11..OD-16 (see DECISION_SHEET.md).

### Round 3 — QUEUE

1. **Furigana truth** (from hunt P1): reading-override lexicon in the mint
   pipeline for name compounds; re-mint affected token readings; deity-name
   verifier probe. The 30 検収前 bodies are the priority surface.
2. **History sentinel everywhere**: generalize the writing room's Back
   sentinel so device-Back walks the app's own stack (drift dive, sheets,
   review, archive) instead of exiting; hunt repro steps in hunts-round2.json.
3. **T-06 reveal-forces-Again** in corridor review (PR70-P0-3 delta) +
   universal transactional helper sweep (P0-4 delta).
4. **T7 param round-trip**: export → fsrs-optimize → import params into
   corridor scheduler (validated store field), demonstrated on a real export.
5. **Small truths**: archive scroll restore, nav-search state preservation,
   dojo/galaxy crumb, lesson-list scroll, 'None' date render, difficulty
   subtitle near-constant fix, keyboard-Tab order at galaxy home.
6. **R2-Y reconciliation** (in flight with its builder).
7. Then Wave C: T3 demo walk + rubric re-assessment; Wave E: truth pass,
   final battery, double-dry HUNT.

Script staged at `<session>/workflows/scripts/renkan-round-2.js`; a fresh session
re-authors it from this queue: (R2-A) SRS/review integrity: monotonic clamp,
fuzz OFF + ADR-003-corridor-fuzz-and-clock, overdueness-ordered dues, bounded
review ≤20 + deferred count, no-debt legacy migration marker, NEW_PER_DAY +
review-bound settings. (R2-B) capture sovereignty: 覚える top-right everywhere,
un-memorize (revlog append-only), list rename/delete/create. (R2-C) reader
truths: wikinews-1403 を, nested buttons, 用例 hint, glossary cross-refs, shelf
sections, glossary honesty labels, tray messaging. (R2-D) T4 feed: ingest tranche
→ mint via build_articles.py → 検収前 candidates + addedAt + titleEn → operator
review-queue JSON + apply script → curation/cull report → two consecutive runs →
feed verifier. (Fleet) 694 archive titleEn in 6 batches. (Hunt) reader-experience,
dead-ends-navigation, console-perf lenses.

## Resume instructions

Fresh session: read the campaign spec, then this file, then `manifest.json`
(exact SHAs). Continue from "Next" above. The battery of §4 is the gate for
every integrated head. Nothing merges to `main` without the operator's word.
