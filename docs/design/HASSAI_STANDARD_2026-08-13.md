# 八彩 HASSAI — the locked colour standard (operator lock, 2026-08-13)

Supersedes 五彩 (`GOSAI_STANDARD_2026-08-12.md`). The operator reviewed the
thirteen-world carousel (`design/gosai-carousel.html` — the five 五彩
nihonga worlds, five 北斎 print worlds, three 電脳 neon worlds) and locked
**eight**, answering the two open gates directly: _"1. Keep [墨・楮紙] 2. 藍 ベロ藍・浪 [as default]"_.

## The eight

| seal | world        | family | pairing                          | register     | key (storage)  |
| ---- | ------------ | ------ | -------------------------------- | ------------ | -------------- |
| 藍   | ベロ藍・浪   | 北斎   | Prussian blue on print cream     | day, DEFAULT | `hokusai` ('') |
| 墨   | 墨・楮紙     | 五彩   | sumi ink on warm kōzo washi      | day          | `sumi`         |
| 赤   | 凱風快晴     | 北斎   | Red Fuji rust on dawn paper      | day          | `akafuji`      |
| 柿   | 焦茶・柿渋   | 五彩   | burnt umber on persimmon tannin  | day          | `iwa`          |
| 漆   | 胡粉・黒漆   | 五彩   | shell white on black lacquer     | night        | `rokusho`      |
| 金   | 紺紙金泥     | 五彩   | sutra gold on indigo             | night        | `yoru`         |
| 浪   | 神奈川沖浪裏 | 北斎   | foam on the deep Prussian sea    | night        | `nami`         |
| 殻   | 攻殻・燐光   | 電脳   | phosphor green on terminal black | night        | `kaku`         |

Four days, four nights. The seal cycles in that order; long-press (P1
mechanic) opens the eight world-stones for a direct jump.

## The ink follows the world (書の間)

Each world carries its own brush pigment in the living-ink engine, all
already proven as true engine renders: 藍→ベロ藍 · 墨→墨 · 赤→赤富士の錆
· 柿→焦茶 · 漆→胡粉 · 金→金泥 · 浪→波の泡 · 殻→燐光.

## Token law (unchanged from 五彩, restated)

- Every surface colours itself from the world tokens (`--ground/-2/-0`,
  `--ink/-2`, `--red`+wash, `--line/-soft`, `--faint/-2`, `--ai`+wash).
- ONE red per world does all semantic work.
- Dark worlds (漆・金・浪・殻) lift `--faint` to ≥0.66 of their ink and carry
  `.v-contrast-wcag` overrides — the night legibility law.
- `--ai` is the go-colour: 藍/sky blues on light worlds; gold on 漆/金,
  spindrift on 浪, phosphor on 殻.
- The two structural constants: the dictionary sheet is 黒漆 lacquer in
  every world; the review card is warm washi on every desk.
- Contrast is measured by the accessibility verifier, never eyeballed.

## Where it is wired (this commit)

- `prototypes/corridor/corridor.css` — default `:root` = ベロ藍・浪; eight
  `[data-theme]` blocks (`sumi` returns to true 墨・楮紙 — the old default's
  values; `akafuji`/`nami`/`kaku` are new keys); WCAG lifts for all four
  dark worlds.
- `prototypes/corridor/corridor.js` — `THEME_UI` seals 藍墨赤柿漆金浪殻.
- The Drift layer's matching pigment worlds follow via
  `tools/build-drift-layer.mjs` (generated file — P6 of the rebuild spec).

## Rebuild spec linkage

`docs/briefs/KAIRO_GOSAI_REBUILD_SPEC_2026-08-13.md` §1 is amended to
these eight; the lock gate is CLOSED and the build is OPEN at P1.
