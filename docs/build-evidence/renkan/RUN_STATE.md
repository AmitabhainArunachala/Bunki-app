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

### Round 1 — in flight (workflow wf_0c28e955-c23)

- 5 triage lenses DONE (counts above); 4 builds in worktrees → adversarial verify:
  A1a drift-bridge rollback delta, A1b dojo obslog delta, A2 AI runtime
  (timeout/abort + IndexedDB lossless archive + provider seam), B3 titleEn-as-data.
- Lander rule: integrate only verified commits, serially; regenerate
  `corridor-standalone.html` via its builder once after all corridor.js landings;
  full battery on integrated head.
- Round 2 queue (drafted): T7 monotonic-clamp fix; optimizer param round-trip into
  corridor store; session-budget UI (apps/app hardcoded 12); reversible capture;
  T4 feed lane (ingest tranche → build_articles.py 検収前 candidates → review-queue
  JSON → two consecutive runs); ADR-003 learner-state narrowing (needs PR70 triage
  detail); fresh HUNT lenses on integrated head.

## Resume instructions

Fresh session: read the campaign spec, then this file, then `manifest.json`
(exact SHAs). Continue from "Next" above. The battery of §4 is the gate for
every integrated head. Nothing merges to `main` without the operator's word.
