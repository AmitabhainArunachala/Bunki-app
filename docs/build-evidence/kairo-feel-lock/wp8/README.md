# WP8 — 筆順, the full-screen stroke-order page

The stroke diagram on a kanji sheet used to be a picture: a 132 px SVG with red
ordinals, sitting in a list. A kanji is *written*, so it now gets a page of its
own. The diagram is the door; the page behind it draws the KanjiVG paths in
order, the way a hand moves.

Everything below was measured in real Chromium, not asserted from a return
value. Re-run it with:

```
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
  node docs/build-evidence/kairo-feel-lock/wp8/wp8-evidence.mjs
```

**37/37 checks passed.** Raw numbers: [`wp8-measurements.json`](./wp8-measurements.json).
Screenshots: [`shots/`](./shots).

---

## What changed

| file | what |
| --- | --- |
| `prototypes/corridor/corridor.js` | `S.strokes` layer state; `openStrokePage` / `closeStrokePage`; `back()` and `dismissSheet()` learn the new top layer; `strokeDoor()` replaces the inline diagram on the kanji sheet; `renderStrokePage()`, `paintStrokes()`, `startStrokeAnimation()`; sheet scroll + focus restoration in `renderSheet()`; one-live-layer inert pass in `render()` |
| `prototypes/corridor/corridor.css` | new `v1.9 · 筆順` section — the door, the page, the canvas, the counter, the controls, the honest-absence room |
| `docs/prototype/screenshots/04-kanji-page.png`, `11-v12-kanji-strokes.png` | the corridor verifier's own shots, refreshed because the kanji sheet now shows a door |

Line references (post-change `corridor.js`):

- `S.strokes` / `S.strokeNumbers` / `S.sheetScrollRestore` / `S.sheetFocus` — 230–240
- `back()` handles the new top layer first — 546–551
- `dismissSheet()` clears it — 576–588
- `openStrokePage` / `closeStrokePage` — 590–614
- the door on the kanji sheet (`renderKanjiNode`) — 2333–2336
- the 筆順 module (census comment, `strokeThumb`, `strokeDoor`, `paintStrokes`, `startStrokeAnimation`, `strokeMissing`, `renderStrokePage`) — 2402–2845
- sheet scroll/focus restoration — 3022–3037
- one-live-layer inert pass — 3226–3243

---

## Design decisions

**The diagram becomes a door, and the door always exists.** The corridor's rule
is "every element is a door, no dead ends". The old code rendered *nothing* for
a kanji with no stroke data — a silent hole. Now `strokeDoor()` runs for every
kanji: with paths it shows the thumbnail and "watch all N strokes draw in
order"; without them it shows the glyph and says "stroke data not yet
available / 筆順のデータはまだない" **on the sheet as well as on the page**, so the
absence is visible before you tap.

**Sequential drawing is measured, not eyeballed.** Each `<path>` is dashed to
its own `getTotalLength()` and its `stroke-dashoffset` walked to zero. The
per-stroke duration follows that same length
(`clamp(260ms, len × 9, 1000ms)`, 90 ms between strokes), so a long sweep takes
longer than a tick — handwriting, not a metronome. One `requestAnimationFrame`
loop owns the whole timeline; replay is the same function called again.

**Reduced motion is a mode, not a faster animation.** Under
`prefers-reduced-motion: reduce` there is no rAF loop at all: the finished glyph
is painted at once and the replay button is *replaced* by 前の画 / 次の画
(prev/next), which step the same `paintStrokes()` function one stroke at a
time. The counter carries `role="status" aria-live="polite"` only in this mode,
where it changes on a human press rather than 60 times a second.

**Colour.** Nothing in the new CSS names a colour. Ink is `--ink`, the writing
square is `--ground-0`, the page ground is `--ground` (flat) / `--ground-2`
(layered, mirroring how `body.v-depth-layered` separates ground from card), the
guide glyph is `--line`, secondary text is `--faint`, and 藍 `--ai` marks the
door and the replay control — "you can go here". 弁柄 `--red` is kept **out of
the page entirely**: there is no reading to mark here, and a missing stroke
order is an absence, not an alarm. A pressed toggle fills with `--ink`, the way
`.seg` and `#lang` already do. (The *thumbnail* on the sheet keeps its original
red ordinals — that byte was left alone to keep the diff honest; unifying it is
a one-line follow-up.)

**Layering, not routing.** The page is not a new `S.view` and not a stack node:
it is a layer above the sheet (`S.strokes`), because the sheet must survive
underneath byte-for-byte. `back()` peels it before the stack; `dismissSheet()`
clears it; `render()` marks every `#app` child except `#stroke-page` `inert` +
`aria-hidden`, so exactly one layer is live at a time.

**No aggregate scores, no chrome clutter.** The page carries a bar, the square,
`3 / 6`, two controls, and one line of provenance-free metadata
(`Year · 漢検 10級 · JLPT N5 · 6 strokes`). Nothing is averaged or scored.

---

## Acceptance, measured

### 0 · the census (from the shipped layers, not from memory)

| | |
| --- | --- |
| kanji in `D.kanji` | **2,582** |
| with KanjiVG paths | **2,134** |
| **without** any path data | **448** |
| stroke keys not in the kanji layer (unreachable) | 2 — 𠮟, 剝 |

The brief said 446. The measured number is **448**: `strokes.json` has 2,136
keys, but two of them (𠮟, 剝) are not in `kanji.json`, so only 2,134 of the
2,582 kanji can reach a diagram. 2,582 − 2,134 = 448. Reported as measured.

### 1 · a kanji WITH strokes — 年 (reader token → word sheet → kanji door)

| moment | counter | strokes complete | `data-state` | shot |
| --- | --- | --- | --- | --- |
| open | `1 / 6` | 0 of 6 (5 untouched) | `drawing` | `02-strokes-start.png` |
| mid | `3 / 6` | 2 of 6, third 65 % drawn (`1, 1, 0.649, 0, 0, 0`) | `drawing` | `03-strokes-mid.png` |
| end | `6 / 6` | 6 of 6 | `done` | `04-strokes-end.png` |

- Full-screen: page box **390 × 844** against a **390 × 844** viewport, origin (0, 0).
- `role="dialog"`, `aria-modal="true"`; focus lands on `#strokes-back`; every
  other `#app` child (`chrome`, `main`, `scrim`, `sheet`, `variants`) is
  `inert` + `aria-hidden="true"`.
- The ink arrives as a strict prefix — first *n* complete, the rest at exactly 0.
  Never a gap, so the order is real and not a fade-in.
- **Replay** (`05-strokes-replay-early.png`): after pressing, `1 / 6` with 0
  strokes drawn and `data-state="drawing"`; it then runs to `6 / 6` again.
- **Numbers toggle** (`06-strokes-numbers-off.png`): on → `.stroke-nums`
  `display: inline`, 6 of 6 ordinals at opacity 1; off → `display: none`;
  on again → 6 of 6 back.
- The sheet still carries the KanjiVG diagram: **6 paths under `#strokes`**, so
  the corridor verifier's own stroke check is untouched. Door hit area
  **358 × 114 px**.

### 2 · a kanji WITHOUT strokes — 丑 (search → kanji sheet → door)

- Door present, `data-strokes="0"`, **358 × 114 px**, no SVG, aria-label
  "丑 stroke order — stroke data not yet available".
- Page: `data-state="nodata"`, glyph rendered at **179 px**, line
  "Stroke data not yet available.", note "What is known is the count — 4
  strokes. KanjiVG does not carry this character's stroke paths yet."
  (`09-nodata-page-en.png`)
- 日本語のみ (`?ui=ja`, `10-nodata-page-ja.png`): 「筆順のデータはまだない。」／
  「分かっているのは画数だけ — 4 画。この字の筆順は KanjiVG にまだ入っていない。」
- Still a full-screen dialog (390 × 844) with both 戻る and ✕. No empty frame,
  no console error.

### 3 · `prefers-reduced-motion: reduce` (`reducedMotion: 'reduce'` context)

- At **60 ms**: `6 / 6`, all 6 strokes complete, `data-motion="reduced"`,
  `data-state="static"`. At **960 ms**: identical — nothing moved.
  (`11-reduced-immediate.png`)
- `#stroke-replay` absent; `#stroke-prev` + `#stroke-next` present.
- Step back: `5 / 6` (5 inked) → `4 / 6` (4) → `3 / 6` (3)
  (`12-reduced-stepped-back.png`); step forward `3 / 6` → `4 / 6`
  (`13-reduced-stepped-forward.png`).
- Clamps: floor at `1 / 6` with `#stroke-prev` disabled; ceiling at `n`.

### 4 · back returns the sheet exactly where it was

| | before | after |
| --- | --- | --- |
| sheet `scrollTop` | **1731** (of 3846) | **1731** |
| `window.scrollY` | 0 | 0 |
| sheet node | `kanji:年` | `kanji:年` |
| sheet text length | 1393 chars | 1393 chars |
| sheet buttons | 51 | 51 |
| focus | (on `#strokes-door`) | **`#strokes-door`** |

Both exits verified: the page's 戻る button and **Escape**. Focus is trapped
inside the dialog across 7 Tab + 3 Shift-Tab presses (ring: close → replay →
numbers → back → close → …). Shot: `07-back-to-sheet-same-place.png`.

### 5 · touch targets ≥ 44 px (measured `getBoundingClientRect`)

| control | 390 × 844 touch | reduced-motion | 1280 desktop |
| --- | --- | --- | --- |
| `#strokes-back` | 69 × 44 | 69 × 44 | 69 × 44 |
| `#strokes-close` | 44 × 44 | 44 × 44 | 44 × 44 |
| `#stroke-replay` | 96 × 48 | — | 96 × 48 |
| `#stroke-prev` | — | 121 × 48 | — |
| `#stroke-next` | — | 98 × 48 | — |
| `#stroke-numbers` | 121 × 48 | 121 × 48 | 121 × 48 |
| `#strokes-door` (on the sheet) | 358 × 114 | — | — |

Smallest dimension anywhere: **44 px**. Nothing below the bar.

### 6 · both themes — ink and paper come from the tokens

| | layered + WCAG (default) | flat + soft fade |
| --- | --- | --- |
| body classes | `v-contrast-wcag v-depth-layered ui-bi` | `ui-bi` |
| ink stroke | `rgb(20,24,28)` = `--ink #14181c` | `rgb(20,24,28)` = `--ink` |
| writing square | `rgb(255,253,246)` = `--ground-0 #fffdf6` | `rgb(255,253,246)` = `--ground-0` |
| page ground | `rgb(246,244,236)` = `--ground-2 #f6f4ec` | `rgb(252,251,246)` = `--ground #fcfbf6` |
| guide glyph | `rgba(20,24,28,0.16)` = `--line` | same |
| ordinals | `rgb(61,68,76)` = `--ink-2` | same |
| metadata line | `rgba(20,24,28,0.68)` = WCAG `--faint` | `rgba(20,24,28,0.42)` = soft `--faint` |
| replay control | `rgb(46,77,110)` = `--ai` | same |

The two themes genuinely paint differently (paper and faint text both move),
and every measured value is byte-identical to the token it claims to use.
Shots: `14-theme-layered-wcag.png`, `14-theme-flat-fade.png`.

### 7 · the existing suite and hygiene

- `node prototypes/corridor/tools/verify-corridor.mjs` → **91/91**, including
  its own `v1.2 · the kanji page draws its stroke order (KanjiVG) — 6 strokes
  rendered`.
- Across every context in this harness (5 browser contexts, phone + desktop,
  normal + reduced motion, both themes): **0 console errors, 0 page errors,
  0 failed requests**.
- `npx eslint .` clean; `npx prettier --check .` clean.

### Desktop 1280

`15-desktop-1280-mid.png`, `16-desktop-1280-end.png` — 開, 12 strokes, page box
**1280 × 900**, completes to `12 / 12`, Escape closes it back to the sheet.

---

## Risks and honest gaps

1. **`prototypes/corridor/corridor-standalone.html` is now one feature stale.**
   It is a generated artifact and was in sync at HEAD; it was deliberately *not*
   regenerated here, because four WP branches each committing an 8 MB rebuild
   would conflict on every merge. One command fixes it at integration:
   `node prototypes/corridor/tools/build-standalone.mjs`. The scratch build was
   verified to compile and run (8.16 MB).
2. **The sheet thumbnail still uses `--red` for its ordinals** (pre-existing
   byte). The new page uses `--ink-2`. Deliberate, to keep the diff to the
   feature; unify in a follow-up if the operator wants red confined to readings
   everywhere.
3. **Toggling the OS reduced-motion setting while the page is open** does not
   re-render it — the mode is read when the page opens. Re-opening picks up the
   change. No `matchMedia` listener was added; scope call.
4. **No history integration.** The corridor has no History API anywhere, so a
   hardware/browser Back gesture still leaves the whole app rather than the
   layer. The page carries its own two exits plus Escape, matching the sheet's
   existing contract ("the sheet carries its own way out").
5. **Only the kanji sheet has the door.** Radical sheets show component
   characters that often *do* have KanjiVG data; wiring the same door there is
   an obvious next step, not done here.
6. **The census disagrees with the brief** (448 vs 446). The number in this
   document is computed from the two shipped JSON layers at run time and is
   recorded in `wp8-measurements.json` under `measurements.census`.
