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

### Round 0 — bootstrap (this commit)

- Branch created from `main` @ `e335ab7`, pushed, draft PR opened.
- Ground truth absorbed: constitution, full-review LEDGER (2 P0 / 22 P1 / 27 P2 / 14 polish), PR70 reconciliation backlog, campaign spec.
- Next: baseline battery on the base SHA; recon of PR #60 (corpus spine), donor branches (`codex/fsrs-optimizer-20260812`, `codex/native-readings-20260812`), rubric closure semantics, wayfinder issues; then Round 1 fan-out (Wave A foundations + Wave B feed, per §3).

## Resume instructions

Fresh session: read the campaign spec, then this file, then `manifest.json`
(exact SHAs). Continue from "Next" above. The battery of §4 is the gate for
every integrated head. Nothing merges to `main` without the operator's word.
