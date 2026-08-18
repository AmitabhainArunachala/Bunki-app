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

## E3 round B — the gate ran on the merged head, and it was not dry either

The rebuilt instrument (`.claude/workflows/renkan-e3-double-dry.js`) ran its
eight lenses against `ae1d901`. On a four-CPU runner the fleet walks in pairs,
so the hunt is a multi-hour instrument; it returned **28 findings**, and by the
gate's own rule a round that finds something is a round WORKED, not passed.

Nineteen are fixed on this branch, each with the probe that convicts its
absence (`verify-corridor.mjs` **233**, up from 216; the AI suite **26**):

| finding | fix |
| --- | --- |
| P1 漢字だけ regraded cards the queue never drew — a 30-day mature card fell to relearning, and a started row minted state past 新規/日 = 0 | the study run schedules only what the queue would have drawn at that instant; everything else is 稽古 |
| P2 the dojo lobby counted the FORECAST and offered cards はじめる could not open ("3 waiting" → "No cards are waiting") | it counts the pool, and names what ripens tonight — the tray's own POL-8 shape |
| P1 the world stones never touched the walk sentinel: Back left the app from the front door in one press, abandoned an article in two | opening arms it, closing re-arms it; the stones are a walkable layer under the ONE sentinel, not a surface with its own entry |
| P2 Back over the writing room closed the ROOM and left the stones and their scrim stranded on the glass | popstate dismisses the topmost overlay before any room moves |
| P2 Tab walked straight out of the stones into the page under the scrim, and Enter there navigated the app | aria-modal, the room beneath inert, and the ring wraps |
| P2 pressing 覚 while already in the tray erased the tray's remembered door; 戻る then abandoned the article | a press that changes nothing changes nothing |
| P1 47 name-tokens per article were focusable buttons with no action and no accessible name — round A made them doors and stopped there | a name says what it is, shows its reading, and hides it again; with ふりがな always on it stops being a button at all |
| P2 分かち＝文節 cut names in half and glued one name's tail to the next name's head | a name starts a 文節, whatever the grader's 固有名詞 exclusion says |
| P1 the review dropped the keyboard to `<body>` at both gates — 21 tabs to 思い出した, 56 more to the stamps | a press that destroys its own control names its successor, tried in the order written |
| P2 every in-sheet press threw focus to 戻る and announced nothing | 戻る is where a sheet OPENS, not where every press inside it ends |
| P2 the card's context scope and its list membership existed only as a CSS class | both state `aria-pressed` |
| P2 the ペース steppers lost focus on every press, and their 44px regions overlapped so a tap under 新規/日 changed 一回の枚数 | they name themselves; a row is at least as tall as the target it claims |
| P2 読み込む overwrote the learner's record with bytes the boot validator rejects — the record destroyed, the app read-only and empty | the import gate is the boot gate; nothing is destroyed to discover the replacement is unreadable |
| P2 undoing a drill INCREASED the 出会い trail's practice count — the revocation row was read as practice | a revocation is not an encounter, and it cancels the row it points at |
| P2 the ten やさしい日本語 rows explained their 検収前 with a Wikinews archive-freeze story that is false of them | the mark names its own reason — rights, human review, or the freeze |
| P2 AnimCJK glyph data (Arphic Public License) is fetched and painted while the panel claiming to state everything omitted it | declared in the pool, with the probe that catches it drifting from `animcjk/index.json` |
| P1 a second 先生の小テスト silently replaced the quiz the learner was in the middle of, taking their answers | the request in flight is state, not a closure; the room it was asked from is the view AND its depth |
| P2 any repaint while the tutor was thinking killed 考え中 and the arriving reply painted into a detached node | 考え中 is state; the reply settles where it can be seen, or asks for one more render |
| P2 the follow-up typed while the tutor thought was destroyed by the reply's own render | the draft rides the render |
| polish the first device Back after ANY reload did nothing at all — boot stripped the walk sentinel's marker and left its entry standing as a stop nothing could recognise | the marker is adopted, not stripped; measured both ways (`answered:false` → `answered:true`) |
| polish the tutor's quiz wore a 本棚 › 小テスト crumb while its only door is the lists tray | the crumb names the room 戻る reopens |
| P2 the galaxy — the DEFAULT entry — held 94–96% of the main thread for as long as the page existed, background included | a page nobody is looking at is a room they have left: the corridor sleeps it through the drift's OWN public seam, the same `show`/`hide` the view switch uses. Measured 97.3% → **0.0%** when backgrounded. It took two withdrawn attempts to find that door. The first gated the loop inside the BUILT layer and broke chain-hop (drift-fast 52/52 → 50/51). The second woke the galaxy with a `render()`, which rebuilds `#app` — and visibility can flip while a finger is mid-gesture, so it tore elements out from under whoever was holding them (drift-fast `detached`, native-readings `Element is not attached to the DOM`). Both times the verifiers were reporting a real hazard, not noise. The seam is driven directly now: no render, nothing detached, and the drift's physics and gesture grammar stay untouched (#46) |

The remaining round-B findings are operator-shaped or content work and are
typed to the sheet rather than fixed here.

### The verification pass, in full

The gate's own Verify phase then ran every one of the 28 findings past an
independent adversarial agent — 37 agents, 3.5 hours, zero errors. **29
verdicts: 5 CONFIRMED, 24 refuted**, and the refutations are overwhelmingly
of one kind: *genuine at `ae1d901`, already fixed by round B's own fix*. That
is the ring closing exactly as designed — the verifier had no idea the fix
existed and re-derived its absence.

Every one of the five it upheld is accounted for:

| upheld | disposition |
| --- | --- |
| the dojo lobby advertises cards はじめる cannot draw | fixed, `3df6ed8` |
| 漢字だけ ignores ペース and dueness | fixed, `3df6ed8` |
| undoing a drill INCREASES the 出会い practice count | fixed, `3df6ed8` |
| AnimCJK's Arphic licence missing from the sources panel | fixed, `3df6ed8` |
| the 45,276-sentence example bank's cull authority | **OD-23**, the operator's |

Nothing it upheld is unaddressed.

**By the gate's own rule this is a round worked, not a dry round.** The count
restarts from zero on this head, exactly as it did after round A.

### What the round taught the instrument

Every confirmation carried the same caveat — *the fix landed on HEAD while I
was verifying*. The verdicts still resolved correctly, but that is luck, not
design: a campaign that fixes what it finds moves the head under its own
verifiers. The gate now takes the head as an argument, hunters name the tree
they walked in their coverage, and verifiers check that commit out into a
scratch worktree instead of trusting a working tree that is moving
(`3fed823`). The loop closed on the instrument, not just on the product.

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
The closing gate is now an instrument in the tree rather than a staged script:
`Workflow({ scriptPath: '.claude/workflows/renkan-e3-double-dry.js', args: { head: '<sha>' } })`
— eight lenses, adversarial confirmation, dry twice or it is not done
(`.claude/workflows/README.md`). By PATH, not by name: `{ name: … }` resolves
against a different registry and answers *not found*.
On a small runner the fleet walks in pairs, so a full gate is hours, not
minutes. Nothing merges to `main` without the operator's explicit word.
