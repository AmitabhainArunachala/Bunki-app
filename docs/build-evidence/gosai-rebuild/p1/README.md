# P1 foundations — gate evidence (2026-08-14)

The first phase of the 八彩 rebuild
(`docs/briefs/KAIRO_GOSAI_REBUILD_SPEC_2026-08-13.md` §4 P1), built on
`claude/app-vision-next-steps-wei73a`.

## What P1 shipped

- **S1 living paper ground** — a per-world procedural paper engine in
  `corridor.js` (`paintPaper`/`applyPaper`): eight painters (print cream ·
  kōzo strokes · dawn fiber · tannin clouds · lacquer polish-lines ·
  indigo + stars · sea swells · terminal rain), grown once per
  world+viewport on an offscreen canvas, cached as a data-URL, hung behind
  the app through `--paper-url` (`body::before`), re-grown on seal change
  and real viewport change. Grown on the ground the body actually shows
  (variant E's layered depth grounds the app on `--ground-2`).
- **S2 raised paper** — the review card is warm washi (墨・楮紙 constants)
  in every world, zen included, with fine tooth and one soft shadow.
- **S3 the lacquer sheet** — every bottom sheet re-scopes the live tokens
  to the 胡粉・黒漆 constants; one gold hairline where the lacquer meets
  the room.
- **S4 hanko grades** — 再・難・良・易 as seals (`--seal-*` grammar): 再
  red outline, 難 quiet, 良 pressed solid in the world's red, 易
  gold-edged. EN sublabels and honest FSRS intervals stay in the DOM.
- **Extended tokens** — `--paper-url`, `--sheet-*`, `--card-*`,
  `--seal-*`, `--gold`.
- **Long-press world picker** — hold either theme seal for the eight
  world-stones (direct jump); tap still cycles; active stone ringed in its
  world's red.
- **Suites extended** — the accessibility walk now measures all eight
  worlds (was two) AND the S1 amplitude law; `verify-corridor`'s
  measurement probe now composites text against the surface it actually
  sits on (a sheet label was measured against the body ground).

## Gate results (all green)

| gate                                | result                        |
| ----------------------------------- | ----------------------------- |
| `npm run format:check`              | clean                         |
| `verify-corridor.mjs`               | 116/116                       |
| `verify-corridor-accessibility.mjs` | 36/36 (was 22 — extended)     |
| `npm test`                          | 1645/1645                     |
| `verify-storage-integrity.mjs`      | 9/9                           |
| `verify:drift:fast`                 | 45 cases · 0 violations       |
| amplitude law (±3% of ground)       | worst world 2.67% rms (赤)    |

Measured paper amplitude per world (mean shift · rms deviation, WCAG
relative-luminance scale, from the accessibility report):

| world      | mean    | rms   |
| ---------- | ------- | ----- |
| 藍 hokusai | −1.69%  | 2.03% |
| 墨 sumi    | −1.88%  | 2.20% |
| 赤 akafuji | −2.43%  | 2.67% |
| 柿 iwa     | −1.90%  | 2.34% |
| 漆 rokusho | +0.26%  | 0.33% |
| 金 yoru    | +0.06%  | 0.23% |
| 浪 nami    | +0.15%  | 0.26% |
| 殻 kaku    | +0.02%  | 0.05% |

## The matrix

`<world>-1-shelf.png` (living paper + doors), `<world>-2-sheet.png` (the
lacquer dictionary), `<world>-3-review.png` (washi card + hanko grades),
all 390×844@2x, plus `hokusai-4-world-picker.png` (the eight stones).
The picker jump was also driven live (stone 殻 → `kairo-theme=kaku`).

## Noted for later phases

- The homograph chooser's translucent white inset inside the lacquer
  sheet reads grey — P3 (the dictionary) re-dresses every node renderer.
- The zen review card now carries washi; P4 (the desk) owns the final
  zen geometry.
