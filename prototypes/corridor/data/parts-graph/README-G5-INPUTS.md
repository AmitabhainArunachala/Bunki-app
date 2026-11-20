# Pinned inputs for G5 (the one parts graph), staged by the Bunki lead 2026-11-05 20:55 JST

These three files are the named, immutable sources the G5 contract counts from (assertion [2]: 263 bricks, 300 radicals).
They ride with the judge files (campaign/judges/G5/) so the conductor pins them into every attempt's worktree and the
contract hash follows their bytes. The worker may not edit them.

- worlds-300.json: the radical-seeded, frequency-filled 300-world selection (inventory C2 "the 300-radical selection"):
  W12 kanji-world system, swarm with Kimi, 2026-10-28 00:22, page-full/data/worlds.json; John's decision 2026-10-29 09:35
  (MISSION/inbox/0935-w12-JOHN-DECIDED-kanji-system-art-and-order.md: "Radicals first", "a radical-seeded 300-world selection").
  THEMES-LEDGER T040: the order decomposes 1,349 of 2,136 jōyō completely and attaches 1,870.
- component-selection.json: out/COMPONENT-SELECTION.json, the recalculated data fact behind T040 (residualParts).
- bricks.json: T20 Lego bricks, 263 components (~/.dharma/bunki_review/2026-10-17/meguri-v2/lego/bricks.json), the X12 input.
The Kangxi 214 (corpus/datasets/kanji/kanken_radicals.jsonl, radicals214.json) is a different set and is NOT the 300.

SHA256SUMS:
33267e4d4af9e6686a6eadb5fa2bfdccdfa05748ef502194a9714be99726be2f  worlds-300.json
b9a528437188ff2d091ea8ab8e30a3e717dd2a4424032f53179c19ec279bfcf5  component-selection.json
0353bb29d949261c0da9e6c647c4c9dd767687382b190626949cc2b84c22516d  bricks.json
