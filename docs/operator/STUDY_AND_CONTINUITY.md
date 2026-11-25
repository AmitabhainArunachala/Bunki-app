# Study and continuity

Work began from the 1.2.3 production source at `62abd354`. The candidate is 1.2.4 on `improve/study-continuity`. This record covers the integrated browser study room, the private collection player, timed practice and the desktop foreground replication path.

## Where the learner's record lives

| Surface | Authority | What counts |
| --- | --- | --- |
| Corridor reader, dictionary, word reviews and timed practice | `prototypes/corridor/corridor.js`, the record host and its IndexedDB transaction path | Explicit grades advance scheduled items. Lookups, reading and in-block repetition carry different evidence. The domain kernel and parity tests define scheduling behavior. |
| N1, N2, specialist and mined decks | `decks/player/engine.js` and the local `bunki-cloze:<deck>` ledger | Card IDs, reviews, lookups and suspension belong to their deck. A storage acknowledgement precedes an on-screen grade advance. |
| Private paragraph collections | `decks/personal/store.mjs`, revision-checked IndexedDB writes | Explicit grades on separate tasks. Export and import carry the collection and its history between browser installations. |
| Desktop replicated records | Electron host, SQLite replication coordinator, typed sync journal and Swift foreground CloudKit transport | The desktop adapter exposes a bounded set of record kinds. Conflicting retrieval attempts can coexist for reconciliation. A merged journal alone does not establish a schedule. |

Follow [ADR-004](../adr/ADR-004-one-learner-state.md) when adding a consumer. Preserve the product's existing focus-room contract, explicit enrollment, per-modality evidence, palette choices and the scheduler pin in [fsrs-pin.json](../../prototypes/corridor/data/fsrs-pin.json).

## Design decisions

- Preserve line breaks across reveal and keep ruby aligned to the word. Retain tap-to-define and the existing right-half reveal gesture.
- Use the extra width on a revealed card for the explanation. Keep the grade dock reachable and keep the passage scrollable in short viewports.
- Give the focused control ownership of Enter and Space. Ignore composition, modified shortcuts and repeated keydowns in the global study handler.
- Report conflicts where the learner can recover. Serialize competing deck mutations on hosts with Web Locks and compare saved bytes before replacing a ledger. Older hosts have the stale-byte check without cross-process serialization.
- Keep records and scheduling compatible with epoch 1. Changes to timed practice affect future events. Historical review rows remain intact.

## Evidence and evaluation

Scores are reviewer judgments on a 0–100 scale, in five-point steps. A working path with a reproduced loss of progress or inaccessible primary action can score below 60. Scores around 75 indicate repeatable behavior in the tested configurations with gaps in coverage. A score above 90 requires sustained use and physical-device evidence. The numbers below are assessments of the inspected product slice. They do not measure retention or outcomes in a learner population.

| Dimension | 1.2.3 | Candidate | Basis for judgment |
| --- | ---: | ---: | --- |
| Visual sophistication | 75 | 80 | The reveal retained its paper surface and four grade colors. The wide layout now gives passage and explanation separate reading space. |
| Japanese typography | 80 | 80 | Real passages, bundled faces and layout-stable furigana. Line-level checks exist for the study room. A full corpus audit at enlarged system text sizes remains open. |
| Information architecture | 70 | 70 | The reader and dictionary are connected. The current and optional five-place layouts still give learners two different navigation models. |
| Portrait experience | 80 | 80 | The 390 × 844 room has a quiet front, thumb reveal and a compact grade dock. No physical one-handed usability study. |
| Landscape experience | 45 | 75 | At 844 × 390 the initial revealed N1 headword was below the screen. The split layout brings it into view alongside the text. |
| Desktop and tablet | 65 | 75 | On wide displays, both sides of a revealed card can be inspected without traversing a tall single column. Other rooms still vary in their use of width. |
| Study efficiency | 65 | 75 | Fixed accidental shortcut grading, Japanese private-card reveal and the timed-practice duplicate scheduled grade. Keyboard speed over multi-hour sessions remains unmeasured. |
| Interaction fluidity | 65 | 70 | Correct focus and rotation reduce interruptions. Refresh-rate, input-to-photon latency and sustained scrolling on hardware need measurement. |
| Synchronization reliability | 40 | 55 | Correct desktop read/write uncertainty classification, receipt validation and two-store reconciliation tests. Browser SRS continuity across physical devices remains open. |
| Offline resilience | 70 | 75 | The private collection browser check imports, grades offline and reloads the record. The same-origin deck contention case now preserves a winning write. Content cached on demand has a different offline envelope. |
| Learning-system coherence | 65 | 75 | Timed repeats carry practice evidence while explicit reviews feed FSRS. Dedicated decks, private tasks and the host word schedule still have separate ownership. |
| Accessibility | 60 | 70 | Keyboard tests cover native activation and Japanese UI. The existing focus room has visible color-coded grade labels. Screen-reader, switch-control and enlarged-text acceptance on devices remain open. |
| Performance | 60 | 70 | Measured work decreased in batch preparation and compound indexing. The uncompressed integrated boot still transfers about 20 MB on the tested reader journey. |
| Code quality | 65 | 70 | Small changes in existing owners, regression cases and unchanged data contracts. The integrated controller exceeds 33,000 lines and remains expensive to reason about. |
| Production reliability | 55 | 65 | Reproduced stale-write loss and fixed the active deck path. Release metadata and automated coverage help bound risk. Signed-device validation and field telemetry remain open. |

## Measured cycles

| Cycle | Reproduction and change | Verification seam |
| --- | --- | --- |
| Discovery | Ran a clean detached build. Walked from home through the shelf to a 495-token article with 222 ruby elements, opened the 中国 entry and rotated with it open. | Local Chromium, 390 × 844, 844 × 390, 834 × 1112 and 1440 × 900. |
| Grade integrity | Two standard-deck tabs were open. A saved Good and Easy. B graded the stale first card Hard. Stored history went from two rows to one. | N2/N1 browser verifier, concurrent mutation and stale undo cases. |
| Keyboard | Alt+3 wrote a row on an N2 answer. Space from the Japanese private collection heading left the front in place. | Rerunning the same browser interaction produced zero rows for Alt+3 and a revealed Japanese answer with unchanged progress. |
| Study presentation | Rotating a revealed N1 passage left the headword near y=582 in a 390px-high viewport. | Measure passage, headword, dock and manual reading seat through a round trip. Keep card identity and ledger constant. |
| Learning evidence | Again followed by an immediate Easy in one timed block changed FSRS twice. | Exercise practice, undo, a normal review and the pinned scheduler vectors. |
| Foreground sync | A snapshot timeout was treated as an uncertain durable write. An invalid mutation receipt could masquerade as success. | Faulted and delayed IPC replies, SQLite close/reopen and two offline reviewers against one prior revision. |
| Performance | A 100-operation batch was repeatedly serialized as it grew. Compound comparisons repeatedly counted characters and derived rank. | Seven warm batch trials, identical request ID and 246,065 bytes. Median preparation 4,371 → 180 ms. On 2,370 kanji and 35,550 associations, median index CPU time 116 → 63 ms, with identical ordered output. Local microbenchmarks under shared load. |

## Reproduce and continue

Use Node 22.13 or later, run `npm ci --ignore-scripts`, then `npm run bunki:web:dev`. This command assembles an immutable runtime. Restart it after editing source. Use a disposable browser profile and synthetic collections for fault injection. Run `npm run release:verify` with the production base SHA before requesting admission. The verifier scripts under `prototypes/corridor/tools` write receipts outside the checkout. The sync tests use the repository's Vitest configuration and the desktop Node test runner.

1. Validate signed iPhone and macOS builds with two real Apple accounts, account changes, interrupted foreground operations, offline reviews and restore. Record exactly which kinds cross the device boundary before exposing a success indicator.
2. Run VoiceOver, keyboard-only, reduced-motion, 200% text and landscape notch checks on physical devices. Exercise dictionary return, a long N1 passage, full queues and private material.
3. Profile startup transfer and main-thread time separately on a mid-range phone. Track cold and warm runs with the same cache state, corpus and thermal conditions. Measure frame times, memory, battery and long-session behavior.
4. Establish an explicit versioned path for exporting or replicating observations from the dedicated decks before adding cross-mode mastery projections. Preserve original provenance and conflicting evidence.
