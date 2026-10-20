# Kanji-next source slice

This branch extends the integrated `df617045` prototype. It is an experimental functional slice, not a new art direction or a claim of instructional effectiveness. W3 owns the source slice; W2 coordinates integration, W12/Kimi language review, and W5 the visual engine. The original world-class objective remains open.

## What is implemented

- Full meanings and explicitly separated classical/Nelson dictionary classifications from the existing pinned KANJIDIC2 source. Ordinary entries, reference lists/search, radical lookup, exploration captions and writing-room labels share the facts. The source has 10,384 records; six legacy structural forms honestly have no reference facts.
- Original-path group inspection for 森・品・晶・織・識・職. The source projection contains 61 groups and 88 strokes; repeated occurrences and unnamed groups remain separate. This is a stroke-group model, not an etymology or semantic/phonetic-role model.
- An authored pilot of 24 kanji in six units, using 49 attested word examples. Meaning recognition and whole-word reading are separate tasks. An introduction offers teaching or a check before answers appear; reveal/skip receives no success credit. Missed-target repair preserves full-unit scores. The course requires linguistic/editorial and learner validation before acceptance.

The dictionary fields do not rewrite old lesson keywords, captured answers or scheduler state. The course writes only existing lesson evidence, through the existing acknowledged transaction, when the learner chooses Keep. No new learner root, scheduler, mastery metric or automatic enrollment exists.

## Shared interfaces

`BunkiReferenceCore.validateKanjiFacts(extra)` validates the schema and source binding. `kanjiReferenceFacts(extra,literal)` returns full meanings, explicitly named radical schemes, and release provenance, or null. A valid table lacking a glyph is different from a failed or pending table. The generator and independent raw-archive tests establish cryptographic parity; runtime validation does not pretend to reread upstream XML.

`BunkiKanjiStructure.createModel({kanji,strokes,grouping})` exposes `inspect(literal)`, `occurrence(literal,id)` and `project(literal,id)`. Occurrence IDs bind literal, source commit/hash and group path. The model preserves original coordinates and ordered paths; a supplied mismatched tree throws. Listed component membership remains a different relation. It never manufactures positions from standalone stroke counts, historical forms, sound or meaning roles.

`BunkiKanjiCourse` supplies immutable static units, explicit prompts, pure answer/reveal/skip transitions, separate target results and missed-only repair. `toLessonEvidence(run,time)` creates existing-shape deltas. The app deduplicates retries, preserves newer scores, keeps successful acknowledgements even when the page is left, and rejects stale record epochs. A revealed or skipped prompt cannot replace that goal's full score. A repaired run never replaces the original score.

Readers and the Kanji finder reach the same ordinary entry. The parts inspector stores selection on that entry's navigation node and activates at `mountPageEffects`, including idle-prebuilt pages. It does not mutate the source context, return path or learner record. Other worlds can consume these contracts without copying this rendering or creating alternate learner identities.

## Source and rights

KANJIDIC2/scriptin release `3.6.2+20260803141815`; raw archive SHA-256 `5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6`. Complete field projection and provenance are generated in `reference-extra.json`; the old tables are preserved.

KanjiVG commit `61e39cfc29724132a6f8823b166296932985a0ff`, Ulrich Apel, CC BY-SA 3.0. Original SVG bytes and hashes are retained in `prototypes/corridor/tools/fixtures/kanji-structure/`; the deterministic extractor derives group hierarchy while preserving stroke paths unchanged. No creative-lane engine was imported.

## Required qualification

Pure module and actual-renderer probes verify source parity, distinct repeated parts, classification/meaning lookup, saved-answer protection, course outcomes, atomic patch production, stale writes, retry/deduplication, and asynchronous mount/refresh behavior. The DOM and commit probes use controlled Node adapters. They are not browser, IndexedDB durability, screen-reader, image, performance or physical-phone evidence.

Before integration: freeze a source head; independently review language/answers and all changed data pins; build a fresh artifact under the shared resource rules; verify packaging and installed identity; run native dictionary/lookup, writing-room, parts-inspector and course journeys; exercise source/focus/scroll return and failed-load/retry on both supported engines. Include actual Tab reachability, touch hit areas, all worlds, reduced motion, zoom/large text and imported/saved-record compatibility. Refresh verifier contracts intentionally for the new source facts. Run the required release and no-mistakes gates before any authorized shipping. Do not reuse current frozen WEAVE/FULL evidence for this branch.

## Not complete

The six-character structure sample is not full-corpus decomposition. Sound/meaning family roles, validated historical structure, vetted sentence transfer for all course targets, a complete adaptive curriculum, the standalone World, personal quests, cross-world journey persistence, world-class animation/art direction, and measured delayed learning remain open. The pilot has no unseen-transfer or retention claims. Optional handwriting scoring is not implemented; the existing writing room remains a reference tool.

The live execution plan and raw receipts are outside the repo in `~/.dharma/bunki_review/2026-10-15/juncture/one-hand/KANJI-NEXT/`. New art remains under John's pause; the failed Rainwell direction is preserved and stopped. Publication remains with the lead's combined handoff and the existing release workflow.
