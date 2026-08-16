# Mock JLPT tests — what exists, what one honestly costs (proposal)

**For:** operator decision sheet, from R4-D · **Status:** PROPOSAL — nothing here was built.
The directive asks for "several mock JLPT tests at multiple levels" and AI-conversation assessment
as the first aptitude probe (`docs/briefs/KAIRO_FULL_INSTRUMENT_DIRECTIVE_2026-08-15.md:96`). The
campaign judged this operator-shaped — it turns on content licensing and on what a score is
allowed to claim — so it comes to you as a sheet rather than as code.

## 1. What exists today (verified in the head of this branch)

**The tutor's quiz.** `prototypes/corridor/corridor.js:4822` asks the tutor for five four-option
items drawn from the last fourteen words on the learner's own 覚える list, each with a one-line
explanation. The parser (`:4791`) accepts three to five well-formed items and otherwise returns
nothing rather than half a quiz. The door appears only with an API key and at least four taken
words (`:4158`). The finish screen says what it is — "A score, nothing more; your review schedule
is untouched" (`:4844`) — and nothing in it writes FSRS state (`:4786`).

**R4-B made that quiz durable** (commit `e04e694`). Every step commits through the store
(`aiQuizCommit`, `:4819`), the run is validated on rehydrate (`validAiQuizRun`, `:792`; load
`:1084`, save `:1121`), and a mid-quiz reload lands on the same question, the same marked answer
and the same running score, with a resume/やめる row outside every gate (`:4184`). Two named R4-B
assertions in `docs/prototype/verification-report.json` cover exactly that reload.

**The dojo's yomi probe** (`corridor.js:8041`). Compounds the learner has *not* taken are
sampled stratified across Kanken band × reading type × head kanji (`buildYomiPool`, `:8124`),
shown bare, and self-graded on one question: could you read it. A miss mints the word into
覚える under the ordinary daily cap; a hit costs nothing. Each answer lands as one observation
row — `[t, 'probe', key, 3|1, minted]` (`:8379`) — in an obslog that is "evidence for routing,
never knownness" and touches no scheduler state (`:448`). It runs entirely offline.

**A stub that already promises 模試.** The drift level slider's 自 (adaptive) stop shows
"実物では、AI評価・SRS・模試から現在地を推定" — `prototypes/corridor/drift-layer.js:2031`, mirrored
into the generated `prototypes/drift/drift-artifact.html:2222` and `corridor-standalone.html:7697`.
It is a hint string with nothing behind it. The only thing that names a level today is
`aiLevelGuess` (`corridor.js:8763`): the commonest JLPT tag among the learner's taken words,
defaulting to N5 — a description of a deck, not a measurement of a person, and already handed
to the tutor as the quiz's context.

## 2. What a mock-test surface honestly requires

**(a) Question sourcing.** Real JLPT items are published by JEES and the Japan Foundation and
are copyrighted. They cannot be reproduced, and "adapted" reproductions are still derivative.
The format, section structure and level descriptors are published facts and may be followed
freely; the items themselves must come from one of three places:

1. **Original items written to the JLPT blueprint** by a qualified native writer. Lawful,
   ours to keep, slow and paid-for.
2. **A licensed bank** from a commercial practice-test publisher. Faster, but terms are
   per-negotiation, typically forbid export, and would put licensed content inside a store the
   learner is promised they can export.
3. **AI-generated pools that stay 検収前 until a human reviewer approves each item** — the
   same discipline the shelf now runs for its thirty recovered originals
   (`docs/build-evidence/renkan/DECISION_SHEET.md:15`). AI drafting cuts writing time; it does
   not cut review time, which is the expensive half.

Whichever is chosen, per-item provenance (authored / licensed / generated) must travel with
the item, because the constitution requires generated, authentic and inferred content to stay
distinguishable (`docs/operator/BUNKI_CURRENT_PRODUCT_CONSTITUTION_2026-08-15.md:73`).

**(b) Timing and scoring UX.** The real exam is sectioned and separately timed, and the
section structure and time allowances differ by level — the exact per-level minutes must be
taken from the current official test guide at build time, not from anyone's memory. More
important: the JLPT reports scaled scores, equated across forms, with sectional minimums *and* an
overall pass mark. Equating needs a calibrated item bank and a test-taker population; a
single-learner product has neither. **Therefore a mock of ours cannot predict a pass, and any
surface saying "you would pass N3" is a proxy metric** — the move the reading rubric forbids when
it rules that no progress report may use a convenient count as a proxy for the thing it is not
(`docs/operator/BUNKI_READING_EXCELLENCE_RUBRIC_AND_CLOSURE_SPEC_2026-08-15.md:58`). The honest
output is raw per-section performance plus explicit uncertainty. Listening carries a second
constraint: scored listening material may not rely on unreviewed TTS
(`proposals/TTS_VOICES_PROPOSAL.md`, storage and provenance section), so a listening mock is
gated behind the voice decision, not ahead of it.

**(c) Where results live.** Typed, modality-specific evidence per ADR-002. A mock item is not
`ReviewGraded`: there is no promotion-active contract behind a word the learner never enrolled,
and only tier A with such a contract may reach the FSRS reducer
(`docs/adr/ADR-002-event-schema-v1.md:53`). Mock results therefore belong in the recorded-but-
never-scheduled-on families — `ProductionObserved` (tier B/C, carrying `rubricId` /
`rubricVersion`) for anything a rubric judges, `ExposureLogged` (tier D) for what was merely
seen (`:39`–`:41`, `:53`–`:56`) — mirrored in the prototype by the yomi probe's obslog shape.
If a genuinely new family is needed, that is a schema version bump with a replay-tested
migration, not an optional property quietly appended (`:103`). And never one global mastery
number: meaning and reading are distinct contracts and a grade on one never mutates the other
(`:86`), memory is modality-specific (constitution `:68`), exposure is not mastery (`:66`).

## 3. A staged shape that starts cheap and honest

**Stage 1 — diagnostic-lite, from what already exists.** No new content. One session that
runs a yomi probe pass, a tutor quiz over the learner's deck, and a read of the deck's own
JLPT composition, and reports a **coverage estimate with stated uncertainty**: "of the N3
compounds this app knows, you read *n* of the *m* sampled; the sample was drawn from what you
have not taken, so it is a floor, not a level." Explicitly labelled *not a JLPT prediction*.
It replaces `aiLevelGuess` as the thing the 自 stop points at, and it makes the drift stub's
promise partly true instead of wholly aspirational.

**Stage 2 — original-item section mocks, per level, human-reviewed.** One section at a time (文字・
語彙 first: cheapest to write, cheapest to review, no audio). Items authored or AI-drafted, every
item 検収前 until a native reviewer approves it, provenance per item, reported per section only.

**Stage 3 — full timed mocks and the AI-conversation assessment probe.** All sections under
official timing, plus the conversation probe the directive wants first — a `ProductionObserved`
rubric surface (tier B/C) that needs a written, versioned rubric before it needs a model.

## 4. Cost and effort — all figures are estimates, not quotes

| Stage | Build effort (est.) | Content money (est.) | Needs from you |
| --- | --- | --- | --- |
| 1 | 3–5 build-days, one push | none | sign-off on the uncertainty wording and on showing a coverage estimate at the 自 stop |
| 2 | 2–4 build-days per section surface | ~1,500–2,000 reviewed items for one credible level-set; at an estimated ¥1,500–3,000 per authored+reviewed item that is roughly ¥2.5M–6M, or ¥1M–2.4M if AI-drafted with review at an estimated ¥500–1,200 per item | a reviewer (named native editor), a per-item budget, and a choice between authoring and licensing |
| 3 | 4–8 build-days plus the rubric | stage 2 again per remaining level, plus recorded audio for 聴解 (blocked on the TTS voice decision) | the voice decision, the conversation rubric, and acceptance that a full set is months of editorial, not one push |

Calendar estimate for stage 2, one level, part-time editorial: **4–8 months**. Nothing here
compresses into a single campaign push, which is why it is a sheet.

**One-word meanings** — DIAGNOSTIC: build stage 1 only; no content spend, no licensing choice,
the coverage estimate ships with its uncertainty printed on it. AUTHOR: commit now to stage 2,
fund an original-item bank and name a reviewer, accepting the months. DEFER: nothing is built;
the 模試 hint stays a hint and this returns when the shelf's 検収前 queue is clear.

**Decision requested:** DIAGNOSTIC · AUTHOR · DEFER — DIAGNOSTIC first because it is the only stage buildable from surfaces that already exist, and it buys a real reading of your edges before a single yen of item money or a single licensing term is committed.
