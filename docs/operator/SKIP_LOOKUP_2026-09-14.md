# SKIP lookup — isolated data and pure engine

**Date:** 2026-09-14

**Scope:** canonical `prototypes/corridor/`; data and pure engine only

**Status:** implemented and unit-tested; this document does not claim UI, offline,
phone, deployment, or product-wide acceptance.

## Authority and boundaries

The latest direct operator instruction permits visible SKIP codes **only in a
dedicated lookup/search surface**, superseding the older general prohibition on
index displays for that surface. This follows the authority order in
[the current product constitution](BUNKI_CURRENT_PRODUCT_CONSTITUTION_2026-08-15.md).
The quiet writing room remains kanji-only with its existing minimal wake field:
no SKIP code, lookup wheel, attribution panel, or new metadata belongs there.

The original `corpus/src/corpus/sources/jmdict/kanjidic.py` allowlist, its
SKIP-stripped outputs, historical provenance record, and existing tests are
unchanged. The new data is an isolated `share_alike` sidecar, not an addition to
`proprietary_safe`. No legacy UI, existing JavaScript, HTML, CSS, service worker,
or standalone bundle is modified by this data/engine work.

## Permission, attribution, and the conflicting notice

The rights holder's permission page states that, **as of December 12, 2014**, the
SKIP coding system and all established codes are available under **Creative
Commons Attribution-ShareAlike 4.0 International** and may be redistributed “for
any purpose, even commercially.” It requires attribution to Jack Halpern with a
link to the Kanji Dictionary Publishing Society. See
[the SKIP permission announcement](https://www.kanji.org/dictionaries/skip_permission.htm)
and [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

Use this visible acknowledgement in the dedicated lookup surface:

> The SKIP (System of Kanji Indexing by Patterns) system for ordering kanji was
> developed by Jack Halpern (Kanji Dictionary Publishing Society at
> https://www.kanji.org/), and is used with his permission.

Provide the [CC BY-SA 4.0 licence](https://creativecommons.org/licenses/by-sa/4.0/)
and [permission-page link](https://www.kanji.org/dictionaries/skip_permission.htm)
with the attribution; keep these with redistributed or adapted sidecar data.
The JSON `sources` array carries the attribution, author, permission effective
date, and licence URLs, and `provenance.changes` describes the extraction.

**Do not hide the conflict:** the legacy EDRDG KANJIDIC project page says:
“It is now under a Creative Commons Attribution-Noncommercial-Share Alike 4.0
Unported Licence,” immediately after referring to the 2014 announcement.
That conflicts with the rights holder's explicit commercial-use permission.
This implementation follows the latter, without rewriting the older corpus
history or claiming that the conflict never existed. See
[the legacy KANJIDIC project page](http://www.edrdg.org/wiki/KANJIDIC_Project.html)
and [the rights holder's announcement](https://www.kanji.org/dictionaries/skip_permission.htm).
The live `/wiki/index.php/KANJIDIC_Project` route returned a closed-wiki
placeholder during verification; the static legacy page above contains the
conflicting paragraph.

KANJIDIC2 readings, meanings, and radicals are separately attributed to the
Electronic Dictionary Research and Development Group under its
[general dictionary licence, CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html).
That statement identifies Jack Halpern as the SKIP rights holder and directs
users to his separate conditions. The lookup surface should carry EDRDG's
acknowledgement and licence link as well as the SKIP attribution; do not rely
on metadata invisible to the user. JSON conversion is credited to
[scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified).

## Pinned source and reproducibility

The builder reads the existing repository pin directly from
`corpus/src/corpus/sources/jmdict/fetch.py`, without calling its network fetcher
or writing its corpus outputs.

| Field                     | Value                                                              |
| ------------------------- | ------------------------------------------------------------------ |
| Upstream repository       | `scriptin/jmdict-simplified`                                       |
| Pinned release            | `3.6.2+20260803141815`                                             |
| Asset                     | `kanjidic2-en-3.6.2+20260803141815.json.zip`                       |
| ZIP SHA-256               | `5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6` |
| Dictionary date           | `2026-08-03`                                                       |
| Database version          | `2026-215`                                                         |
| Generated sidecar size    | `2,360,706` bytes                                                  |
| Generated sidecar SHA-256 | `9605a24687dc8a24179089670e7ffa95cefa1a887b19ee7d951cb77dbc61aa74` |

Upstream release:
https://github.com/scriptin/jmdict-simplified/releases/tag/3.6.2%2B20260803141815

Run from the repository root with authenticated GitHub CLI access:

```sh
python prototypes/corridor/tools/build-skip-data.py
node prototypes/corridor/tools/test-skip-core.mjs
```

With an existing downloaded archive, build and prove byte-for-byte parity:

```sh
python prototypes/corridor/tools/build-skip-data.py --archive /path/to/kanjidic2-en-3.6.2+20260803141815.json.zip
python prototypes/corridor/tools/build-skip-data.py --archive /path/to/kanjidic2-en-3.6.2+20260803141815.json.zip --check
node prototypes/corridor/tools/test-skip-core.mjs --archive /path/to/kanjidic2-en-3.6.2+20260803141815.json.zip
```

The default cache is `~/.cache/bunki-skip`; download is `gh release download`,
not “latest.” Hash mismatches fail before output is written. `--check` never
writes. Output order is Unicode scalar order, there is no runtime timestamp,
and expected counts and known source anomalies are checked before generation.
Future repins require deliberate source, licence, coverage, and anomaly review,
followed by regeneration and updated tests; do not loosen checks merely to make
a changed upstream release pass.

## Coverage and source integrity

Counts below are computed from the pinned release and stored in `skip.json`.

| Coverage                                                           |  Count |
| ------------------------------------------------------------------ | -----: |
| Source characters / sidecar entries                                | 10,384 |
| Canonical codes                                                    | 10,384 |
| Alternate codes                                                    |    942 |
| `posn` — position/division                                         |    421 |
| `stroke_count` — stroke count                                      |    211 |
| `stroke_and_posn` — count and position                             |     24 |
| `stroke_diff` — differing stroke-count opinions                    |    286 |
| Pattern 1 canonical codes                                          |  6,763 |
| Pattern 2 canonical codes                                          |  2,489 |
| Pattern 3 canonical codes                                          |    848 |
| Pattern 4 source-reported canonical codes                          |    284 |
| Classical radical available                                        | 10,384 |
| English meanings available                                         | 10,384 |
| No Japanese on/kun reading supplied upstream                       |    277 |
| Sidecar literals outside the current 2,582-record Corridor catalog |  7,808 |

The four original misclassification labels and their meanings are retained from
[KANJIDIC's format documentation](http://www.edrdg.org/wiki/KANJIDIC_Project.html).
No alternate is promoted to canonical; no stroke division is inferred from
KanjiVG or rendered geometry. Missing readings remain empty arrays, not invented
pronunciations.

### Explicit upstream anomalies

| Literal | Source value | Kind                       | Handling                                                                  |
| ------- | ------------ | -------------------------- | ------------------------------------------------------------------------- |
| 㡀      | `4-2-5`      | canonical                  | Preserve verbatim; subtype 5 is invalid.                                  |
| 口      | `3-3-0`      | `posn` alternate           | Preserve verbatim; inside stroke count is zero.                           |
| 囗      | `3-3-0`      | `posn` alternate           | Preserve verbatim; inside stroke count is zero.                           |
| 門      | `3-8-0`      | `posn` alternate           | Preserve verbatim; inside stroke count is zero.                           |
| 搔      | `1-3-09`     | canonical numeric spelling | Normalize to `1-3-9`; retain original spelling in `sourceNormalizations`. |

The four rule-invalid codes carry `sourceIssues` on their records and do not
participate in strict matching, including wildcard searches. Thus strict
searchable coverage is **10,383 canonical entries and 939 alternate codes**,
not a falsely claimed 10,384 valid canonical codes. All source records and
misclassification values remain available in the attributed data. A future
literal detail view for 㡀 should explain its source anomaly rather than present
`4-2-5` as an approved code.

## Public engine API

`skip-core.js` is a dependency-free IIFE with `window.BunkiSkipCore` in a browser
and `module.exports` in Node. It does not fetch data, touch the DOM, use storage,
change learner state, or infer mastery from a lookup.

```js
const query = BunkiSkipCore.parseQuery('ＳＫＩＰ：１－３－８');
// {kind:"skip", raw:..., normalized:"1-3-8", parts:[1,3,8], complete:true}
const results = BunkiSkipCore.search(skipData, query, {
  includeAlternates: false,
  radical: null,
});
// Each result: {...entry, matchedCode:"1-3-8", matchType:"canonical", misclass:null}
```

- `parseQuery(raw)` returns `kind: "skip" | "invalid" | "text"`. An invalid result
  has a readable `error`; ordinary text must continue through existing search.
- Prefix `skip:` is case-insensitive; fullwidth ASCII and common hyphens are
  normalized. Japanese prolonged-sound marks are not treated as hyphens, and
  compatibility ideographs are not normalized away.
- `1-3-8` and `skip:1-3-8` are exact queries.
- `1-3`, `1-3-`, `1--8`, `1-*-8`, `1-?-8`, `*-3-8`, and `skip:1` are partial
  queries; `null` in a parsed `parts` array is a whole-field wildcard.
- `skip:`, `skip:*`, or `*-*-*` select all valid codes. Bare empty text, `1`,
  `*`, or `?` are ordinary search, not an implicit all-kanji lookup.
- Pattern must be 1–4; count fields must be positive safe integers. Pattern 4
  third field must be 1–4. A wildcard pattern may have third field greater than
  4 because it can still match patterns 1–3.
- `1-3-x`, `5-3-8`, `4-8-8`, zero/negative counts, decimals, and a fourth SKIP
  field are invalid SKIP intent rather than ordinary text.
- `search(data, rawOrParsedQuery, options)` also accepts `data.entries` directly.
  `match` is an alias with the same signature, not a single-row boolean predicate.
- `includeAlternates` defaults to false and must be boolean true to opt in.
  All canonical matches precede alternate-only matches; deduplication is by
  literal. Source order is stable within each group. There is no hidden limit
  or frequency ranking.
- An alternate result retains `canonical`, plus `matchedCode`, `matchType:
"alternate"`, and its original `misclass` label.
- `radical` optionally filters the classical/Kangxi number 1–214; an integer or
  numeric string is accepted. `undefined`, `null`, and `""` mean no filter.
  It is separate from the SKIP code; the UI may use the existing radical table
  to label an optional fourth wheel.
- Invalid/text queries or missing data return an empty result array; the UI must
  inspect `kind` to distinguish invalid syntax from a valid query with no hits.
- `patterns`, `solidSubtypes`, `misclassifications`, and `rules` expose read-only
  labels and explanatory metadata.

### Sidecar record schema

```js
{
  literal: "情",
  canonical: ["1-3-8"],
  alternatives: [{ code: "1-1-10", misclass: "posn" }],
  readings: { on: ["ジョウ", "セイ"], kun: ["なさ.け"], nanori: [] },
  meanings: ["feelings", "emotion", "passion", "sympathy", "circumstances", "facts"],
  radical: 61,
  strokeCounts: [11],
  frequency: 235
}
```

The root contains `schemaVersion: 1`, `pool`, `licence`, `licenceUrl`, `sources`,
`provenance`, `counts`, and `entries`. Exceptional entries additionally carry
`sourceIssues: [{code, misclass, reason}]` and/or
`sourceNormalizations: [{from, to, misclass}]`.

## Rules that the UI must preserve

1. Pattern 1: left–right; count left, then right.
2. Pattern 2: top–bottom; count top, then bottom.
3. Pattern 3: enclosure; count enclosure, then inside.
4. Pattern 4: solid; second field is **total strokes**, third field is **subtype**:
   1 top line, 2 bottom line, 3 through line, 4 other.

Divide at the first natural division without breaking strokes or indivisible
units. When more than one solid subtype applies, the **smallest matching subtype
number takes precedence**. These are SKIP rules, not visual-shape heuristics;
see [the authorized SKIP overview](http://www.edrdg.org/wwwjdic/SKIP.html).

Verified examples: 情 `1-3-8`, 明 `1-4-4`, 寺 `2-3-3`, 国 `3-3-5`,
雨 `4-8-1`, 下 `4-3-1`, 垂 `4-8-2`, 中 `4-4-3`, 大 `4-3-4`,
王 `4-4-1`, 生 `4-5-2`, and 一 `4-1-4` come from the pinned dataset.
Do not replace canonical lookup with an attempted visual classifier.

## Verification and integration handoff

The full test command with `--archive` passes **19/19 tests**, including:

- Browser-global and CommonJS loading; fixture matching for every pattern.
- Normalization, partial/wildcard parsing, malformed intent, type-4 validation.
- Every alternate category, canonical-first order, duplicate literals,
  separate radical filtering, no-results and frozen-input purity.
- Fallback schema for all entries and 7,808 out-of-catalog literals.
- All **10,383 valid canonical** and **939 valid alternate** memberships checked
  across **982 distinct query/mode combinations**.
- Explicit anomaly preservation/exclusion and numeric normalization provenance.
- Reproducible sidecar bytes, all raw-source SKIP values/categories, fallback
  text parity, and the existing stripped-output allowlist for every source row.

Without `--archive`, 18 tests run and the raw-archive parity test is explicitly
skipped. This is not a substitute for full parity when changing the data.

The six existing functions in `corpus/tests/test_jmdict_kanjidic.py` also passed
by direct invocation (the sandbox has no pytest installation). The original
corpus source, samples, datasets, and Corridor `kanji.json` have no diff.

UI integration is separate work: load the script and sidecar, route only
`kind: "skip"` or `"invalid"` away from ordinary dictionary search, provide
loading/failure/empty states, visibly distinguish alternates, provide fallback
detail for uncatalogued characters, retain context on return, expose attribution,
and add any required service-worker/standalone assets. This engine makes no
offline or writing-path coverage claim for the extra kanji.
