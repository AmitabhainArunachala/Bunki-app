# Kanji-next source slice

This branch extends the integrated `df617045` prototype. It is an experimental functional slice, not a new art direction or a claim of instructional effectiveness. W3 owns the source slice; W2 coordinates integration, W12/Kimi language review, and W5 the visual engine. The original world-class objective remains open.

## What is implemented

- Full meanings and explicitly separated classical/Nelson dictionary classifications from the existing pinned KANJIDIC2 source. Ordinary entries, reference lists/search, radical lookup, exploration captions and writing-room labels share the facts. The source has 10,384 records; six legacy structural forms honestly have no reference facts.
- Original-path group inspection for 森・品・晶・織・識・職. The source projection contains 61 groups and 88 strokes; repeated occurrences and unnamed groups remain separate. This is a stroke-group model, not an etymology or semantic/phonetic-role model.
- An authored pilot of 48 kanji in 12 units, using 97 attested primary/alternate word records (including repeated words). Meaning recognition and whole-word reading are separate tasks. An introduction offers teaching or a check before answers appear; dictionary-origin visits offer supported practice instead. Reveal/skip receives no success credit. Missed-target repair preserves full-unit scores. The new selection requires linguistic/editorial and learner validation before acceptance.

The dictionary fields do not rewrite old lesson keywords, captured answers or scheduler state. The course writes only existing lesson evidence, through the existing acknowledged transaction, when the learner chooses Keep. No new learner root, scheduler, mastery metric or automatic enrollment exists.

## Shared interfaces

`BunkiReferenceCore.validateKanjiFacts(extra)` validates the schema and source binding. `kanjiReferenceFacts(extra,literal)` returns full meanings, explicitly named radical schemes, and release provenance, or null. A valid table lacking a glyph is different from a failed or pending table. The generator and independent raw-archive tests establish cryptographic parity; runtime validation does not pretend to reread upstream XML.

`BunkiKanjiStructure.createModel({kanji,strokes,grouping})` exposes `inspect(literal)`, `occurrence(literal,id)` and `project(literal,id)`. Occurrence IDs bind literal, source commit/hash and group path. The model preserves original coordinates and ordered paths; a supplied mismatched tree throws. Listed component membership remains a different relation. It never manufactures positions from standalone stroke counts, historical forms, sound or meaning roles.

`BunkiKanjiCourse` supplies immutable static units, explicit prompts, pure answer/reveal/skip transitions, separate target results and missed-only repair. `counts()` reports the authored coverage; `unitForCharacter(literal)` matches only an exact target. `asPractice(run)` changes a paused preview into a practice check without changing its responses or prompt identities. `toLessonEvidence(run,time)` creates existing-shape deltas. The app deduplicates retries, preserves newer scores, keeps successful acknowledgements even when the page is left, and rejects stale record epochs. A revealed or skipped prompt cannot replace that goal's full score. A repaired run never replaces the original score.

Readers and the Kanji finder reach the same ordinary entry. The parts inspector stores selection on that entry's navigation node and activates at `mountPageEffects`, including idle-prebuilt pages. It does not mutate the source context, return path or learner record. Other worlds can consume these contracts without copying this rendering or creating alternate learner identities.

The second source revision applies the pilot language critique. Five selected
`displayMeaning` values simplify teaching labels while preserving raw
`wordMeaning` values and readings. 未/末 and 青/清/晴/情 appear among each
other's meaning distractors. The curriculum revision is 2, so the changed
checks cannot overwrite revision-1 lesson evidence. Teaching cards also show
their attested alternate words; preview checks still withhold teaching answers.
The third source revision expands the catalog to revision 3, while the original
six units retain their revision-2 lesson IDs, content and compatible live runs.
Only the six new units use revision-3 result IDs. The legacy technical course ID
remains stable; the visible title and coverage counts reflect 48 characters.

Reader slip and keyboard lookup shortcuts carry their original passage and
token index into the kanji entry. Related-form navigation retains that origin
without merging the distinct glyphs. The existing source-practice guard still
requires the requested kanji to occur in the actual source token. Course entry
detours explicitly name their return control, and the finder resumes a live
course without clearing it or an unrelated ordinary lesson. These are session
navigation guarantees; course drafts are not newly persisted across reloads.
Existing reader taps and assistance may still record encounter/help observations.
They are not recall grades, and the new inspector does not create learner writes.

Ordinary entries now link an exact covered character to its authored unit.
Reader and canonical Atlas routes therefore share that door. The contextual
visit retains the original entry, reference collection/query/page and reader
position through the existing navigation stack. Its scoped return frame also
retains an earlier course by identity, without replacing an ordinary lesson.
Nested course and Atlas detours restore in order. Pending course saves refuse
replacement; stale learner ownership or a replaced review caller cannot restore
the old source through either a course frame or an intervening generic frame.

The contextual unit has an explicit return to its entry. A same-unit entry
detour resumes the active check or teaching position. Taking the dictionary-to-course door marks
the held course as supported practice, including an intro/menu with no run yet.
It does not create an answered result. Only the matching originating character
keeps its original dictionary context when reopened; another teaching character
or whole word never inherits that source token. The authored word exercise is
not presented as a test of the reader's sentence. The private personal-deck host
has no course-router contract, so its shared entry intentionally has no such door.

## Source and rights

The fourth source slice adds a [frozen library inventory](LIBRARY_INVENTORY.md)
and the first [attributed 戠 family](SHIKI_SHOKU_FAMILY.md). Identity coverage,
word/readings, source occurrences, geometry, authored role edges and missing
historical coverage are separate counts. `BunkiKanjiFamily` supplies typed,
immutable joins with exact source evidence; its three family members are not
additional authored course targets. Kimi's further teaching-gloss selections
preserve raw fields, lesson identities and all existing graded prompts.

KANJIDIC2/scriptin release `3.6.2+20260803141815`; raw archive SHA-256 `5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6`. Complete field projection and provenance are generated in `reference-extra.json`; the old tables are preserved.

KanjiVG commit `61e39cfc29724132a6f8823b166296932985a0ff`, Ulrich Apel, CC BY-SA 3.0. Original SVG bytes and hashes are retained in `prototypes/corridor/tools/fixtures/kanji-structure/`; the deterministic extractor derives group hierarchy while preserving stroke paths unchanged. No creative-lane engine was imported.

## Required qualification

Pure module and actual-renderer probes verify source parity, distinct repeated parts, classification/meaning lookup, saved-answer protection, course outcomes, atomic patch production, stale writes, retry/deduplication, and asynchronous mount/refresh behavior. The DOM and commit probes use controlled Node adapters. They are not browser, IndexedDB durability, screen-reader, image, performance or physical-phone evidence.

Before integration: freeze a source head; independently review language/answers and all changed data pins; build a fresh artifact under the shared resource rules; verify packaging and installed identity; run native dictionary/lookup, writing-room, parts-inspector and course journeys; exercise source/focus/scroll return and failed-load/retry on both supported engines. Include actual Tab reachability, touch hit areas, all worlds, reduced motion, zoom/large text and imported/saved-record compatibility. Refresh verifier contracts intentionally for the new source facts. Run the required release and no-mistakes gates before any authorized shipping. Do not reuse current frozen WEAVE/FULL evidence for this branch.

## Not complete

The six-character structure sample is not full-corpus decomposition. One sound/meaning family now has attributed source data, still awaiting exact-slice language and integration acceptance. Broader family coverage, validated historical structure, vetted sentence transfer for all course targets, a complete adaptive curriculum, the standalone World, personal quests, cross-world journey persistence, world-class animation/art direction, and measured delayed learning remain open. The pilot has no unseen-transfer or retention claims. Optional handwriting scoring is not implemented; the existing writing room remains a reference tool.

The live execution plan and raw receipts are outside the repo in `~/.dharma/bunki_review/2026-10-15/juncture/one-hand/KANJI-NEXT/`. New art remains under John's pause; the failed Rainwell direction is preserved and stopped. Publication remains with the lead's combined handoff and the existing release workflow.
