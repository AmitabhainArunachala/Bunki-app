# @bunki/seed

**Owner WP:** WP-04 (dataset, `LICENSES.md`, provenance completeness test).

**LICENSE: pending operator decision** (controller §4, OD-09).

> **This package is the one deliberate exception to the license-constraint rule.**
> Controller §4 accepts share-alike seed data (REQ-SRC-02, DL-33) **confined to
> `packages/seed/`**. Share-alike source data must not leak into any other
> package. Nothing here may become a dependency of `@bunki/domain`.

## What this package is

A small, honest, hand-assembled dataset — roughly 12–20 lexemes, 8–12 kanji
(including 分 and 岐, which support the default canonical fixture 分岐 per OD-02),
2–3 grammar constructions, 6–10 example sentences, one KanjiVG-derived stroke SVG
set, and one hand-written thematic integration passage (~100–200 characters).

It is a **Phase-0 seed, not a dictionary.** Controller §8 and §2 both forbid a
full JMdict/KANJIDIC2 import in Phase 0.

## Boundary rules (controller §8)

- **Every field carries provenance** per REQ-SRC-01. A provenance-completeness
  test walks all seed records and fails on any field that cannot name its source.
  This test feeds T-15.
- **`LICENSES.md` is verbatim, not paraphrased.** Attribution text is copied from
  the primary source, with source URLs and retrieval dates recorded. WP-04
  verifies each license text against the primary source — not against a summary.
- **The UI never claims complete coverage.** Empty-search states must say the
  dataset is a Phase-0 seed (controller §8, REQ-GATE-03).
- **No scraped content.** No web/YouTube scraping, no Firehose connectors
  (controller §2).

## Expected sources and licenses

| Source                       | License                                      | Notes                                                   |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| JMdict / KANJIDIC2 subsets   | EDRDG CC BY-SA 4.0                           | attribution text verbatim in `LICENSES.md`              |
| KanjiVG                      | CC BY-SA 3.0                                 | stroke SVGs for seed kanji                              |
| Tatoeba sentences            | CC BY 2.0 FR                                 | per-sentence attribution                                |
| Operator's seeded encounter  | labeled with its real source                 | REQ-SRC-01                                              |
| Thematic integration passage | authored by this project, explicitly labeled | feeds the §10 screen-5 canvas with no extra AI exchange |

If a needed asset's license cannot be verified against its primary source, that
is a controller §21.3 stop condition (unresolved source licensing) — not a
judgement call.

## Status

WP-01 skeleton only. `data/` and `LICENSES.md` are WP-04's deliverables.
