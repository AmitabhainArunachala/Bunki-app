# KAIRO next integration — RUN_STATE

**Campaign:** `docs/handoffs/KAIRO_NEXT_INTEGRATION_HANDOFF_2026-08-17.md`
**Branch:** `kairo-next-integration-20260817` · **Base:** PR #74 head `40012e5`
**Day-one SHAs verified:** PR #74 head `40012e58c899426d931875cfa01f6cc4bb257566`,
`main` @ `e335ab7` (0 ahead / 65 behind PR #74). PR #74 stays unmerged — operator's word only.

## What this session closed

### Integrity debt (baseline was NOT green — now it is)

| gate | baseline | cause | fix |
| --- | --- | --- | --- |
| corridor | 214/215 | sheet sentence tokens (`button.tok` outside `#reader`) were measured without their 44px `::before` hit region — the CSS already granted it; the verifier's selector only looked inside the reader | verifier measures the `::before` on every `button.tok` (`verify-corridor.mjs`); corridor now **215/215** |
| storage-integ | crash | line-pins in `residual-storage-callers.json` were stale by +3 against the current `corridor.js` (12943→12946, 4493→4496, 4559→4562) — evidence drift, not a code regression | ledger line-pins recomputed against the live source (per the ledger's own schemaNote); verifier green |
| corpus-pytest | 18 collection errors | battery hard-coded `/home/user/.venv-bunki-corpus`; corpus requires Python ≥3.11 | battery probes `$HOME` first; venv built at `~/.venv-bunki-corpus`; **185 passed, 2 skipped** |

### E3 round A — the three named residuals, fixed and convicted

1. **Chat pending lived in one render's closure** — leaving the tutor page
   mid-question dropped the 考え中 and re-armed 送る; a second send duplicated
   the question in the durable archive. Fix: `aiChatLog.pending` module state;
   returning to the page repaints the spinner and keeps 送る sealed; `ask()`
   refuses while pending. Probes: `verify-corridor-ai.mjs` — "walking away and
   back mid-question keeps 考え中 and the sealed 送る", "a send while pending is
   refused" (the Enter-key vector, which bypassed the disabled button).
2. **Archived replies unreadable after their sheet closed** —
   `renderAiTutor`/`renderAiExamples` started from an empty out. Fix:
   `aiLastReply(surface, ref)` hydrates the reopened word sheet from the
   archive (newest assistant row for `word:<id>`), no new request. Probe:
   "the archived tutor answer and examples read back on reopen — no new request".
3. **Radical picker density** — 211 chips at a 41px pitch, the densest tap
   grid in the app. Fix: `.kdx-chip` now keeps the app-wide `--tap` (44px)
   floor in both axes; convicted by a dedicated kanjidex probe in
   `verify-corridor.mjs` ("every radical and stroke chip is at least 44px",
   211 chips measured) — the shelf/panel 44px sweep never enters the kanjidex,
   so it could not convict this fix on its own. Revert-checked: with the
   `.kdx-chip` floor removed the probe fails 211/211.

AI verifier: **24/24** (was 21/21; three new convicting probes added, none weakened).

## E3 round B — honest state

`renkan-e3-double-dry.js` was **staged, never committed** — it exists nowhere
in the tree or in any commit across all branches (`git log --all` search).
Round B as "replay the staged script" is unexecutable. What ran instead this
session: the full battery (16 gates), the corridor/a11y/AI/storage sweeps on
the new head, and fixes for every confirmed-open round-A finding. This is
**not** two consecutive dry rounds by the gate's own rule — T5 stays typed to
the sheet (OD-19) with the added fact that the round-B instrument must be
rebuilt before the gate can ever close. See DECISION_SHEET addendum.

## Battery on this head

**16/16 green** — `battery-close/SUMMARY.md` in this directory, run after all
fixes (completed 2026-08-17T05:01:56Z; e2e 44 passed, corpus 185 passed / 2 skipped).
Baseline (pre-fix, for contrast): `battery-baseline/SUMMARY.md` (corridor and
storage red, corpus mis-invoked).

## Resume instructions

Read the handoff, then this file, then `docs/build-evidence/renkan/RUN_STATE.md`
and `DECISION_SHEET.md`. Battery: `bash docs/build-evidence/renkan/battery.sh <outdir>`
(Node 22, Playwright Chromium, `~/.venv-bunki-corpus` for corpus). Nothing
merges to `main` without the operator's explicit word.

## Post-merge addendum (2026-08-19, independent review + TENOHIRA kickoff)

- **Count correction:** the "corridor now 215/215" above predates commit
  `88826ff` (the kanjidex probe). On the merged head the corridor suite is
  **216/216** — independently re-run and confirmed on `612ead1` and again on
  `main @ ae1d901`.
- **The handoff this file cites was never committed:** the campaign source of
  truth named in the header
  (`docs/handoffs/KAIRO_NEXT_INTEGRATION_HANDOFF_2026-08-17.md`) exists in no
  tree or commit on any branch — the same failure mode OD-19 records for
  `renkan-e3-double-dry.js`. Its substance survives in PR #76's description
  and in the review record; reconstruction waits on the operator supplying
  the original. Resume via the TENOHIRA campaign instead:
  `docs/prompts/KAIRO_TENOHIRA_CAMPAIGN_2026-08-19.md`.
