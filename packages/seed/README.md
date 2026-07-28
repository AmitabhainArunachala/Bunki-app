# @bunki/seed

**Owner WP:** WP-04 (dataset, `LICENSES.md`, provenance completeness test).

**LICENSE: pending operator decision** (controller §4, OD-09).

> **This package is the one deliberate exception to the license-constraint rule.**
> Controller §4 accepts share-alike seed data (REQ-SRC-02, DL-33) **confined to
> `packages/seed/`**. Share-alike source data must not leak into any other
> package. Nothing here may become a dependency of `@bunki/domain`.

## What this package is

A small, honest dataset: real licensed dictionary content for the lexical
layers, this project's own writing for the text layers, each labelled as what it
is.

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

| Source            | Licence       | State                                                                    | Covers                                                   |
| ----------------- | ------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| KanjiVG           | CC BY-SA 3.0  | **verified (primary source)** against the project's own repo, 2026-07-27 | stroke SVGs; stroke counts, components, radicals         |
| JMdict (EDRDG)    | CC BY-SA 3.0  | **licensed redistribution**, 2026-07-28                                  | lexeme `reading`, `partOfSpeech`, `senses`               |
| KANJIDIC2 (EDRDG) | CC BY-SA 3.0  | **licensed redistribution**, 2026-07-28                                  | kanji `onReadings`, `kunReadings`, `meanings`            |
| This project      | pending OD-09 | original work                                                            | sentences, passage, grammar, selections, computed values |
| Tatoeba           | CC BY 2.0 FR  | **deferred (D-2)** — unreachable, **nothing shipped**                    | —                                                        |

Full detail, verbatim licence texts, per-file digests, the retrieval log and the
open deferrals: [`LICENSES.md`](LICENSES.md). The machine-readable binding of
source → licence text lives in `data/licences.json` and is enforced by
`test/edrdg.test.ts`.

Every EDRDG-sourced field carries its **real** upstream identifier — a JMdict
`ent_seq`, a KANJIDIC2 literal — in `source_entry_id`. None is a placeholder.

`review_status` is `licensed-redistribution`, not `primary-source-verified`,
and the difference is load-bearing: `www.edrdg.org` is still refused by the
egress proxy, so the data and EDRDG's own licence statement were taken together
from one pinned, sha256-verified artefact (`jamdict-data` 1.5, the `jamdict`
project's own data package). The licensor's host was never reached, so the
statement's currency is unverified and is recorded as unverified.

Example sentences remain **project-authored**. Tatoeba's hosts are blocked, the
pinned database contains no examples, and no reachable host carries the
CC BY 2.0 FR text — so under "licence first, data second" nothing is shipped
from it and nothing is labelled with it.

If a needed asset's license cannot be verified, that is a controller §21.3 stop
condition (unresolved source licensing) — not a judgement call. It is not
triggered here: every shipped byte is either covered by a verbatim licence text
in `licenses/` or is this project's own work under the pending OD-09 decision.

## Commands

```bash
npm run test                                         # includes this package's 103 assertions
node packages/seed/scripts/fetch-kanjivg.mjs --check  # re-verify strokes against pinned upstream (network)
node packages/seed/scripts/fetch-edrdg.mjs --check    # re-verify every JMdict/KANJIDIC2 value (network)
```

## Status

WP-04 dataset complete. D-1 (JMdict/KANJIDIC2 content and attribution text)
**closed**. D-1a (confirm the current licence version at EDRDG itself) and D-2
(Tatoeba) open as recorded above.
