# 五彩 GOSAI — the locked colour standard (operator lock, 2026-08-12)

> **SUPERSEDED 2026-08-13 by 八彩 —** see `HASSAI_STANDARD_2026-08-13.md`.
> The operator re-picked eight worlds from the thirteen-world carousel;
> this document remains as the record of the first lock.

The operator reviewed 十彩の墨 (ten nihonga colorings of the living-ink
engine, `design/stroke-art-iro.html`) and locked **five** as the standard
across the entire app: _"pick five of them and then make it locked in and
wired in as the new standard across the entire app."_

## The five, and their roles

| 世界       | pairing                               | role in the corridor                                                                                     |
| ---------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 墨・楮紙   | sumi ink on warm kōzo washi           | the reading day-world — DEFAULT. Reader, shelf, cards.                                                   |
| 朱・胡粉   | shrine vermilion on shell white       | the bright day-world; 朱 is also THE action colour everywhere (readings, seals, live accents, grade 良). |
| 焦茶・柿渋 | burnt umber on persimmon-tannin paper | the mingei world — home register of the 新聞アーカイブ.                                                  |
| 胡粉・黒漆 | shell white on black lacquer          | the dark reading world; the dictionary sheet's native dress.                                             |
| 紺紙金泥   | sutra gold on indigo                  | the deep night — the Drift's sky, gold accents, the stroke room at night.                                |

Dropped from the ten (kept as art, not as UI): 群青・金地 (reserved for
special moments — completion states, perhaps), 緑青・鳥の子, 藍・雲母,
銀泥・紫紙.

## Where it is wired (this commit)

- `prototypes/corridor/corridor.css` — default `:root` = 墨・楮紙; the four
  `[data-theme]` blocks re-derived to 朱・胡粉 / 焦茶・柿渋 / 胡粉・黒漆 /
  紺紙金泥. The `.v-contrast-wcag` lifts re-derived per ink (both dark
  worlds get the night lift).
- `prototypes/corridor/corridor.js` — `THEME_UI` seal glyphs 墨・朱・柿・漆・金.
  **Storage keys keep the historical names** (`hokusai/sumi/iwa/rokusho/yoru`)
  so saved preferences survive; the values are the new standard.
- The Drift layer (`drift-layer.js`) is GENERATED from the drift source
  through an exact-string patch gate — its five matching pigment worlds
  follow in the next slice via `tools/build-drift-layer.mjs`, not by hand.

## Token law

- Every surface colours itself from the world tokens: `--ground/-2/-0`,
  `--ink/-2`, `--red` (+wash), `--line/-soft`, `--faint/-2`, `--ai` (+wash).
- ONE red does all semantic work per world (朱 family on light grounds,
  lifted 朱 on dark). Nothing else is coloured.
- Dark worlds (黒漆, 紺紙金泥) lift `--faint` to ≥0.66 of their ink — the
  night legibility law (operator's phone, 2026-08-11).
- `--ai` is the "you can go here" colour: 藍 indigo on light worlds, gold
  on the dark worlds.
- Contrast is measured by `tools/verify-corridor-accessibility.mjs`, never
  eyeballed.

## The structural register (the campaign, in order)

Colour is wired now; the structures shown in `design/kairo-gosai.html`
land room by room, each behind the full battery + operator feel verdict:

1. washi reader ground (procedural paper, not flat hex)
2. lacquer dictionary sheet (胡粉・黒漆 regardless of world, gold hairlines)
3. hanko grade seals on the SRS answer face (再・難・良・易)
4. the gold Drift door (紺紙金泥 wired through the drift build)
5. 書の間 — the living-ink stroke room (stroke-art-v5 engine as a corridor room)
