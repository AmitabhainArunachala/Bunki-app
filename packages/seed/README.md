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

| Source            | Licence       | State                                     | Covers                                                    |
| ----------------- | ------------- | ----------------------------------------- | --------------------------------------------------------- |
| JMdict (EDRDG)    | CC BY-SA 4.0  | **verified (primary source)**, 2026-07-28 | lexeme `reading`, `partOfSpeech`, `senses`                |
| KANJIDIC2 (EDRDG) | CC BY-SA 4.0  | **verified (primary source)**, 2026-07-28 | kanji readings, meanings, grade, stroke count, freq, JLPT |
| KanjiVG           | CC BY-SA 3.0  | **verified (primary source)**, 2026-07-27 | stroke SVGs; stroke counts, components, radicals          |
| Tatoeba           | CC BY 2.0 FR  | **verified (primary source)**, 2026-07-28 | example sentences, with per-sentence contributor credit   |
| This project      | pending OD-09 | original work                             | the eight worked examples, passage, grammar, selections   |

Everything is now taken from the licensor's own host. Full detail, verbatim
licence texts, per-file digests, the retrieval log and the closed deferrals:
[`LICENSES.md`](LICENSES.md). The machine-readable binding of source → licence
text lives in `data/licences.json`, enforced by `test/edrdg.test.ts` and
`test/dictionary.test.ts`.

Every sourced field carries its **real** upstream identifier — a JMdict
`ent_seq`, a KANJIDIC2 literal, a Tatoeba sentence id and contributor. None is a
placeholder.

### The licence version was wrong, and that is why this matters

The previous round could not reach `www.edrdg.org` and took EDRDG's licence
statement from a redistributor that bundled it with the data. That copy said
**CC BY-SA 3.0**. The licensor's own statement says **V4.0**. The round recorded
the doubt as open item D-1a instead of guessing, and reading the real statement
settled it — the package now says 4.0 everywhere.

This is the argument for the rule at the top of `LICENSES.md`: fetch the licence
from the licensor, not from whoever is reachable. Nothing inside a package can
detect that its licence text is a version behind.

## The two tiers

`data/*.json` is the **§8 fixture tier** — 16 lexemes, 10 kanji, the canonical
分岐 target and the hand-written integration passage. Controller §8 fixes its
size at 12–20 lexemes and `test/dataset.test.ts` enforces that; the imports below
did not change its size, only the truth of its contents.

`data/dictionary/` is the **imported tier**, written by the importer and never by
hand. At the committed parameters it holds 3,000 lexemes, the 1,241 kanji they
use, a verbatim KanjiVG stroke file for every one of them, and 2,000 Tatoeba
sentence pairs. It is separate precisely so that growing the dictionary can never
be mistaken for growing the seed fixtures.

## Re-running or widening the import

The importer is the deliverable; the JSON is its output. One command reproduces
or expands everything:

```bash
# Licences first — a source with no verbatim licence text on disk cannot ship.
NODE_USE_ENV_PROXY=1 node packages/seed/scripts/import-sources.mjs --licences

# The full pipeline. Change one number to change the scale.
NODE_USE_ENV_PROXY=1 node packages/seed/scripts/import-sources.mjs --lexemes=3000
NODE_USE_ENV_PROXY=1 node packages/seed/scripts/import-sources.mjs --lexemes=all
```

`NODE_USE_ENV_PROXY=1` is required in this environment: Node's built-in `fetch`
ignores `HTTPS_PROXY` without it and the downloads fail with a misleading 403.

Raw archives (~200 MB) are cached in the gitignored `packages/seed/.cache/` and
are **not** committed. Their sha256 is recorded in
`data/dictionary/manifest.json`, so a shipped gloss can still be traced to the
exact upstream bytes it came from.

If a needed asset's license cannot be verified, that is a controller §21.3 stop
condition (unresolved source licensing) — not a judgement call. It is not
triggered here: every shipped byte is either covered by a verbatim licence text
in `licenses/` or is this project's own work under the pending OD-09 decision.

## Commands

```bash
npm run test                                              # includes this package's assertions
node packages/seed/scripts/import-sources.mjs --check      # offline: manifest vs files on disk
node packages/seed/scripts/import-sources.mjs --verify-fixtures  # network: §8 fixtures vs current upstream
node packages/seed/scripts/fetch-kanjivg.mjs --check        # network: strokes vs pinned upstream
```

`--verify-fixtures` is worth running before trusting the fixture tier's
provenance. Run against the 2026-07-28 files it found seven fields still carrying
values from the 2021 redistribution — including 分岐点, whose senses upstream had
rewritten entirely — and those were re-derived rather than relabelled.

## Status

WP-04 dataset complete and re-sourced from primary hosts. **D-1, D-1a, D-2 and
D-3 all closed.** D-4 (upstream moves on; this is a dated snapshot) is open by
nature and is what `--verify-fixtures` exists to answer.

Not done, and deliberately: a **Sources / About screen**. §3 of the EDRDG licence
requires that a smartphone or tablet app acknowledge the files on a separate
screen reached from a menu, not only inline. The Phase-0 surface is Expo Web,
where the "acknowledgement on each screen display" clause governs and is
satisfied by `SEED_ENTRY_DISCLOSURE` on every word and kanji page. The dedicated
screen needs `apps/app/app/_layout.tsx` and the navigation map, which the
orchestration spec assigns to the shell owner — so it is raised as a coordination
request rather than edited across that boundary.
