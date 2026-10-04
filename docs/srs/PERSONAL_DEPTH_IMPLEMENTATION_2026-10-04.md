# Personal SRS: depth without a changing grading target

This iteration applies the learner's October 4 feedback to **私の文脈**, the
personal paragraph collection inside Bunki. It extends the earlier SRS review;
it does not silently change the assessment contracts of the two older public
decks. The [research synthesis](research/PERSONAL_CARD_DEPTH_2026-10-04.md)
separates experiments, original community practice, and product judgment.

## What the learner experiences

The front presents a complete Japanese paragraph and one declared task:
meaning in context, reading, grammar function, or the existing application
question. The target has an explicit label and underline. There is no answer
markup, furigana, English answer, or app-controlled token lookup on that face.
The application task retains its original question and assessment identity.

Reveal changes the paragraph into a reading surface. Reviewed annotations
provide ruby for every kanji-bearing unit. On phones, a compact Japanese answer
replaces the question area; on a wide screen, the paragraph and answer sit
beside each other. The paragraph remains available. Short usage is followed by
optional layers for grammar, contrasts, related expressions, and kanji.
Opening English is an explicit per-card choice. English support closes for
the next card; expanding a Japanese layer is not undone by opening English.

The answer guides are newly authored explanations of the occurrence, not
quotations from a Japanese dictionary. Whole-word readings remain whole-word
readings; the UI does not assign guessed pieces of a jukujikun to individual
characters. Japanese definitions, grammar notes, usage and comparisons can
carry their own reviewed ruby annotations.

Each revealed paragraph can open Bunki's actual dictionary, kanji and grammar
sheets. The sheet is a sibling overlay: recursive entry navigation does not
replace the personal card. **覚える** opens the existing list chooser and can
create a named list. Saving uses the shared Bunki learner envelope. Closing or
using device Back returns to the same card and position. Grading shortcuts and
buttons are disabled while a dictionary sheet is active.

The design uses the existing ten palettes, crisp borders, clear typography,
compact controls and restrained functional accents. Color is supplemented by
text and shape. This collection has no invented N1/N2 labels; theme, task and
review state are the meaningful signals available today.

## Preserved learning and data contracts

- `engine.mjs` and `store.mjs` are unchanged. FSRS-6 weights, retention, steps,
  sibling handling, due checks and rating mappings remain the same.
- Existing collection IDs, lesson text, lesson hashes, content digest and
  assessment IDs remain unchanged. Each modality keeps its own evidence.
- An answer reveal, English reveal, lookup, source visit, or captured word is
  not a successful review. Only an explicit grade writes a personal review.
- Opening a dictionary or its save chooser does not enroll an item. Confirming
  **覚える** preserves Bunki's existing explicit memorization contract: it adds
  the item to the host's review pool and selected lists. The chooser labels
  this destination “daily review.” It writes no grade, FSRS record or review
  log, and it does not change the personal paragraph's FSRS state.
- Writes still commit before advancing. Failed writes retain the answer;
  concurrent stale windows fail rather than overwrite newer work. Undo remains
  append-only.

## Answer enrichment and safe updates

`bunki-personal-enrichment` version 1 is a separate, revisioned answer guide.
It binds to `collectionId` and the original `contentDigest`; each entry also
binds to the original lesson `contentHash`. Its own SHA-256 covers its complete
contents. These hashes establish byte integrity and edition binding, not
linguistic correctness or a trusted author identity.

Every paragraph annotation must reconstruct the original text exactly. Every
kanji-bearing segment must contain a kana reading. Optional answer ruby must
reconstruct each Japanese explanation and related expression exactly. The
import boundary validates identities, field limits, references, reading shapes
and content hashes before writing. Imported markup is escaped, never executed.

The guide can arrive as a separate file or an additive `enrichment` field in
the original collection JSON. Importing the enriched collection into an
already-used collection updates the answer guide while retaining the existing
paragraphs, review events and settings. A separate guide requires its matching
collection to have been imported first.

Reimporting the identical guide is safe. An older revision or different guide
claiming the same revision cannot replace saved material. A newer revision can
improve answer-side wording/readings without changing what was assessed. A
change to the paragraph, target, sense or assessment task still requires an
explicit content migration or distinct identity; an enrichment file cannot
perform that change.

Exports include the collection, full review history and answer guide. Existing
backups without enrichment still open. Importing one does not remove a saved
guide. No migration resets a review or creates a new card.

## Privacy and offline behavior

The public application contains reusable code, research and synthetic tests.
The personal collection, conversation anchors and authored guide remain a
device import and are excluded from the repository and CI artifacts. No text
is sent to a remote tokenizer, dictionary API or explanation service.

Dictionary preparation loads Bunki's existing same-origin data after reveal.
The service worker precaches the core dictionary, kanji, stroke and grammar
assets along with the player. These add approximately 6.5 MiB of data to the
installation cache. Complete dictionary shards are loaded on demand and are
available offline after caching; an unavailable complete entry retains its
core result and an honest retry message. A failed first installation still
requires connectivity; this is not a claim that an uncached web app can work
without ever connecting.

The fallback for old collections without reviewed annotations uses the
device's Japanese word segmenter and Bunki's dictionary/conjugation data for
navigation. It does not fabricate furigana or Japanese explanations. The
enriched personal collection supplies the reviewed coverage requested here.

## Verification

Run the following from the repository root:

```bash
node prototypes/corridor/tools/test-personal-collections.mjs
node --test prototypes/corridor/decks/personal/tests/host-bridge.test.mjs
node prototypes/corridor/tools/verify-personal-collections.mjs
node prototypes/corridor/tools/verify-personal-host.mjs
node prototypes/corridor/tools/verify-corridor-storage-integrity.mjs
npm run lint
npm run format:check
npm run typecheck
npm test
```

The collection browser suite uses synthetic text and real IndexedDB. The host
suite uses synthetic text with the actual packaged dictionary and shared
learner store. Required scenarios include a locked front, deliberate English,
complete paragraph ruby, an answer upgrade after existing reviews, backup
round-trip with enrichment, failed writes, concurrent windows, recursive
dictionary navigation, named-list capture and no review evidence from lookup.

Chromium checks use 320/390/1440 px viewports and network-offline mode. WebKit
checks run in CI, including the existing server-unavailability cache fallback
test because Playwright's WebKit offline flag has a documented service-worker
navigation issue. Neither substitutes for physical iPhone or installed Mac
acceptance. Final run results are recorded with the pull request.

## Further improvements, in priority order

| Priority | Improvement                                                 | Why it matters                                                                                                               | Acceptance condition                                                                                                                               |
| -------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Independent fluent editorial review and correction workflow | Hashes and complete ruby cannot certify contextual naturalness or sense accuracy.                                            | Each disputed reading/definition has a correction, provenance and a revision that preserves assessment identity where appropriate.                 |
| 1        | Encounter backlinks in saved items                          | The shared chooser currently saves canonical entry identity; it should also remember which private paragraph led to capture. | Store a local collection/lesson reference and selected sense without copying private passages into public data; return to the original passage.    |
| 1        | Repair workflow for genuinely confusing cards               | Repeated failures can arise from ambiguity, not weak memory.                                                                 | Pause, inspect the intended sense, record a note, and resume deliberately; preserve original events.                                               |
| 2        | Verified listening and pronunciation layers                 | Meaning, reading aloud and listening are different skills.                                                                   | Licensed/consented audio and reliable pitch/reading metadata; no audio on a reading-test front; distinct assessments if scheduled.                 |
| 2        | A second sense-matched context and transfer check           | Success in a familiar paragraph does not establish flexible use.                                                             | Fluent review, clear source, optional practice, and an unfamiliar-context outcome measured separately from ordinary reviews.                       |
| 2        | Selective MCD for grammar and collocations                  | Form retrieval can complement meaning retrieval.                                                                             | One meaningful deletion, sensible alternate-answer policy, explicit opt-in and separate card identity/history. No blanket deck conversion.         |
| 2        | Bring the same boundary and durable saves to legacy players | The earlier review documented independent player defects.                                                                    | Fix the old storage/restore and identity defects first, then share presentation components without mixing ledgers.                                 |
| 3        | Local learning-quality evaluation                           | More taps or longer sessions do not demonstrate better learning.                                                             | Track recall time separately from exploration, delayed target recall, unseen-context transfer and confusion errors; export only by learner choice. |
| 3        | Signed native packaging and real-device acceptance          | Browser emulation cannot verify every iOS or Mac lifecycle behavior.                                                         | Physical-device install, offline, force-quit, recovery, keyboard, share and accessibility walkthroughs.                                            |

These are explicit remaining improvements, not shipped claims. No research in
this pass establishes a 10× learning-speed gain, a complete JLPT N1/N2 syllabus,
or universal superiority of MCD or Japanese-only feedback.
