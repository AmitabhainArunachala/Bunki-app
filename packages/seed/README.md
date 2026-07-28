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

Every field of every imported record names a source **registered in
`data/provenance.json`** — `edrdg-jmdict`, `edrdg-kanjidic2`, `kanjivg-verbatim`,
`bunki-computed`, `bunki-selection`, and per sentence half `tatoeba-japanese` /
`tatoeba-english`. The map is per field, not per file, because these records mix
sources: a kanji record's readings are KANJIDIC2's and its `strokeSvg` is
KanjiVG's, and a sentence pair is two works by two people. `src/validate.ts` fails
closed on an id it does not know, so an unregistered reference would make the
whole tier unloadable; `test/dictionary.test.ts` resolves every id against the
registry offline, and the importer refuses to emit before
`assertProvenanceRegistered()` passes.

**Tatoeba attribution is a gate, not a field.** The export writes MySQL's NULL
sentinel — the two characters `\N` — in the username column for an ownerless
sentence, and 100,087 of the 248,821 Japanese rows are like that. CC BY 2.0 FR
cannot be complied with for a work whose author cannot be named, so a pair with an
unnamed contributor on either half is **not shipped**; the count is recorded in
the manifest's `deferred` list and in
`counts.sentencePairsDroppedWithoutNamedContributor`. Every sentence that does
ship names both of its contributors.

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
npm run test                                                     # includes this package's assertions
node packages/seed/scripts/import-sources.mjs --check            # offline: manifest vs files on disk
node packages/seed/scripts/import-sources.mjs --verify-reproducible  # archives: re-derive and diff
node packages/seed/scripts/import-sources.mjs --verify-fixtures  # network: §8 fixtures vs current upstream
node packages/seed/scripts/fetch-kanjivg.mjs --check             # network: strokes vs pinned upstream
```

### What `--check` proves, and what it does not

`--check` compares the committed bytes to the digests the importer recorded and
verifies that every shipped source still has its verbatim licence text on disk at
its recorded digest. That is **tamper-evidence**: it detects a file edited after
the import. It is **not** a reproducibility check, because it never re-derives
anything from upstream — a file emitted by an older version of the importer keeps
matching its own recorded digest forever.

That gap was real, not hypothetical. The committed `data/dictionary/lexemes.json`
once carried duplicate glosses in 83 of 3,000 records while the importer
deduplicated them, so the shipped data was not the script's output and `--check`
said MATCH throughout.

`--verify-reproducible` is the check that closes it: it re-runs the whole
pipeline from the cached archives — at the parameters the manifest itself
recorded, not at whatever you type — into a scratch directory, and diffs every
emitted file byte for byte against the committed one. It writes nothing under
`data/` and exits 1 on any difference, so "the shipped data is this script's
output" is a claim that can fail. It needs the archives in `--cache`; with them
present it runs in about a minute and no network.

`--verify-fixtures` is worth running before trusting the fixture tier's
provenance. Run against the 2026-07-28 files it found seven fields still carrying
values from the 2021 redistribution — including 分岐点, whose senses upstream had
rewritten entirely — and those were re-derived rather than relabelled.

## Status

WP-04 dataset complete and re-sourced from primary hosts. **D-1, D-1a, D-2 and
D-3 all closed.** D-4 (upstream moves on; this is a dated snapshot) is open by
nature and is what `--verify-fixtures` exists to answer.

**The Sources / About screen coordination request is closed.** §3 of the EDRDG
licence requires that a smartphone or tablet app acknowledge the files on a
separate screen reached from a menu, not only inline. That screen needed
`apps/app/app/_layout.tsx` and the navigation map, which the orchestration spec
assigns to the shell owner, so it was raised across the boundary rather than
edited. The shell surface was granted for this wave and the request executed: the
app's **About & diagnostics** destination — one of the four in the persistent
navigation shell — now carries a "Sources & licences" section listing every
source in the provenance registry with its licence and attribution, beside the
entry disclosure itself.

**"Each screen display" means each, and this package got that wrong twice.** The
claim was once that the clause was satisfied by `SEED_ENTRY_DISCLOSURE` on every
word and kanji page. The **search screen** also displays words from the files — a
result row is a reading, a set of senses and a part of speech, every one of them a
JMdict field — and it carried no acknowledgement at all, because the only notice
it rendered was the coverage disclosure, which appears exactly when nothing
matched. That was fixed by adding one route to a list. The **canvas** renders the
target's headword and reading inside the passage and was still missing, which a
verifier found by driving a browser.

Both misses were the list, not the rule, so the list is gone. This package now
exports `FIELDS_REQUIRING_ON_SCREEN_ATTRIBUTION`, derived from its own records by
asking which fields carry a source whose licence demands on-screen attribution.
`apps/app/test/edrdg-acknowledgement.test.ts` walks every destination in the
navigation map, follows its imports, and fails any screen that can reach one of
those fields without rendering the acknowledgement — with a negative control, so
it cannot pass by being vacuous. `apps/app/e2e/edrdg-acknowledgement.spec.ts`
then walks the loop in a browser and asserts the licensor is named in the visible
text of each screen, including the three that exist only after a target is
promoted and which no URL-driven route list ever reached.
