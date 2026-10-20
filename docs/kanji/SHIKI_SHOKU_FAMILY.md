# First family: 戠 → 職・識・織

This is a source and pure-API slice for the world engine. It supplies one attributed family, not a new course, renderer, historical reconstruction or learner record. Native presentation and source/task adapters remain unqualified.

The asset is `prototypes/corridor/data/share_alike/kanji-family.json`; the pure module is `kanji-family.js`. The existing production asset list, deferred script list, worker cache list and standalone source bundler include them. No standalone HTML or site was generated for this slice.

## What is attested

The three cited Kanjipedia formation entries, attributed there to **角川新字源 改訂新版**, identify 戠 as a sound component. The six role edges are factual paraphrases with per-edge citations, separate from geometry.

| Member | Selected standard on-readings | Meaning-component account                                                                                                                                                            | Source                                           |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 職     | ショク                        | 耳 is associated with hearing/knowing in the dictionary's formation account, followed by an extension to office or charge. This does not make “ear” a direct synonym for employment. | [職](https://www.kanjipedia.jp/kanji/0003558300) |
| 識     | シキ                          | The account associates 言 with understanding and remembering.                                                                                                                        | [識](https://www.kanjipedia.jp/kanji/0002903800) |
| 織     | ショク・シキ                  | The account associates 糸 with weaving cloth.                                                                                                                                        | [織](https://www.kanjipedia.jp/kanji/0003557300) |

These are attributed lexicographical accounts. They are not a newly verified archaeological lineage. Source access date is **2026-10-21**; raw page bytes were not archived and no page hash is claimed. No long dictionary passage is copied.

The selected readings do not replace the local raw arrays. In particular, the existing 職 array contains ショク・ソク; Kanjipedia lists ショク normally and marks シキ outside the standard table. Both claims retain their own provenance. 識 likewise retains its separately labelled outside-table readings. A family association does not determine a word's reading.

| Exact word/reading | Retained sentence        | Retained translation                            | Local corpus occurrence                  |
| ------------------ | ------------------------ | ----------------------------------------------- | ---------------------------------------- |
| 職業・しょくぎょう | 彼の職業は医師だ。       | He is a doctor by profession.                   | SID 6284; `s-03.json`, row 284, token 2  |
| 知識・ちしき       | 知識は力なり。           | Knowledge is power.                             | SID 1369; `s-00.json`, row 1369, token 0 |
| 組織・そしき       | この組織は戦後生まれた。 | This institution came into being after the war. | SID 8906; `s-04.json`, row 906, token 1  |

Sentences and translations are copied from the existing **Tanaka Corpus / Tatoeba Project (EDRDG examples.utf)** bundle, whose manifest declares **CC BY 2.0 FR** and [corpus attribution](https://www.edrdg.org/wiki/index.php/Tanaka_Corpus). The asset retains full raw rows, exact word-token readings, local shard SHA-256/row/token coordinates and manifest attribution. `build_examples.py` discarded the original corpus sentence IDs: these remain explicitly null. There is no invented Tatoeba sentence URL, contextual lexical sense ID or per-character kana alignment. Whole-word readings agree with the exact pinned dictionary records; this is not independent admission of the tokenizer's other sentence readings.

## Identity, relationships and geometry

There are **19 typed nodes and 18 edges**:

- Seven canonical kanji identities: 戠・職・識・織・耳・言・糸.
- Six distinct component occurrences in their own host glyphs.
- Three exact word/reading pairs and three retained sentence-token occurrences.
- Three `phonetic-component`, three `semantic-component`, six `source-component-occurrence`, three `word-contains-kanji` and three `attested-word-occurrence` edges.

The reference types are deliberately distinct:

```js
{ type: 'kanji', id: '織' }
{ type: 'word', id: '組織', reading: 'そしき' }
{ type: 'component-occurrence', id: existingKanjiVGOccurrenceId }
{ type: 'sentence-occurrence', id: exactBundledExampleOccurrenceId }
```

For a word, both spelling and reading are required. Its existing reference-catalog key is `JSON.stringify([reference.id, reference.reading])`; its canonical app target is separately `{type: 'word', id: reference.id}` after resolving that exact catalog entry. A different or absent reading must not alias the known word. These references are not new scheduler/card IDs.

A component occurrence preserves the existing structure-module ID:

```text
["kanjivg-occurrence", upstream-commit, containing-literal,
 raw-svg-sha256, group-path]
```

A family sentence occurrence is local evidence identity:

```text
["bundled-example", repository-relative-shard-path, shard-sha256,
 row-index, token-index]
```

It is not a `teacher-context`, confirmed source-practice plan, learner observation or claim of an upstream sentence ID. A word's `scalarIndex` uses Unicode scalars within the word spelling; corpus `tokenIndex` uses the compact row's token array. Neither is a source-practice UTF-16 answer span.

All six geometry edges bind their own retained KanjiVG SVGs at commit `61e39cfc29724132a6f8823b166296932985a0ff`, **Ulrich Apel / KanjiVG, CC BY-SA 3.0**. The three contextual 戠 occurrences each have **12 paths**. Standalone 戠 has a canonical reference and a declared stroke count but no retained paths or standalone fixture in this dataset. Never create its geometry from that count or borrow another host's right half.

The existing tree also retains 音 and split 戈 geometry. In 織, one 戈 stroke lies within 音/立; the other three belong to the direct 戠→戈 child. This slice authors no 音/戈 teaching edge, complete-戈 union, non-overlap assertion, font-mesh binding or historical form. Standalone 糸 has stroke paths but no authored grouping. Missing coverage remains visible.

## Pure API and W5 adapter

```js
const structure = BunkiKanjiStructure.createModel({
  kanji: kanjiDocument.kanji,
  strokes: strokeDocument.strokes,
  grouping: structureDocument,
});
const family = BunkiKanjiFamily.createModel({
  data: familyDocument,
  kanji: kanjiDocument.kanji,
  words: wordsDocument.words,
  structure,
});

family.family(); // immutable descriptor
family.node({ type: 'kanji', id: '織' }); // immutable node or null
family.edgesFor({ type: 'kanji', id: '戠' }, 'phonetic-component');
family.example(sentenceReference); // exact occurrence only
family.geometry(componentReference); // exact host's ordered paths
```

`catalog()` exposes the immutable full snapshot. A missing structure model returns `status: "unavailable"` for component geometry; supplied mismatched geometry throws. `geometry()` accepts only component-occurrence references; it does not silently navigate from a canonical component to one arbitrary host. The model snapshots its inputs and projected paths. It performs no network, DOM, storage, enrollment, scheduling or inferred relationship work.

Runtime checks enforce typed endpoints, exact raw word records/readings, sentence IDs/coordinates/attribution, evidence joins, role-source kinds and host-specific geometry. They do not establish the truth of a cited web page or recompute retained file hashes. The offline tests and inventory rehash source files, resolve source locators and compare retained rows. Independent linguistic acceptance must be bound to the exact asset separately.

The immutable handback's Git head plus the family and structure SHA-256 values identify this graph snapshot. W5 must preserve that tuple in its adapter and reject a mismatch; there is no implicit “latest” graph revision or automatic cross-revision migration. Edge IDs are authored strings scoped by that snapshot. Existing structure parent/child pairs remain their own source-tree relations; they do not inherit a family role.

W5 owns mapping its proposed `GraphPort` to these exports, selecting each destination's own occurrence, return capabilities, rendering and depth semantics. The technical `$` wrapper remains retained evidence; `$/0` is the glyph root. W3 owns source truth and later reviewed relationship/task adapters.

**First-family course tasks remain unavailable.** The 48-character pilot has no authored 職・識・織・戠・糸 targets. Use `taskTarget: null`; do not invent a course ID or turn sentence exposure into a graded attempt. A future source-practice task must separately admit its live source context/reading cue and confirm an existing plan under the real host contract. The three retained examples do not grant that admission. Course rows stay off the scheduler; W4 remains the sole gated grading owner.

## Why `learning-core.mjs` is absent from Git

The module is generated output by design, not a missing handwritten file. `scripts/build-reading-module.mjs` exists in Git; this source-only worktree's sparse selection does not materialize it or all `packages/` inputs. Reading a file from another worktree is not a replacement for pinning its Git bytes.

The exact generation path, inspected from the frozen source, is:

1. `scripts/build-corridor-site.mjs` calls `buildCorridorModules(repo)` from `scripts/build-reading-module.mjs`.
2. Its learning entry is `scripts/corridor-learning-entry.ts`, exporting domain source-practice contracts, event parsing and the persistence hash function.
3. `buildCoreModule(repo, 'domain', 'modules/learning-core.mjs', 'scripts/corridor-learning-entry.ts')` uses **esbuild 0.28.2**, checked against `package.json`, with bundling, browser ESM, targets Safari 17/Chrome 120, UTF-8, minification, inline legal comments, no source map and `write: false`.
4. The existing site builder stages the returned bytes at `<site>/modules/learning-core.mjs` and records compiler/input hashes with the other generated modules. It rechecks inputs before finalizing the build.

After a fresh explicit build release/resource admission, the existing command on the complete exact checkout is:

```sh
node scripts/build-corridor-site.mjs --out /absolute/new/path/under/.dharma/site
```

This command was **not executed** for slice 4. Materialize the tracked build inputs and use that checkout's pinned dependencies first. Do not commit generated runtime bytes, copy an unbound live bundle, create a mock module, or claim the full sentence API executed from Git objects. W5's current source-only mirror remains limited until a preserved build is admitted.

## Verification and remaining work

Run `node --test prototypes/corridor/tools/test-kanji-family.mjs` for offline source and adversarial join controls, plus the inventory's focused tests and affected course/route suites. Runtime receipts live outside the repository. The tests preserve distinctions between malformed-data refusal, source-hash parity, independent review and native behavior.

W5 receives the asset/API snapshot for its real-data probe. W2/Kimi review this exact slice; Grok cross-checks. Source/font correspondence, first-family task authoring, historical forms, full-source admission, live host return completion, phone visuals and learning-effectiveness evidence remain separate work. Nothing here is a world-class-completion or production-release claim.
