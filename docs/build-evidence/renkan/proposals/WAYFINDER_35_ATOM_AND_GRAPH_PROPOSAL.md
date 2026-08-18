# Wayfinder #35 — name the atom and the graph (proposal)

**For:** operator decision sheet OD-4a (RENKAN §5.4) · **Status:** PROPOSAL — nothing here is executed.

## What exists today (evidence, not aspiration)

**Two identity systems hold learner knowledge, and they do not yet share a name.**

1. **The corridor's key** — every scheduled item is an opaque `type:id` string
   (`word:安堵`, `kanji:海`, `radical:氵`, `idiom:一期一会`), minted by `srsKey`
   (`prototypes/corridor/corridor.js:6194`), stored in `S.srs` (`:497`), and used
   identically by the revlog, the observation log, and suspension. Six types are
   live: word · kanji · radical · idiom · grammar · particle (`:608`). The key
   grammar deliberately reserves facets for card families to come —
   `kanji:海:on`, `word:安堵:prod`, `sent:<sourceId>#<n>` (`:6186-6193`). A capture
   can carry its context (`ctx: {p, i, scope}` — passage, index, 語だけ/この文/段落,
   `:6039-6062`), which is a thread-to-passage edge in all but name.
2. **The domain kernel's identity chain** — a capture mints a **thread**
   (`ThreadId`, ADR-002 `EncounterCaptured`); the thing a review tests is a
   **KnowledgeComponent**, `kc:` + the exact captured text
   (`packages/domain/src/contracts/component-identity.ts`); what gets scheduled is a
   **contract**, `contract:learn:<threadId>:<specId>:v<N>:<skill>`
   (`contracts/learn-contracts.ts`), and meaning/reading are distinct contracts whose
   memory never collapses (T-05) — the constitution's "memory is modality-specific" made structural.

**The graph today** is real but thin and typed:

- **SEM tier**: 82 words (~1.2% of the lexicon, `docs/prototype/KAIRO_PROTOTYPE_LOG.md:216`),
  edges typed syn 類義 · ant 対義 · reg 語感 · fam 同族 · col 共起 · thm 主題
  (`corridor.js:220-227`, data in `data/proprietary_safe/sem.json` with its own provenance pool).
- **JMdict relations**: cross-references and antonyms on deep word sheets, kept apart from
  authored 類語 by law — "a JMdict xref is never dressed up as an authored synonym note"
  (`corridor.js:8110-8113`).
- **Containment**: kanji→components (`parts`), kanji→Kangxi radical (`rad`), radical→kanji
  lists (`data/share_alike/kanji.json`); word→kanji pages walk the same edges.
- **Context**: the capture's `ctx` ties a thread to the exact sentence/paragraph it was met in.

## The proposal — one name, one key grammar, no store breaks

**The atom is the thread.** The constitution already says it: encounters become
"durable, interconnected threads" (§3). The learner-facing unit — the thing you
capture, promote, and return to through every recursive door — is named **thread**
everywhere. The schedulable unit stays **contract**: a thread carries one or more
modality-specific contracts, and FSRS schedules contracts, never threads. This is
not a new layer; it is naming what `@bunki/domain` already builds and what the
corridor's one-card-per-item today collapses into a 1:1 special case.

**The graph is the weave (織).** Threads interconnect through typed, provenance-pooled
edges. Naming it the weave keeps the textile metaphor honest (threads weave; they do
not "graph") and gives the SEM tier, JMdict xrefs, containment, and context edges one
home with one edge schema: `{from, to, rel, note?, pool}` — exactly the shape
`sem.json` already stores.

**The unifying key: `type:id[:facet]` becomes the canonical target key.**

- The corridor's key is adopted as-is; the facet slot is the already-reserved room
  for reading/production/sentence card families.
- New domain component ids mint as `kc:` + target key (`kc:word:安堵`). Existing
  `kc:<raw text>` ids are grandfathered valid — the A1 event bridge carries a
  versioned mapping table, so **neither store changes a single stored byte today**
  (`kairo-corridor-v1` and the `bunki-phase0` event log are both untouched).
- Contract ids are unchanged — they embed thread + spec + skill, not the component key.
- One short ADR (ADR-003) records the key grammar and the mapping, with replay
  fixtures, per `component-identity.ts`'s own rule that identity changes are
  explicit decisions, never drift.

**Edge vocabulary (closed set, extendable only by ADR):** the six SEM relations +
`contains` (kanji↔radical, word↔kanji) + `xref` (dictionary voice) + `context`
(thread↔passage). Every edge carries its provenance pool — authored SEM edges are
`proprietary_safe`, JMdict edges are `share_alike` — so the licence walls hold
inside the weave too.

## Why not the alternatives

- **"Atom"** is accurate but foreign to every operator-ratified document; nothing
  in the constitution, lock, or corridor speaks of atoms. It would be a third
  vocabulary, and the problem is having two.
- **"Card"** names a presentation, not the unit — one thread will render as several
  cards (recognition, MCD cloze, reading), and the SRS audit already found the
  card taxonomy is where growth happens (`docs/audits/SRS_AUDIT_2026-08-11.md` §5).
- **Deferring** leaves T2 (one learner state) building a bridge between two unnamed
  systems — the mapping table gets built either way; without the ruling it gets
  built twice.

**One-word meanings** — THREAD: atom = thread / graph = weave / key = `type:id[:facet]`,
exactly as above. ATOM: same schema, but named atom/graph (vendor-neutral vocabulary).
DEFER: campaign builds the A1 bridge with internal names only; naming returns to you later.

**Decision requested:** THREAD (recommended) · ATOM · DEFER
