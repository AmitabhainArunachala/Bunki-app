# C 生きた本棚 Living Shelf: evolution made alive

Track A (evolution). Prototype: `index.html` (`#/today #/read #/read/article #/read/popup #/learn #/learn/front #/learn/back #/learn/done #/words[/w|k|p/<key>] #/me`, plus `?theme=night` and `?lang=ja`). Evidence: `shots/`, `motion/journey.webm`, `motion-frames.png`.

**The eight laws** (VISION §8): 1 the brief is the frame · 2 beauty and function are one object · 3 one app, one memory, one web · 4 one language at a time · 5 one world, distinct rooms · 6 one job per screen, one next step · 7 real and true · 8 calm ground, living detail.

## The concept in one paragraph

Today's app already has a vibration: the word sky at the front door, woodblock prints, Mincho, 藍 indigo and washi paper. Living Shelf keeps all of it and makes it move, the way the 80s–90s masters moved a frame. The sky of your own words becomes the Today room. Its words drift on three parallax planes, and the day's word sits in the middle with one sentence of wonder ("A small bird, 隹, hides inside both kanji"). Tap any word and it is carried, the same glyph from the same pixel, into the **word web**. The web is a drafting plate: word, kanji, parts, siblings and passages, with real data marks. Each tap re-centres it with the same match-cut, so you go word → kanji → part → family and back to the exact sentence without feeling a page change (Kon). The shelf is alive too. Each room is a bound volume with a vertical spine label. On Read the books are real spines whose height is the article's real length, and they lean and breathe. The lead woodblock breathes and parallaxes, and at night the same print turns to rain and lanterns. Learn is a lacquer stage with one lit washi card. The answer is revealed after a held beat (間), with furigana rising like ink. Me is a stab-bound book of hanko stamps, with a gold seam for every word that came home. Interactive motion is 300 ms or less, and only ambient motion runs longer.

## The one thread that ties every room

**One glyph carried across contexts.** The Today word flies into the web. A web node flies to the centre. A kanji tile in the word sheet flies to the plate. The book spine's picture opens into the article hero. The web's passage node returns you to the article at the same line, and that line glints. This is the signature of the whole app and its shareable clip: 推進 → 推 → 隹 → the bird's 40-kanji family (21 of them already in your words).

---

## Tokens v2 (role names from FOUNDATION.md)

File: `css/tokens.css` (`:root` = day, `html[data-theme="night"]` = night). In the real app these go on `body` inside the token fence, as FOUNDATION says.

| Role | Day | Night | Note |
|---|---|---|---|
| `--color-ground` | `#ece5d6` | `#0c1423` | washi / 藍 washi (never black) |
| `--color-ground-2` | `#e3dbc9` | `#0f192b` | |
| `--color-page` | `#f1ebdf` | `#101a2c` | |
| `--color-paper` | `#f7f2e8` | `#141f33` | raised paper |
| `--color-surface` | `#fbf8f2` | `#18253b` | sheets |
| `--color-surface-sunk` | `#e6dece` | `#0a111e` | |
| `--color-ink` | `#191c22` | `#ede6d6` | sumi / 胡粉 (15:1 both) |
| `--color-ink-2` | `#383d47` | `#cfc8b8` | |
| `--color-muted` | `#555b66` | `#a3acbb` | ≥6:1 |
| `--color-quiet` | `#6b6a64` | `#8c96a8` | captions only, ≥4.6:1 |
| `--color-line` | `rgba(25,28,34,.16)` | `rgba(220,230,255,.16)` | hairlines |
| `--color-line-soft` | `rgba(25,28,34,.08)` | `rgba(220,230,255,.08)` | |
| `--color-rule` | `rgba(31,58,95,.38)` | `rgba(120,220,210,.34)` | 藍 ruling / phosphor ruling |
| `--color-rule-soft` | `rgba(31,58,95,.12)` | `rgba(120,220,210,.10)` | |
| `--color-edge-strong` | `rgba(25,28,34,.34)` | `rgba(220,230,255,.30)` | raised edges (border + shadow kept) |
| `--color-accent` | `#1f3a5f` 藍 | `#9db8e6` | structure, primary face (day) |
| `--color-accent-wash` | `rgba(31,58,95,.08)` | `rgba(157,184,230,.10)` | |
| `--color-seal` | `#b4301c` 朱 | `#ff7657` | "this, now": seal, target, wrong |
| `--color-seal-wash` | `rgba(180,48,28,.09)` | `rgba(255,118,87,.13)` | |
| `--color-signal` | `#0b6f78` 浅葱 | `#5df2d6` phosphor | exactly one element per screen |
| `--color-signal-wash` | `rgba(11,111,120,.12)` | `rgba(93,242,214,.13)` | |
| `--color-signal-glow` *(new)* | transparent | `rgba(93,242,214,.45)` | emitted light, night only |
| `--color-gold` *(new)* | `#94702a` | `#e2bd6c` | earned only (kintsugi seam, saved) |
| `--color-lacquer` *(new)* | `#141a28` | `#060a13` | 藍漆, frames only |
| `--color-lacquer-2` *(new)* | `#1d2638` | `#0b1220` | |
| `--color-card-surface` | `#f6f0e3` | `#e9e1cf` | the card stays paper under stage light |
| `--color-card-ink` / `-ink-2` / `-muted` | `#191c22` / `#383d47` / `#5a5f68` | same | |
| `--font-display` | Shippori Mincho B1 800 → system serif | | display, headwords, numerals |
| `--font-reading` | `"Hiragino Mincho ProN","Yu Mincho","Noto Serif CJK JP",serif` | | reading text, passages |
| `--font-ui` | `-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans CJK JP",sans-serif` | | all chrome |
| `--font-seal` | Kaisei Tokumin (再 難 良 易 only) | | JA grade pads |
| `--font-brush` | Yuji Syuku | | reserved; not used in this prototype |
| `--font-data` *(new)* | `ui-monospace,"SF Mono",Menlo,monospace` | | system mono, tabular data only |
| `--type-*` | caption 11 · label 12 · chrome 13 · control 15 · body 16 · reading 19 · lead 21 · section 24 · title 30 · headword 48 · display 88 · hero 132 · seal 22 | | px |
| `--leading-*` | tight 1.15 · ui 1.35 · body 1.6 · reading 2.15 | | reading leaves room for ruby, so there is no reflow on reveal |
| `--weight-*` | regular 400 · medium 500 · semibold 600 · bold 800 | | Shippori ships 800 only |
| `--space-*` | hair .5 · 1=4 · 2=8 · 3=12 · 4=16 · 5=20 · 6=24 · 8=32 · 10=40 · 12=48 · 16=64 · 20=80 · 24=96 | | |
| `--radius-*` | none 0 · small 2 · seal 3 · card 4 · control 6 · surface 10 · float 14 · overlay 18 · pill 999 | | paper is nearly square |
| `--elevation-paper` | `0 1px 0 ink/6%, 0 6px 18px ink/5%` | black/40%, black/35% | two-layer paper shadow |
| `--elevation-card` / `-lift` / `-float` | see file | deeper at night | |
| `--motion-press` | 90ms | | button travel |
| `--motion-quick` | 160ms | | chrome |
| `--motion-standard` | 220ms | | |
| `--motion-sheet` / `-room` | 280ms | | sheets, room entrance |
| `--motion-ma` *(new)* | 120ms | | the held beat (間) before an answer |
| `--motion-long` | 9000ms | | ambient breath (≥6 s cycles) |
| `--ease-standard` | `cubic-bezier(.2,.8,.2,1)` | | |
| `--ease-enter` | `cubic-bezier(.22,1,.36,1)` | | |
| `--ease-exit` | `cubic-bezier(.4,0,1,1)` | | |
| `--ease-ink` *(new)* | `cubic-bezier(.65,0,.35,1)` | | brush entering and leaving paper |

Per-room overrides use `html[data-room=…]` (`--color-ground`, `--color-paper`, and on Words at night `--color-rule*`). The world palette never changes; only material and light change.

## Per-room identity

| Room | Material | Light | Signature gesture | Signature motion | Spine label |
|---|---|---|---|---|---|
| **Today** | thin washi under the word sky; a horizon of roofs | dawn band, cool left → warm right; **night:** the city from above, roofs with lit windows (amber, 1 in 7 phosphor) | one word, one verb: "Follow the bird" / "Begin today" | three parallax planes drift (14/19/26 s); due words breathe (7 s); the day's ticks arrive like a train | TODAY · 10·08 |
| **Read** | thick kōzo, magazine weight; full-bleed woodblock; a lacquer shelf ledge | morning window; **night:** the same print darkened, rain plane plus lantern glow | pull a spine; tap any word | hero breathes (14 s) and parallaxes on scroll (0.42×, mist 0.18×); spines lean (9 s, staggered); voice line travels word by word | READ · 06 |
| **Learn** | 藍-lacquer proscenium holding one washi card (a vermilion rim under the lacquer) | stage spotlight; the card is the only lit paper | answer · hold · grade | reveal: 間 120 ms → ruby rises line by line → the answer plate rises → grade pads rise; registration marks snap in on grade | LEARN · 12 |
| **Words** | drafting vellum over a 10/50 px 罫線 grid, registration marks, legend | even and shadowless; **night:** a blueprint, phosphor wires with optical glow, the cyberpunk plate | open anything into its parts | re-centring match-cut; leaders unfold from the centre; strokes ink in order; pointer parallax (wires 4 px, nodes 8 px) | WORDS · plate n |
| **Me** | stab-bound book (和綴じ holes and gold thread), hanko grid | late gold from the upper right; **night:** a lamp | read your own record | seals press in (scale 1.4 → 1, 2.4 ms stagger); horizon bars draw; a cel highlight runs once along each gold seam | ME · 214 |

## Three Japans on every screen (check 22)

- **Today.** Paper: washi, Mincho sky. Instrument: transit line, train ticks, tabular data. City: the phosphor "now" stop, and at night the lit roofs.
- **Read.** Paper: woodblock, kōzo. Instrument: registration marks, data line, chars and min. City: the signal voice line, and at night rain and lanterns.
- **Learn.** Paper: washi card. Instrument: tick progress, registration marks, intervals. City: lacquer night stage, the vermilion "now" tick with glow.
- **Words.** Paper: vellum, Mincho. Instrument: the plate with leaders, stroke ticks, data marks. City: the signal shared part, a full blueprint at night.
- **Me.** Paper: the bound book, hanko. Instrument: exact numbers and bars. City: the signal ring on today's cell, and the lamp at night.

## Alive: authored micro-responses per room (check 23), each under 1 s and each carrying meaning

- **Today.**
  - A sky word answers touch with weight (scale 1.14), then flies into its web.
  - The day's word inks in (scale 1.04 → 1, 520 ms, once).
  - The 12 ticks arrive like a train, the first 3 vermilion for the 3 hardest cards.
  - Due words carry a vermilion dot and breathe brighter.
  - The primary button has 2 px of physical travel.
- **Read.**
  - The spine pulls 16 px off the shelf before opening.
  - Words that are in your decks wear a dotted 藍 underline.
  - The spoken word carries the one signal underline.
  - On return, the exact word glints.
  - The word sheet rises on a spring.
- **Learn.**
  - Held beat, then furigana rise.
  - "Show English" slides the gloss in (you work a little to see it).
  - Registration marks snap 3 px inward on grade.
  - Grade pads have press travel.
  - The progress tick glows vermilion on the current card.
- **Words.**
  - The tapped node's glyph flies to the centre.
  - Leaders unfold from the centre.
  - Strokes ink in stroke order with KanjiVG numbers.
  - The shared part glows (signal).
  - Sibling words ink their shared kanji in 藍.
- **Me.**
  - Hanko press in.
  - Bars draw to their exact value.
  - The cel highlight slides along each kintsugi seam once.
  - Tomorrow's first word is half-shown.

## Signature moments (check 25)

- **Today:** "the bird". 推進 lifts out of the sky and lands in the web, where one 隹 is lit between both kanji.
- **Read:** the spine becomes the window. At night the woodblock is the rainy city.
- **Learn:** the reveal. A held frame, then the reading rises over every kanji, and the answer plate shows 研 = 石 stone + 开; the whetstone (砥石) is in the definition.
- **Words:** the family. 隹 opens into 40 kanji, and 21 of them are already in your words.
- **Me:** the gold seam closes over 辛抱, 怠る and 目下, "lost, then kept".
- **Session end:** "The surface is clear." The day's words rise, and one next door is offered.

## The pull (check 24)

Every walk ends on one visible next door:
- **Learn session end** (`#/learn/done`): the article that holds your words, "Read it now", plus tomorrow's first word half-shown.
- **Today:** the ritual line "Then 伊勢の時間 · 9 of your words".
- **Me:** "Tomorrow · 9 cards, first 推敲".
- **Read:** ranked by how many of your deck words each article holds. This count is computed live from the real decks, so the shelf changes as the decks change.

## Component map (what replaces what in today's app)

| Component | Replaces (real app) | Notes |
|---|---|---|
| Spine label `.spine` | room headers that all looked alike; the "dojo" chip | vertical room name + one real number; lit like a 縦看板 at night |
| Five-tab bar `#tabs` | top chrome row (search · 道場 · 藍 · EN/日本語 · 覚0) | `PRIMARY_TABS`; hairline icons drawn for this concept; the vermilion seal is the active state |
| Today sky `.sky` + `.star` | the front-door drift (kept); `tray` | the door's sky becomes the ritual's ground; due words marked |
| Day's word `.dayword` | none (new) | the daily hook into the web; one sentence of wonder generated from real part data |
| Ritual line `.ritual` | the strewn tray lists | 3 stops, 1 primary action |
| Lead woodblock `.lead` | thin-strip shelf card + two rows of grey pills | full-bleed 3:2 picture above the fold; filters fold into one control |
| Book spines `.book` + `.ledge` | the shelf's card list | spine height = article length; count = deck words inside |
| Reader `.article`, `.text .w` | `reader` with tip box, 原文/やさしい explainer, "audio coming soon" | kinsoku-safe tokens, ruby 10.5–11 px, a sticky voice bar (no placeholder) |
| Word sheet `.sheet` | the word popup, which differed between rooms | one tap grammar: reading, meaning, defJa, kanji tiles → parts → web, other cards, family, 覚える |
| Learn stage `.proscenium` + `.sections` | `dojo` (集中道場) "everything strewn together" | the stage + 4 numbered sections with live counts, one home each |
| Card `.card-room` | navy-and-gold deck player ("two products") | lacquer frame in the world's darkest tone, washi card, EN grade pads (JA 再難良易 in Kaisei Tokumin) |
| Session end `.finish` | none / a scrap pile of stats | cleared surface, tally, one next door |
| Word web `.plate` | `search` / `kanjidex` / `thesaurus` (`word-web`) | one plate for word, kanji and part, re-centring with a breadcrumb trail of the walk |
| Data marks `.marks` | none | 6 real marks per plate (deck, reading, kanji, strokes, shared part, siblings; or strokes, meaning, on, kun, Kanken, words) |
| Year book `.me` | `me` / `kagami` / `srs-stats` | four horizons, came-home seams, 12-week hanko, next door, settings at the back |

## Every animation

All animate **only `transform` and `opacity`** (the Words plate's pointer parallax uses `transform` too). Under `prefers-reduced-motion: reduce`, every animation and transition drops to a 120 ms crossfade, ambient motion (`.ambient`) stops, the springs jump to their end, and match-cuts are skipped (the target simply appears).

| Name | Trigger | Properties | Duration | Easing | Reduced |
|---|---|---|---|---|---|
| room entrance `plate` | any route | translateY 10/16/22 px → 0, opacity (3 planes, 0/30/60 ms) | 280 ms | ease-enter | fade 120 ms |
| match-cut | sky word / day word / kanji tile / web node / book picture | transform translate + scale of a fixed clone (WAAPI) | 280 ms (220 for web) | ease-enter | none, instant |
| sky drift `drift1-3` | ambient | translate ≤18 px | 26 / 19 / 14 s alternate | ease-in-out | off |
| due breath `breath` | ambient | opacity .96 ↔ .7 | 7 s alternate | ease-in-out | off |
| ink-in `ink` | day word, sheet headword | opacity, scale 1.04 → 1 | 420–520 ms (non-blocking) | ease-ink | fade |
| train `arrive` | Today load | translateX 46 → 0, opacity, 12 ms stagger | 300 ms | ease-enter | fade |
| hero breathe `breathe-pic` | ambient | scale 1 → 1.035, translateX −4 px | 14 s alternate | ease-in-out | off |
| hero parallax | scroll | translateY 0.42× (picture), 0.18× (mist) | live | n/a | off |
| rain | night, ambient | translateY 40 px | 9 s linear | linear | off |
| spine lean `lean` | ambient | translateY −3 px | 9 s alternate, staggered 1.3 s | ease-in-out | off |
| spine pull | tap | translateY −16 px | 90 ms | ease-standard | instant |
| voice line | play | underline scaleX 0 → 1, opacity | 220 ms per word | ease-standard | fade |
| return glint `glint` | back to the line | opacity | 1.2 s once | ease-standard | fade |
| word sheet spring | word tap | translateY (spring k 460, ζ .86) | ≈260 ms | physics | jump |
| scrim | word tap | opacity | 220 ms | ease-standard | 120 ms |
| reveal `inkrise` | Reveal | ruby opacity + translateY 3 px; delay 間 120 ms + 4 ms × index | 240 ms | ease-enter | fade |
| answer plate `rise` | Reveal | translateY 18 px, opacity; delay 140 ms | 280 ms | ease-enter | fade |
| grade pads `rise` | Reveal | same, 220 ms + 20 ms × n | 260 ms | ease-enter | fade |
| English toggle | tap | opacity + translateY 4 px swap | 160 ms | ease-standard | fade |
| registration snap | grade | translate 3 px inward | 160 ms | ease-standard | instant |
| stage float `float` | ambient | translateY −4 px, rotate | 8 s alternate | ease-in-out | off |
| web re-centre | node tap | chosen glyph translate + scale; others opacity → 0 (120 ms); swap at 200 ms; centre scale .96 → 1 | ≤300 ms | ease-enter | instant swap |
| leaders `wire` | plate render | scale .5 → 1 from the centre, opacity, 10 ms stagger | 260 ms | ease-enter | fade |
| nodes `nodein` | plate render | scale .55 → 1, opacity, 14 ms stagger | 260 ms | ease-enter | fade |
| strokes `inkst` | kanji plate | opacity per stroke, 18 ms stagger | 200 ms | ease-ink | fade |
| hanko `stamp` | Me | scale 1.4 → 1, opacity, 2.4 ms stagger | 200 ms | ease-enter | fade |
| bars `grow` | Me | scaleX 0 → value | 600 ms (non-blocking) | ease-enter | fade |
| kintsugi `cel` | Me | translateX, skew, opacity, once | 520 ms | ease-standard | off |
| session `up` | session end | translateY 70 → 0, opacity | 2.4 s ambient | ease-enter | fade |
| button press | press | translateY 2 px | 90 ms | ease-standard | instant |

Nothing interactive makes the user wait: every control is live immediately, and the longer pieces (ink-in, bars, the rise) never block input.

## EN / JA

- **EN.** All chrome is English. The spine labels are English small caps. The only Japanese is learned content (each word marked `lang="ja" data-ui-content="learning"`, and the controls that carry a word declare `data-ui-content-value`), plus the 日本語 option in Settings.
- **JA.** All chrome is Japanese: 今日/読む/学ぶ/辞書/私, 再/難/良/易 in Kaisei Tokumin, tategaki spine labels. The voice name "Kore" stays.
- **Prototype-only.** Glosses in English (meanings) remain in JA mode as learning content.

## Building it into the real app (prototypes/corridor)

1. **Tokens.** Paste the table above into the `BUNKI DESIGN TOKENS V2` fence on `body:not([data-view='drift'])`, plus `html[data-room=…]` overrides. Add the new roles to the compatibility bridge: `--color-signal-glow`, `--color-gold`, `--color-lacquer(-2)`, `--font-data`, `--motion-ma`, `--ease-ink`.
2. **Room stylesheets.** `rooms/{today,read,learn,words,me}.css` map 1:1 to this prototype's `css/*.css`. Selectors become the real views (`tray`, `shelf`, `reader`, `dojo`, deck player, `search`/`word-web`, `me`). Keep every existing ID and class from FOUNDATION (`#back`, `#chrome-dojo`, `.bubble-shelf`…).
3. **Markup.** Rebuild each room with `el()` and `tx(ja, en)`. Nothing here needs strings outside `tx`, and the spine label is `biLabel('div', 'spine', ja, en)`.
4. **Shared helpers.** Three helpers carry most of the craft and are small, around 60 lines each:
   - `spring()` (the sheet, the card);
   - `matchCut(fromEl, targetFn)`, which wraps the View Transitions API with this FLIP fallback;
   - `recentre()`, which swaps only the plate and never re-renders the room.
5. **The web.** `webModel(type, key)` runs on data the app already has: deck words, `share_alike/kanji.json` (parts, Kanken, readings), `strokes.json` (KanjiVG), and passages from deck cards and articles. Move the sibling and passage indexing into `dictionary-worker.js` so lookups stay under 100 ms.
6. **Read.** The spine height comes from article length, and the "your words" count is computed per learner from the record, cached per day. Night prints use CSS filters plus a rain plane; true night prints (re-generated pictures) are a content task.
7. **Learn.** Grades call the existing FSRS path unchanged. The front is inert: no `rt` is in the DOM until reveal, which keeps the zero-leak guards. The session end needs a new `results` register.
8. **Checks.** Run `tools/lint-ui-language.mjs --both-languages`, the shell verifier, accessibility (44 px is met across the board, including the sky words via an expanded hit area), and the F1 subset.

## Honest self-critique

- **Today is the strongest room.** It is also the riskiest: about 80 sky words on a phone can read as noise for a beginner. The real app should cap the sky at the learner's own words (at most 40) and fade the far plane further.
- **The web plate stays legible because it is curated.** It shows at most 5 siblings, 2 side nodes and 10 family members. A word with 6 kanji, or a part with 400 members, needs paging that is not designed yet. Leader lines can still cross a caption when two kanji share a part.
- **Some numbers are sample data**, marked here and not in the UI: Me's horizons and hanko, the due counts, intervals, "seen 3×", and the session tally. Real data in the prototype:
  - deck sizes (666/358/976);
  - "9 of your words";
  - every web mark, sibling, passage, stroke and Kanken grade.
- **The match-cut uses a clone.** On iOS Safari the native View Transitions API would be smoother; the clone path is the fallback.
- **Night prints are filtered day prints with a rain plane.** That reads well at thumbnail size but is not Hasui's real night; real night prints would be the tears moment of "Dusk".
- **The Read shelf is partly below the fold** on 390×844. The lead story wins the fold, as check 10 asks, but the shelf's breathing is first felt on scroll.
- **No sound or haptics yet**, and no premium preview or paywall page (VISION §7.3). Those belong to the build.
- **Not in the prototype:** the focus room, tests and the sensei. They are shown only as sections with counts.
