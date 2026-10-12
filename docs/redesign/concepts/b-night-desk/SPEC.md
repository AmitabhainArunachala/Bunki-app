# B 夜の文机 Night Desk: spec

Track A, the evolution. Open `index.html` from the repo root server (`#/today`, `?theme=night`, `?lang=ja`). Evidence: `shots/sheet-day.png`, `shots/sheet-night.png`, `motion-frames.png`, `motion/journey.webm`.

## The eight laws (printed per VISION §8)
1. The brief is the frame. 2. Beauty and function are one object. 3. One app, one memory, one web. 4. One language at a time. 5. One world, distinct rooms. 6. One job per screen, one obvious next step. 7. Real and true. 8. Calm ground, living detail.

## The concept in one paragraph
Today's app keeps its vibration: woodblock pictures, Mincho, 藍, washi. It gains a **signal layer**, a hairline of light that traces meaning. Light runs from a word down to its kanji and on to their parts. A scan-line sits under the word the voice is reading. A beam passes down a card and leaves the readings behind it. On the plate of the web, the path you walked stays lit. Around the light sits the instrument layer: registration marks, leader lines, tabular mono numerals and a ruled grid. Every annotation in it is real data. By **day** the screen is paper in morning light with crisp instrument lines, and one teal signal. At **night** the same rooms become a writing desk in a 藍 room. The lamp warms the upper left, the city glows cyan and magenta from the lower right through slow rain, the woodblock heroes darken with their lamps lit, the room names glow down the right edge like a sign on a building, and the Words plate becomes a phosphor HUD. The anchor is real: the AI essay's own woodblock is a lamp-lit desk by a harbour window, and the essay is about memory. The day's word 記憶 opens a web that reaches 古事記 (記 = to record) and the Kojiki article on the shelf.

## Tokens v2 (role names; `css/tokens.css`)
| Role | Day | Night |
|---|---|---|
| `--color-ground` | `#f2ede2` washi | `#0b1322` 藍 night |
| `--color-paper` (surface) | `#faf7f0` | `#121c30` |
| `--color-ink` / `-2` / `-3` | `#1b2130` 13.8:1 / `#4a5263` 6.7:1 / `#5f6574` ≥4.8:1 | `#ece5d5` 14.8:1 / `#c0bcb1` / `#9aa0ad` ≥5.5:1 |
| `--color-ai` 藍 (structure, links) | `#1f3b6e` | `#8fb0e6` |
| `--color-line` / `-strong` | 藍 22% / 50% | blue-white 20% / 45% |
| `--color-signal` (one light per screen) | `#006b7c` (5.3:1) | `#5df2dc` phosphor + `0 0 6px` glow (13.5:1) |
| `--color-shu` 朱 (seal, wrong) | `#b8361f` | `#ff6a4d` |
| `--color-gold` / `-leaf` (earned) | `#8a6514` / `#c9a24a` | `#e0bd6a` / `#e8c66e` |
| `--color-lacquer` (stage) | `#141c2e` | `#060a13` |
| `--color-lamp` / `--color-city` / `--color-city-2` / `--color-rain` | morning band | amber 16% / cyan 10% / magenta 7% / blue-white 7% |
| `--font-display` | Shippori Mincho B1 800 | same |
| `--font-reading` / `--font-ui` / `--font-data` / `--font-grade` | system Mincho / system sans / `ui-monospace` stack / Kaisei Tokumin (再難良易 only) | same |
| `--type-*` | hud 10, caption 12, ui 15, reading 19, ruby 10.5, title 26, display 92 | same |
| `--leading-reading` | 2.15 | same |
| `--space-1…7` | 4 8 12 16 20 28 40; gutter 20 | same |
| `--radius-*` | hair 2, surface 6, control 10 | same |
| `--elevation-1/2/sheet` | warm paper shadows | deep shadows plus a hairline lift |
| `--motion-*` | tick 90, crisp 160, settle 280, breath 480, ink 720, ma 320 ms | same |
| `--ease-*` | crisp `(.2,.8,.2,1)`, settle `(.22,1,.36,1)`, ink `(.65,0,.35,1)` | same |

The card stays washi in both themes (`--card-paper` `#f4efe3` by day, `#ebe2cd` at night). It is the one lit sheet of paper in a dark room.

## Rooms (`html[data-room]`)
| Room | Material | Light | Signature gesture | Signature motion / moment |
|---|---|---|---|---|
| **today** | desk paper; a plate with registration marks | a diagonal morning band; at night the lamp upper-left, the city lower-right, rain | one verb (Begin review), with a transit line of stations: Review, Read, Tomorrow | **The light trace.** The word inks in, a held beat, then light runs 記憶 → 記 / 憶 → 言 己 忄 意, and a spark travels it every 7.2 s. The scan-line then reads the day's sentence. |
| **read** | thick kōzo, a full-bleed woodblock, a cartouche label | window light; at night the print's own night (brightness .66, lamp glow breathing at 7.5 s, two-layer rain) | tap any word | **The voice line.** A scan of light sits under the word Ami is reading; the 13 sentence ticks fill. The word sheet is a match-cut: the tapped word flies into the sheet's headword. |
| **learn** | a lacquer stage holding a washi card | stage light from above; at night city rim light on the card edge | answer, hold, grade | **The beam.** Reveal lifts the card and snaps the registration marks inward 3 px. A beam crosses the card top to bottom, each reading appears as the beam passes it, and a light bracket joins the shared part 隹 of 推 and 進. |
| **words** | drafting vellum on an 8/40 px ruled grid; at night a phosphor plate | even and shadowless; at night a central cyan glow | tap any node | **The walk of light.** Nodes FLIP to new places, the old centre moves opposite your direction of travel, and the edge back to where you came from is the only lit trace. The walk shows as crumbs joined by light. |
| **me** | a cream ledger with ruled lines, gold, hanko | low gold light from the upper right; at night the lamp | read your year | **Kintsugi.** A lost word's crack closes in gold (scaleX, 1.4 s), then a cel highlight sweeps it once. Seals stamp into the calendar day by day. |

### Small authored responses (≥3 per room, each under 1 s and tied to meaning)
- **Today:** word ink-in (scale .94→1, 720 ms); traces draw from each glyph (720 ms, staggered); stations arrive like a train (translateX 26→0); press travel on kanji, parts and button (2 px / scale .94); the scan-line reads the sentence; Hear plays the real sentence audio.
- **Read:** hero parallax (0.35×, transform); the lamp breathes at night; the tapped word lifts (−3 px, ×1.06) before the sheet; the sheet rises on a spring (k 300, c 28); traces draw from each kanji to its parts in the sheet; the shelf row nudges on press.
- **Learn:** the deck deals in; registration snap; beam reveal; shared-part bracket with a spark; grade press travel and a haptic tick (`navigator.vibrate(8)`); Again draws a vermilion slash (180 ms), other grades press a stamp (260 ms).
- **Words:** node press scale .92; FLIP re-centring with staggered births; the edge you walked lights up and carries a spark; the detail plate cross-fades (140 ms).
- **Me:** gauges draw from zero (1.1 s, staggered); hanko stamp in with 14 ms stagger; the gold seam closes, then a cel highlight.

### The pull (no guilt)
Today ends its route with **Tomorrow · 12 due · first word 象徴**, half-shown under a mask. The session end (`#/learn/done`) offers a **Next door**: the article that holds 7 of today's words, with Read it now. The shelf marks **New today** against what was already read. The returning word (記憶) glints on Today, on the shelf and in the reader as a dotted due-underline.

## Component map
| Component | What it is | Replaces in today's app |
|---|---|---|
| Tab bar `#tabs` | five hairline icons; EN labels, or JA 今日/読む/学ぶ/辞書/私 | doors, the strewn header (道場, 藍, EN/日本語, 覚 0) |
| `.kanban` | a vertical room sign; Latin rotated in EN, 縦書き in JA; lit at night | nothing (new) |
| `.hud` | mono tabular annotation, real data only | grey metadata pills |
| `.reg` | registration marks; they snap on reveal | nothing |
| `.trace` / `.spark` | the signal hairline (transform `rotate·scaleX`) | nothing |
| Today plate | word → kanji → parts anatomy, sentence with scan, route | `tray` list view |
| Shelf hero + cartouche | full-bleed woodblock, stats strip, due-word chips, one resume button | search bar, 本棚 header, two rows of filter pills |
| Shelf row | thumbnail with registration marks, mono meta, due ticks | big cards with English subtitles |
| Reader + `.a-voice` dock | ruby text, ¶ rules, due underline, scan-line, sentence ticks, real per-sentence audio | thin strip hero, 原文/やさしい switch, tip box, "音声準備中 · coming soon" |
| Word sheet `.sheet` | spring sheet: headword (match-cut), word audio, record strip, kanji → parts, also-met-in, Open its web / Save to cards | reader popup |
| Learn stage + index 01–04 | lacquer stage with live counts; Cards / Focus / Tests / Guided, one home each | 集中道場 dojo page |
| Card front/back | washi on lacquer; inert front; back with answer band, kanji parts, shared-part light, English behind a tap | navy-and-gold deck player (もう一度 / 思い出せた under EN) |
| Grade dock | Again/Hard/Good/Easy with intervals; JA 再難良易 in Kaisei Tokumin | two-button JA-only dock |
| Session end `.d-plate` | seal, real counts, next door | none |
| Web plate | FLIP graph of word, kanji, part, passage, grammar and culture nodes, plus a detail plate with ≥5 dictionary marks | `search` / `thesaurus` / `kanjidex` views |
| Me ledger | four horizon gauges, gold seams, hanko calendar, settings at the back | `me` / `kagami` / `srs-stats` |

## Animations
| Name | Trigger | Properties | Duration / easing | Reduced motion |
|---|---|---|---|---|
| Room enter | route change | opacity, translateY 10 px, staggered by `--i` × 70 ms | 480 ms settle | 120 ms fade |
| Room leave | route change | opacity, translateY −6 | 160 ms crisp | 120 ms fade |
| Ink-in | Today load | opacity, scale .94→1 | 720 ms settle | fade |
| Trace draw | Today, sheet, card back, web | transform scaleX 0→L | 720 ms ink | drawn instantly |
| Spark | lit traces | transform translate, opacity (WAAPI) | 7.2 s loop | none |
| Scan-line | voice / Today | transform translate + scaleX | 150 ms per token | jumps |
| Station arrive | Today load | opacity, translateX 26→0 | 480 ms, delay 520+ ms | fade |
| Parallax | scroll on shelf / article | transform translateY 0.35–0.4× | per frame | stopped |
| Lamp breathe | night Read | opacity, scale | 7.5 s loop | static |
| Rain | night, all rooms | transform translate | 9 s / 14 s (hero 7 s / 11 s) linear | static |
| Word lift + match-cut | tap word | flyer translate+scale (WAAPI), token translateY/scale | 640 ms ink | no flyer, sheet appears |
| Sheet spring | popup open/close | transform translateY (JS spring k 300 c 28 / k 520 c 40) | ~450 ms | jumps |
| Card lift + reg snap | Reveal | transform | 280 ms settle | 120 ms |
| Beam reveal | Reveal | beam transform translateY, opacity; rt opacity staggered by y (0–700 ms) | 820 ms ink | rt fade |
| Answer rise | Reveal | opacity, translateY 12 | 480 ms, staggered 120–700 ms | fade |
| Slash / stamp | grade | transform scaleX / scale + rotate, opacity | 180 / 260 ms | fade |
| Re-centre (FLIP) | tap node | node transform, opacity; centre scale 1.5 | 640 ms settle, births +40 ms each | jumps |
| Gauge grow / hanko / kintsugi / cel | Me load | transform scaleX / scale, opacity | 1.1 s / 240 ms / 1.4 s / 520 ms | final frame |

All animation runs on `transform` and `opacity` only (checked by grep). Every ambient loop runs at 6 s or slower.

## Data honesty
- **Real (repo):** article text, tokens, furigana, paragraph and sentence boundaries, per-sentence audio for voice Ami (`audio/s/ami/bunki-essay-n1-ai-*.m4a`), word audio, character and sentence counts, the N1 share from the article grading, deck sizes (666 / 358 / 976), the 12 kit cards, kanji data (KANJIDIC2/KanjiVG: strokes, Kanken, radical number, readings, direct parts), radical families (隹 in 40 kanji), JMdict glosses, the N1 word count (2,274) and the kanji count through level 2 (2,133). The fields "your due words inside" are real intersections of the due list with article tokens. `js/data.js` is generated by a script that reads these files.
- **Fixture, shaped like the record (`REC` in `app.js`):** the learner's 41 days of review counts, the due list (deck terms taken from these articles), in-review counts, 記憶's history, the resume position, shadowed sentences, kanji recalled, recovered words, FSRS intervals and the session-end counts. In the build each one reads from the real record.

## Building it into the real app (prototypes/corridor)
1. **Tokens:** paste the day/night role values into the **BUNKI DESIGN TOKENS V2** fence in `editorial.css`, scoped on `body`. Add the role names `--color-signal`, `-lamp`, `-city`, `-rain` and `--font-data`. Night becomes a `data-theme` on html, set by the seal or the system.
2. **Per-room css:** `rooms/{today,read,learn,words,me}.css` keyed on `html[data-room]`; Learn's card styles go on `data-room=learn` and the deck views. `data-room-entering` drives the room-enter stagger.
3. **Shared primitives** (vanilla JS with `el()`/`tx()`): `regs(node)`, `trace(layer,a,b,opts)`, `spring(node,…)`, `scanSentence()` → `corridor-signal.js` (about 150 lines). `trace` must recompute on resize.
4. **Views:** the tray → Today (plate + route); the shelf → hero/cartouche/rows; the reader binds the scan-line to the existing `reading-controller.mjs` sentence cues and `reading-position.mjs`; the existing word sheet gets the match-cut flyer and spring, keeping its 44px capture door; the dojo → Learn stage + index; the deck player adopts the washi card, beam reveal and grade dock (`tx()` labels, Kaisei grade glyphs only in JA), with the FSRS scheduler, card ids and `bunki-cloze:*` untouched; the `thesaurus`/word-web view gets the FLIP plate using the dictionary worker for neighbours.
5. **Data:** the web's edges come from the dictionary (KANJIDIC2 parts, the radical index, JMdict words sharing a kanji), passages from the learner's encounter log, grammar from `grammar-v11.json`, and culture notes from a curated table with licences recorded.
6. **Checks:** `lint-ui-language.mjs --both-languages` (a headless pass of this prototype's text nodes already shows 0 EN-chrome kana/kanji and 0 JA-chrome English across 14 routes); `verify-corridor-accessibility.mjs`; reduced-motion snapshots.

## Self-critique (honest)
- **Strongest:** the light trace on Today, the night Words plate (Ghost in the Shell, but every glyph is real), the beam reveal, the shared-part bracket on 推/進, and the night woodblock with its lamp lit.
- **Weaker:**
  - Day Today is calm but still mostly beige. It has no woodblock, and its "city" element by day is only the signal light. A window inset showing the day print, turning to the night print at dusk, would strengthen it.
  - The web is one ring deep with curated edges. A real plate would show a faint second ring.
  - On the card back, the grade dock covers the last lines of the passage.
  -
  - The shelf hero by day shows a night picture, because the lead article's print is a lamp-lit desk.
  - Ruby on long readings (標準 ひょうじゅん) spreads its base text. Chrome has no ruby overhang.
  - The mono stack falls back to DejaVu Sans Mono on Linux. On iPhone it is SF Mono, which is tighter.
