# 鏡 KAGAMI — amendment 一 · 道場の門 (the dojo gate)

**Date:** 2026-09-21 · **Author:** Claude (operator-directed) · **Status:** amendment to
`BUNKI_KAGAMI_CAMPAIGN_2026-08-25.md`. The campaign stays the wayfinder for learning-system
work; this document adds three movements to its ladder, types two decisions for the operator,
and records the review that produced them. **Base:** `main` @ `11594593` (#93). **Run state:**
`docs/build-evidence/kagami/RUN_STATE.md`.

The operator's instruction, verbatim in intent: _review every area of the app that tests the
learner — JLPT mock tests, Japanese school-grade tests, whatever else a holistic Japanese
education would assess — map what we have and what we don't, and make it reachable through the
dojo in a clean, organized, tractable way that informs the learning path of the whole
ecosystem. Do not reinvent the wheel._

Constraints fixed in the brief that followed (2026-09-21), each the operator's word:

- Two tracks, kept apart: Japanese as a second language, and the school 国語 progression.
- The vessel is the latest and most evolved one — the corridor — held to the kernel's laws by
  contract parity (ADR-004).
- The dojo is the one gateway, with practice, diagnosis and papers as its rooms.
- Built first for one self-directed learner — the operator — never so exclusive that others
  cannot live in it later.
- The outcome is holistic Japanese across every modality, with JLPT N1 in December as one
  benchmark among the signals.
- SRS is the engine; every other room is a side quest that feeds the learner model. Side quests
  may propose material; only the learner's confirmation adds it, and only FSRS schedules.

> One ledger, one recomputable model, surfaces as queries — and one door to walk through them.

---

## 1. The assessment map — what exists

Verified on `main` in a real browser on 2026-09-21 (verifier results in §8). Every room below
already agrees on the campaign's shape: capture creates no debt, practice writes evidence and
never schedule, the mirror reads all of it, FSRS-6 is the only scheduler.

| Room                                      | What the learner does                                                                                                                        | Evidence written                                                | Moves the scheduler          | Reached from                                   | Gate                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------- | ---------------------------------------------- | ---------------------------------------- |
| 覚える → 復習 (My Study, the review room) | declares recall (T-06), then grades                                                                                                          | `revlog` grade rows, `stats[day]`                               | yes — FSRS-6                 | tray `#review-start`                           | verify-corridor, storage-integrity       |
| 集中道場 · 覚えるの札 (`due`)             | a timed block over due cards; the first lap grades, later laps are 稽古 (POL-12)                                                             | `revlog` (first lap) · `obslog` `dojo` (practice)               | first lap only               | galaxy nav `.nav-dojo` → lobby                 | verify-corridor Phase A, R4-B            |
| 集中道場 · 漢字だけ (`kanji`)             | kanji drill, easiest first                                                                                                                   | `obslog` `dojo` (never-taken) · `revlog` (enrolled and started) | enrolled cards only          | lobby                                          | verify-corridor                          |
| 集中道場 · 読み探査 (`yomi`)              | "could you read it" on compounds never taken; a miss may mint into 覚える under the daily cap                                                | `obslog` `probe`                                                | no                           | lobby                                          | verify-corridor                          |
| レッスン                                  | N5–N2 word lanes and 漢検 10級–1級 kanji lanes, ten items, teach → four-choice quiz; the end screen offers 覚える per word or all at once    | `obslog` `lesson`, `lessonsDone`                                | no                           | shelf `#lessons-link`                          | verify-experience E08, storage-integrity |
| 模試の間                                  | 25 papers (five per level N5–N1), 12–19 items each across 文字・語彙 / 文法 / 読解; per-answer persistence; results with explanations        | `obslog` `mock` (`setId#type`), `mockDone`                      | no                           | shelf `#mock-link`, 参考書庫 `#reference-mock` | verify-mock, E09                         |
| 鏡                                        | reads the ledger back: four bands (語彙・読み・文の形・自分で使う) as per-level measured/observed counts, confusion edges, frontier, leeches | none — derived, memoized, never persisted                       | no                           | shelf `#kagami-link`                           | verify-kagami, E14                       |
| 先生                                      | conversation; a bounded mining pass after each reply writes typed observations                                                               | `obslog` `sensei` (observed), `confuse`; the AI archive         | no                           | tutor door, key-gated                          | verify-corridor-ai                       |
| 小テスト (the tutor's quiz)               | three to five generated items over the learner's own list                                                                                    | a durable `aiQuiz` run; no ledger row                           | no                           | tray, key-gated, four words or more            | verify-corridor R4-B                     |
| 墨流し Drift                              | swipes known / unknown; the 自 stop is a hint string                                                                                         | `obslog` `drift`                                                | no                           | landing                                        | verify-drift                             |
| 本棚 · reader                             | tap ladder reading → gloss → entry; explicit 覚える                                                                                          | `obslog` `tap`, `reveal`; `taken` only on 覚える                | not until explicit enrolment | shelf                                          | verify-corridor, E05–E07                 |
| 参考書庫                                  | browses the complete JLPT and 漢検 collections                                                                                               | none, by design                                                 | no                           | shelf                                          | verify-reference                         |
| Kernel `apps/app`                         | a finite FSRS session over promoted contracts; probes; the evidence inspector                                                                | domain events, tiers A–D                                        | tier A through the gate      | its own vessel                                 | vitest, e2e                              |

The mirror already names the seam this amendment opens. Its frontier comment reads: _"These
are the doors the drift and the custom papers will pull from; here they are only shown."_

## 2. What does not exist — the gap census

1. **An N1 lesson lane.** `laneMembers()` reads only the boot dictionary, which tags no word N1
   (N5 706 · N4 659 · N3 2046 · N2 1745 · N1 0), and `renderLessons` skips a level whose plan is
   empty. The graded word list the papers are built from holds 2,274 N1 words; 1,919 of them
   resolve in the boot dictionary with glosses (1,906 with the same reading), 355 do not. N2 is
   already covered by the dictionary's own tags.
2. **Doors.** The dojo lobby offers time, three modes, an empty-state sentence with no door, and
   nothing toward レッスン・模試・鏡. `back()` walks probe → dojo, focus review → dojo, dojo →
   galaxy; 模試・レッスン・鏡 return to the shelf; the crumb's `dojoFamily` covers dojo, probe and
   the focus review only.
3. **The mirror does not act.** Frontier rows and leeches open their entries through `go()`;
   nothing proposes a room, a paper or a lane.
4. **No declared goal, two learner models.** Nothing stores an exam or a date, and
   `aiLevelGuess()` — the commonest deck tag — still steers nine prompts (movement 三).
5. **The papers are diagnostics, not a rehearsal.** `approved` is read only to draw the 検収前
   badge; each section's `minutes` is in the JSON and never read; an N1 paper carries ten 語彙
   items of two kinds, seven 文法 items of one kind, two 読解 items, and no 聴解. Nothing is
   equated. The dojo already owns a working countdown (`S.focus.deadline`, the HUD).
6. **No place for evidence made outside the app.** `validObservationRow` accepts exactly eleven
   kinds — `tap`, `probe`, `drift`, `params`, `reveal`, `lesson`, `dojo`, `note`, `sensei`,
   `confuse`, `mock` — and refuses anything else fail-closed, so a new kind needs its validator
   landed first: the `mock` precedent.
7. **Listening.** Absent until the judged voice (TENOHIRA PR 五); the interim read-along voice
   is article-only and 検収前.
8. **Production.** The 自分で使う band rests on sensei `prod-gap` observations alone. The kernel
   has `ProductionObserved` with `rubricId`/`rubricVersion`; no rubric text exists anywhere.
9. **The 国語 track.** Nothing. `schoolGrade` (KANJIDIC) and the 漢検 grades are metadata.
10. **Gates.** `verify-corridor` and `verify-corridor-storage-integrity` were red on `main` and
    ran in no workflow. Repaired and wired in 二補 (§8).

## 3. Two tracks, and what each authority may mean here

The repo's law already forbids the composite: a band is a vector, never a number (campaign law
3). This amendment extends it — **tracks are never averaged into one "Japanese level"** — and
fixes what each external authority is allowed to mean inside the app.

| Authority                   | What it measures                                                                                                                                                                | Its use in Bunki                                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JLPT (N5–N1)                | language knowledge, reading, listening; no speaking or writing sections; scaled scores with an overall pass mark and sectional minimums; no published vocabulary or kanji lists | the exam benchmark. Papers report raw per-paper, per-section evidence, never a scaled score or a pass estimate (the room's law 4). Level tags stay source classifications, as the reference library already discloses. |
| JF Standard / CEFR          | six modal cells — listening, reading, spoken production, written production, spoken interaction, written interaction — plus text-mediation Can-dos                              | the holistic frame: the names for bands the mirror does not yet have (聴く, やりとり) and for future production rubrics. Alignment metadata, never a level scale of our own.                                           |
| 漢検 (Kanji Kentei)         | readings, writing, okurigana, stroke order, radicals, compounds, idioms; grades 10級–2級 follow the school years 小1–高卒                                                       | the kanji subprofile and the honest school-grade lens for kanji. Already a lesson lane and a reference collection; never presented as holistic proficiency.                                                            |
| MEXT courses of study, 国語 | curricular attainment in Japanese-medium schooling — 知識・技能 / 思考・判断・表現 / 主体的に学習に取り組む態度; literature, classics, information handling                     | the second track. No official crosswalk to JLPT or CEFR exists, so nothing here converts a school grade into an L2 level. Deferred for a single L2 learner; metadata only when it comes.                               |

Official sources read for this section: the JLPT's own statements of what the test measures
(<https://www.jlpt.jp/e/about/points.html>) and how it scores
(<https://www.jlpt.jp/e/guideline/results.html>), its guidebook already cited by the reference
library (<https://www.jlpt.jp/e/reference/pdf/guidebook_s_e.pdf>), the JF Standard
(<https://www.jfstandard.jpf.go.jp/>), the MEXT courses of study
(<https://www.mext.go.jp/a_menu/shotou/new-cs/1384661.htm>), and the 漢検 grade overview
(<https://www.kanken.or.jp/kanken/grades/overview/>). Their items are copyrighted; the papers
reproduce none.

## 4. Laws this amendment adds

Under the campaign's seven, binding on movements 八・九・十:

8. **The gate is a lobby, not a container.** Rooms keep their code, their names and their
   verifiers. The dojo lobby gains doors and a reading; nothing is moved into it.
9. **A proposal is a door, never a write.** 次の一手 proposes; the learner's tap opens an
   existing door (`startFocus`, `startReview`, `startLesson`, `startMock`, `go`). Nothing
   schedules, mints or enrols on the learner's behalf.
10. **No readiness number.** No output — lens, planner, paper or mirror — states a pass
    probability, a percentage readiness, or "you are N1". The N1 lens shows measured evidence
    per band at N1 and which paper sections have been sat.
11. **Evidence made outside the app is evidence, labelled.** External rows carry `external`
    provenance, count as measured for exactly what they claim — one section of one sitting —
    never touch a scheduler, and are shown apart from the per-item bands.
12. **Two tracks, never averaged.**

## 5. 順路 — the movements this amendment adds

Order in the ladder: 二補 (the truth pass, this PR) → 三 (as written) → 八 → 九 → 十. 九 waits
for 三 so that one learner model steers both the sensei and the planner. 四・五・六・七b stand as
written; 七b's custom composer reads 九's proposals as well as 二's frontier.

**八 · 道場の門 (the dojo lobby as the gateway)** — files: `prototypes/corridor/corridor.js`
(`renderFocus`, `back()`, the crumb's `dojoFamily`, `renderMock` for the timed toggle),
`corridor.css`; `tools/verify-corridor.mjs` (R3-E widened), `tools/verify-experience.mjs` (a
dojo segment — there is none today), `tools/verify-mock.mjs` (isolation unchanged).

- The lobby: a 次の一手 reading at the top (until 九 lands, doors only); doors to レッスン・模試・鏡,
  which stay the views they are; the empty-state sentence becomes doors (the 覚える list, 漢字だけ,
  レッスン).
- The return: an origin marker (named in the build) so that `back()` from a room entered through
  the dojo returns to the dojo; `dojoFamily` widened; the trail reads 銀河 › 集中道場 › 模試.
- 本番の時間で: an opt-in toggle on a paper that reuses the focus countdown and HUD to enforce the
  section `minutes` already in each set's JSON. Default off. A timed paper writes exactly the
  same `mock` rows.
- _Verify:_ dojo → 模試 → back → dojo with the right trail; dojo → レッスン → back; each empty-state
  door opens; a timed paper writes only `mock` rows and no FSRS state; a11y on the lobby; battery.

**九 · 次の一手 (the next-move planner)** — files: `corridor.js` (a pure `nextMoves()` beside
`learnerModel()`; `S.goal` as a preference beside `srsPrefs`; renderers in the lobby and 鏡),
`tools/verify-kagami.mjs` (extended).

- Inputs: `learnerModel()` (bands, edges, disagreement flags, frontier, leeches),
  `srsDueItems()` and `srsForecast()`, `srsPrefs`, `lessonsDone` and `mockDone`, and the declared
  goal `S.goal` (`exam`, `level`, `date`). A goal is a preference the learner declares, not a
  claim about what they know; absent, the planner behaves as if no exam existed.
- Output: a ranked, bounded list (five at most) of `{ kind, why, door }`. `door` names an
  existing action; `why` cites the rows it stands on — counts, never certainty.
- Weighting: due cards first, always (memory is the engine); then the goal's bands where measured
  evidence at the goal level is thin or failing; then the rest of the bands, so no modality goes
  to zero while the exam nears. The weights are a convention stated in code, not a measurement.
- The N1 lens, in 鏡 and the lobby: per band, measured counts at the goal level; papers sat per
  level and section; external rows (十) when present. Never a percentage.
- _Verify:_ same store ⇒ byte-same proposals; nothing persisted; every `door` resolves to an
  existing function; an empty ledger yields honest empty proposals; no output string matches the
  pass/readiness lexicon (verify-mock's forbidden phrases, extended); `S.goal` absent ⇒ today's
  behaviour; battery.

**十 · 外の証拠 (external evidence rows)** — files: `corridor.js` (`validObservationRow` first;
a small 記録 form reachable from 鏡 and the lobby; `learnerModel()` gains an `external` section;
export and import carry the rows by construction), `tools/verify-corridor-storage-integrity.mjs`
(fixtures), `tools/verify-kagami.mjs`.

- The row: `[t, 'extern', scope, right, total, source]`. `scope` follows `exam:level:section`
  (`jlpt:N1:moji-goi`, `jlpt:N1:bunpou`, `jlpt:N1:dokkai`, `jlpt:N1:choukai`); `source` is a
  short label — the workbook or publisher and the sitting date — and never item content.
- The model: `external[scope] = { sittings, right, total }`, rendered apart from the four bands as
  外の証拠 (measured, external). It never feeds `kagamiEdge` and never schedules.
- The validator lands first, so older builds carry the rows fail-closed — the `mock` precedent.
- _Verify:_ malformed rows refused; export → import round trip; determinism; `srs`, `revlog` and
  `taken` unchanged by any external row; battery.

This is the one genuinely new primitive in the amendment. It is what lets 聴解 and full-format
timed rehearsal — done with official or licensed materials outside the app, since real items are
copyrighted and the papers here are short — become evidence the mirror can show before the voice
decision lands.

## 6. Decisions requested of the operator

Typed here, recorded in `RUN_STATE.md` §二補, settled by nobody else.

**D1 · the N1 lane's source.** _A:_ `laneMembers()` falls back to the graded word list for words
the boot dictionary leaves untagged — about 1,919 N1 words, about 191 lessons — disclosed as
source-assigned levels the way the reference library discloses its counts; the four N2 words
whose two sources disagree keep the dictionary's tag; `lessonChoices` distractors must still
resolve. _B:_ lessons stay as they are, and N1 is reached through 棚 at the band (六), 覚える and
the papers. The reference cleanup deliberately kept lesson populations unchanged, which is why
this is a decision and not a movement.

**D2 · the papers' 検収.** An operator pass that flips `approved` per set, guarded by
`verify-mock`; until then the 25 papers stay labelled practice evidence and nothing in the app
calls them a mock exam.

## 7. Deferred, with the reason typed

- **Listening in-app** — waits on TENOHIRA PR 五, the judged voice. External 聴解 results enter
  through 十.
- **Speaking and writing performance tasks** — a written, versioned rubric first (ADR-002's
  `rubricId` / `rubricVersion`). Until then 自分で使う rests on sensei observations and the mirror
  says so.
- **The 国語 track** — metadata lens only (漢検 grade, `schoolGrade`); no MEXT-aligned tasks for one
  self-directed L2 learner.
- **Authored N1 item banks** — Stage 2 money stays on the decision sheet. The app is not the
  December rehearsal instrument; it is the memory and the steering.
- **Kernel runtime unification** — ADR-004 parity holds. At native packaging every row kind maps
  to an evidence family (`extern` → `ProductionObserved` tier B/C, or a schema bump with a
  replay-tested migration), and the ledger rides across unchanged.

## 8. Verification record of 二補

Run on `main` @ `11594593`, real Chromium, 2026-09-21, before any change:

| Gate                                    | Before                                                                                                                                                               | After 二補       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `verify-kagami.mjs`                     | 30/30                                                                                                                                                                | 30/30            |
| `verify-mock.mjs`                       | 25/25 · 423 items across 25 papers                                                                                                                                   | 25/25            |
| `verify-experience.mjs`                 | 41/41 · 63 screenshots                                                                                                                                               | 41/41            |
| `verify-corridor.mjs`                   | **222/224** — two crumb probes read visible text; the trail has lived in `aria-label` since the 2026-09-14 header repair                                             | 224/224          |
| `verify-corridor-storage-integrity.mjs` | **crashed** — a probe demanded the lane bulk-memorize mint removed in #92; behind it the residual `saveStore()` ledger pinned five callers against a source with six | PASS · 41 checks |

The sixth caller is #92's `returnFromNavigation()`, which writes the `readerPos` bookmark on
its way back to the article — the UI-preference root the ledger already permits. A missed
recompute, not a bypass of `commitStorePatch`. Both suites now run on every corridor pull
request (`reference-libraries.yml`), and `verify-corridor` has a workflow of its own
(`corridor-gate.yml`).

## 9. Honest limits

- The papers are 12–19 items, without 聴解, not equated, 検収前. They are section diagnostics, and
  the app says so; a mock exam in the JLPT's sense comes from the exam's own publishers.
- Bands describe evidence, not a person. External rows describe one sitting each.
- One learner, one browser vessel. No physical-device or screen-reader session stands behind any
  claim here; the corridor is held to the kernel by contract parity, not by shared code.
- Every count is of the bundled corpus. None is an official syllabus.
