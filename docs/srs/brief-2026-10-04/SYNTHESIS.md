# Synthesis of the three analyses of the learner brief

Inputs: `learning-design.md`, `aesthetics.md`, `integration.md` (each by a separate
reviewer, read-only, with evidence from the research files, the standard and the
code). This file records where they agree, where they push back on the brief, and the
build order that follows. Decisions marked **(learner)** are open.

## Where all three agree

1. **The front is already untouchable** (`sentenceNodes({front:true})`); keep it, pin
   it with a test. Full furigana on reveal is already there and stays.
2. **The back is a fast feedback strip first, depth second.** Immediately under the
   passage: term, reading, part of speech, Japanese definition, a short muted English
   gloss, the usage note. A card you knew must be gradeable in about six seconds with
   zero taps. Everything richer sits behind one or two taps, and some of it only once
   the card is in review state.
3. **English: demote, don't hide.** Japanese definition first; the English gloss last,
   small and muted, still visible; full translation, dictionary English and kanji
   meanings behind taps. This satisfies both the earlier ask (confirm fast) and this
   brief (English not in your face). The `gloss` setting already exists; the deck's
   default becomes a recorded learner decision.
4. **Level is a chip, not a colour.** No `level` field exists in the deck yet; "at my
   level" is relative; a seventh hue breaks the "subtle" and colour-blind rules. One
   hue axis per surface: target coloured by part of speech, card edge and chip by item
   kind (語 / 字 / 文法), red/green/amber for grades and state, everything else ink.
   English is never coloured. The topic colour wheel and the level-1–3 edges leave the
   card.
5. **"Spaceship" is subtraction plus one transition, not effects, and not Rust.** The
   felt slowness is the player rebuilding the whole screen on every tap. Keep the card
   node on reveal, animate only opacity and transform, under 180 ms, with a directional
   card advance and a progress rail; honour reduced motion everywhere. Retune the light
   themes for contrast; move paper and chalk textures off the card where ruby sits.
6. **Tap-to-define on the back needs data the cards lack.** Ruby segments carry no lemma
   or dictionary reference, so the build must emit per-card tokens (surface, lemma,
   kind, reference) — the tokenizer already has them. In the corridor, the player gets a
   small host adapter (`lookup`, `open`, `isTaken`, `take`) so a tap opens the same entry
   sheet and 覚える chooser as the reader. Taps are lookups, never scheduler evidence; a
   word already in the deck says 「このデッキにあります」. The standalone page has no
   dictionary: furigana plus a built-in gloss map, no 覚える.
7. **Kanji family and grammar links come free offline** (`kanji.json` parts, JMdict
   see-also, corridor `GRAMMAR` ids). **Synonyms and a Japanese–Japanese dictionary do
   not**: `sem.json` covers 82 words and the dictionary is English-only, so J→J depth
   must be authored (`defJa` grows into per-sense definitions in the N2/N1 pass).
8. **No fourth player.** The private collection player's four task kinds (meaning,
   reading, grammar, application) should be ported into the deck player through the
   schema v2 contracts, with its ledger migrated — the one experience across the two
   decks, the private collection and N2/N1.

## Where they push back on the brief

- "Multi-layered, recursive, haywire": capped at two layers above the fold and gated
  by card state. Density is measured in retrievals per minute, not information per
  card; depth exists, but opt-in.
- Other passages of the same word do not appear on the study back (they would leak
  sibling answers); they live in the word list.
- A hue for N1/N2 cards: no (see 4).

## Build order

| Phase | Content                                                                                                                                                                                                                                                                                                                                                          | Size                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1     | Front pin test; back hierarchy and gloss demotion; sticky answer strip for long passages; remove clutter (tips panel, amber tip bar, level edge, topic wheel); contrast retune and textures off the card; reveal transition without full rebuild; reduced-motion guard; kind colour and level chip (emit `word.level`); kanji family; grammar and see-also links | ~1 week of small PRs, each with a screenshot matrix and contrast script |
| 2     | Per-card tokens in the build; host adapter; reveal-gated tap → define → 覚える in the corridor; standalone fallback                                                                                                                                                                                                                                              | ~3 days                                                                 |
| 3     | Port the private player's task kinds into the deck player (schema v2), migrate its ledger; this is also decision D1 for N2/N1                                                                                                                                                                                                                                    | ~6 days                                                                 |

## Open decisions (learner)

1. Accept "demote, don't hide" for English, with the per-deck default recorded?
2. Accept level as a text chip rather than a colour?
3. Phase 3 now (one player for everything) or after the N2/N1 pilot?
