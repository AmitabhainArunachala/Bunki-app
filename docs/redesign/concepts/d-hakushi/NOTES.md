# D 白紙 Hakushi: refinement log

## Build 0: the first full pass

- **Idea:** every screen is a printed plate, and the app is one line with five stations.
- **Rooms:** five, each with its own ground: white washi, warm kōzo, a straw floor with a lacquer stage, a vellum grid, and kraft gold.
- **Shared pieces:** the vertical hanging sign; the Line nav with a sliding car; the one word slip; the match cut; the spring sheet; and the FLIP word web.
- **Data:**
  - It is built from the real decks: 2,000 words, 1,220 kanji and 644 components, via `tools/build-index.mjs`.
  - Articles come from the six real kit articles with full tokens.
  - One demo record feeds every number.

## Round 1: first look at all 22 stills and the journey

- **Bug: the reader broke into one word per line.** The shelf class `.mine` (display: flex) collided with the reader's `.tk.mine`. I renamed it to `.minec`.
- **Bug: a hidden slip leaked through the translucent Line.** "はんぷく" showed under the bar on the card front, which is a front leak. The slip is now `visibility: hidden` when closed.
- **Journey blocked.** An open slip blocked room changes. The router now closes the slip on every room change.
- **Today:**
  - The Japanese definition wrapped to an orphaned "と". Only the lines beside the sign keep their right padding now.
  - Too many vermilion windows broke the one-mark rule, so they are now very rare.
  - The due count collided with the car, so I moved it.
- **Read:** the shelf strip wrapped ("6 / STORIES"). I dropped the date and the separator and set nowrap.
- **Learn:**
  - "12 new" was duplicated and sat under the sign.
  - The card stage had no sign, so I added one.
  - A stale day override made Reveal pale and off-signal, so I removed it.
  - Added "Front · no readings" on the front, so the inert rule says so.
- **Words:** the legend overlapped the grammar node. I moved it into the crumbs row as real counts, and part labels now wrap.
- **Me:** the hand-written line overlapped the year page. It is now a horizontal epigraph in Yuji Syuku (a real line from the Ise essay).
- **Night:** the Learn stage vanished into the ground. It now has a lifted 藍 panel with a phosphor rim and a radial stage light.

## Round 2: motion frames and night stills

- **Words, 隹 view:** the eleven kanji collided with the culture node, so I re-slotted them on two rows and two sides.
- **Words, part traces:** the traces ran through the part labels. Part traces now elbow just below the labels, and the kanji row moved down to 128.
- **Words, "alive":** added the circuit pulse, a signal square that runs along the trace from the previous centre to the new one (VISION §4: the 回路 web is alive during a dive).
- **The pull (check 24):** the article now ends on a concrete next door ("Walk the web · 反復 · 4× in this article"). Today's line and Me's next door already did this.
- **Me:** the sign was pulled into the flow by a `position: relative` rule, so it now sits at the right again. The kintsugi seam moved to the row's lower edge, where it replaces the hairline, instead of crossing the reading.
- **Crumbs:** the legend was clipped by the sign, so the crumbs row now keeps a 60 px right margin.

## Round 3: language purity, contrast and motion audit

- **Language scan.** I scanned every text node in all 11 routes, in both languages. EN had zero kana or kanji outside learned content. JA mode still showed English kanji glosses ("conjecture", "advance") on Today, the web, the slip and the card anatomy. In JA, kanji are now glossed by their reading (すい, しん), part glosses hide, and English word glosses leave the slip and the entry. The JA aria labels for word nodes use readings.
- **Contrast check.**
  - ink-3 is at least 4.6:1 on all five day grounds and at least 7.2:1 at night.
  - White on asagi is 5.9:1; dark on phosphor is 12:1.
  - Vermilion on kraft is 4.08:1 and is used only for non-text marks there.
- **Motion audit.**
  - CSS transitions are transform or opacity only. I removed a box-shadow transition on the primary button.
  - Every WAAPI keyframe uses transform or opacity.
  - left and top are set statically only.
  - Ambient cycles (windows, rain) are at least 6 s.
- **Narrow phones.** At 320 px the word plate overflowed (its drawing is 390 px wide). It now zooms as a whole drawing below 390 px, and there is no horizontal scroll on any route at 320 px or 390 px.
- **Shooter.** Final re-shoot of the screens and the journey. The shooter prints no page errors.
