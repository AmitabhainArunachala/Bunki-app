# Kanji structure sources

`source/*.svg` are **unmodified** KanjiVG files from revision
`61e39cfc29724132a6f8823b166296932985a0ff`. Each retains its original copyright and
license header. KanjiVG is attributed to Ulrich Apel and distributed under
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/);
see [KanjiVG](https://kanjivg.tagaini.net/).
`source/source-manifest.json` records exact source URLs, byte counts and SHA-256.
These are source geometry, not files copied from a creative implementation.

The derived runtime projection is
`prototypes/corridor/data/share_alike/kanji-structure.json`, also attributed to
KanjiVG under CC BY-SA 3.0. It covers **six glyphs**, not the whole catalog.
All 88 ordered SVG path strings match existing `strokes.json` byte-for-byte.
The extractor retains every group inside each stroke wrapper, including unnamed
groups and split groups with the same label. Child paths use the source XML
element's actual child index; the root wrapper is `$`. Source attributes remain
uninterpreted evidence, including `part`, `position` and `radical`.
No semantic/phonetic teaching claim is derived.

To verify the committed projection offline, from the repository root:

```sh
python3 prototypes/corridor/tools/extract-kanji-structure.py \
  --source-dir prototypes/corridor/tools/fixtures/kanji-structure/source \
  --strokes prototypes/corridor/data/share_alike/strokes.json \
  --output prototypes/corridor/data/share_alike/kanji-structure.json \
  --check
node --test prototypes/corridor/tools/test-kanji-structure.mjs
```

Without `--check`, the extractor writes only the explicitly specified output,
after validating all six source hashes and exact runtime-path parity. It never
downloads sources, changes runtime strokes, guesses a decomposition or translates
geometry. Unsupported transforms/geometry children fail rather than being dropped.
Upstream stroke-number annotations are not part of the selected stroke geometry.

Runtime API (`kanji-structure.js`, plain script or CommonJS):

```js
const model = BunkiKanjiStructure.createModel({
  kanji: D.kanji,       // map, not the outer kanji.json document
  strokes: D.strokes,   // map, not the outer strokes.json document
  grouping,            // whole kanji-structure.json document; null means absent
});
const view = model.inspect('森');
const wood = view.occurrences.find(row => row.reference?.id === '木');
const projection = model.project('森', wood.id);
// projection: { reference, occurrenceId, viewBox, source, pathIndices, paths }
```

`inspect` returns `reference`, `listedMembership`, `strokeCount`, `grouping`,
`occurrences`, and `tree`. Tree nodes include the flat occurrence fields plus
`children`; the outer stroke wrapper has a null reference. A group without an
element label has no invented reference. Each occurrence retains `groupPath`,
`sourceGroupId`, `sourceAttributes`, `parentId`, `childIds`,
`directStrokeIndices` and descendant `strokeIndices`.

Occurrence IDs bind the exact glyph, pinned revision, raw-source SHA and group
path. A repeated 木/口/日 has distinct occurrences but a shared part reference.
Selected paths stay in source stroke order and the original `109 × 109` viewBox;
the model supplies no rendering transform. Selection from a different glyph or
an unknown occurrence returns null.

Missing grouping returns `status: "absent"`, `tree: null` and no occurrences.
Listed component membership is still available separately and never substitutes
for geometry. Supplied malformed grouping or path mismatch throws.
`status: "available", strokeParity: "exact"` means runtime schema/tree/path checks
passed. Raw XML/hash derivation is the separate offline check above.

The API snapshots its inputs and freezes outputs. It has no DOM, fetch, storage,
learning-record, scheduler, mastery or navigation side effects. A consumer must
route an explicit learning action through the existing record/SRS contracts.
