# JLPT and Kanji Kentei reference libraries

## Operator scope

Build exhaustive, browsable stock reference libraries, separate from
learner-selected My Study, AI-tutor custom material, lessons, and mock papers.
This feature indexes all the committed classified source records rather than
showing an eighteen-entry preview or silently ignoring supplementary sources.

The canonical runtime is `prototypes/corridor/`. The implementation does not
edit frozen specifications, source corpus files, existing dictionary files,
lesson populations, the learner-store schema, or the scheduler. It removes the
old reference view's bulk “memorize next twenty” action.

## What the learner can do

- Open **Reference library** from the reading shelf.
- Switch JLPT vocabulary and kanji; choose any N5–N1 or unassigned collection.
- Browse every Kentei grade and the explicit `1/準1級`, `配当外`, and unassigned bins.
- Search the entire selected collection by headword, reading, or English
  meaning. Full-width and kana variants normalize for search, never identity.
- Read one hundred entries per page, jump to any page, and use first,
  previous, next, and last controls at the top and bottom.
- Sort by reading or printed headword.
- Open ordinary dictionary records in the existing entry sheets. Closing
  returns to the same page, query, scroll position, and keyboard invoker.
- Inspect supplementary records in a read-only source sheet. They do not
  become incomplete study cards just because reference metadata is available.
- Move separately to My Study or Mock papers. Looking at the library never
  enrolls items or awards mastery.

## Verified corpus coverage

### JLPT

| Level      | Vocabulary memberships | Kanji memberships |
| ---------- | ---------------------: | ----------------: |
| N5         |                    763 |               103 |
| N4         |                    716 |               181 |
| N3         |                  2,157 |                 0 |
| N2         |                  1,872 |               739 |
| N1         |                  2,279 |               956 |
| Unassigned |                 16,932 |             4,931 |

There are **7,783 distinct classified form/reading pairs** and 7,787 level
memberships. Four pairs have conflicting source classifications, so they occur
in each attested level with a visible disagreement note. Vocabulary identity is
the exact printed form and reading; different readings remain separate records.
The index contains 24,715 word pairs including the unassigned collection.

The sources contain 1,979 JLPT-tagged kanji. The empty N3 bin is disclosed
rather than populated through guesswork. Legacy pre-2010 KANJIDIC levels are
not relabeled as modern JLPT levels.

These are source classifications, not an official exhaustive test syllabus.
The current JLPT does not publish vocabulary, kanji, and grammar specification
lists ([official guidebook, Q7–Q8](https://www.jlpt.jp/e/reference/pdf/guidebook_s_e.pdf)).

### Kanji Kentei

| Assigned grade | Reference memberships |
| -------------- | --------------------: |
| 10級           |                    80 |
| 9級            |                   160 |
| 8級            |                   200 |
| 7級            |                   202 |
| 6級            |                   193 |
| 5級            |                   191 |
| 4級            |                   313 |
| 3級            |                   284 |
| 準2級          |                   328 |
| 2級            |                   185 |
| 準1級          |                   858 |
| 1級            |                 2,675 |
| 1/準1級        |                   644 |
| 配当外         |                   474 |
| Unassigned     |                   129 |

All **6,787 full-table source rows** are represented. They resolve to 6,781
distinct source-tagged records: 6,244 printed glyphs and 537 records without a
Unicode glyph, with six cross-grade conflicts retained. Those 537 records
display their source IDs and an explicit missing-glyph label; they are not
pretended to be drawable characters. An additional 129 bundled glyphs have no
Kentei grade and remain in the unassigned bin.

Pinned KANJIDIC metadata fills advanced characters absent from the original
2,453-character app grade table. After enrichment, 630 source-tagged records
still lack readings and 621 lack meanings, including the 537 glyphless records.
The library does not fabricate those fields.

The cleanup also restores eight previously omitted kun-reading fields:
**典、尺、慨、旺、論、賓、赦、頒**. All eight are already attested in
committed kotobako metadata and corroborated by the pinned KANJIDIC archive.
The old projection selected a row only when _both_ on and kun were absent,
so these partial records were skipped. Existing nonempty readings and meanings
are unchanged; field-level `metadataSources` identify the actual provider.
Absence of on or kun alone is not evidence that a character must have that
reading type.

### Remaining gap census after cleanup

| Gap                                                                           |      Count | Disposition                                                                     |
| ----------------------------------------------------------------------------- | ---------: | ------------------------------------------------------------------------------- |
| Modern N3 kanji classifications                                               | 0 attested | No licensed committed modern N3 list; no legacy-level splitting                 |
| Kentei records without a Unicode glyph                                        |        537 | Keep source ID, grade and species relationship; no borrowed glyph or metadata   |
| Visible Kentei glyphs without Japanese readings                               |         93 | 84 literals absent from the pinned archive; 9 present without Japanese readings |
| Visible Kentei glyphs without English meanings                                |         84 | Exact literals absent from the pinned archive                                   |
| Kentei grade-unassigned bundled glyphs                                        |        129 | No grade inferred                                                               |
| Classified vocabulary exact form/reading pairs without a bundled JMdict match |        683 | Retain original runtime reference; not a broken canonical target                |
| Classified vocabulary exact form/reading pairs with multiple JMdict matches   |        112 | Preserve every candidate; never select the first homograph                      |

The nine reading gaps with a pinned literal are **檔、歷、毗、沪、欄、廊、殺、類、隆**.
Neither Unicode normalization nor a related form supplies authority to copy
readings, meanings or grades into these records. The complete gap lists and
eight field-level repairs are emitted in `coverage.json`; no external corpus
was added during this cleanup.

Counts above are **assigned-grade bins**, not cumulative examination targets.
The official advanced scope is approximately 3,000 characters for 準1級 and
6,000 for 1級; neither source-row totals nor variant-form counts establish
official exam completeness ([official grade overview](https://www.kanken.or.jp/kanken/grades/overview/)).

## Data and authority boundaries

`reference-core.js` is a pure index over existing runtime dictionaries plus
`data/share_alike/reference-extra.json`. The supplementary data is isolated
from application code and preserves source/license attribution. Every
classification can be traced back to its source record.

- The supplement now preserves all **18,548 classified vocabulary source
  rows**: 5,169 kotobako, 6,692 Drift and 6,687 wbig. Matching an existing level
  is no longer a reason to discard a source ID, alternate reading or gloss.
  It also preserves all 1,979 kotobako kanji JLPT attestations. The counts above
  use the exact form/reading identity, rather than the earlier printed-key index.
- Kentei facts come from the committed CC0
  [mimneko/kanji-data](https://github.com/mimneko/kanji-data) projection, pinned
  at `0be3577f7939ec85d2b4e373a7a94262e7449e13`. Dictionary page-order fields
  remain excluded.
- Readings and meanings retain
  [EDRDG's JMdict/KANJIDIC attribution](https://www.edrdg.org/) and
  [CC BY-SA 4.0 terms](https://creativecommons.org/licenses/by-sa/4.0/).
- Supplemental KANJIDIC metadata uses the
  [pinned 3.6.2+20260803141815 JSON release](https://github.com/scriptin/jmdict-simplified/releases/tag/3.6.2%2B20260803141815).
  Archive SHA-256:
  `5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6`.
- Historical kotobako and Drift inputs contribute otherwise lost vocabulary
  classifications. No new JLPT or Kentei classification is inferred from
  dictionary frequency, school grade, or legacy numbering.

### Relationship integrity map

`tools/fixtures/reference/relationships.json` is a source-hashed expected map
checked by the core verifier, not an additional runtime dictionary. It covers:

- **31,625 namespaced reference nodes** (`word:` and `kanji:`), their
  collection memberships, source-level attestations and metadata gaps.
- **26,981 exact runtime canonical targets**, each verified to exist and match
  the reading where applicable. The other **4,644 nodes** are reference-only,
  including 3,791 visible glyphs and 537 glyphless source records. Supplementary
  word readings without an exact runtime target stay in their source sheet.
- **53,388 source-attested word-to-kanji edges** (35,557 distinct pairs) from
  `dict.k`, `words.k` and kotobako `containsKanji`; every target is bundled.
  No character decomposition or level inheritance creates new edges.
- **7,848 exact form/reading pairs** on classified vocabulary keys: 7,053
  have one bundled JMdict candidate, 112 have multiple candidates and 683
  have none. Their 6,998 distinct JMdict candidate IDs are verified against
  the index and actual detail shards, including reading restrictions and
  shard routing. Candidates are not automatic redirects or sense-level
  classification claims. Unassigned words have runtime-target checks but
  are outside this additional JMdict matching scope.
- All **6,787 Kentei entry IDs** and **5,637 source species IDs**. Shared
  species IDs form reversible relationships without merging glyphs or
  transferring grades. Six repeated printed glyphs retain their original
  source rows; **芸** additionally spans two different species IDs and is
  explicitly flagged as an identity collision.

The verified census has **zero dangling runtime canonical targets, JMdict
candidate targets, source word-to-kanji targets or Kentei relationships**.
The map separates target absence, absent metadata, ambiguous candidates and
unassigned classification instead of conflating them as “incomplete links.”
New core fields (`canonicalTarget`, `dictionaryLinks`, `kanjiLinks`,
`speciesIds`, `relatedForms`, `identityCollision`, `metadataSources`) are
additive and read-only. The integrated navigation retains the reference caller
through nested word, sentence and article visits. Source metadata alone never
authorizes study enrollment.

The controller's page, query, sort, and scroll state are transient, outside the
learner store. Existing canonical entry sheets retain explicit enrollment;
supplementary source-only sheets expose no enrollment control. Existing lesson
selection continues using its unchanged population.

## Reproduce and verify

From the repository root:

```sh
node tools/test-reference-core.mjs
node tools/test-reference-core.mjs --archive /path/to/kanjidic2-en-3.6.2+20260803141815.json.zip
node tools/build-reference-data.mjs --check
node tools/build-reference-data.mjs --check --archive /path/to/kanjidic2-en-3.6.2+20260803141815.json.zip
node prototypes/corridor/tools/test-reference-packaging.mjs
# Browser checks use one previously built, hash-identified site and a fresh
# external evidence directory. Set these to the candidate being tested:
KAIRO_SITE_DIR=/path/to/site KAIRO_ARTIFACT_SHA256='<artifact-sha256>' \
  KAIRO_EVIDENCE_DIR="$HOME/.dharma/bunki_audit/reference-check" \
  node prototypes/corridor/tools/verify-reference.mjs
```

The archive-free projection check independently rebuilds corpus
classifications and exact dictionary candidates while retaining the pinned
metadata projection with an accidental-corruption checksum. It is not an
independent raw-metadata verification. The
archive-backed check independently verifies raw metadata and byte-identical
output. Neither command downloads data or changes exam classifications.
The core regression tests compare coverage and relationships with the committed
fixtures without rewriting them. They verify every edge target, preserve source
collisions and exercise independent restriction, normalization and missing-target
fixtures. Proposed fixture output requires an explicit external `--evidence-out`
directory; a stale expected fixture fails the normal check.

The feature includes service-worker cache entries, standalone and fragment
embedding, Pages asset copying and smoke checks, and a dedicated reference
workflow. Network-blocked standalone testing covers both N1 and advanced
Kentei reference browsing.

Machine-readable expected counts and source hashes are in
`tools/fixtures/reference/coverage.json` and `relationships.json`. These fixtures
are not execution receipts. Actual run logs, candidate identities and limitations
belong under the operator's external evidence directory; the
[production build record](KAIRO_PRODUCTION_BUILD_2026-09-10.md) identifies the
current local integration.

## Remaining limits

This is exhaustive access to the indexed corpus, not a new set of official
exam papers, a comprehensive grammar/listening syllabus, or a certification
claim. The existing 25 short mock papers remain separate, unapproved practice
material. Physical iPhone Safari, native Japanese IME, and VoiceOver are not
verified by the Chromium automation.

The local production candidate combines reference and SKIP lookup with recovered
R35 work. It has not been pushed, merged or deployed by this integration task.
