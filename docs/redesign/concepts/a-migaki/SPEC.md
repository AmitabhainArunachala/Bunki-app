# A 磨き Migaki: evolution, refined

Track A. This is today's Bunki polished the way a sword polisher works a blade: the same blade, each stone finer, until the grain shows. Everything he defended stays. The word sky stays as the opening of Today, the woodblocks stay in Read, Mincho stays, 藍 stays as structure and cream washi stays as the ground. What changes is relief, line, light and motion. Every surface now reads as at least three layers: real kōzo fibre for ground, a paper or lacquer sheet for surface, and one signal light. Annotation is drawn in hairlines and tabular numerals, and every mark comes from real data (JMdict, KANJIDIC2, KanjiVG, the decks and the articles). At night the same paper turns into the 藍 city: woodblocks get their night print with lanterns lit and rain falling, the Words plate becomes a phosphor circuit, and the Today sky becomes a city seen from a quiet window. The lens is 研ぎ (togi), polishing in layers, and the walk makes it literal: the day's word 研ぐ opens to 研, then to the stone 石, then to 磨 (*migaki*, polish). The app's own idea surfaces from inside the learner's web.

Run: serve the repo root and open `docs/redesign/concepts/a-migaki/index.html#/today`. URL parameters: `?theme=night` and `?lang=ja`. Data is generated from repo sources by `tools/build-data.mjs`. The fibre tile comes from `tools/make-washi.mjs`.

## The eight laws (VISION §8), and how this concept touches them
1. **The brief is the frame.** The concept answers the whole brief: calm *and* alive, ancient *and* electric, and it is never only restrained.
2. **Beauty = function.** Every ornament is data or structure: registration marks, stroke order, Kanken grades, intervals.
3. **One web.** The same door works everywhere. A word in Today, the train, a card, an article or a node all open `#/words/...`. "Back to the sentence" and "Back to today" return to the origin.
4. **One language.** `T(en, ja)` covers all chrome. Kanken grades and JMdict parts of speech are localised (`KK()`, `POS()`). Learned Japanese is marked `data-ui-content="learning"`.
5. **One world, distinct rooms.** The palette is constant. Each room changes material, light, header grammar and motion (table below).
6. **One job, one next step.** Each screen has exactly one signal-lit element.
7. **Real and true.** Glosses, parts, strokes, grades and passages are real. The learner record is a labelled sample, and it is internally consistent.
8. **Calm ground, living detail.** Rest states are still, and only meaning moves. No ambient loop is faster than 6 s.

## Tokens v2: values

Role names follow FOUNDATION.md. Day values are on `body`, night values are on `html[data-theme=night] body`, and room overrides are on `html[data-room=…] body` (see `css/tokens.css`).

| Role | Day | Night |
|---|---|---|
| `--color-page` | `#f2ede2` (room overrides below) | `#0d1423` (indigo washi, never black) |
| `--color-paper` | `#f9f5ec` | `#141e33` |
| `--color-paper-2` | `#ece5d6` | `#0a101c` |
| `--color-ink` | `#1b1f26` sumi | `#efe9dc` 胡粉 shell-white |
| `--color-ink-2` / `-3` | `#3f4552` / `#596070` | `#c6ccd7` / `#a3adbd` |
| `--color-line` / `-strong` | 藍 at 26% / 52% | `rgba(150,180,225,.2)` / `.44` |
| `--color-indigo` | `#1f3a5f` 藍 (structure) | `#9dbbe6` (lifted) |
| `--color-vermilion` | `#b3321f` 朱 "this, now" | `#ff7461` |
| `--color-signal` | `#08737d` 浅葱 asagi | `#63f2d9` phosphor (殻 world) |
| `--color-gold` / `-leaf` | `#8f6d1f` / `#c9a54a` (earned only) | `#e2bd66` / `#e8c873` |
| `--color-lacquer` / `-2` / `-edge` | `#16181e` / `#24272f` / `#3a3326` | `#05080f` / `#10172a` / `#2b3b5c` |
| `--color-card` / `-card-ink` | `#faf6ec` / `#1b1f26` | `#e9e1cf` lantern-lit washi / `#191c22` |
| `--font-display` | Shippori Mincho B1 800 (Japanese display) | same |
| `--font-serif` | Hiragino Mincho → Yu Mincho → Noto Serif CJK JP (reading text, Latin display) | same |
| `--font-sans` | -apple-system → Hiragino Sans → Noto Sans CJK JP (chrome) | same |
| `--font-mono` | ui-monospace → SF Mono → Menlo (data, tabular) | same |
| `--font-hand` | Yuji Syuku (the hand-copied line, only) | same |
| `--font-grade` | Kaisei Tokumin (再 難 良 易 only) | same |
| `--type-*` | micro 10.5 · caption 12 · ui 15 · body 16.5 · reading 19 · ruby 10.5 · title 25 · display 44 · hero 92 px | same |
| `--leading-*` | tight 1.18 · ui 1.38 · body 1.62 · reading 2.2 | same |
| `--weight-*` | 400 · 520 · 650 · display 800 | same |
| `--space-1…9` | 4 8 12 16 20 24 32 48 64; gutter 20; hairline .5px | same |
| `--radius-*` | hair 2 · surface 6 · sheet 14 · pill 999 | same |
| `--elevation-1/2/3` | warm two-layer paper shadows | inset lip + deep black falloff |
| `--motion-*` | tick 90 · crisp 160 · settle 280 · breath 480 · ink 720 · ma 320 ms · ambient 14 s | same |
| `--ease-*` | crisp (.2,.8,.2,1) · settle (.22,1,.36,1) · ink (.65,0,.35,1) · out (.16,1,.3,1) | same |

The materials are two fixed layers. `.washi` is a 480 px tile of 70 generated kōzo strands with bark flecks, set in `css/washi-fibre.svg`. `.washi-fine` is static pulp grain. At night both are inverted, and a `.city` layer of teal and vermilion glow sits below-right.

## Rooms (`html[data-room]`): one family, five identities

| Room | Material | Light | Header grammar | Signature gesture | Signature motion / moment |
|---|---|---|---|---|---|
| **Today** | Thin washi sky (the kept word sky, now an upper band of his words) | Dawn band, cool left to warm right. Night: a lit city grid at the horizon | Date in serif, with no room title. A vertical 研ぐ in Shippori and its passage in 縦書き | One verb (Begin) and the transit line of the day | **The arrival.** The due words leave the sky and come in as one train, with a held 間 before the stations light |
| **Read** | Thick kōzo, magazine weight. Full-bleed woodblock with a paper 短冊 cartouche | Window light from upper left. Night: the same print darkened, with lanterns lit and rain | 44 px masthead between rules, like a newspaper | Tap any word, and it lifts into its sheet | **Dusk.** The same print becomes the night city. The voice line travels word by word |
| **Learn** | Paper ground, 漆 lacquer proscenium, washi card with トンボ marks | Stage light. Night: the card glows like a lantern and the frame falls dark | Small label. The stage itself is the hero | Answer, hold, grade | **研ぎ出し togidashi.** A polish band crosses the card, readings surface where it passes, 間, then the passage slides down while the answer comes up above it |
| **Words** | Drafting vellum on a 方眼 grid, a technical plate | Even, shadowless. Night: phosphor terminal, leaders become 回路 traces with a running current | Search field as the header, with a source line | Tap any node and it moves to the centre | **The walk.** 研ぐ, then 研, then 石, then 磨. Each match-cut carries the same glyph from its pixel to the centre, and KanjiVG strokes write in order |
| **Me** | A bound book: spine, page edges, ledger | Late afternoon gold | Book title inside the page | Turn the month (page turn) | **Mended in gold.** Seals stamp in day by day. Lapsed-then-held words carry a kintsugi seam that catches one cel highlight |

**Small authored responses (≥3 per room, each under 1 s and each meaningful):**
- **Today:** the day's word inks in with a bleed layer that fades; the due words travel to the train; the stations rise in order; the Begin button presses 2 px; any train car opens its web.
- **Read:** the lead print settles from 1.035 scale; the Listen pill rises; a tapped word lifts 1.07× with a signal underline; Keep turns gold and leaves a gold underline in the text; lanterns breathe on a 7 to 9 s cycle at night; the hero parallax runs at 0.42×.
- **Learn:** the readings surface left to right behind the polish band; the passage slides down as the answer rises; the grade pads press; the トンボ marks snap 2 px inward on a grade ("registered"); the session close stamps its seal.
- **Words:** leaders draw out from the centre (scaleX); nodes bloom in order; strokes write with vermilion stroke numbers; grammar and culture nodes swap the detail plate in place; the night current runs the structural traces.
- **Me:** the gold horizon bars fill; the seals stamp in sequence; the page turns (rotateY); the kintsugi cel highlight sweeps once per tile.

**The pull:** the session close (`#/learn/done`) shows the next door (都市の匿名性と言語, which holds 5 of today's words) and tomorrow's first word, half shown (怠…). Today's line ends on Tomorrow.

## Component map (what each replaces in today's app)

| Component | Replaces |
|---|---|
| Tab bar: a lacquer band with hairline icons and a polished active tick (EN labels / JA labels) | Header pills 道場 / 藍 / EN-日本語 / 覚 0; the doors |
| `.sky` + `.dayword` + `.train` + `.line` (Today) | The drift door's word field and the "tray" list. The sky's hush is kept, and one next step is added |
| `.mast` + `.lead` + `.cartouche` + `.grid .story` (Read shelf) | 本棚 header, search bar, Tools menu, and the two rows of grey filter pills (now one hairline control) |
| `.hero` + `.paper` + `.voice` + `.body .w` (article) | The thin-strip hero, the 原文/やさしい explainer, the tip box, and "音声準備中 · audio coming soon" |
| `.sheet` word sheet with `.ktile`, `.ws-also`, `.ws-cult`, `.ws-dive` | The reader popup and the separate dictionary entry. Same tap grammar everywhere |
| `.proscenium` + `.lsec` ×4 (Cards, Focus, Tests, Guided) with live counts | The strewn 集中道場 dojo page |
| `.stage` + `.card` + `.answer` + `.kplate` + `.grades` | The navy-and-gold deck player ("two products") and its もう一度/思い出せた/削除 under EN |
| `.closing` (session close + next door) | The end-of-session stats scrap pile |
| `.plate` web + `.detail` technical plate + `.trail` walk | Search results, the kanji page, thesaurus and word-web views |
| `.book` (horizons, seals calendar, kintsugi, copied line, settings at the back) | kagami / srs-stats progress views and the settings sheet |
| `.sign` vertical room sign (縦看板) | Nothing. It is a new family mark, printed by day and lit at night |

## Animation inventory (transform and opacity only, verified by grep)

| Name | Trigger | Properties | Duration / easing | Reduced motion |
|---|---|---|---|---|
| Room leave | Room change | opacity, translateY(−6px) scale(.995) | 160 ms crisp | 120 ms fade |
| Sky settle + drift | Today enter | opacity; translate3d ≤8 px | 900 ms; ambient 14 / 18 / 22 s alternate | Drift off |
| Ink-in (day's word) | Today enter | opacity, scale .975→1; pre-blurred copy opacity .55→0 | 720 ms ink, 1100 ms | Fade |
| The arrival (train) | Today enter +520 ms | FLIP translate + scale from sky position, 55 ms stagger | 760 ms ink, then 間 320 ms | Instant |
| Stations light | After the arrival | opacity, translateX | 360 ms settle, 70 ms stagger | Fade |
| Lead print settle | Shelf enter | opacity, scale 1.035→1 | 480 ms settle | Fade |
| Story stagger | Shelf enter | opacity, translateY 8 px | 380 ms, 40–60 ms stagger | Fade |
| Hero parallax | Article scroll | translateY(0.42·y), scale ≤1.1 | Per frame | None |
| Voice line | Play | transform translate + scaleX on one bar | 300 ms crisp per word, 380 ms cadence | Jump |
| Word lift | Word tap | clone translateY −3 px, scale 1.07 | 160 ms crisp | Instant |
| Sheet rise | Word tap | translateY 105%→0 on a spring (k 300, c 30) | ≈350 ms | Instant |
| Sheet contents | Sheet open | opacity, translateY 8 px, 45 ms stagger | 280 ms settle | Fade |
| Scrim | Sheet open / close | opacity | 280 ms | 120 ms |
| Night lanterns | Night, always | opacity .82↔1 | 7 s / 9 s alternate | Off |
| Night rain | Night, always | translate3d | 9 s linear | Off |
| Card enter | Stage enter | opacity, translateY 18 px, scale .985 | 480 ms settle | Fade |
| 研ぎ出し polish | Show answer | Band translateX −120%→240% | 560 ms ink | Off |
| Readings surface | Show answer | rt opacity, delay by x-position + line | 240 ms each | Fade |
| Answer up / passage down | Reveal +760 ms | Answer children opacity + translateY; passage FLIP translateY | 340 ms / 460 ms settle | Instant |
| Grade pads rise | Reveal +1020 ms | opacity, translateY | 320 ms settle | Fade |
| Registration snap | Grade | トンボ translate 2 px inward | 160 ms crisp | Instant |
| Session close | Done enter | Ring rotate −40°→0 + scale; seal scale 1.18→1 | 900 ms ink; 200 ms at +700 ms | Fade |
| Web enter | Words enter | Centre scale .9→1; nodes scale .82→1; leaders scaleX 0→1 | 380–420 ms, staggered | Static |
| Match-cut re-centre | Node tap | FLIP translate + scale of shared nodes; new nodes bloom; ring scale .6→1; detail rise | 520–640 ms ink | Static swap |
| Stroke order | Kanji centred | Each KanjiVG path opacity + scale .96→1, 70 ms apart; numbers fade | 260 ms ink | Static |
| Circuit current | Night, Words | A 10 px pulse translateX along struct leaders | 6 s loop | Off |
| Book open | Me enter | rotateY −9°→0, opacity | 480 ms settle | Fade |
| Horizon fill | Me enter | scaleX 0→p | 900 ms ink | Static |
| Seal stamp | Me enter | scale 1.25→1, opacity, 22 ms per day | 180 ms crisp | Static |
| Kintsugi cel | Me enter | Highlight translateX across each tile once | 620 ms ink | Off |
| Page turn | Month arrows | rotateY ±70° out, then in, opacity | 240 + 320 ms | Swap |
| Press travel | Every primary control | translateY 2 px | 90 ms | Same |

## Building it into the real app (prototypes/corridor)

1. **Tokens.** Paste the day and night blocks from `css/tokens.css` into the TOKENS V2 fence in `editorial.css`, scoped `body:not([data-view='drift'])` per FOUNDATION. Add the room blocks under `html[data-room=…]`. Add `--color-card*` as aliases of the existing `--color-card-*` family. Do not add new fonts. Keep `--font-mono` as a system stack.
2. **Materials.** Ship `washi-fibre.svg` as an asset (it is about 40 KB and could be optimised to about 15 KB). Add `.washi`, `.washi-fine` and `.city` once in the shell, outside the views.
3. **Room CSS files.** Create `rooms/today.css`, `read.css`, `learn.css`, `words.css` and `me.css` from the `room-*.css` files here. They use only tokens and keep the `data-room-entering` hook for entrances.
4. **Markup.** Each prototype view maps to an existing renderer: Today maps to `tray` (keep the drift door untouched, as FOUNDATION requires); Read to `shelf` and the reader; Learn to `dojo` (group into the four `lsec` sections it already has: guided, decks, focus, plus tests), and the stage to the deck player; Words to `search`, `kanji` and `word-web`; Me to `me`, `kagami` and settings. Port the template strings to `el()` / `tx(ja, en)` / `biLabel`. Every English string here already has its Japanese pair.
5. **Data.** The web needs no new data. `dict.json`, `kanji.json`, `strokes.json` and `radicals214.json` already ship. The curated top-level decompositions (`PARTS` in `tools/build-data.mjs`) should move into `reference-extra.json`. Grammar and culture nodes need a small curated table tied to card sentences, which the engine lens already proposes.
6. **Motion helpers.** Add `spring()` (12 lines), a `flip()` helper for the word lift and the re-centre, and `revealCard()` choreography inside the deck player. All of it uses WAAPI on transform and opacity, and every piece is wrapped in a reduced-motion check.
7. **Verifiers.** Rerun lint-ui-language in both languages. Kanken and part-of-speech strings now localise, so EN chrome shows "KANKEN Pre-2", not 準2級. Relief, hit-size (all targets are 44 px) and contrast should pass as well. The deck zero-leak front holds, because the front DOM has no readings and the answer is injected on reveal.

## Self-critique

- **The strongest moments:** the night woodblock (the same Ise print with lanterns lit and rain), the 研ぐ→研→石→磨 walk with KanjiVG strokes writing in order, and the togidashi reveal that keeps the card in place.
- **Today is the busiest screen.** The vertical word, its passage, meta, the train, the line and the button all compete. It holds together, but Musashi would cut the meta column or the train. I would test hiding the train after the arrival plays once.
- **The learner record is a sample.** Day 214, 1,284/3,410 and the seals are consistent, but they are not read from a real record. The scheduling numbers on the grade pads (1m / 8m / 3d / 9d) are illustrative, not FSRS output.
- **The faint sky words are decorative** and deliberately below 4.5:1. The tappable words (the train) meet contrast.
- **The voice is simulated.** The voice line runs, but no audio plays in the prototype.
- **The web layout is fixed-polar.** Nodes with very long glosses truncate. A part with 40 kanji shows 7, and there is no "more" door yet.
- **Read's woodblock night print is a CSS approximation.** Darken, multiply and lantern points work well on Ise and the Kojiki hall. A real night print per picture would be better.
- **Fonts:** the runner's Latin serif (Noto Serif) and mono (Noto Sans Mono CJK) stand in for Hiragino Mincho and SF Mono, so the iPhone will look slightly crisper.
