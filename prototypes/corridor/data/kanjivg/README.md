# KanjiVG upstream archive

The G5 parts graph is built from the pinned KanjiVG archive, but the 24 MB
archive is **not** committed to this repository. Supplying it is an operator
step:

- `BUNKI_G5_UPSTREAM_ZIP=/absolute/path/to/upstream.zip`, or
- `prototypes/corridor/data/kanjivg/upstream.zip` (the contract's default path).

The exact archive is required. `g5-inputs.json` pins:

- dataset: `KanjiVG`
- version: `70a0b7ae0c18ceb5cb358274b029cce0234a43bc`
- bytes: `24094874`
- sha256: `d6a17d77902b863d7524e24d11c44ae628c5d5ba4f09cb3af90c1190bf78bcca`
- licence: `CC BY-SA 3.0`

The contract test authenticates those bytes before reading any SVG member.
SVG members are read in memory only; nothing is extracted to disk. A glyph's
member is the five-or-six digit lowercase hexadecimal code point, e.g.
`04e00.svg` for `一` (archive prefix
`kanjivg-70a0b7ae0c18ceb5cb358274b029cce0234a43bc/kanji/`).

Rebuild the committed data files with:

```sh
BUNKI_G5_UPSTREAM_ZIP=/absolute/path/to/upstream.zip \
  node prototypes/corridor/contracts/parts/build-parts-graph.mjs
```

Then verify with:

```sh
BUNKI_G5_UPSTREAM_ZIP=/absolute/path/to/upstream.zip \
  node --test prototypes/corridor/contracts/parts/parts.contract.test.mjs
```

The licence text is kept at `packages/seed/licenses/KanjiVG-COPYING.txt`.
