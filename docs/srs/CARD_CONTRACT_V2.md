# Card contract v2 — the passage card

Status: agreed direction, 2026-10-04, from the learner's dictated vision
(`LEARNER_VISION_2026-10-04.md`), the typed brief (`LEARNER_BRIEF_2026-10-04.md`), the
YouTube diet (`LEARNER_YOUTUBE_DIET_2026-10-04.md`), the AJATT and community research
(`research/report-ajatt-method-and-community.md`) and the three brief analyses
(`brief-2026-10-04/SYNTHESIS.md`). Where this contract conflicts with `STANDARD.md`, this
contract wins and the standard gets an amendment; it never changes FSRS numbers, card IDs,
Anki identities or `bunki-cloze:<deckId>` ledgers.

## 1. One sentence

A card is a five-sentence Japanese passage with one target, graded on that target alone,
with everything else one tap deep.

## 2. The front (locked)

- 4–5 sentences, roughly 180–300 characters, written to one of the registers in §6.
- The target appears exactly once. No furigana, no English, no tap-to-define, no hint
  unless the card has been repaired (§8).
- The passage must constrain the target: a native reader could predict its sense from the
  surrounding sentences. This is the "does the context do work" check (§7).
- Default task: 読んで思い出す (targeted meaning retrieval). The target is marked on the
  front with the deck's target style; the learner recalls its sense and reading. The MCD
  preset (blank instead of mark) stays available per deck and per card kind, scoped to
  particles, collocations, conjugations and three-plus-kanji compounds, blanking whole
  words or bounded chunks, never single kanji.
- Zoom: a toggle (remembered per deck) narrows the front to the target sentence with the
  other four dimmed. On a new card the whole passage is bright; after the first pass the
  non-target sentences dim by default. The learner reads the whole passage when they
  choose to, not because the card forces it.

## 3. The reveal

Tier one, read on every pass, no taps:

1. The target, with reading, pitch (shown, never graded), part of speech.
2. Furigana over every kanji in the passage (the learner's request; AJATT 2007 and
   Tatsumoto both allow furigana on the back).
3. One Japanese definition: the dictionary sense used in this passage, copied verbatim,
   never rewritten, with the matching sense selected when the entry has several.
4. The usage note, one line, only when the passage needs it.

Tier two, one tap each, in this order:

5. English gloss of the target (short, muted). A per-deck "always show" switch keeps the
   earlier request (PR #116) available; the N2/N1 default is behind the tap.
6. Full-sentence translation of the target sentence only. Never the whole passage.
7. 漢字の形と意味: the target's kanji with components and the learner's own words that
   share a kanji or a reading (the JPMN/Kiku model), not etymology or mnemonics.
8. 類語・対義語: only dictionary cross-references and words already in the learner's
   collection; shown only once the card is in review state (interference, R13).
9. Other passages for the same word: collapsed, titles only; each is its own card.
10. Source line: author or "書き下ろし", licence, link where one exists.

Tap-to-define on any word in the passage or in the definition, after reveal only: opens
the reader's entry sheet with the same 覚える chooser. A tap is capture, never evidence;
it never grades, never adds a card by itself, and shows 「このデッキにあります」 for
words already enrolled. Recursion stops when the kanji give the meaning (Khatz's cut-off).

## 4. Grading and repair

- Two buttons, Again and Good. Hard and Easy are not shown. Grade only the target. On an
  MCD card a reviewed alternative filler counts as Good.
- On-screen rule (TheMoeWay): if the back made you understand the target better, Again.
- Delete is one tap during review and reversible for the session. Leech threshold 5;
  repair ladder in order: swap in the next-ranked passage, add a hint, suspend. Bulk culls
  of never-reviewed cards are allowed; whole-deck reset is not offered.

## 5. Repetition across textures

Each word gets three or four passages, each its own card, released days apart by the
existing unlock rules. The passages must differ in register (§6) and, where the word has
more than one sense, in sense. The same kanji recurs across words in the kanji-family
fold, which is where "the same kanji in different contexts" lives without leaking.

## 6. Registers (from the YouTube diet)

| Code | Register                     | Model in the learner's diet                             | Share per word |
| ---- | ---------------------------- | ------------------------------------------------------- | -------------- |
| 講   | lecture / book summary       | 中田敦彦, アバタロー, サラタメ, 本要約チャンネル, PIVOT | always one     |
| 報   | news / analysis              | 中田 半導体・地政学, ReHacQ, 楽待, NHK register         | usually one    |
| 論   | essay / philosophy           | Floating Stories (空海・老子), ソフィー, 高野山の法話   | one if it fits |
| 話   | spoken, informal             | ひろゆき, ゆる言語学ラジオ, コムドット, Hapa            | one if it fits |
| 学   | learning science / exam talk | 星友啓, PIVOT 勉強法, DaiGo, にしむら先生               | optional       |

Topics rotate through the learner's four: mind and learning; Indian and Buddhist
philosophy (anchored in Japanese by 日本ヴェーダーンタ協会, 大蔵経, 大愚和尚); AI with semiconductors; world history as connective tissue. The fifth texture,
Japanese about Japanese (語源, 言語学), is allowed for any word whose kanji or etymology is
interesting. Hobby topics (surf, yoga, crypto) at most once per word.

## 7. Writing and verification loop (AI-written passages)

Written passages are welcome and preferred where no native hit of the right register
exists. Each passes five independent checks before it becomes a card; a failure means a
rewrite, not a patch.

1. **Naturalness** — a judge separate from the writer, instructed to reject translationese,
   unnatural collocations, wrong register markers and 書き言葉/話し言葉 mixing.
2. **Facts** — every checkable claim (dates, names, numbers, attributions) verified or
   removed; passages about real people stay in the public record.
3. **Level** — grammar and vocabulary audited against the N3/N2/N1 inventories in
   `n2n1/`; each passage records the grammar points it exercises so coverage is traceable.
4. **One target** — the target appears once; no other word from the learner's list appears
   unless it is already in review state.
5. **Context does work** — a reader shown the passage with the target removed can name
   its sense from the surrounding sentences.

Every written passage is labelled `original: true` with its register code and topic, and
carries the deck's licence so it can be published and narrated.

## 8. Audio

Optional, off by default. Only voices that pass the blinded native panel in
`build-evidence/renkan/proposals/TTS_VOICES_PROPOSAL.md` and the learner's own ear.
Written passages can be narrated freely; mined passages only where the source licence
allows derivative audio.

## 9. Visual system

Unchanged from `brief-2026-10-04/aesthetics.md`: target coloured by part of speech, card
edge and chip by item kind, level as a text chip, English never coloured, textures off the
card, one reveal transition under 180 ms, reduced motion honoured, grade bar pinned.

## 10. Measurement

The December 2026 sitting is replaced by the app's own timed N1 mock built from these
passages. Per-card review time, lapse rate per register and per topic, and deletion rate
are logged so the "Darwinian" question (MCD preset versus targeted default) is settled by
the learner's data by spring 2027.
