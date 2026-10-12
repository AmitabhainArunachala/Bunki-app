# D 白紙 Hakushi: spec

**The eight laws** (VISION §8):

1. The brief is the frame.
2. Beauty and function are one object.
3. One app, one memory, one web.
4. One language at a time.
5. One world, distinct rooms.
6. One job per screen, one obvious next step.
7. Real and true.
8. Calm ground, living detail.

## The concept

Bunki is designed as a printing house and a railway: **every screen is a printed plate, and the app is one line with five stations.** The ground is paper (washi fibre, sumi, 藍, one 朱). The instrument is the printer's and the transit engineer's: hairlines, registration marks (トンボ), tabular figures, a station diagram for the day, and orthogonal circuit traces for the word web. The city is the light. By day there is exactly one 浅葱 signal per screen. At night it becomes 燐光 phosphor (the 殻 world come home), with lit hanging signs, rain on the woodblocks, and a skyline of lit windows under the day's word.

Each room hangs its name as a vertical sign (縦看板) from the top-right edge: printed ink by day, a neon outline by night that flickers on as you enter. Navigation is **the Line**: five stations on one track. A car slides to the station you are at, so rooms keep a left-to-right order and every room change travels in that direction.

Interaction is one grammar everywhere:

- A tap on any word opens the same slip.
- A tap on a kanji or part opens the web.
- The **match cut** carries the same glyph across every change: the passage word becomes the slip's headline, the picture becomes the article hero, the day's word becomes the centre of the web, and the card's target lifts into the back's head.

## Tokens v2

Role names follow FOUNDATION.md. Values are in `css/tokens.css`.

| Role | Day | Night |
|---|---|---|
| `--color-ground` (Today / Read / Learn / Words / Me) | #f5f3ee / #efe9dd / #e9e4d8 / #e6ebed + grid / #ece2cd | #0b1222 / #101115 / #0a0d17 / #061317 + phosphor grid / #15100b |
| `--color-paper` (surfaces) | #fbfaf6, per room #f8f4ea / #fbf9f3 / #f3f6f7 / #f6efdf | #121a2d, per room #181a20 / #141a29 / #0b1d22 / #1e1710 |
| `--color-ink` / `-ink-2` / `-ink-3` | #15171b / #464b54 / #5f646d (≥4.6:1 on every ground) | #ece8df / #c3c6cf / #9aa1af (≥7:1) |
| `--color-line` / `-line-strong` | ink 14% / 38% | shell 14% / 36% |
| `--color-structure` (藍) | #233a63 | #8fb0e6 (Words #7fe3cf) |
| `--color-mark` (朱: target, seal, wrong) | #c8361b | #ff6a4a |
| `--color-signal` (the one light) / `--color-on-signal` | #0a6f78 浅葱 / #fff (5.9:1) | #5cf0d0 燐光 / #04211b (12:1), with a glow `rgba(92,240,208,.38)` |
| `--color-gold` / `--color-gold-leaf` | #8a6420 / #c9a24e | #e2bd6a / #d9b25a |
| `--color-lacquer` (frames only) | #1d1513 | #070a14 |
| `--font-display` / `--font-serif` / `--font-sans` / `--font-hand` / `--font-grade` | Shippori Mincho B1 800 / system Mincho / system sans / Yuji Syuku / Kaisei Tokumin (再難良易 only) | same |
| `--type-micro`, `label`, `ui`, `body`, `reading`, `ruby`, `title`, `hero`, `giant` | 10.5, 12, 15, 17, 19, 10.5, 26, 54, 112 px | same |
| `--leading-tight`, `ui`, `reading` | 1.15, 1.35, 2.05 | same |
| `--weight-regular`, `strong`, `display` | 400, 650, 800 | same |
| `--space-1` … `--space-12` | 4, 8, 12, 16, 20, 24, 32, 40, 48; `--gutter` 20; `--hit` 44; `--line-h` 68 | same |
| `--radius-hair`, `control`, `pill` | 2, 3, 999 (paper has corners) | same |
| `--elevation-paper`, `raised`, `sheet` | two-layer warm paper shadows | 1px shell edge + deep shadow |
| `--motion-tick`, `crisp`, `settle`, `breath`, `ink`, `ma` | 90, 160, 280, 480, 720, 320 ms | same |
| `--ease-crisp`, `settle`, `ink`, `out` | (.2,.8,.2,1), (.22,1,.36,1), (.65,0,.35,1), (.16,1,.3,1) | same |

## Rooms

Each room stamps `html[data-room]`.

| Room | Material | Light | Signature gesture | Signature motion (the moment) |
|---|---|---|---|---|
| **Today** | Thin white washi; the day's word on 田字格 practice squares, with a vertical reading | A dawn band, cool left and warm right, over a hairline elevation drawing of the city. At night the drawing becomes the city: lit windows, some going dark on slow cycles | Tap the day's word | The word inks in glyph by glyph (brush easing), then the timetable's track draws down and the three stops arrive like a train (Rintaro). The button rises last |
| **Read** | Thick kōzo; full-bleed woodblocks with vertical cartouches and an N-level hanko | Window light. At night the same print darkens under two layers of rain, and the cartouche glows like a paper lantern | Tap any word (one slip everywhere) | The shelf picture becomes the article hero (match cut), with parallax on scroll. The voice line underlines word by word |
| **Learn** | Straw paper floor; a lacquer proscenium (only ever a frame) holding stacked washi cards | Stage light on the card; at night, deep 藍 with a phosphor rim | Reveal, a held beat, then grade | Reveal is not a flip. The passage stays put, the target lifts into the head (match cut), the readings ink in word by word, there is a 320 ms 間, and then the grades rise. *Again* draws one vermilion cut across the card (Hakuin) before it slides away |
| **Words** | Drafting vellum on a 13/65px grid: an Akira mechanical plate | Even and technical; at night a phosphor blueprint | Tap any node; it becomes the centre | Re-centring: shared nodes fly to their new places (spring), new ones fan out from the old centre, a signal pulse runs along the circuit trace from where you were to where you are, and the traces come on after a 間 |
| **Me** | A bound book: kraft and gold, page edges, a hanko year | Late, low, gold; at night a desk-lamp gold | Tap a mended word | The weeks stamp in like seals, the rulers draw to their exact values, and one cel highlight crosses each gold kintsugi seam |

### Little things (≥3 per room, each under 1 s and tied to a meaning)

- **Today**
  - The 38 on the Today station is the real due count.
  - The day's word presses down under the finger.
  - Timetable stops press sideways like a points switch.
  - At night, a few windows go dark and light again on 6–15 s cycles.
  - The stroke count sits beside each glyph.
- **Read**
  - Words that are in your decks carry an indigo dotted underline. This is the ghost layer: reading feeds the cards.
  - The picture presses in at 1.02.
  - The tapped word stays lit vermilion while its slip is open.
  - The article ends with a next door: walk 反復, with its count in this article.
  - Keep stamps a seal on the slip.
- **Learn**
  - The deck sheets fall onto the stage on entry.
  - The deck breakdown bars draw out.
  - The progress ticks turn gold as cards are graded.
  - The registration marks snap 2 px inward when a card is graded.
  - English is behind one tap.
  - Each grade pad has 2 px of travel.
- **Words**
  - The crumb path is "back to the exact step".
  - Via squares mark each real junction.
  - The plate legend gives real counts.
  - Search answers from the 2,000 deck words as you type.
  - A passage list highlights the word in real sentences.
- **Me**
  - The today cell is outlined.
  - Gold days are days a lost word came back.
  - The percentages are exact to 0.1%.
  - The settings segments switch language and light for real.

## Component map

| Component | What it is | Replaces in the real app |
|---|---|---|
| The Line (`.line`) | Five stations on one track with a sliding car and the due count | `buildPrimaryTabs()` bar (`PRIMARY_TABS`) |
| Hanging sign (`.sign`) | Vertical room name, printed by day and lit by night | Header room labels; the 道場 chrome label |
| Strip (`.strip`) | One line of real data per plate | The top chrome row (戻る, 道場, 藍, EN/日本語, 覚 0) |
| Day word + Today's line (`.dayword`, `.board`) | The ritual: one word, three stops, one verb | `tray` view |
| Shelf (`.story-lead`, `.story-pair`, `.story-row`) | A magazine; the filter folds into one control | `shelf` view, its grey pill rows and tool grid |
| Reader (`.hero`, `.reader`, `.voiceline`) | Full-bleed hero, ruby text, deck-word ghost layer, voice line, next door | `reader` view, thin-strip hero, tip box, "audio coming soon" |
| Word slip (`.slip`) | One sheet for every word: reading, gloss, kanji tiles, counts, Keep | Reader word popover, sky word sheet, deck gloss sheet |
| Learn room (`.lstage`, `.lrows`) | Four sections, each with one home and a live count | `dojo` (集中道場) |
| Card stage (`.lacquer`, `.card`, `.grades`) | Lacquer frame with a washi card; same passage front and back | The deck player's navy/gold card |
| Word web (`.field`, `.node`, `.traces`, `.entry`, `.anat-plate`) | The graph of word ↔ kanji ↔ part ↔ family ↔ passages ↔ grammar ↔ culture, plus an anatomy plate | `search`, `kanjidex`, `thesaurus` (word-web) |
| Year book (`.yearbook`, `.horizons`, `.mended`, `.settings`) | Honest progress plus the settings at the back | `me`, `kagami`, `srs-stats` |

## Every animation

All of them animate only transform and opacity. With `prefers-reduced-motion: reduce`, every one collapses to a crossfade of 120 ms or less, the springs jump to their end, and the match cuts are skipped. With `?still`, everything is off.

| Name | Trigger | Properties | Duration and easing | Reduced motion |
|---|---|---|---|---|
| Station car | Any room change | transform X | 460 ms, overshoot (.34,1.25,.5,1) | 120 ms |
| Multiplane plate change | Room change | Layers 0–4: translateX of 16 + 14·L px plus opacity, each 50 ms later; the old plate goes −24 px and fades | 420 + 40·L ms, settle; out 180 ms | 120 ms fade |
| Sign ignition (night) | Room entry | opacity steps | 900 ms, steps | 120 ms |
| Day word ink-in | Today entry | Glyph translateY −10 → 0, scale 1.06 → 1, opacity; cells fade first | 760 ms each, 220 ms apart, ink (.65,0,.35,1) | none |
| Train arrival | Today entry | Track scaleY 0 → 1; stops translateX 56 → 0 plus opacity, 110 ms apart; button rises 14 px | 520–640 ms, out | none |
| City windows | Night, ambient | opacity | 6–15 s cycles | paused (1 iteration) |
| Rain | Night prints, ambient | translate3d | 7 s and 11 s linear loops | stopped |
| Picture → hero | Open an article | transform from the shelf rect | 560 ms, settle | skipped |
| Hero parallax | Scroll | translateY(0.35·y) and a small scale | Live | off |
| Word slip | Tap any word | Spring translateY (k 300, c 28); the scrim fades | ≈350 ms | instant |
| Word match cut | Slip opens | Clone flies from the word's rect to the headline (translate plus scale), held at 82% | 560 ms, settle | skipped |
| Kanji tiles | Slip opens | translateY 8 → 0 plus opacity, 70 ms apart | 320 ms | none |
| Seal press | Keep | scale 1.6 → .94 → 1, rotate, opacity | 260 ms | 120 ms |
| Deck fall | Learn entry | Sheets translateY plus rotate plus opacity | 520 ms | none |
| Reveal | Reveal | Target match cut into the head (620 ms); rt opacity and translateY 14 ms apart; a 320 ms 間; grades rise 16 px, 50 ms apart | ≈1.1 s total | instant |
| Again cut | Grade Again | Vermilion bar scaleX 0 → 1 at −14°, then a 240 ms hold | 160 ms | skipped |
| Card out / in | Any grade | translateX −110% with rotate, then the next card comes in from +60% | 300 + 420 ms | instant |
| Registration snap | Grade | トンボ translate 2 px inward | 160 ms | 120 ms |
| Web arrival | From Today, a card or the slip | Centre node from the source rect; nodes scale .5 → 1; traces fade | 640 / 460 / 400 ms | skipped |
| Re-centre (FLIP) | Tap a node or a crumb | Shared nodes translate plus scale from their old place (springy); new nodes fan out from the centre; leaving nodes fade; the ring settles from 1.35 | 560 ms; fan 520 ms, 28 ms apart | instant |
| Circuit pulse | Re-centre | 8 px signal square translated along the trace's elbows, then scale 3 plus fade | 520 + 300 ms | skipped |
| Hanko year | Me entry | Week columns scale 1.25 → 1 plus opacity, 22 ms apart | 220 ms | none |
| Rulers | Me entry | Fill scaleX; marker translateX | 700 ms, ink | none |
| Cel highlight | Me entry | One skewed highlight translateX across each gold seam | 900 ms, once | none |
| Press travel | Every control | translateY 1–2 px, or scale .94–.985 | 90 ms | 120 ms |

## Building it into the real app

The real app is `prototypes/corridor`: vanilla JS with `el()` and `tx()`, CSS only through Tokens v2, and per-room CSS files.

1. **Tokens.** Copy the role values above into the BUNKI DESIGN TOKENS V2 fence in `editorial.css`, scoped on `body` and on `html[data-room=…] body`. New roles needed: `--color-mark`, `--color-signal`, `--color-signal-glow`, `--color-on-signal`, `--color-structure`, `--color-lacquer`, `--color-grid*` and `--color-gold-leaf`. Night is `html[data-theme=night]`, mapped to the existing theme switch.
2. **The Line.** Restyle `buildPrimaryTabs()` markup (add the rail, track and car, plus `.station-node`) and keep `PRIMARY_TABS` as the single table. `--nav-clearance` becomes 68 px plus the safe area. `observePrimaryDocks()` already handles docks above it (the voice line and the grade dock).
3. **Sign and strip.** These are a small `roomSign(room)` and `roomStrip(...)` built with `el()` and `tx()`, appended by each view's render. The sign is `aria-hidden`; the strip holds real record numbers only.
4. **Rooms.** Write one CSS file per room: `rooms/today.css`, `read.css`, `learn.css`, `words.css` and `me.css`.
   - `tray` gains the day word and the board. The day word comes from the scheduler's next due card; the stops come from the due count, today's pick and that word's first part.
   - `shelf` and the reader keep their IDs. Only the markup of the lead, pair and rows changes, plus the `.tk.mine` class from the learner's known set.
   - `dojo` keeps its three groups, re-laid out as the stage plus rows.
   - The deck player keeps its storage, card IDs, `bunki-cloze:*` keys and zero-leak front. Only the reveal sequence and the lacquer frame are new.
5. **The slip.** Unify the reader popover and the sky/deck sheets into one `openSlip()` (JMdict for words not in the decks). This also fixes the "same tap everywhere" law.
6. **The web.** `graph(key)` in `js/rooms/words.js` is a pure function of the deck index plus notes. Port it to read the dictionary worker; layout uses fixed slots, and the FLIP is about 60 lines.
7. **Motion.** `spring()` and `matchCut()` in `js/ui.js` are about 40 lines with no dependencies. Respect `prefers-reduced-motion` exactly as here.
8. **Checks.** Run `tools/lint-ui-language.mjs --both-languages`. This prototype already passes a text-node scan in both languages: zero kana or kanji in EN chrome, and zero English in JA chrome. In JA mode, kanji are glossed by reading, never by English. Also run the 44 px and contrast verifiers and the F1 subset.

## Honest self-critique

- **Voice is simulated.** The voice line plays the word-by-word timing without audio, because no voiced file was wired in this prototype. In the real build it must be bound to a real Kore track, or it ships hidden.
- **The record is a demo.** Every number on screen comes from one consistent object (`R` in `js/data.js`) and from the real decks: 38 due, 214/666 and so on. But the learner and his year are invented. Kanji met (512) is computed from the held deck words, and Kanken's ≈6,000 is a published approximation.
- **Grade intervals are shown, not computed.** They are not run through FSRS here.
- **Mock tests and Guided are not wired.** Focus routes to the 隹 family plate (honest, but not a timed sitting). The mock lengths and Guided row are present but go nowhere in the prototype.
- **The card back is long.** The full passage with readings plus anatomy needs a scroll at 390 px. The grade dock is sticky, but "Show English" sits just under it on first view.
- **Ruby spacing follows the browser.** Chromium spreads the base under long readings (標 準 語). It is typographically correct but uneven; a custom overhang would read cleaner.
- **The door (word sky) is not reimagined here.** Today is the entry. The rejection of the sky as the first screen is deliberate but untested with him.
- **Deck data has quirks.** Component data is the deck's own (e.g. 復 lists 亻), so it is real but imperfect.
