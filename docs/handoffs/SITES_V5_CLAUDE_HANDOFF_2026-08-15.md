# Sites v5 donor handoff to Claude — 2026-08-15

This note separates the untouched Sites v5 donor from the operator-approved reconciliation now being built on PR #71.

## Coordinates and authority

- GitHub donor branch: `sites/v5-import`
- GitHub donor commit: `a3de88251d7ea0acde086b190bdd8f3afda46b94`
- Donor commit tree: `ef08e93651d8cc5f5d1bd222ea0c230c84aa8395`
- Original Sites commit: `d1b61776c3edd0863dce4fd337459f72f308e106`
- Original Sites commit tree: `ef08e93651d8cc5f5d1bd222ea0c230c84aa8395`
- Live donor prototype: <https://bunki-kairo-preview.simandharswami1111.chatgpt.site>
- Reconciled integration branch: `agent/bunki-integrated-prototype-2026-08-15`
- Integration baseline / reconciled PR #71 head: `b5124438849a2a26ad801396e0c32bfc02142349`
- Reconciled live prototype: <https://bunki-integrated-prototype.simandharswami1111.chatgpt.site>
- Reconciled Sites version: `appgprj_6a7ff249edbc8191b8c5ec72405c84ad~appgver_88a8019d68fc81918bf02b1607ae48fb`

`sites/v5-import` is a single squashed working-tree donor. Its tree is byte-for-byte equivalent to the Sites v5 tree above. There is intentionally no PR for the donor branch, and it does not touch `main` or `claude/app-vision-next-steps-wei73a`.

The donor is evidence, not the new integration authority. Port selectively into the integration branch. In particular, do **not** replace PR #71's now-gallery-identical ink engine with the Sites engine; see §5.

## 1. Sleeping state and wake trigger

Sites v5 enters quiet mode only when `minimal=1`; the hosted root redirects to `/prototype.html?entry=shelf&demo=ink&minimal=1`. Opening a stroke page then sets `strokeChromeAwake = false`.

While sleeping, the visual allowlist is:

1. the centered living-ink kanji on the active world's full-viewport paper; and
2. one faint `⋯` button at the upper right.

There is no back button, title, khead, pips, hint, counter, replay, slow control, metadata, legacy pigment row, card frame, grid, or guide. The hidden wake field remains in the DOM but is `inert`, `aria-hidden`, invisible, and non-interactive. The kanji canvas is feather-masked into the surrounding paper so it does not read as a square tile.

The sleeping kanji is not a faint guide. On ordinary motion, Sites v5 initially performs a complete write invisibly with `{ iterations: 12, hidden: true }`, including its drying phase, and then fades the finished living-ink sheet in over `0.5s`. The viewport may therefore be briefly blank during that hidden brew. Under reduced motion it paints a finished still immediately. If stroke numbers were already enabled when the room opens, the first write is visible instead of hidden.

The sole wake trigger is a real `44px × 44px` button whose visible text is `⋯`; it rests at `opacity: 0.28` and rises to `0.78` when focused, hovered, or awake. Clicking it merely toggles the awake field. It does **not** resume or restart the brush. A visible rewrite from blank happens only when the learner taps the kanji stage, turns stroke numbers on, or explicitly invokes replay in the non-minimal debug room. First `Escape` while awake sleeps the field and returns focus to `⋯`; a subsequent `Escape` closes the room.

The approved reconciliation makes quiet mode the default (`?minimal=0` is the framed diagnostic route), while retaining the same sleeping allowlist and wake semantics. It also adds one same-URL history sentinel: browser/device Back and the iPhone edge-back gesture close the room and restore the original sheet without introducing a visible Back button; Forward faithfully reopens that same kanji room.

## 2. The ten palettes

They are **not** the ten `CARDS` from `prototypes/corridor/design/stroke-art-iro.html` verbatim. Sites v5 exposes this exact seal order:

`墨 · 朱 · 柿 · 漆 · 金 · 藍 · 赤 · 浪 · 板 · 雷`

The final Sites v5 pigment records are:

```js
{
  sumi: {
    pal: { mode: 0, low: [0.512, 0.448, 0.352], high: [0.16, 0.16, 0.24], sheen: [0.05, 0.055, 0.06] },
    wetScale: 1.0,
    still: '#1c1913',
  },
  shu: {
    pal: { mode: 0, low: [0.95, 0.52, 0.38], high: [0.62, 0.14, 0.1], sheen: [0.06, 0.05, 0.05] },
    wetScale: 1.0,
    still: '#a8281e',
  },
  iwa: {
    pal: { mode: 0, low: [0.7, 0.52, 0.38], high: [0.3, 0.16, 0.08], sheen: [0.05, 0.045, 0.04] },
    wetScale: 1.0,
    still: '#3e2410',
  },
  rokusho: {
    pal: { mode: 1, low: [0.3, 0.28, 0.25], high: [0.94, 0.91, 0.85], sheen: [0.14, 0.13, 0.12], spark: [1.0, 0.98, 0.92], metal: 0.25 },
    wetScale: 0.9,
    still: '#efe9dc',
  },
  yoru: {
    pal: { mode: 1, low: [0.42, 0.3, 0.1], high: [1.0, 0.83, 0.45], sheen: [0.1, 0.12, 0.2], spark: [1.0, 0.9, 0.6], metal: 1 },
    wetScale: 0.85,
    still: '#d9b25f',
  },
  hokusai: {
    pal: { mode: 0, low: [0.48, 0.58, 0.78], high: [0.07, 0.14, 0.28], sheen: [0.05, 0.06, 0.08] },
    wetScale: 1.0,
    still: '#1f3766',
  },
  akafuji: {
    pal: { mode: 0, low: [0.88, 0.55, 0.4], high: [0.55, 0.18, 0.09], sheen: [0.055, 0.05, 0.045] },
    wetScale: 1.0,
    still: '#8c351f',
  },
  nami: {
    pal: { mode: 1, low: [0.32, 0.38, 0.44], high: [0.9, 0.94, 0.97], sheen: [0.1, 0.12, 0.16], spark: [0.95, 1.0, 1.0], metal: 0.35 },
    wetScale: 0.9,
    still: '#eae6d8',
  },
  keyblock: {
    pal: { mode: 0, low: [0.512, 0.448, 0.352], high: [0.16, 0.16, 0.24], sheen: [0.05, 0.055, 0.06] },
    wetScale: 1.0,
    still: '#26221c',
  },
  hakuu: {
    pal: { mode: 1, low: [0.42, 0.3, 0.1], high: [1.0, 0.83, 0.45], sheen: [0.1, 0.12, 0.2], spark: [1.0, 0.9, 0.6], metal: 1 },
    wetScale: 0.85,
    still: '#d9a93f',
  },
}
```

Lineage is deliberate:

- `sumi` is the original 墨 card verbatim.
- `shu` is the original 朱 card verbatim.
- `iwa` carries the original 焦茶 card verbatim.
- `rokusho` carries the original **胡粉** card verbatim; despite the historical id, this public choice is the 漆 seal/world, not the old green 緑青 pigment.
- `yoru` carries the original 金泥 card verbatim.
- `hokusai` is a darker retune of the original 藍 card.
- `akafuji` is an authored rust between 朱 and 弁柄.
- `nami` is an authored additive spindrift white.
- `keyblock` reuses canonical 墨, with a darker still swatch.
- `hakuu` reuses canonical 金泥, with a warmer still swatch.

Thus the old standalone 群青, 緑青, exact 弁柄, and 銀泥 cards are not four of this public set.

In Sites v5 the ten-choice field is **not** an independent ink picker. Each choice calls `requestKairoTheme(id)`, changes the whole app world and paper, and remounts the room with that world's coupled pigment. `THEME_UI` actually contains eleven complete worlds because legacy `kaku` / 殻 remains available to saved preferences and the broader Sites world picker; only `WRITING_PALETTE_IDS` filters the writing-room field to ten. The approved reconciliation keeps 殻 internal/legacy-compatible and filters every public picker, not only the writing room, to the exact ten above.

## 3. Readings layout

The minimal sleeping state has no khead at all. Waking reveals a dedicated two-column readings grid directly below the palette grid:

1. left card: `音読み`, with a small English `on` sublabel;
2. right card: `訓読み`, with a small English `kun` sublabel.

Both use the full KANJIDIC arrays in source order and join multiple readings with `・`; neither is sliced. A missing array renders `—`. Kun okurigana boundaries are made visible by changing KANJIDIC notation such as `なが.い` to `なが（い）`. The accessible name removes the dot entirely and joins multiple readings with `、`. Values use `overflow-wrap: anywhere` rather than truncation.

Compared with the complete labeled 音/訓 readings already on PR #71, the useful Sites contribution is therefore presentation and accessibility: the compact paired cards, parenthesized visible okurigana, and dotless screen-reader label. It adds no separate reading dataset or alternate ordering. The old framed khead remains a different, unlabeled layout and is intentionally absent from quiet mode.

## 4. Stroke-number timing

Sites v5 numbers appear **during the write**, not after freeze. `makeWriterFor()` emits `beginStroke = i` on the same `advance()` result that contains that stroke's first non-empty splat list. The GPU/WebGL loop uploads that stroke's sprite, calls `onStroke(i)`, and advances the ink in the same animation frame. `onStroke(i)` reveals marker `i + 1` and fills its pip. There is no eager `onStroke(0)` at `begin()`.

Turning `筆順の番号` on clears every marker to zero and starts a visible rewrite from blank, so the learner sees each number arise with its stroke. Turning it off hides them immediately. Markers remain present after the completed write; they are not batch-added at freeze. PR #71 at the reconciled baseline had per-stroke reveal, but still emitted the first marker eagerly and announced later strokes when scheduling their gap. This integration tightens that callback to the first real splat with a small writer/UI clock change; it does not transplant the donor renderer or run loop.

One donor defect should not be ported: in reduced-motion mode the Sites toggle paints the finished still but calls `paintStrokes(page, 1, 1)`, revealing only the first number. The approved reconciliation instead presents a coherent finished still with all numbers when the option is on.

## 5. Other evolved details, and what not to port

Writing-room details worth preserving selectively:

- Quiet mode is a true viewport, not a card: `100vw × 100dvh`, no frame, border, radius, or shadow.
- The kanji stage is `min(94vw, 72dvh, 560px)` and uses a radial feather mask to merge the opaque simulation canvas into the same grown paper beneath it.
- The awake field sits above the bottom safe area, is scrollable without a visible scrollbar, and contains only a four-column ten-world grid, a two-column reading row, and the single `筆順の番号` pill.
- Palette buttons are at least `46px` high; the trigger and number control meet the `44px` touch target.
- Tapping the kanji stage writes again with a fresh random seed: “never the same twice.” Theme selection stops the hero engine, washes the app substrate toward the new world, commits the world, then remounts a freshly inked room.
- Paper painters run at design strength inside the room and include visibly biased (`72%`) rounded fibers plus dedicated shell and storm grounds.
- Writer timing constants in the donor are: `600ms` initial brush pause, `120ms` inter-stroke pause, `260ms` settle for ordinary strokes, `460ms` settle for stop strokes, and `4200ms` after the last stroke before `finished` is emitted.
- Sites v5's ordinary rewrite asks for `{ speed: 1, iterations: 1.1 }`; its hidden opening brew asks for `{ iterations: 12, hidden: true }`; slow asks for `{ speed: 0.7, iterations: 1 }`. Slow/replay are not exposed in quiet mode.
- With no stroke paths, untouched Sites v5 leaks its missing-data prose into minimal mode and has no valid awake field behind the trigger. The approved reconciliation fixes this to glyph + faint trigger, with palettes/readings available on wake but no dysfunctional number option.

### Critical engine warning

Do not wholesale port `public/corridor-ink.js` or the app-substrate block from Sites v5. That donor diverged after the gallery law that PR #71 has now restored:

- it accumulates fractional `iterations` to accelerate wall time;
- it advances a separate `writeClock` rather than using PR #71's gallery-identical run loop;
- it adds GPU and WebGL drying tails (`240` GPU frame-steps / `480` WebGL single steps) and accelerated drying batches;
- it performs the twelve-iteration hidden opening brew;
- it contains a large independent app-substrate/flood engine and different substrate lifecycle;
- its WebGL2/render evolution is not the byte-identical gallery pipeline now verified on PR #71.

The approved integration keeps PR #71's wall-clock hand, one GPU lattice step per frame, two WebGL2 steps per frame, the canonical settle/living window, and immediate freeze when `finished` fires—without the donor's extra batched post-finish drying tail. It ports only the useful quiet-room contract, first-splat UI synchronization, complete readings presentation, ten public world choices, paper/contrast refinements, and accessibility behavior. Its normal write is made only a smidgen faster with `speed: 1.1`; slow remains `0.7`. This is the reconciliation boundary Claude should use.
