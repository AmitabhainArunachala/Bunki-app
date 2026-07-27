# @bunki/seed

**Owner WP:** WP-04 (dataset, `LICENSES.md`, provenance completeness test).

**LICENSE: pending operator decision** (controller §4, OD-09).

> **This package is the one deliberate exception to the license-constraint rule.**
> Controller §4 accepts share-alike seed data (REQ-SRC-02, DL-33) **confined to
> `packages/seed/`**. Share-alike source data must not leak into any other
> package. Nothing here may become a dependency of `@bunki/domain`.

## What this package is

A small, honest, hand-assembled dataset:

|                                                    | Count | Where                                         |
| -------------------------------------------------- | ----- | --------------------------------------------- |
| Lexemes                                            | 16    | `data/lexemes.json`                           |
| Kanji (incl. 分 and 岐 for the OD-02 fixture 分岐) | 10    | `data/kanji.json`                             |
| Grammar constructions                              | 3     | `data/grammar.json`                           |
| Example sentences                                  | 8     | `data/sentences.json`                         |
| Integration passage (160 characters)               | 1     | `data/passages.json`                          |
| KanjiVG stroke SVGs                                | 10    | `data/strokes/`, manifest `data/strokes.json` |

It is a **Phase-0 seed, not a dictionary.** Controller §8 and §2 both forbid a
full JMdict/KANJIDIC2 import in Phase 0.

The set is deliberately closed: every headword decomposes into seed kanji only,
and every seed kanji is used by at least one headword, so no word page links to a
kanji page that does not exist and no kanji sits unreachable. `test/dataset.test.ts`
asserts both directions.

Runtime dependencies: **none.** `zod` is a devDependency, used only in
`test/schema.test.ts`.

## How provenance is stored

Every data-bearing field of every record names a provenance source, and the
loader materialises the full REQ-SRC-01 record onto the field — so a consumer of
`seedDataset` sees a resolved `ProvenanceRecord` per field, never a pointer it has
to know how to follow.

```json
// data/kanji.json — one record, several sources (the REQ-SRC-01/A7 case)
{
  "character": "分",
  "strokeCount": 4,
  "onReadings": ["ブン", "フン", "ブ"],
  "fieldProvenance": {
    "character": "bunki-selection",
    "strokeCount": { "ref": "kanjivg-derived", "source_entry_id": "kanji/05206.svg" },
    "onReadings": "bunki-editorial"
  }
}
```

The sources themselves live once in `data/provenance.json`. The registry exists
because the alternative — copying an identical eleven-key object next to ~200
fields by hand — drifts, and drifted provenance is worse than none. A field may
override only `confidence`, `review_status`, `source_entry_id` and `notes`;
`source`, `source_version`, `license`, `attribution` and `modification_status`
are **not** overridable, so no field can quietly relicense itself.

Completeness is enforced three independent ways, so a single mistake cannot pass:

1. **The type system** — each record type is `fields + id + ProvenanceByField<fields>`,
   so a new data field with no provenance entry is a compile error.
2. **The loader** (`src/validate.ts`, dependency-free) — rejects an unprovenanced
   field, an unknown source reference, a provenance entry for a field that does
   not exist, and a forbidden override, at import time.
3. **The tests** — `test/provenance.test.ts` walks the resolved dataset _and_ the
   raw JSON on disk independently of the loader, and `test/schema.test.ts`
   re-states the same rules in zod so a loader bug and a schema bug would have to
   coincide.

## Boundary rules (controller §8)

- **Every field carries provenance** per REQ-SRC-01. The completeness test walks
  all seed records and fails on any field that cannot name its source. It feeds T-15.
- **`LICENSES.md` is verbatim, not paraphrased.** Attribution text is copied from
  the primary source, with source URLs and retrieval dates recorded — not from a
  summary, not from memory. Where a primary source could not be reached, the item
  is recorded as deferred and **no content from it ships**.
- **The UI never claims complete coverage.** `SEED_COVERAGE_DISCLOSURE` for
  empty-search states, `SEED_ENTRY_DISCLOSURE` for word and kanji pages
  (controller §8, REQ-GATE-03).
- **No scraped content.** No web/YouTube scraping, no Firehose connectors
  (controller §2).
- **Strokes are fetched, never drawn.** `scripts/fetch-kanjivg.mjs` downloads them
  from a pinned upstream commit; `test/strokes.test.ts` re-hashes every file and
  re-derives every extracted value from the bytes.

## Sources actually shipped

| Source                     | Licence       | State                                                         | Covers                                                              |
| -------------------------- | ------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| KanjiVG                    | CC BY-SA 3.0  | **verified** against the project's own repository, 2026-07-27 | stroke SVGs; stroke counts, components, radicals                    |
| This project               | pending OD-09 | original work                                                 | sentences, passage, grammar, readings, senses, meanings, selections |
| JMdict / KANJIDIC2 (EDRDG) | CC BY-SA 4.0  | **deferred (D-1)** — host unreachable, **nothing shipped**    | —                                                                   |
| Tatoeba                    | CC BY 2.0 FR  | **deferred (D-2)** — host unreachable, **nothing shipped**    | —                                                                   |

Full detail, verbatim licence texts, per-file digests, the retrieval log and both
deferred items: [`LICENSES.md`](LICENSES.md).

Readings and senses are hand-assembled and carry `review_status: "unreviewed"`
with `source_entry_id: null` — they are deliberately **not** labelled JMdict or
KANJIDIC2, because EDRDG's hosts were unreachable and inventing entry sequence
numbers would manufacture the audit trail this package exists to make trustworthy.

If a needed asset's license cannot be verified against its primary source, that
is a controller §21.3 stop condition (unresolved source licensing) — not a
judgement call. That condition is not triggered here: the unverifiable sources
simply contribute nothing.

## Commands

```bash
npm run test                                        # includes this package's 87 assertions
node packages/seed/scripts/fetch-kanjivg.mjs --check # re-verify strokes against pinned upstream (network)
```

## Status

WP-04 dataset complete; D-1 and D-2 open as recorded above.
