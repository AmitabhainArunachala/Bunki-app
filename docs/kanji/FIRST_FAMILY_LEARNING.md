# First family practice: 職・識・織

`kanji-course.js` adds the thirteenth authored unit, `shiki-shoku`, at unit revision 4. Catalog revision 4 contains 51 characters and 103 primary/alternate word records. The existing twelve units, their revisions, schema-1 sessions, 96 prompt contracts and lesson identities remain unchanged.

This is keyword recognition and whole-word reading practice. A plain-form prompt uses the ordinary whole glyph or whole word, without component highlights, furigana or an answer shown before the response. Recognition choices remain recognition choices; this does not create a new `form` test, writing grade, source-transfer claim or mastery measure.

| Target | Raw character keyword | Primary word | Exact dictionary reading | Raw word gloss                  | Teaching alternative |
| ------ | --------------------- | ------------ | ------------------------ | ------------------------------- | -------------------- |
| 職     | Post                  | 職業         | しょくぎょう             | occupation, business            | 職場・しょくば       |
| 識     | Discriminating        | 知識         | ちしき                   | knowledge, information          | 意識・いしき         |
| 織     | Weave                 | 組織         | そしき                   | organization; structure; tissue | 織る・おる           |

Meanings/readings are copied from the pinned local `kanji.json` and `words.json`, with their source hashes in `catalog().sources`. Alternatives are teaching examples, not additional assessment tasks. In particular, 織's character keyword is not the translation of 組織, and a shared component does not establish an individual character reading inside a word.

Slice 5.1 preserves each raw `meaning` above and adds the editorial `displayKeyword` labels **職 — “Job; position”** and **識 — “Knowing; awareness”**. Teaching, every occurrence in a choice list (including distractors), and answer feedback use the same display label. 織/木 retain “Weave”/“Tree”. This field is separate from the whole-word `displayMeaning`; it does not change raw glosses, readings, answer IDs, lesson identities or the original 96 prompt contracts. Learner answers are still the selected glyph IDs, never the English labels. These exact display strings are submitted for language review, not represented as prior reviewer approval.

Each target also has `teachingSentence = {text, english, reference, sourceAttribution, note, register?}` copied from its exact `kanji-family.json` bundled example. The original occurrence identity and Tanaka Corpus/Tatoeba CC BY 2.0 FR attribution are retained. 知識は力なり。 has `register: "literary-set-saying"` and is labelled as a literary set saying, not ordinary modern conversation. These examples do not authorize a sentence-to-card mapping or source-transfer assessment. Japanese editorial acceptance belongs to the designated reviewers; the source tests establish correspondence, not that acceptance.

The teaching label now reads **「文語調の格言です。」**, following lead0319 and W2's combined0330 ruling. The reviews disagreed: Claude0316 requested this wording because the sentence is a maxim, whereas Fugu0327 explicitly accepted the previous 「文語の慣用表現です。」. This is a recorded lead disposition, not a unanimous finding that the previous label was defective. The English “A literary set saying.” and the attributed example remain unchanged.

## Exact task identity

`unitForTask(reference)` returns the family unit or `null`. `taskTarget(reference)` (also exported as `taskForReference`) returns:

```js
{
  courseId: "kanji-foundations-24",
  unitId: "shiki-shoku",
  revision: 4,
  targetId: "職",
  promptIds: ["shiki-shoku/職/reading"]
}
```

Accepted references are exactly `{type:"kanji", id:"職"}` (meaning prompt), or `{type:"word", id:"職業", reading:"しょくぎょう"}` (reading prompt), and the corresponding 識/知識 and 織/組織 pairs. Raw spelling and raw reading must both match; kana folding is used only to evaluate a learner response. Extra/missing reference fields, components, sentences, the family center 戠, alternate teaching words and other characters return `null`. A prompt ID is a course identity, never an SRS key or hook surface.

## Schema 2: session-only attempts

Only this unit uses schema 2. `createRun("shiki-shoku", {sessionId, mode?, targets?})` requires a caller-supplied ASCII identifier (`[A-Za-z0-9_-]`, 1–80 characters), normally `crypto.randomUUID()` from the UI. `mode` remains `check`/`preview`; targets remain `meaning`/`reading`. The module has no clock, randomness, storage, network or scheduler dependency.

The ordinary run fields remain, with `sessionId`, `round` (initially 0) and `attempts` added. Each attempt has a stable ID `${sessionId}/${round}/${promptId}`. Round increases on a missed-only retry. `currentAttempt(run)` returns a frozen copy of the current attempt plus canonical task identity:

```js
{
  attemptId, promptId,
  item: {kind:"word", term:"職業", reading:"しょくぎょう"},
  tests: "reading",
  help: [], exposure: [],
  actedAt: null, answeredAt: null, feedbackAt: null,
  selfCheck: null, checkedAt: null
}
```

For keyword recognition, `item` is `{kind:"kanji", literal:"職"}` and `tests` is `meaning`. The completed run has no current attempt. `plainPrompt(run)` returns only `{attemptId,promptId,kind,text,choices}`; it omits answer keys, raw readings, glosses, parts and teaching sentences. `currentPrompt` remains the full internal contract used to evaluate and later display feedback.

All state transitions return frozen new values and preserve their input. Session data is not a new learner-record root and is not a durable observation event.

| Operation                                         | Contract                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recordHelp(run, attemptId, help)`                | Current unanswered attempt only. Help is `{what, about?, reveals, at}`; `at` must be finite and `reveals` contains unique `reading`/`meaning`/`form` values. `about` is a canonical word or kanji item. Empty `reveals` is an ordinary hint. Exact duplicate events are idempotent; new events must be appended in nondecreasing time order. |
| `answer(run, value, {attemptId,at})`              | Validates an actual answer and advances once. Help cannot be dated after this answer. A stale attempt ID cannot answer the next prompt.                                                                                                                                                                                                      |
| `reveal(run, {attemptId,at})`                     | Advances without an answer; records canonical answer exposure for a later retry. Produces no answer observation or hook candidate.                                                                                                                                                                                                           |
| `skip(run, {attemptId,at})`                       | Advances without an answer or invented exposure. Produces no answer observation or hook candidate.                                                                                                                                                                                                                                           |
| `showFeedback(run, attemptId, at)`                | Requires an actual response and a time at/after it. Records exposure separately from pre-answer help. Repeating it is idempotent.                                                                                                                                                                                                            |
| `selfCheck(run, attemptId, "knew"\|"missed", at)` | Requires shown feedback and a time at/after it. A known incorrect answer cannot be marked `knew`. Repeating the same check is idempotent; switching a recorded check is rejected.                                                                                                                                                            |
| `retry(run)`                                      | Existing missed-only policy: wrong/revealed prompts enter repair, skipped prompts do not. The new round retains that prompt's prior help and shown-answer exposure as pre-answer help, sorted/deduplicated. Responses, feedback state and self-checks do not carry over.                                                                     |

Feedback/reveal exposure is distinct from the `help` array of the same attempt. This matters when `Date.now()` returns the same value for response and feedback: feedback cannot retroactively count as pre-answer help. On a retry it becomes prior exposure and remains distinguishable from an unaided first response.

The UI must retain reference exposure while the visit is live and apply it to each relevant new prompt, with its original timestamp. Sort retained events before calling `recordHelp`; do not reset assistance when switching a preview to practice, returning from a dictionary, or rebuilding a page. A general hint or a help item about another target still conservatively makes the course result assisted. W4 determines the precise review cap from the canonical help, facet and target.

`summary(run).results` for schema 2 includes `attemptId`, `item`, `tests`, `help`, `exposure`, `actedAt`, `answeredAt`, `feedbackAt`, `selfCheck`, `checkedAt` and `assisted`, alongside the existing result fields. Existing schema-1 result objects are unchanged.

## One unavailable-until-integrated review seam

`hookCandidate(run, attemptId)` returns `null` until there is an actual response, shown feedback and explicit self-check. It never emits a rating, schedules anything, binds a saved card, samples a clock or calls a hook. When ready it returns:

```js
{
  kind: "attempt",
  item: {kind:"word", term:"職業", reading:"しょくぎょう"},
  surface: "course:kanji-shiki-shoku-r1",
  tests: "reading",
  answer: {selfCheck:"knew"},
  revealed: true,
  answeredAt: 100,
  help: []
}
```

The UI supplies `at: new Date(...)` at the single W4 seam. The `r1` surface version identifies this first hook surface; it is separate from catalog/unit revision 4. Never use slash-containing prompt IDs as surfaces. A candidate is eligibility information, not proof that a grade was admitted. W4 must still enforce trusted surface registration, exact current saved identity, ownership, enrollment/due state, duplicate/day restrictions, assistance and atomic publication. While that implementation is unavailable, practice continues and the UI reports the unavailable seam. No fallback schedule write is allowed.

Leaving has no transition or penalty. Duplicate-response protection here is session-local; durable duplicate grading remains W4's responsibility. Incorrect responses cannot be laundered into `knew`; reveal/skip and merely opening a reference never become grade candidates.

## Existing practice evidence only

`toLessonEvidence` still returns only the existing `{obslog, lessonsDone}` delta, using the ordinary `lesson` event. Answered assisted rows use lesson ID suffix `:assisted`, and assisted scores have a separate bucket. Unassisted rows retain the base family lesson ID. Scores report the actual bucket total rather than counting helped answers as unaided. If a facet has a reveal/skip, it does not publish a partial replacement score. Repair observations append `:missed` after any `:assisted` suffix and never replace a full score. Reveal/skip write no answer observation; no new hook evidence event or record root is introduced.

Pure checks cover exact existing-unit/prompt hashes, source dictionary and bundled sentence correspondence, task identity rejection, plain prompt shape, ordered help, timestamp ties, stale attempt IDs, wrong-answer/self-check rejection, retry exposure, assistance buckets, and acceptance by the actual existing corridor `obslog`/`lessonsDone` validators. They do not establish browser behavior, Japanese editorial approval, FSRS admission or physical-phone acceptance.

Run from the worktree with the pinned Node runtime; where the sparse checkout lacks dependencies, use the already installed TypeScript package through `NODE_PATH`:

```sh
NODE_PATH=/Users/dhyana/worktrees/Bunki-app/weave_20261020/node_modules \
  /opt/homebrew/Cellar/node@22/22.23.3/bin/node --test \
  prototypes/corridor/tools/test-kanji-course.mjs
```

Runtime logs and the pre-change `4362002e` identity snapshot belong under `~/.dharma/bunki_review/2026-10-15/juncture/one-hand/KANJI-NEXT/evidence/slice5-course/`.
