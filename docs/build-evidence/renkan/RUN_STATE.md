# 連環 RENKAN — RUN_STATE (final)

**Campaign:** `docs/prompts/BUNKI_RENKAN_ONE_PUSH_CAMPAIGN_2026-08-16.md`
**Branch:** `claude/renkan-one-push-2026-08-16` · **PR:** #74 (draft, stays draft)
**Base:** `main` @ `e335ab7` (PR #73 merged) · **Rounds run:** 0–4 + Wave C + Wave E
**Exact SHAs per landing:** `manifest.json` (schema-bound round ledger)

## §1 terminal board — final typed states

Every row is CLOSED with bound evidence or typed onto the operator decision
sheet (§5). No third state.

| #   | Terminal          | State                        | Binding                                                                                                                             |
| --- | ----------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Every gate green  | **CLOSED**                   | `battery-final/SUMMARY.md` — fresh full §4 battery on the final head; corridor 190, storage 35, a11y, writing-room 37, drift 52, AI 19, native-readings 50, feed 27, replay, export, e2e 44, corpus pytest 193 |
| T2  | One learner state | **DECISION-SHEET (OD-9)**    | Engineering complete: PR70 backlog drained or ADR-disposed; parity enforced by verifiers. `docs/adr/ADR-004-one-learner-state.md` awaits your ratification — the ADR route §1 itself permits |
| T3  | Reading Crown     | **DECISION-SHEET (OD-6/7)**  | 30-cap **lifted** by the exact-SHA demo (`reader-demo/10c440c…`, 85/86 assertions). Honest re-score **28.4/100** (`RUBRIC_REASSESSMENT_2026-08-16.md`). ≥70 is unreachable without physical-device evidence (OD-7) and audio (OD-6) — the rubric's own scale caps everything else at 40 |
| T4  | The feed          | **DECISION-SHEET (OD-3)**    | Loop closed and gated: two consecutive automated runs, grader-scored, pools separated, EN titles as data (82 shelf + 682 archive), cull authority, `verify-feed.mjs` 27/27. 0/N approved **stays 0/N** until you decide — a feed of *approved* material cannot self-close |
| T5  | Ledger zero       | **DECISION-SHEET (OD-19)**   | 83-finding triage + 13 hunt findings burned down across rounds 1–4; the closing double-dry HUNT (8 lenses × 2) could not run — the account hit its monthly spend limit mid-round-4. Script staged, one command from done |
| T6  | AI stack honest   | **CLOSED (ADR-004 sibling)** | 10s abort on every surface, provider/model seam, lossless IndexedDB archive across all six surfaces, 24-turn destruction gone, `verify-corridor-ai.mjs` 19/19. Literal package import deferred by ADR-004 §sibling with named rationale |
| T7  | SRS complete      | **CLOSED**                   | Optimizer harvested (11/11), revlog has a reader, fitted params drive the scheduler fail-closed (R3-D, evidence in `optimizer-roundtrip/`), session budget is the learner's (R2-X), capture reversible everywhere (R2-B), fuzz/clock policy unified (ADR-003) |
| T8  | Truth pass        | **CLOSED**                   | README rewritten to what is real; in-app copy repaired (R2-C/R3-E honest signals, true crumbs); campaign manifest v2 authored fresh and passing `verify:integration-manifest`; this file's terminal states typed |

## What landed (rounds 0–4)

Round 0 — corpus spine ancestry (PR #60's debt), FSRS optimizer harvest,
baseline battery 14/14, ground truth absorbed, decision-sheet proposals drafted.

Round 1 — drift judgments reach the learner obslog (P0, ack-gated with
rollback); dojo drills stamp practice, never orphaned FSRS state (P0); AI
runtime honesty (abort + provider seam + lossless archive); titleEn as data
(TITLES_EN map deleted); sent-door 44px. Triage of the 65-finding ledger
against the live head: 83 rows measured (33 already fixed).

Round 2 — capture sovereignty (覚える top-right everywhere, un-memorize,
list management); one scheduler policy (fuzz off + monotonic clamp, ADR-003),
overdueness ordering, bounded review, no-debt legacy migration, ペース
settings; the feed loop with the operator review queue; reader/shelf truths;
694 archive EN titles; app-kernel budget + real lookup friction; drift ring
honours the 390px glass + first-touch cue. Three HUNT lenses ran.

Round 3 — furigana truth (the ruby stopped lying about deity names: 303
readings re-minted under a provenance-carrying override lexicon, with a
checker and DOM probes); device Back walks the app instead of leaving it;
declared recall gates the reveal (T-06) plus the transactional sweep
(unchecked learner-root writes 19 → 5); the optimizer loop closed; honest
difficulty signals, true crumbs, kept places.

Round 4 — lessons write evidence and enrolling is the learner's choice
(PR70-P0-1), the dojo's second lap is honest practice, the tutor's quiz
survives reload; one Learn lineage in `apps/app` (P1-18) with durable
uncertainty and real kanji-page capture (P2-18).

Wave C — the exact-SHA end-to-end reader demonstration (C1) and the honest
rubric re-assessment (C2).

## Not done, named honestly

- **R4-C** (obslog reader: the 出会い exposure trail on entry sheets; tray
  rest/wake 44px) and **R4-D** (mock-tests proposal doc) — briefs preserved
  below; both died unstarted on the account spend limit.
- **R4-A's independent adversarial verify** — the verify agent died on the
  same limit. The lander re-ran every gate it claimed (typecheck, lint,
  vitest 1710/1710, e2e 44/44) but no decorrelated agent refuted it. Typed
  as OD-20.
- **E3 double-dry HUNT** — see T5 / OD-19.

### Preserved briefs (for the next session)

R4-C: one honest consumer for the observation ledger — an 出会い eyebrow on
word/kanji entry sheets distilling that item's obslog (first seen, times met,
last practice, drift judgment) as evidence display, never a level claim; plus
the tray rest/wake control's 44px hit region (button.tok ::before pattern).
R4-D: `proposals/MOCK_TESTS_PROPOSAL.md` — what exists (tutor quiz, yomi
probe), what a mock-test surface honestly requires (JLPT items are
copyrighted: original-format items vs licensed banks vs generated+人手 review
検収前 pools), staged shape, cost, ending in a decision-requested line.
E3: `renkan-e3-double-dry.js` (staged) — 8 lenses × 2 rounds, adversarial
confirmation of every finding, dry twice or it is not done.

## Resume instructions

A fresh session needs only this repo: read the campaign spec, then this file,
then `manifest.json` (exact SHAs), then `DECISION_SHEET.md`. The battery is
`bash docs/build-evidence/renkan/battery.sh <outdir>`; environment notes are in
the manifest (`e2e` needs its build first; corpus pytest needs the venv).
Nothing merges to `main` without the operator's explicit word.
