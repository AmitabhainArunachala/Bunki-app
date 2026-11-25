# Integrated study and continuity

This is the implementation record for the branch based on `next` at `cbb7a0343` (PR #154, 1.3.0-rc.2). The candidate is 1.3.0-rc.3. The separate production 1.2.3 baseline at `62abd3542` uses different routing and storage. Its 1.2.4 work is available on `improve/study-continuity`. Do not apply its localStorage writer over the integrated engine.

## What owns a review

| Entry | Runtime and storage | Contract |
| --- | --- | --- |
| Paired Bunki study, or an explicit isolated shared preview | Same-origin shared frame mounts the canonical Nihongo Study renderer. The replica uses a scoped IndexedDB compare-and-swap transaction, outbox and replay projection. | The paired host owns the connection, permits, retries and installation lifecycle. Preview uses a disposable learner. Neither a preview nor a successful local write proves a server acknowledgement. |
| Ordinary unpaired built-in decks | `decks/player` uses per-deck records and cross-surface answer arbitration. | Rebase valid independent changes. Reject an already answered card. Refuse writes over unreadable or externally removed history. Explicit restore protects the previous bytes. |
| Private paragraph collections | Separate IndexedDB collections, checked revisions, explicit backup transfer. | Reveal, reading and lookup leave the schedule intact. A committed grade or undo updates an existing record. |
| Host word review and timed practice | Corridor's durable record and pinned scheduler. | A scheduled review changes the card. An immediate repeat within the same timed block contributes practice evidence. |
| Desktop foreground journal | Electron host, SQLite replication coordinator and a Swift CloudKit transport. | Its supported record kinds and acknowledgement semantics differ from the paired study protocol. Both offline observations may survive a concurrent review without synthesizing a second FSRS advance. |

The public distribution remains pinned to the 354-file Nihongo Study release at `5f2f45fb021d6e328ea91c7890fcadf70da9a37b`. The importer, content binding and release verifier own this boundary. The grade clock lives upstream. A separately reviewed upstream correction excludes time spent in a menu, help or report surface from active recall time. Its adoption requires a new admitted distribution. [Shared study contract](../srs/SHARED_STUDY_ENGINE.md) · [Release identity](../../scripts/shared-study-release.json)

## Iterations and evidence

| Cycle | Baseline observation | Candidate check |
| --- | --- | --- |
| Discovery | Ran the immutable rc.2 artifact and inspected shared preview, ordinary deck and reader routes. The shared host and unbound player draw different screens for the same N2 deck. | Keep the same routes, fixture identity, viewport and release pin when comparing runs. |
| Reliability | A modified grade shortcut wrote a review. Space from the Japanese private-card heading failed. The legacy ledger accepted a grade over a changed, unreadable record. | Keyboard, stale record and explicit recovery tests. Neither opening the answer nor refusing a write creates a review. |
| Learning evidence | A short learning step could reinsert the scheduled item inside a timed block. | Verify one scheduled grade, later practice, undo and subsequent ordinary SRS review. Original grade policy and existing rows retain their meaning. |
| Shared interface | At both 667 × 375 and 844 × 390 none of the four embedded grades passed center-point hit testing. The iframe extended behind host navigation. | Size the host and frame together. Exercise the actual front, back and grade actions across portrait, short landscape, tablet and desktop. |
| Unbound interface | Rotating the old N1 room to 844 × 390 left its headword at y=470, below the grading dock at y=212. | Keep the reading position as the wide room places the explanation beside the passage. The grading row has its own space. |
| Reading | First Japanese article token appeared at y=469–472 across three short landscape widths. The illustrated cover used the entire initial reading area. | Cover and passage share the first screen. Verify Japanese text, dictionary access, reading controls and restoration of a token bookmark. |
| Paired sync | Ending a pairing after a restart could show zero pending answers. A single 500-row transport page could undercount a larger mixed backlog. | Count locally retained pending answers across the whole outbox. Test restart, revocation, mixed events and backlog beyond one wire page. |
| Desktop sync | Snapshot read timeouts and uncertain writes shared an error path. Invalid write receipts could signal success. | Validate receipt revisions, including duplicate replay. Read-only timeouts allow retry on the same session. Two independent SQLite stores preserve competing attempts for reconciliation. |
| Performance | Compound comparisons repeatedly recomputed Japanese word length and JLPT rank. Batch preparation reserialized every prefix. Independent boot modules loaded in series. | On the actual rc.2 dictionary, 2,370 kanji and 35,550 ordered associations yielded identical SHA-256. In 15 alternating samples median CPU fell from 132 to 95 ms. Seven warm synthetic batch trials on the common coordinator reduced median prep from 4,371 to 180 ms for the same 246,065-byte request and ID. |

The synthetic 75 ms RTT boot probe on the production-based slice measured the ten validator requests spanning a median 3,426 ms before and 337 ms after the common boot change, three fresh browser contexts per variant. This interval excludes the rest of launch. CPU contention varied. The original production journey still transferred about 20 MB on an uncompressed loopback host.

## Evaluation

Judgments on the inspected paths use five-point increments on a 0–100 scale. The columns record discovery, integrity fixes, adaptive layouts and the combined candidate. A reproducible loss or unreachable primary action rates below 60. Scores near 75 require repeatable behavior across the exercised paths. Scores above 90 require sustained use on real devices. Where an iteration supplied no new evidence the score stays fixed.

| Dimension | Baseline | Integrity | Layout | Combined | Evidence and limit |
| --- | ---: | ---: | ---: | ---: | --- |
| Visual sophistication | 75 | 75 | 80 | 80 | Shared chrome and editorial cover are established strengths. Short-screen space now serves the text and answer. |
| Japanese typography | 80 | 80 | 80 | 80 | Native ruby, contextual readings and Japanese copy. Enlarged system text and long mixed-script passages still need a device audit. |
| Information architecture | 70 | 70 | 70 | 70 | The paired host owns one study UI. Separate local modes remain visible and do not implicitly migrate. |
| Portrait | 80 | 80 | 80 | 80 | Four reachable grade controls at 390 × 844. Physical one-handed use remains unmeasured. |
| Landscape | 40 | 40 | 75 | 75 | The revealed shared card had zero reachable grades at two phone widths. Now the grade action can complete after rotation. |
| Desktop and tablet | 70 | 70 | 75 | 75 | Wider layouts give room to inspect the answer beside its source. Hardware keyboard and trackpad sessions still need a longer trial. |
| Study efficiency | 65 | 70 | 75 | 75 | Fewer accidental writes, correct Japanese shortcut and access to grades while rotated. |
| Interaction fluidity | 65 | 65 | 70 | 70 | Rotation and keyboard behavior checked on the real renderer. Sustained frame time and input latency require a hardware trace. |
| Synchronization | 60 | 70 | 70 | 70 | Paired outbox recovery, independent local stores and precise receipt checks. Device-to-device CloudKit and the live paired service require separate acceptance. |
| Offline resilience | 70 | 75 | 75 | 75 | Interrupted and stale writes are guarded. Cache availability and identity scope determine which content can open offline. |
| Learning coherence | 70 | 75 | 75 | 75 | Canonical shared projection, independent observations and deliberate grade history. The local learning modes retain their own records. |
| Accessibility | 60 | 65 | 70 | 70 | Plain versus modified keys, native focus, real touch targets and scrolling. Physical VoiceOver, Switch Control and text scaling remain open. |
| Performance | 60 | 60 | 60 | 70 | Identical data ordering with lower indexing CPU and substantially less repeated sync preparation. Battery and thermal behavior are unmeasured. |
| Code quality | 65 | 70 | 70 | 70 | Changes stay in existing owners and use pinned release identities. The large integrated controller still makes regression review expensive. |
| Production reliability | 55 | 65 | 65 | 65 | Fail-closed storage, explicit retry semantics and repeatable release checks. Release admission and real-device qualification remain separate decisions. |

## Reproduction and remaining acceptance

1. Install dependencies with `npm ci --ignore-scripts` and start `npm run bunki:web:dev`. The server builds a fresh immutable artifact. Use the reported origin with `?deck=n2&sharedStudy=preview` for the shared renderer, `?deck=n1` for ordinary study and `?deck=personal&ui=ja` for a private collection.
2. Run `npm run verify:shared-study:release` and `node scripts/verify-shared-study.mjs`. Run the shared browser verifier against the assembled site with `KAIRO_SITE_DIR` and an external `KAIRO_EVIDENCE_DIR`. The presentation, SRS-conformance, reader/bookmark, storage and sync verifiers exercise their respective owners.
3. Bind two disposable devices, introduce an eligible card, go offline, review independently and reconnect. Inspect the outbox, retrieved events, review head and conflicts on each installation. Test revocation with an unsent review. Use synthetic scopes and retain the original backups.
4. Run the signed builds on physical iPhone and Mac. Validate foreground/background transitions, device rotation with an IME or VoiceOver active, real-account revocation, incremental transport and restoration from an older backup.
5. Profile long sessions with thousands of cards and years of retained events on a mid-range phone. Distinguish transfer, parse, render, storage acknowledgement and wire confirmation. No claim about long-term learning efficacy follows from these software checks.

Screenshots and execution receipts belong outside the checkout. The evidence bundle supplied with the work pairs images from matching routes and screen dimensions. The build identity in a receipt identifies the artifact actually exercised.
