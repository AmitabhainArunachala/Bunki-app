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
| N5         |                    743 |               103 |
| N4         |                    681 |               181 |
| N3         |                  2,122 |                 0 |
| N2         |                  1,863 |               739 |
| N1         |                  2,279 |               956 |
| Unassigned |                 16,774 |             4,931 |

There are **7,677 distinct classified words** and 7,688 level memberships.
Eleven words have conflicting source classifications, so they occur in each
attested level with a visible disagreement note. N1 retains all 2,274 entries
from the secondary word table plus five additional committed classifications.

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

Counts above are **assigned-grade bins**, not cumulative examination targets.
The official advanced scope is approximately 3,000 characters for 準1級 and
6,000 for 1級; neither source-row totals nor variant-form counts establish
official exam completeness ([official grade overview](https://www.kanken.or.jp/kanken/grades/overview/)).

## Data and authority boundaries

`reference-core.js` is a pure index over existing runtime dictionaries plus
`data/share_alike/reference-extra.json`. The supplementary data is isolated
from application code and preserves source/license attribution. Every
classification can be traced back to its source record.

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

The controller's page, query, sort, and scroll state are transient, outside the
learner store. Existing canonical entry sheets retain explicit enrollment;
supplementary source-only sheets expose no enrollment control. Existing lesson
selection continues using its unchanged population.

## Reproduce and verify

From the repository root:

```sh
node tools/test-reference-core.mjs
node tools/build-reference-data.mjs --check
node tools/build-reference-data.mjs --check --archive /path/to/kanjidic2-en-3.6.2+20260803141815.json.zip
node prototypes/corridor/tools/test-reference-packaging.mjs
node prototypes/corridor/tools/verify-reference.mjs --shots /tmp/reference-shots
node prototypes/corridor/tools/verify-mock.mjs
```

The archive-free projection check independently rebuilds corpus
classifications while retaining the pinned metadata projection. The
archive-backed check independently verifies raw metadata and byte-identical
output. Neither command downloads data or changes exam classifications.

The feature includes service-worker cache entries, standalone and fragment
embedding, Pages asset copying and smoke checks, and a dedicated reference
workflow. Network-blocked standalone testing covers both N1 and advanced
Kentei reference browsing.

Machine-readable counts and source evidence are in
`docs/build-evidence/reference/coverage.json`. Executed checks and environment
limitations are recorded in `docs/build-evidence/reference/QA.md`.

## Remaining limits

This is exhaustive access to the indexed corpus, not a new set of official
exam papers, a comprehensive grammar/listening syllabus, or a certification
claim. The existing 25 short mock papers remain separate, unapproved practice
material. Physical iPhone Safari, native Japanese IME, and VoiceOver are not
verified by the Chromium automation.

The feature is prepared for review without merging. SKIP lookup remains a
separate feature branch; shared packaging files may need integration when both
are merged.
