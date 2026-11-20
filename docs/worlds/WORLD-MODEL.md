# One world model

**Status:** a pure shared-world contract with three stub consumers; the runtime worlds have not migrated to it (campaign node G7; SPEC S6-R8, S7-R2, S7-R3, S7-R4, S7-R15; resolves C10 at the contract level). Interface: `prototypes/corridor/contracts/world/world.mjs`, with the consumers under `stubs/`.

## The model

Under this contract, a **world is a view over the shared graph**, plus **one state layer**.

- **The view.** A world opens on a G9 entry id and sees what the graph holds about it: the one entry object (G13: entry, reading and sense ids, the first answer, the fuller entry), the kanji written in its spelling with their G5 part ids and components, and the provenance of each fact. A world never carries Japanese of its own: every character it shows comes from the shipped dictionary and the KanjiVG parts graph through the graph (S7-R15, S6-R9). The example in the contract's judge is 食べる, read from `data/share_alike/dict-v2`, and its kanji 食 from `data/parts-graph/graph.json`.
- **The state layer.** `{projects, continuation, journeys}` — Worldcraft's project and help state, Passage's interruptible continuation, and the quest and journey lifecycle — held once, keyed by world id, saved through `saveProject`, `continueAt`, `startJourney` and `advanceJourney`. No world keeps its own state.
- **Entrances.** A world is entered directly, or from reading, a word, a kanji page, voice or Drift (S7(c) 6, S9). Every entrance writes a G4 return record (`contracts/return/return.mjs`) so the learner returns to the exact place.

## Intended runtime migrations

| Model                 | Where it lived                                                                  | Disposition                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| M3 world engine (T29) | design only                                                                     | its design becomes an instance of this model; nothing is ported, there is no m3 module                      |
| Worldcraft (M4)       | `prototypes/corridor/m4-worldcraft.mjs`, `worldcraft-view.mjs` (rescued, S7-R4) | projects and help state move into the state layer; the build host becomes a view                            |
| Passage (M4)          | `prototypes/corridor/m4-passage.mjs` (rescued)                                  | its interruptible continuation becomes `continuation`                                                       |
| Quests                | `prototypes/corridor/m4-quest.mjs`                                              | the quest and journey lifecycle becomes `journeys`                                                          |
| Kanji worlds (W12)    | `prototypes/corridor/kanji-world-encounter.mjs`                                 | an instance opened on a kanji's entries; content from the graph, never a lesson packet typed into the world |

On the integration base these models keep different state (`createQuestState`, `createWorldcraftState`, `createPassage` each return their own shape); the contract's stub tests fail against them on shape, which is the point.

## What this document does not decide

The visual language (S7(c) 3, the Creative Bar), the art directions (C3) and the journey-write migration proof (S7(c) 5) are their own work. Nothing from the rescue at `~/.dharma/bunki/rescue/overnight-worldcraft-20261103/` is discarded unread; the stubs import nothing from the rescued modules.
