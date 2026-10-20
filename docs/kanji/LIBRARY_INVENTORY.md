# Frozen library inventory

The offline inventory separates identities from authored teaching, source occurrences, geometry and relationship claims. It does not establish “every kanji covered,” language acceptance, learner mastery, licensing clearance or native app qualification.

Run from the repository root with the pinned local Node runtime:

```sh
/opt/homebrew/Cellar/node@22/22.23.3/bin/node \
  prototypes/corridor/tools/inventory-kanji-library.mjs \
  --out /Users/dhyana/.dharma/bunki_review/2026-10-15/juncture/one-hand/KANJI-NEXT/evidence/slice4-library/inventory.json

/opt/homebrew/Cellar/node@22/22.23.3/bin/node --test \
  prototypes/corridor/tools/test-kanji-library-inventory.mjs
```

The report is external runtime evidence, not a repository asset. `--out` is required, must be absolute and must resolve outside the repository. The tool reads local files only. It does not build the app, download sources, access private learner records or write scheduler state.

Every consumed file has a path, SHA-256 and byte count. Repeated reads and the final boundary reject changed bytes; optional family presence must also remain stable. The report contains no clock, random identifier or absolute checkout path. Its Git HEAD is contextual: the input hashes identify the actual working-tree snapshot, including uncommitted inputs. Freeze those inputs before treating a report as the accepted slice inventory.

## Current measured denominators

The slice-4 snapshot uses the tables at base `0186490e1c356c9b295c252747dd3184a3d7efb9` plus the new working-tree family asset described below. These counts are produced from the actual catalog, tables, dictionary shards and article files, not copied from the stale 70-passage `data/manifest.json`. Later runs must use their own input hashes.

| Axis                                             |                                                                    Measured scope | What the count does not mean                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------------- |
| Canonical kanji                                  |                                                 **2,582** exact `kanji.json` keys | All Unicode kanji, or every reference-only glyph                                                  |
| Reference-only catalog entries                   |                    **4,328** = **3,791 glyphs + 537 glyphless CE source records** | 4,328 drawable or enrollable characters                                                           |
| Complete kanji catalog                           |                                                  **6,910** unique catalog entries | Sum of overlapping JLPT/Kentei collection memberships                                             |
| KANJIDIC2 fact literals                          |                                                                        **10,384** | Catalog enlargement; **4,101** fact literals are not catalog entries                              |
| Canonical facts absent                           |                                                     **6**: 劦・厽・壴・夋・甶・菐 | Empty/failed loading; these are actual source absences                                            |
| Word catalog                                     | **24,715** exact form/reading pairs: **24,399 canonical**, **316 reference-only** | One identity per spelling; shadowed alternate readings remain separate                            |
| Selected JMdict detail corpus                    |                         **70,179 entries, 89,991 senses, 101,183 kana-form rows** | Whole upstream JMdict, or 89,991 contextually resolved senses                                     |
| Supplemental kanji reading projection            |       **2,578 rows, 8,230 source reading strings**, plus **9** official additions | Individual-kanji allocation of every compound’s contextual reading                                |
| Bundled source library                           |                                                   **156 articles, 95,731 tokens** | Private/imported texts, personal decks or generated passages                                      |
| Printed Han occurrences                          |                                      **53,571**, across **1,879 distinct glyphs** | Dictionary identities, components, semantic roles or recall                                       |
| Canonical kanji attested in those token surfaces |                                                 **1,734 / 2,582**; **848** absent | An authored exercise or reviewed sentence for every attested glyph                                |
| Explicit contextual sidecar                      |            **1,029 rows**: **973 sense selections, 52 names, 4 reading mentions** | Complete runtime disambiguation; name/reading mentions are not lexical senses                     |
| Stroke geometry                                  |        **2,136 glyphs, 22,366 ordered paths**; **2,134 / 2,582** canonical glyphs | Occurrence-preserving decomposition for every drawable glyph                                      |
| Original-source grouping                         |                                      **6 glyphs, 61 group occurrences, 88 paths** | Full corpus decomposition or etymology                                                            |
| Listed component membership                      |                      **11,159 rows**, from **2,223 glyphs**, using **901 labels** | Positioned/repeated occurrences or verified sound/meaning relations                               |
| Authored course pilot                            |                    **48 characters, 12 units, 97 primary/alternate word records** | 97 distinct words; repeated records remain counted, and coverage is not all readings or retention |

The report also enumerates catalog glyphs without complete facts/readings, canonical glyphs without geometry and source attestation, exact IDs and per-glyph coverage. No identity is merged by normalization. 剝 and 𠮟 can have geometry/reference facts while remaining outside the catalog’s `kanji.json` canonical-target denominator.

## Identity and occurrence rules

`reference-core.createCatalog` is the authority for canonical targets. Vocabulary identity uses its actual exact form/reading key; a reference-only homograph never inherits the canonical word’s reading. A glyphless source ID remains a source record. A kanji’s complete dictionary gloss list is separate from its lesson keyword.

Source occurrences use inventory-only coordinates over the existing article/token identities, not a new persisted app, card, lexical or scheduler ID:

```text
["bundled-passage", article.id, article-file-sha256,
 token-index, Unicode-scalar-index-within-token.s]
```

Only the printed `token.s` is counted, using Unicode `Script=Han`. This includes source Han forms without equating them to canonical Japanese entries. It does not expand `森` into three `木`, infer a dictionary match from a lemma, or assign a whole-token reading to each character. Supplementary-plane offsets use Unicode scalars rather than UTF-16 code units.

The report binds the full ordered occurrence-key digest, per-article and per-glyph totals, and up to three exact examples per glyph. All occurrences are reconstructible from the pinned article files; this avoids copying whole passages into the report. Contextual sidecar rows retain the original article/token identity and unmodified row, and are checked against an actual token and the selected dictionary’s sense bounds. The tool does not run the runtime sense-selection rules or editorially rejudge their choices.

KanjiVG grouping IDs bind the exact glyph, pinned commit, raw SVG hash and group path. All nesting, unknown labels and repeated occurrences survive; 森/品/晶 retain three separate 木/口/日 occurrences. The actual structure model checks ordered runtime-path parity. The inventory also checks all six retained SVG hashes against the source manifest. This is not a new independent XML extraction audit.

## Relations and the family integration seam

The default optional input is:

```text
prototypes/corridor/data/share_alike/kanji-family.json
```

An explicit alternate repository-relative path may be supplied with `--family`; a missing explicit path fails. An absent default is reported as `status: "absent"`, not silently filled from shared readings or component shapes.

The slice-4 schema seam accepts `schemaVersion: 1`, a `family` descriptor, a source ledger (`sources` or `sourceLedger`), `nodes`, `edges` and `examples`. Each edge requires a unique ID, typed endpoints present in the node table and nonempty source/locator evidence resolving to the source ledger. Word references retain `{type: "word", id: exactSpelling, reading: exactRawReading}`; endpoint closure checks all three fields without normalization, while other reference kinds retain their type/ID key. Source kinds such as `dictionary-entry`, `retained-file` and `retained-svg` are counted separately. Relations are counted separately:

- `phonetic-component`
- `semantic-component`
- `source-component-occurrence`
- `word-contains-kanji`
- `attested-word-occurrence`

The current family asset has **3 members, 19 typed nodes, 18 edges and 3 attested bundled examples**: **3 phonetic-component, 3 semantic-component, 6 source-component-occurrence, 3 word-contains-kanji and 3 attested-word-occurrence** edges. Its source ledger separates **3 dictionary entries, 8 retained files and 3 retained SVGs**. The tool rehashes every retained source and validates joins through the actual `kanji-family.createModel` with the current structure model.

The dictionary claims are attributed to Kanjipedia / 角川新字源 改訂新版; the asset declares access on **2026-10-21** but explicitly has no retained raw page hash. This inventory does not fetch or independently approve those accounts. The three sentence bindings use retained Tanaka/Tatoeba-derived example shards (declared **CC BY 2.0 FR**); compact bundle row and token coordinates are preserved. Original corpus sentence IDs, contextual lexical sense IDs and individual-character reading alignment remain null. The three selected examples are not a census of the full examples corpus.

Rerun after the owner freezes the final family asset. Its file hash and exact edge IDs enter the report, along with authored counts by relation and the source ledger. The inventory deliberately leaves `independentlyVerifiedSoundMeaningEdges` null: asset presence and citations alone are not an independent language/source-review receipt. Bind that receipt separately; never inflate six structured glyphs into six authored sound-family members. The proposed family’s three members and the six geometry samples are different axes.

Existing Kentei data has **6,787 source records** and **5,637 species IDs**. Form labels remain verbatim: **5 元字, 644 旧字, 501 旧字でない異体字, 5,637 親字**. Shared species records are related forms, not canonical redirects or inherited reading/grade. The printed-glyph collision at 芸 remains visible. These labels and any etymology prose do **not** prove historical-form geometry; that coverage remains unestablished.

The existing semantic tier has **82 word heads and 718 editorial edges**. It is reported separately and contributes no kanji phonetic/semantic-component coverage.

## Source dates, attribution and remaining gaps

The machine report retains the local source declarations verbatim:

- KANJIDIC2/JMdict via scriptin release `3.6.2+20260803141815`, dictionary date **2026-08-03**, EDRDG **CC BY-SA 4.0**. The KANJIDIC2 archive hash is `5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6`; upstream declared totals are kept distinct from counted local selected rows.
- KanjiVG commit `61e39cfc29724132a6f8823b166296932985a0ff`, Ulrich Apel, **CC BY-SA 3.0**. Six original SVGs and per-file hashes are retained locally. No unrecorded commit date or new acquisition is invented.
- Kentei fact projection: mimneko/kanji-data commit `0be3577f7939ec85d2b4e373a7a94262e7449e13`, declared **CC0-1.0**, with source CE/species IDs.
- Official 常用漢字表 dated **2010-11-30**; local reference provenance records its **2026-10-19** retrieval. It supplies the separately marked reading additions.
- Each article retains its source, URL, publication date where present, license, attribution and ruby-source declaration. Index-level source declarations also remain visible, including the ISA glossary’s unverified-terms warning. No missing date or right is fabricated.

Not inventoried as a frozen corpus: personal/own-text/imported material, standalone deck contents, the full examples corpus beyond the three selected family bindings, future dynamically generated text, exhaustive runtime-resolved senses, qualified historical decomposition, complete authored families, or native course/reader behavior. Dictionary date and a source URL are provenance, not proof that a learner-facing interpretation has passed editorial review.

The focused pure checks cover identity separation, repeated/supplementary source occurrences, contextual sense bounds, absent versus authored family data, unchanged-byte pin enforcement, repository-output refusal, real-source denominators and deterministic output. They provide **no browser, IndexedDB, phone, learning-effectiveness or release evidence**.

## Slice 5 successor

The retained slice-4 numbers above describe its immutable snapshot. Slice 5 adds the separately authored 職・識・織 unit: **51 characters / 13 units / 103 primary and alternate word records**. The original 48 targets and 96 graded prompt contracts keep their identities and answers. The new unit adds six tasks (three keyword choices, three whole-word readings); its retained sentences remain teaching material, not admitted source-transfer tasks. A new external inventory and input hashes accompany READY-05.md; the earlier inventory is preserved. Reference and geometry coverage do not expand with a course unit.
