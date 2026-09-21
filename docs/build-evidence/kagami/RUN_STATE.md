# 鏡 KAGAMI — RUN_STATE

**Campaign:** `docs/prompts/BUNKI_KAGAMI_CAMPAIGN_2026-08-25.md`
**Amendment 一 (2026-09-21):** `docs/prompts/BUNKI_KAGAMI_AMENDMENT_2026-09-21.md` — 道場の門
**Base:** `main` @ `812a85b7` (PR #85 merged) · position last corrected 2026-09-21 on `main` @ `11594593` (#93)

## Position

| PR  | Movement                                            | State                              |
| --- | --------------------------------------------------- | ---------------------------------- |
| 一  | 台帳 — ledger taxonomy + sensei-writes              | MERGED (`8504cea4`, #86)           |
| 一補 | 台帳の後始末 — review rounds 4–9 aftercare          | MERGED (`f4cf1b88`, #88)           |
| 七a | 模試 — the mock room + 25 papers                    | MERGED (`f4cf1b88`, #88)           |
| 二  | 鏡 — the model + mirror page                        | MERGED (`124f08b3`, #90)           |
| 二補 | 真実化 — stale gates repaired, CI wired, this record | **IN REVIEW** (this PR)            |
| 三  | 先生の目 — sensei-reads + placement                 | queued — next                      |
| 八  | 道場の門 — the dojo lobby as the gateway            | queued (amendment 一)              |
| 九  | 次の一手 — the next-move planner                    | queued (amendment 一, after 三)    |
| 十  | 外の証拠 — external evidence rows                   | queued (amendment 一)              |
| 四  | 潮 — drift 自                                       | queued                             |
| 五  | 札の文 — multi-sentence cards + mining              | queued                             |
| 六  | 棚 — shelf at the band                              | queued                             |
| 七b | 模試 — Stage 1 DIAGNOSTIC + the custom composer     | queued (reads 二's frontier and 九) |

Movement 七 was one row twice: the papers the operator brought forward
(merged, #88) and the Stage-1 diagnostic the campaign typed (still queued).
They are 七a and 七b from here on so the table cannot say two things.

## 一補 — what and why

Devin's fourth review round landed minutes before #86 merged; all three findings
were confirmed against main and fixed in 一補: (1) a record write the device
refuses no longer strands a destroyed archive — the crossing holds rollback
material and puts the conversations back; (2) a stale tab freezes (storage-event
`staleTab` law: alert up, writes refused, reload to continue) instead of
clobbering the record another tab wrote — two live tabs are single-writer now,
by design; (3) the `aiEvidenceIncomplete` marker rides the envelope through
import (storeExtras seam), so a declared evidence loss stays declared forever.
Devin also holds 6 dashboard-only flags ("not posted by settings") — unreadable
from here; the operator can paste them if they want them addressed.

## 七 模試 — brought forward on the operator's word (2026-08-31)

The campaign typed movement 七 as a Stage-1 diagnostic only, with authored item
banks (¥1M–6M) left on the decision sheet. The operator's word replaced that:
**five traditional papers per JLPT level**, plus a scaffold for custom sets
(gap-filling, 中学歴史-style scenarios, a reading-list test, YouTube recall).
So the banks were built rather than bought — `tools/build-mock-sets.mjs`
generates 25 papers / 425 items deterministically from the repo's own
rights-cleared assets (the graded word list, the 45k attested-sentence bank,
the CC-licensed shelf), and every right answer is what the corpus actually
says. No real JLPT item is reproduced; each set ships 検収前.

Built and NOT built, on purpose: 漢字読み · 表記 · 文脈規定 · 文法形式の判断
(form) · 読解 (主旨 + passage cloze) all ship. **Particle cloze was built and
removed** — the corpus can prove a particle is unattested after a word, but
unattested is not ungrammatical (「午後に」/「午後まで」 are both real), and an
item with two defensible answers is a broken item. Particles wait for a real
grammar-point bank. Listening waits on the voice decision (TENOHIRA PR 五).

Still to come (模試 PR 二): the custom composer — sets drafted from the
learner model's weak edges, a scenario prompt, the learner's own read
articles, or a pasted transcript. It needs 鏡 (movement 二) to know the gaps,
so the mirror comes first.

## 二 鏡 — what the mirror is and is not

`learnerModel(S)` is pure, versioned and derived: same store ⇒ byte-same model,
nothing persisted, nothing scheduled. It reads only rows carrying an explicit
right/wrong judgment — probe · lesson · dojo · mock · sensei · real reviews (a
revocation names the row it undoes, so an undone grade is not counted). Taps and
reveals land on nodes as encounters and stay off the bands: friction is not a
verdict.

Four bands, never averaged: 語彙 · 読み · 文の形 · 自分で使う. Each renders as
per-level counts with its own provenance line (measured vs observed) — a band
resting only on mined rows says so. `KAGAMI_MIN_SEEN` (4) is the floor below
which the model declines to speak of a level at all.

Three traps, all hit and all fixed here. A level is spelled three ways in this
repo — the boot dictionary writes `"N5"`, the graded word list the papers are
built from writes `5`, and a grammar point writes its own again — so
`kagamiLevel` normalizes all three and `kagamiLevelOf` resolves grammar keys
through `GRAMMARS()` (without either, cells come out empty and the band cannot
form an edge). "Disagreement" means an easier level FAILING under a harder one
PASSING — flagging the ordinary shape (clear N5, miss N4) was a bug the phone
screenshot caught. And a subject with no JLPT tag at all — kanji, radicals,
idioms, particles — lands in a `級外` cell that counts but clears nothing,
rather than being credited to a level the record cannot support.
verify-kagami pins every one of these.

Still to come: movement 三 retires `aiLevelGuess()` at its nine call sites in
favour of model queries, and 模試 PR 二's custom composer reads the frontier.

## 二補 — the truth pass (2026-09-21)

The operator asked for a whole-repository review of learner testing — JLPT
papers, school-grade tests, whatever else a holistic Japanese education
assesses — mapped to what exists and what does not, and reachable through the
dojo in a way that informs the learning path of the whole app. The review is
recorded as amendment 一 (`docs/prompts/BUNKI_KAGAMI_AMENDMENT_2026-09-21.md`);
this movement is the housekeeping the review found necessary before anything
else moves.

**What the gates said on `main` @ `11594593`, real Chromium, before this PR:**

| Gate                                    | Result                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `verify-kagami.mjs`                     | 30/30                                                                                           |
| `verify-mock.mjs`                       | 25/25 · 423 items across 25 papers                                                              |
| `verify-experience.mjs`                 | 41/41 · 63 screenshots                                                                          |
| `verify-corridor.mjs`                   | **222/224** — two crumb assertions read visible text; the crumb has carried its trail in `aria-label` since the 2026-09-14 header repair |
| `verify-corridor-storage-integrity.mjs` | **crashed** at `every-in-app-mint-carries-the-started-mark` — the lane's bulk-memorize mint it demanded was removed on the operator's ruling (#92) |

Neither red was a product regression; both were checks protecting a repealed
assumption (constitution §2: update the check). Both had gone unseen because
the two suites ran only in `battery.sh`, never on a pull request.

**Done here, on purpose small:**

1. `verify-corridor.mjs` — the two R3-E crumb probes read the trail from
   `aria-label` and the room from the visible `b`, the idiom
   `verify-reference-connections.mjs` already used. 224/224.
2. `verify-corridor-storage-integrity.mjs` — the retired lane mint is asserted
   absent rather than present; every surviving mint (capture, lesson enroll,
   probe miss) is still checked for the `started` mark. Behind that crash sat a
   second stale pin: the residual `saveStore()` ledger
   (`docs/build-evidence/reading-r5-learning-loop-r5-20260815/residual-storage-callers.json`)
   recorded five direct callers and the source now has six — #92's
   `returnFromNavigation()` writes the `readerPos` bookmark on its way back to
   the article. It touches only the UI-preference root the ledger already
   permits, so it is a missed recompute, not a bypass of `commitStorePatch`;
   it is recorded with its disposition and every line pin is refreshed. Green,
   41 checks.
3. `.github/workflows/reference-libraries.yml` — `verify-kagami` and
   `storage-integrity` join the corridor-path workflow.
   `.github/workflows/corridor-gate.yml` — `verify-corridor` gets its own job
   (it does not fit the fifteen-minute budget beside the suites already there).
4. This record: 二 is MERGED, 七 is split into 七a/七b, 八・九・十 are typed.
   `MOCK_TESTS_PROPOSAL.md` carries a dated status line; its "nothing built"
   is history, not the present.

**Not done here, deliberately:** no runtime change to `corridor.js`, no new
ledger kind, no lesson-population change, no `approved` flag flipped. Those are
movements 八・九・十 and the two decisions below.

**Decisions requested of the operator** (typed in amendment 一 §6, settled by
nobody else):

- **D1 · the N1 lane.** The boot dictionary tags no word N1, so `renderLessons`
  shows no N1 section. Of the graded word list's 2,274 N1 words, 1,919 resolve
  in the boot dictionary with glosses (1,906 with the same reading), 355 do not.
  A: `laneMembers()` falls back to the graded list for words the dictionary
  leaves untagged (≈191 lessons, disclosed as source-assigned levels the way the
  reference library discloses its counts). B: lessons stay as they are; N1 is
  reached through 棚 (六), 覚える and the papers.
- **D2 · the papers' 検収.** All 25 sets are `approved: false` and the flag is
  read only to draw the badge. An operator pass per set, or the papers stay
  labelled practice evidence.

## Notes for the resuming session

- The chat placement session of 2026-08-25 is the reference transcript for the
  observation taxonomy: reading nodes (歩→ほ), confusion edges (歩↔足), sense
  nodes (によって depending-on), form nodes (potential 答えられません),
  receptive/productive split (~one band).
- Sensei-mined observation subjects are restricted to word/kanji in v1 —
  grammar-point subject matching (AI names → deck ids) is deferred until a
  reliable mapping exists; grammar evidence still lands via the quiz/lesson
  kinds that exist.
- Mock Stage 2 (authored item banks, ¥1M–6M) stays typed on the decision
  sheet — operator's call, outside this campaign.
- The 設定 dial to disable mining is deferred until the operator asks; cost is
  ~sub-cent per exchange.
