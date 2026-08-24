# 掌 TENOHIRA — the month in the hand: real use closes the loop

**Date:** 2026-08-19 · **Author:** Claude (operator-directed) · **Status:** active
when a session is pointed at this file. Supersedes the G00 end-to-end controller
(`docs/goal/`, retired 2026-08-19) as the repository's operating wayfinder.

The operator's instruction, verbatim in intent: _I am the learner now, on my
real phone, refining through a month or so of real use — then a version for my
father (74, coming from entry-level Duolingo). If it serves us both, the whole
learning curve is covered. Engineering decisions are handed to Claude, who
always shares the thought process. Run this end to end._

掌 — the palm of the hand. The app leaves the verifier's cage and lives in two
real hands; what the hands report becomes the work.

---

## §0 Authority, base, and laws

- **Base**: `main` @ `ae1d901` (PR #74 RENKAN and PR #76 KAIRO-next both
  merged, 2026-08-19). The corridor (`prototypes/corridor/`) **is the app**
  (Decision 1 below). `apps/app` (Expo) is parked as a possible future native
  wrapper; its typed packages remain the verified reference for FSRS/replay.
- **Branch/PR discipline** (this campaign's core change from RENKAN): no more
  one giant campaign branch. Work lands as **small, single-purpose PRs** in the
  順路 order of §2, each:
  1. built on a fresh branch from current `main`,
  2. battery-gated (§4) before push,
  3. independently and adversarially reviewed (the build-agent +
     reviewer-agent pattern that closed PR #76),
  4. merged only on the operator's explicit word.
- **Ground truth reading list** (a fresh session reads, in order):
  1. this file,
  2. `docs/build-evidence/tenohira/RUN_STATE.md` (live position + next command),
  3. `docs/operator/BUNKI_CURRENT_PRODUCT_CONSTITUTION_2026-08-15.md`,
  4. `docs/build-evidence/renkan/RUN_STATE.md` + `DECISION_SHEET.md`
     (inherited open items: OD-19/21/22 and the sheet),
  5. `docs/build-evidence/kairo-next/RUN_STATE.md`.
- **Inherited laws, non-negotiable** (unchanged from RENKAN):
  - Capture is sovereign; explicit promotion before scheduling; AI is advisory
    and never writes learner/FSRS state; exposure is not mastery; provenance
    stays attached; one learner state across surfaces; 44px and readability
    are product requirements.
  - No proxy metrics. Claims bind to exact SHAs and runnable evidence or are
    marked UNVERIFIED. Never weaken, skip, or quarantine a verifier to get
    green; a verifier change is a build product with its own verify loop.
  - Licence pools stay separated; unapproved content is visibly 検収前;
    nothing self-approves. Evidence directories are append-only. Frozen
    `docs/specs/` are never edited.

## §1 The ten decisions of 2026-08-19 (binding)

Recorded from the operator session of 2026-08-19; each is law until the
operator says otherwise.

| #   | Decision                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **The corridor is the app.** Expo shell parked; typed packages stay the verified core.                                                             |
| 2   | **Two learners, whole curve**: the operator now (real phone, ~a month of daily use), then the father's version. Real use is the evidence engine.   |
| 3   | **Engineering lead is Claude's**, reasoning always shared. G00 controller retired; small battery-gated PRs; weekly friction triage.                |
| 4   | **Feed: delegate with criteria** — a rubric distilled from the operator's culls; AI approves against it with provenance; operator spot-checks.     |
| 5   | **Audio: quality is the law.** Pitch accent must be right. Research done 2026-08-19; two-tier plan in §3 PR 五. Nothing ships un-judged.           |
| 6   | **AI access: one family key** on both phones; device-only stance unchanged.                                                                        |
| 7   | **Data truth**: full kanji readings regenerated (OD-21) + furigana-truth sweep over the 682 archive (OD-22). Glossary-rights rows stay parked.     |
| 8   | **English scaffolding: per-learner device default.** Already structurally true (`S.lang` lives in the per-device store; fresh devices start `bi`). |
| 9   | **Word sheet: essentials first** (word, reading, top meanings, 覚える), the rest behind quiet folds, nothing removed.                              |
| 10  | **Push the Nihonga direction** (operator override of the cautious option). Staged: approved mockups first, reader leads, month not muddied.        |

## §2 順路 — the PR sequence

Each PR is one session's honest work. Order is dependency order; a later PR
never starts while an earlier one awaits operator word unless the operator
says to parallelize.

| PR  | Name                                | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 一  | 手の中に · in your hands            | This PR. Campaign spec + RUN_STATE; G00 retirement; PWA installability (manifest, service worker, icons, deploy list) so the Pages site installs to both home screens; the ひとこと friction-note door (obslog-riding, export-riding); evidence-doc corrections.                                                                                                                                                                                     |
| 二  | 語のページ · the word page breathes | Essentials-first word sheet (Decision 9); the lesson lane surfaced as the father's obvious daily front door.                                                                                                                                                                                                                                                                                                                                         |
| 三  | よみもの · the feed flows           | Approval rubric distilled from the operator's cull history; delegated approval pass with provenance marks; in-app spot-check queue (Decision 4, OD-3).                                                                                                                                                                                                                                                                                               |
| 四  | まことの読み · true readings        | KANJI_SRC regeneration for full reading sets (OD-21); furigana-truth gate swept over the 682-article archive (OD-22).                                                                                                                                                                                                                                                                                                                                |
| 五  | こえ · the voice                    | Voice shootout first (probe corpus: NHK-accent-dictionary ambiguous pairs + real shelf sentences; judged against OJAD/NHK + the operator's ear; candidates: Azure ja-JP, Google, AivisSpeech/SBV2 JP-Extra, CoeFont, VOICEVOX). Then Tier 1: curated-shelf audio pre-generated and shipped behind a new **audio-truth gate**. Tier 2: on-demand synthesis via an accent-phrase-exposing engine so the word sheet can _draw_ verified pitch patterns. |
| 六  | 日本画 · living ink                 | The Nihonga push (Decision 10): direction mockups for operator approval first, then the reader leads the rollout, then the rest follows.                                                                                                                                                                                                                                                                                                             |

**Standing debts** (attach to whichever PR touches nearest, or their own small
PRs): rebuild the E3 eight-lens double-dry instrument and run it dry twice
(closes T5/OD-19); preserve the chat draft across AI reply settlement
(PR #76 review nit); the KAIRO-next handoff doc was never committed — its
absence is recorded, reconstruction only if the operator supplies the
original; weekly friction triage from the ひとこと notes once PR 一 ships.

## §3 The month — how real use drives the loop

- The operator (and later the father) uses the installed app daily.
- Frictions go through the ひとこと door (one tap from the tray, writes an
  append-only `['note']` obslog row, rides the export envelope).
- Weekly (or when the operator sends an export/notes), a session triages
  notes → the next small PR. Notes are evidence, not commands: anything
  law-shaped still goes to the operator.
- Real-device findings retire `browserAndDevice: NOT_RUN` honestly (OD-7
  begins to close by living, not by lab claims).

## §4 The battery (unchanged gate)

`bash docs/build-evidence/renkan/battery.sh <outdir>` — all 16 gates green
before any push, evidence committed under
`docs/build-evidence/tenohira/<pr>/`. Node 22, Playwright Chromium,
`~/.venv-bunki-corpus` (Python ≥3.11, corpus dev+grading extras).
Corridor suite stands at **216** checks as of `main @ ae1d901` (the
kairo-next RUN_STATE's "215" predates the kanjidex probe).

## §5 What this campaign honestly cannot close

- Reading-Crown scoring past 40 without audio (PR 五) and device evidence
  (§3) — and past that, the rubric is the judge, not this file.
- Feed content approval (Decision 4 delegates _checking_, not taste): 0/N
  approved stays 0/N until the rubric pass runs AND the operator's
  spot-checks hold.
- The father's version's fitness: only his hands can say. His onboarding
  session is its own future decision.
- Anything the decision sheet types to the operator (OD-16/17/18 content
  judgments, glossary rights).

## §6 Kickoff (for a fresh session)

1. Read §0's list. 2. `git fetch origin main` and branch from it.
2. Open `docs/build-evidence/tenohira/RUN_STATE.md`; do the **next command**
   it names. 4. Battery before push; draft PR; adversarial review; operator
   word before merge. 5. Update RUN_STATE + push. Sessions die; the campaign
   must not.
