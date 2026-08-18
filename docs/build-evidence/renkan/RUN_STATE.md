# 連環 RENKAN — RUN_STATE (final)

**Campaign:** `docs/prompts/BUNKI_RENKAN_ONE_PUSH_CAMPAIGN_2026-08-16.md`
**Merged:** PR #74 → `main` @ `ae1d901` (2026-08-18) · follow-up branch: `claude/renkan-round-b-2026-08-18`
**Base:** `main` @ `e335ab7` (PR #73 merged) · **Rounds run:** 0–4 + Wave C + Wave E
**Exact SHAs per landing:** `manifest.json` (schema-bound round ledger)

## §1 terminal board — final typed states

Every row is CLOSED with bound evidence or typed onto the operator decision
sheet (§5). No third state.

| #   | Terminal          | State                        | Binding                                                                                                                             |
| --- | ----------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Every gate green  | **CLOSED**                   | `battery-e3a/SUMMARY.md` — 16/16 on the newest head after the E3 fixes (corridor 215, a11y 46, writing-room 37, storage 35, drift 52, AI 21, native-readings 54, feed 31, replay, export, e2e 44, corpus 193). `battery-final/SUMMARY.md` is the same battery at the campaign's §5 close |
| T2  | One learner state | **DECISION-SHEET (OD-9)**    | Engineering complete: PR70 backlog drained or ADR-disposed; parity enforced by verifiers. `docs/adr/ADR-004-one-learner-state.md` awaits your ratification — the ADR route §1 itself permits |
| T3  | Reading Crown     | **DECISION-SHEET (OD-6/7)**  | 30-cap **lifted** by the exact-SHA demo (`reader-demo/10c440c…`, 85/86 assertions). Honest re-score **28.4/100** (`RUBRIC_REASSESSMENT_2026-08-16.md`). ≥70 is unreachable without physical-device evidence (OD-7) and audio (OD-6) — the rubric's own scale caps everything else at 40 |
| T4  | The feed          | **DECISION-SHEET (OD-3)**    | Loop closed and gated: two consecutive automated runs, grader-scored, pools separated, EN titles as data (82 shelf + 682 archive), cull authority, `verify-feed.mjs` 27/27. 0/N approved **stays 0/N** until you decide — a feed of *approved* material cannot self-close |
| T5  | Ledger zero       | **DECISION-SHEET (OD-19)**   | 83-finding triage + 13 round-2 hunt findings burned down across rounds 1–4. The double-dry gate then RAN: round A's eight lenses found 27 more, of which 11 are fixed and gated tonight (see below). Round A was not dry, so by the gate's own rule the campaign is not done — round B is the next command |
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

- ~~R4-C, R4-D, R4-A's verify, E3~~ — all four were stopped by the account's
  monthly spend limit at the §5 close. The limit lifted afterwards and all
  four were completed: **R4-C** landed (出会い trail + rest/wake 44px),
  **R4-D**'s proposal is on the sheet, **R4-A** was independently CONFIRMED
  (the verifier forced the StrictMode double-persist hazard rather than
  trusting the claim, and found two misleading test comments, now corrected),
  and **E3 round A** ran — see below.
- **E3 round B** has not run. Two consecutive dry rounds close T5; one
  non-dry round has now been worked. OD-19.

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


## E3 round A — the closing gate ran, and it was not dry

The spend limit lifted, so the double-dry HUNT started. Round A's eight
lenses returned **27 findings**; the round is by definition NOT dry, and the
campaign's own rule is that a non-dry round becomes work. Eleven fixes landed
tonight, each with the probe that convicts its absence:

| finding | fix |
| --- | --- |
| P1 dojo enrolled captured-but-unstarted rows into FSRS (no-debt hole one step out from A1b) | drills as practice; `E3-A` probe |
| P2 いま見る hid the answer the learner just asked for | the flag holds for the whole card |
| P1 rejecting a feed mint restored a pre-override body (R3 lexicon undone) | restore always re-mints; only the unregenerable NINJAL pair carries over |
| P2 ten glossary rows carried a corpus NAME as their licence | they say 未検証, wear 検収前, and wait on the operator (`rights` queue kind) |
| P2 the one `pendingVerification` row wore no mark and had no queue row | both, now |
| (root cause) the body overwrites the index, so index-only marks were invisible | bodies reconciled + an agreement probe |
| P2 the tray forgot every door but the reader, and opened at the last surface's offset | it carries its origin and lands at its own top |
| P2 device Back could not see the nav / world stones / capture panel | they dismiss in stacking order before any room moves |
| P1 every render threw keyboard focus to `<body>` | the control that had focus is found again by name |
| P1 names written in kanji were dead text (the grader's exclusion was doing the reader's job) | any kanji token with a reading is a door, in its own class |
| P1 an import left the previous learner's AI conversations underneath | the archive is cleared, and a failure to clear stops the import |
| P1 筆順の番号 did nothing once the field closed | the numbers answer to their own toggle |
| P1 Tab wrapped past the room's two fixed corner controls | a rendered box is the honest visibility test |
| P1 readings shipped truncated while the builder claimed FULL sets | slicing removed; the shipped-data truth stated; OD-21 |
| P2 the tray's rows were keyboard-dead; four folds had no aria-expanded | both fixed |
| P2 the ink kept redrawing a still forever | freeze means stop drawing; begin() restarts it |
| CI: writing-room 36/37 | the probe was sampling mid-fade; it now waits for what it asserts |

Battery after all of it: **16/16** (`battery-e3a/SUMMARY.md`). The corridor
suite stands at **215**, a11y 46, writing-room 37, drift 52, AI 21, feed 31,
native-readings 54.

Round A's remaining findings (contrast on two chrome labels, sentence tokens
outside the reader being keyboard-dead, the radical picker's density, the
tutor's mid-flight edges, archive furigana coverage) are recorded in the
workflow journal and typed to the sheet where they are operator-shaped
(OD-21, OD-22). **Round B has not run**: by the gate's own rule the campaign
is not dry until two consecutive full-fleet rounds come back empty.

### E3 round A — the verification pass, and what is still open

All 27 round-A findings went through adversarial confirmation on the live
head. **6 were CONFIRMED; the rest were refuted** — most of them because the
night's fixes had already landed on the head the verifier re-tested, which is
the ring closing exactly as designed.

Four of the six confirmed are fixed and gated: the sentence ladder outside
the reader (用例, the 文 page, the review answer face) is keyboard- and
screen-reader-reachable; 字引's chosen lens speaks its state and paints with
the world's own pair instead of 2.85:1 white-on-deep-red; the tutor's quiz
waits where it was asked for instead of seizing the room the learner walked
to; the reader carries its English title again in bi mode.

**Two confirmed findings remain open** for the next session (both P2, both in
the AI/dictionary surfaces, both with exact anchors in the workflow journal
`wf_1ccf6598-25f`):

1. Leaving the tutor page mid-question drops the 考え中 and re-arms 送る, so
   sending again duplicates the question in the durable transcript
   (`corridor.js` ask() closure — the spinner and disabled state live only on
   the current render).
2. Closing a word sheet while the tutor is thinking archives the reply where
   no surface can read it back (`renderAiTutor`/`renderAiExamples` start from
   a fresh empty out and never read the archive).
   — and 字引's radical picker is 211 chips at a 41px pitch, the densest tap
   grid in the app.

**Round B still has not run.** Two consecutive dry rounds close T5; round A
was worked, not dry. The next command is the same one: the E3 script.

**KAIRO-next addendum (2026-08-17):** both open confirmed findings above and
the radical-picker density are fixed on `kairo-next-integration-20260817`,
each with a convicting probe (`verify-corridor-ai.mjs` 24/24, corridor
215/215). The staged `renkan-e3-double-dry.js` was never committed anywhere;
OD-19 now carries that fact. See `docs/build-evidence/kairo-next/RUN_STATE.md`.

## After the merge — 2026-08-18

The operator marked PR #74 ready and **merged it**: `ae1d901` on `main`.
That answers **OD-8 — MERGE**. The campaign branch is history now; follow-up
work belongs on a fresh branch cut from `main` (this file's home from here).

`main` also took a parallel integration the same day (**PR #76**,
`kairo-next-integration-20260817`). Between the two lines, the six confirmed
E3 round-A findings are now ALL addressed: four were fixed on the campaign
branch, and the parallel line closed the other two —
`aiChatLog.pending` survives a render (so leaving the tutor mid-question no
longer drops the 考え中 or lets a resend duplicate the question) and
`renderAiTutor` restores the last reply from the archive (so closing a word
sheet mid-thought no longer throws the answer away). It also gave the
kanjidex chips their 44px targets.

**Post-merge battery on `ae1d901`: 16/16.** Two integration lines merging
cleanly is not something to assume — it was measured.

### T5's standing

The double-dry gate has been re-launched on the merged head. The rule is two
consecutive rounds with zero confirmed findings; round A on the old head was
worked, not dry, so the count starts again from zero here. Until two clean
rounds land, T5 stays **DECISION-SHEET (OD-19)** and this file says so.

## Resume instructions

A fresh session needs only this repo: read the campaign spec, then this file,
then `manifest.json` (exact SHAs), then `DECISION_SHEET.md`. The battery is
`bash docs/build-evidence/renkan/battery.sh <outdir>`; environment notes are in
the manifest (`e2e` needs its build first; corpus pytest needs the venv).
Nothing merges to `main` without the operator's explicit word.
